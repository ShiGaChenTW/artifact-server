import type {ReactNode} from "react";

import type {Insights} from "@/api/client";
import {Progress} from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {dashboardText} from "@/i18n/messages/dashboard";
import {readerText} from "@/i18n/messages/reader";
import {formatBytes, formatRelativeTime, formatTimestamp} from "@/lib/presentation";
import {GrowthChart, TagChart} from "./dashboard-charts.tsx";
import {
  artifactReviewHref,
  dispatchStates,
  formatDay,
  percentage,
} from "./dashboard-format.ts";

const readingsText = dashboardText.readings;
const overviewText = dashboardText.overview;
const reviewText = dashboardText.review;
const storageText = dashboardText.storage;

/** One counted reading: label, figure, then context. */
function Reading({
  detail,
  label,
  value,
}: {
  readonly detail: string;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="as-metric">
      <dt>{label}</dt>
      <dd>
        <span className="as-metric__value">{value}</span>
        <span className="as-metric__detail">{detail}</span>
      </dd>
    </div>
  );
}

/**
 * The dashboard readings as a two-by-two definition grid divided by rules,
 * never boxed cards.
 */
export function DashboardHeadline({insights}: {readonly insights: Insights}) {
  const {overview, review, storage} = insights;
  const inWindow = insights.window === "all" ? readingsText.inTotal : readingsText.inThisWindow;
  const inFlight = review.dispatches.queued + review.dispatches.claimed +
    review.dispatches.delivered;
  return (
    <section aria-label={readingsText.label} className="as-dashboard-section">
      <dl className="as-metrics">
        <Reading
          detail={readingsText.versionsDetail(overview.versionCount, overview.versionsInWindow, inWindow)}
          label={readingsText.artifacts}
          value={String(overview.artifactCount)}
        />
        <Reading
          detail={readingsText.threadsDetail(review.threadsOpenedInWindow, review.threadsResolvedInWindow, inWindow)}
          label={readingsText.openThreads}
          value={String(review.openThreads)}
        />
        <Reading
          detail={readingsText.dispatchesDetail(inFlight, review.dispatches.failed)}
          label={readingsText.dispatches}
          value={String(review.dispatchesInWindow)}
        />
        <Reading
          detail={readingsText.acrossEveryVersion(formatBytes(storage.logicalBytes))}
          label={readingsText.stored}
          value={formatBytes(storage.storedBytes)}
        />
      </dl>
    </section>
  );
}

/** A dashboard section: a heading on a rule, quiet context to its right. */
function SectionCard({
  children,
  description,
  id,
  title,
}: {
  readonly children: ReactNode;
  readonly description: string;
  readonly id: string;
  readonly title: string;
}) {
  return (
    <section aria-labelledby={id} className="as-dashboard-section">
      <div className="as-dashboard-section__head">
        <h2 id={id}>{title}</h2>
        <span className="as-dashboard-section__aside">{description}</span>
      </div>
      <div className="as-dashboard-section__body">{children}</div>
    </section>
  );
}

function Subheading({children}: {readonly children: ReactNode}) {
  return (
    <h3 className="as-dashboard-subheading">
      {children}
    </h3>
  );
}

function Quiet({children}: {readonly children: ReactNode}) {
  return <p className="as-dashboard-quiet">{children}</p>;
}

