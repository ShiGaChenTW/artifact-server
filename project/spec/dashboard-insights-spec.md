# Dashboard insights (fork-local)

Status: fork-local feature of `ShiGaChenTW/artifact-server`; not proposed upstream.
Backlog: ARTSV-1; the All-projects summary is ARTSV-8.

## Purpose

One read-only page, `/review/dashboard`, answers four questions about an
installation or one of its projects:

1. **Overview**: how many live artifacts and versions exist, which changed most
   recently, how tags are distributed, and how many artifacts have public links.
2. **Review**: how many comment threads are open or resolved, how many open
   threads were dispatched to an agent, and where each dispatch stands.
3. **Storage**: bytes declared by every retained version, bytes actually stored
   after content deduplication, growth over the window, and Git-history mirror
   consumption.
4. **Activity**: who published, restored, deleted, captured, linked, retagged,
   or changed the access of an artifact, who commented, and how dispatches
   moved, newest first.

## Contract

- `GET /api/v1/insights?projectId=&window=` returns the four-section summary.
- `GET /api/v1/insights/activity?projectId=&window=&cursor=&limit=` returns one
  newest-first page of activity with an opaque cursor.
- `window` is one of `7d`, `30d` (default), `90d`, `all`. A bounded window
  starts at 00:00 UTC of its first day, so it holds exactly that many whole UTC
  days, today included.
- Omitting `projectId` reads every project of the caller's installation.
- Reading requires artifact-listing authority and comment-read authority. An
  unknown project answers `PROJECT_NOT_FOUND`; malformed input answers
  `INVALID_INPUT`.
- Deleted artifacts never appear in overview, review, or ranked lists. Storage
  still counts their versions, because deletion keeps immutable bytes.
- Growth is daily; a span longer than 90 days folds into 7-day buckets starting
  on the first day. Bytes published before the window form the baseline.
- Activity names a member or registered agent; an API key actor carries only
  its kind, because key names are an administration detail. Inferred
  addressing, delivery failure, and cancellation carry no actor, because the
  record keeps none.
- Only the SQLite (local) persistence implements these queries. Every other
  deployment answers `CAPABILITY_UNAVAILABLE` (HTTP 501).

## All-projects summary

The All-projects view (no `projectId`) compares projects side by side and is
the entry point to each project's own reports. A report is an existing
artifact; projects are the classification. Folders and tags keep their roles,
and reading the summary never moves, renames, or rewrites anything, so
artifact IDs, version IDs, immutable bytes, and existing links stay valid.

- `overview.projects` lists every project of the caller's installation, empty
  and archived projects included, for zero, one, or many projects. Each row
  carries `projectId`, `name`, `archived`, `artifactCount`, `versionCount`,
  `versionsInWindow`, `latestVersionAt`, `openThreads`,
  `inProgressDispatches` (queued, claimed, or delivered), `failedDispatches`,
  and `logicalBytes`.
- Every figure is a current total except `versionsInWindow`, which counts only
  versions published inside the window. The interface says which is which.
- Each row equals the same figure in that project's own summary for the same
  window: `artifactCount`, `versionCount`, and `versionsInWindow` match the
  overview, `openThreads` and the dispatch counts match the review section,
  and `logicalBytes` matches the storage section.
- `logicalBytes` is the bytes declared by the project's retained versions,
  including those of deleted (trashed) and purged artifacts, because neither
  deletion nor purge reclaims bytes (file-management-spec section 9.4).
  Content shared between projects counts in each project, so the rows add up
  to the installation's declared bytes, never to its disk use. Deduplicated
  `storage.storedBytes` is an installation-scope figure and the interface
  labels it as such.
- The figures are computed in a fixed number of grouped queries, each limited
  to the installation, never one query per project.
- Same-name projects stay separate rows; the interface shows their IDs.
  Archived and empty projects are marked, and an installation without projects
  has its own empty state. Loading and failure never render as zeros.
- Each row links to that project's dashboard with the same window
  (`/review/dashboard?project=<id>&window=<window>`, the default window
  omitted) and to its artifact list (`/review/files?project=<id>`, or Review
  when the Files page is unavailable). A refresh keeps the scope and window.
- Authority, `PROJECT_NOT_FOUND`, and `CAPABILITY_UNAVAILABLE` follow the
  contract above. Another installation's projects are never listed, drilled
  into, or counted; the persistence adapter itself filters by installation.

## Conformance requirements

DSH-001 through DSH-005 in `conformance.yml` index the contract promises;
DSH-006 through DSH-008 index the All-projects summary.