/** The latest artifacts as a divided list, each with its version number. */
export function RecentArtifacts({
  insights,
  now,
  onShowOverview,
  projectNames,
}: {
  readonly insights: Insights;
  readonly now: number;
  readonly onShowOverview: () => void;
  readonly projectNames: ReadonlyMap<string, string>;
}) {
  const recent = insights.overview.recentArtifacts.slice(0, 5);
  return (
    <section aria-labelledby="dashboard-recent-title" className="as-dashboard-section">
      <div className="as-dashboard-section__head">
        <h2 id="dashboard-recent-title">{readerText.dashboard.recent}</h2>
        <button className="as-dashboard-link as-dashboard-section__aside" onClick={onShowOverview} type="button">
          {readerText.dashboard.viewOverview}
        </button>
      </div>
      {recent.length === 0 ? <Quiet>{overviewText.noArtifacts}</Quiet> : (
        <ul className="as-recent">
          {recent.map((artifact) => (
            <li key={artifact.artifactId}>
              <a href={artifactReviewHref(artifact.projectId, artifact.artifactId)}>
                <span className="as-recent__name">{artifact.name}</span>
                <span className="as-recent__meta">
                  <span>{projectNames.get(artifact.projectId) ?? artifact.projectId}</span>
                  <span title={formatTimestamp(artifact.latestVersionAt)}>{formatRelativeTime(artifact.latestVersionAt, now)}</span>
                </span>
                <span className="as-version-number">v{artifact.latestVersionNumber}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** What exists, what changed recently, and how it is tagged. */
export function OverviewSection({
  insights,
  now,
  projectNames,
}: {
  readonly insights: Insights;
  readonly now: number;
  readonly projectNames: ReadonlyMap<string, string>;
}) {
  const {overview} = insights;
  const showProjects = insights.projectId === null && overview.projects.length > 1;
  return (
    <SectionCard
      description={overviewText.description}
      id="dashboard-overview-title"
      title={overviewText.title}
    >
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="grid min-w-0 grid-cols-1 content-start gap-3">
        <Subheading>{overviewText.recentlyUpdated}</Subheading>
        {overview.recentArtifacts.length === 0
          ? <Quiet>{overviewText.noArtifacts}</Quiet>
          : (
            <Table className="as-page-table">
              <TableHeader>
                <TableRow>
                  <TableHead>{overviewText.artifact}</TableHead>
                  {showProjects ? <TableHead>{overviewText.project}</TableHead> : null}
                  <TableHead className="text-right">{overviewText.version}</TableHead>
                  <TableHead className="text-right">{overviewText.updated}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.recentArtifacts.map((artifact) => (
                  <TableRow key={artifact.artifactId}>
                    <TableCell className="max-w-64 truncate">
                      <a
                        className="underline-offset-4 hover:underline"
                        href={artifactReviewHref(artifact.projectId, artifact.artifactId)}
                      >
                        {artifact.name}
                      </a>
                    </TableCell>
                    {showProjects
                      ? <TableCell>{projectNames.get(artifact.projectId) ?? artifact.projectId}</TableCell>
                      : null}
                    <TableCell className="text-right font-mono tabular-nums">
                      v{artifact.latestVersionNumber}
                    </TableCell>
                    <TableCell className="text-right" title={formatTimestamp(artifact.latestVersionAt)}>
                      {formatRelativeTime(artifact.latestVersionAt, now)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
      </div>
      <div className="grid min-w-0 content-start gap-6">
      {showProjects
        ? (
          <div className="grid min-w-0 grid-cols-1 gap-3">
            <Subheading>{overviewText.projects}</Subheading>
            <Table className="as-page-table">
              <TableHeader>
                <TableRow>
                  <TableHead>{overviewText.project}</TableHead>
                  <TableHead className="text-right">{overviewText.artifacts}</TableHead>
                  <TableHead className="text-right">{overviewText.versions}</TableHead>
                  <TableHead className="text-right">{overviewText.lastVersion}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.projects.map((project) => (
                  <TableRow key={project.projectId}>
                    <TableCell>
                      {project.name}
                      {project.archived ? <span className="as-dashboard-quiet-inline">{overviewText.archived}</span> : null}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{project.artifactCount}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{project.versionCount}</TableCell>
                    <TableCell className="text-right">
                      {project.latestVersionAt === null ? overviewText.noneYet : formatRelativeTime(project.latestVersionAt, now)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )
        : null}
      <div className="grid min-w-0 grid-cols-1 gap-3">
        <Subheading>{overviewText.tags}</Subheading>
        {overview.tags.length === 0
          ? <Quiet>{overviewText.noTags}</Quiet>
          : <TagChart tags={overview.tags} />}
        <Quiet>
          {overviewText.tagSummary(overview.untaggedArtifactCount, overview.publicLinkCount)}
        </Quiet>
      </div>
      </div>
      </div>
    </SectionCard>
  );
}

/** What still needs attention and what agents were asked to do. */
export function ReviewSection({
  insights,
  now,
  windowLabel,
}: {
  readonly insights: Insights;
  readonly now: number;
  readonly windowLabel: string;
}) {
  const {review} = insights;
  const total = review.openThreads + review.resolvedThreads;
  const resolvedShare = percentage(review.resolvedThreads, total);
  return (
    <SectionCard description={windowLabel} id="dashboard-review-title" title={reviewText.title}>
      <div className="as-progress-row">
        <span>{reviewText.resolved}</span>
        <span className="as-mono">{reviewText.resolvedOf(review.resolvedThreads, total)}</span>
      </div>
      {resolvedShare === null
        ? <Quiet>{reviewText.noThreads}</Quiet>
        : (
          <div aria-label={reviewText.resolvedThreads} aria-valuemax={100} aria-valuemin={0} aria-valuenow={resolvedShare}
            className="as-progress" role="progressbar">
            <span style={{width: `${resolvedShare}%`}} />
          </div>
        )}
      <Quiet>
        {reviewText.openSummary(review.openThreads, review.openDispatchedThreads)}
        {review.oldestOpenThreadAt === null
          ? null
          : reviewText.oldestOpened(formatRelativeTime(review.oldestOpenThreadAt, now))}
      </Quiet>
      <div id="dispatches">
        <Subheading>{reviewText.dispatches}</Subheading>
        <dl className="as-dispatch-states">
          {dispatchStates.map((entry) => (
            <div data-tone={review.dispatches[entry.state] > 0 ? entry.tone : "neutral"} key={entry.state}>
              <dt>{entry.label}</dt>
              <dd>{review.dispatches[entry.state]}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div>
        <Subheading>{reviewText.mostOpenThreads}</Subheading>
        {review.openThreadsByArtifact.length === 0
          ? <Quiet>{reviewText.nothingWaiting}</Quiet>
          : (
            <ul className="as-dashboard-rows">
              {review.openThreadsByArtifact.map((artifact) => (
                <li key={artifact.artifactId}>
                  <a className="as-dashboard-link" href={artifactReviewHref(artifact.projectId, artifact.artifactId)}>
                    {artifact.name}
                  </a>
                  <span className="as-mono">{artifact.openThreads}</span>
                </li>
              ))}
            </ul>
          )}
      </div>
    </SectionCard>
  );
}

/** How many bytes the catalog holds, how fast it grows, and Git-history use. */
export function StorageSection({
  insights,
  projectNames,
}: {
  readonly insights: Insights;
  readonly projectNames: ReadonlyMap<string, string>;
}) {
  const {storage} = insights;
  const saved = storage.logicalBytes - storage.storedBytes;
  const firstDay = storage.growth.at(0)?.day;
  const enabledProjects = storage.gitHistory.projects.filter((project) => project.enabled);
  return (
    <SectionCard
      description={storageText.description}
      id="dashboard-storage-title"
      title={storageText.title}
    >
      <dl className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-4 sm:grid-cols-[repeat(4,minmax(0,1fr))]">
        <Figure label={storageText.stored} value={formatBytes(storage.storedBytes)} />
        <Figure label={storageText.acrossVersions} value={formatBytes(storage.logicalBytes)} />
        <Figure label={storageText.savedByDeduplication} value={formatBytes(saved)} />
        <Figure label={storageText.files(storage.distinctBlobCount)} value={String(storage.fileCount)} />
      </dl>
      <div className="grid min-w-0 grid-cols-1 gap-3">
        <Subheading>
          {storageText.publishedBytes(firstDay === undefined ? null : formatDay(firstDay))}
        </Subheading>
        {storage.growth.length < 2
          ? (
            <Quiet>
              {storageText.singleDay(
                formatBytes(storage.growth.at(0)?.cumulativeBytes ?? 0),
                firstDay === undefined ? null : formatDay(firstDay),
              )}
            </Quiet>
          )
          : <GrowthChart bucket={storage.growthBucket} points={storage.growth} />}
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">{storageText.viewAsTable}</summary>
          <Table className="as-page-table">
            <TableHeader>
              <TableRow>
                <TableHead>{storage.growthBucket === "week" ? storageText.weekOf : storageText.day}</TableHead>
                <TableHead className="text-right">{storageText.added}</TableHead>
                <TableHead className="text-right">{storageText.versions}</TableHead>
                <TableHead className="text-right">{storageText.total}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {storage.growth.filter((point) => point.versions > 0).map((point) => (
                <TableRow key={point.day}>
                  <TableCell>{formatDay(point.day)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{formatBytes(point.addedBytes)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{point.versions}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{formatBytes(point.cumulativeBytes)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </details>
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-3">
        <Subheading>{storageText.largestArtifacts}</Subheading>
        {storage.largestArtifacts.length === 0
          ? <Quiet>{storageText.noArtifacts}</Quiet>
          : (
            <ul className="grid grid-cols-1 gap-2 text-sm">
              {storage.largestArtifacts.map((artifact) => (
                <li className="flex min-w-0 items-center justify-between gap-4" key={artifact.artifactId}>
                  <a
                    className="min-w-0 truncate underline-offset-4 hover:underline"
                    href={artifactReviewHref(artifact.projectId, artifact.artifactId)}
                  >
                    {artifact.name}
                  </a>
                  <span className="font-mono tabular-nums">{formatBytes(artifact.logicalBytes)}</span>
                </li>
              ))}
            </ul>
          )}
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-3">
        <Subheading>{storageText.gitHistory}</Subheading>
        {enabledProjects.length === 0
          ? <Quiet>{storageText.gitHistoryOff}</Quiet>
          : (
            <>
              <Quiet>
                {storageText.gitHistorySummary(
                  formatBytes(storage.gitHistory.committedBytes),
                  formatBytes(storage.gitHistory.reservedBytes),
                  storage.gitHistory.pendingJobs,
                  storage.gitHistory.failingJobs,
                )}
              </Quiet>
              {enabledProjects.map((project) => {
                const used = project.committedBytes + project.reservedBytes;
                const share = project.budgetBytes === null ? null : percentage(used, project.budgetBytes);
                return (
                  <div className="grid gap-1.5" key={project.projectId}>
                    <div className="flex justify-between gap-4 text-sm">
                      <span>{projectNames.get(project.projectId) ?? project.projectId}</span>
                      <span className="font-mono tabular-nums">
                        {formatBytes(used)}
                        {project.budgetBytes === null ? storageText.noBudget : storageText.ofBudget(formatBytes(project.budgetBytes))}
                      </span>
                    </div>
                    {share === null
                      ? null
                      : <Progress aria-label={storageText.budgetUsed} value={Math.min(100, share)} />}
                  </div>
                );
              })}
            </>
          )}
      </div>
    </SectionCard>
  );
}

function Figure({label, value}: {readonly label: string; readonly value: string}) {
  return (
    <div className="grid min-w-0 gap-1">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="font-mono text-lg tabular-nums slashed-zero">{value}</dd>
    </div>
  );
}
