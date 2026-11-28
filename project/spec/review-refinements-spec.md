# Review refinements

**Status:** Accepted (November 24, 2026); implementation tracked in Backlog ARTSV-3.
**Date:** November 24, 2026
**Owner:** Artifact Server web application (fork-local; not proposed upstream)
**Source:** Interface benchmark report RPT-2026-011 (Markup, artx, Glance, SlashDocs, Vibe Kanban, Langfuse, Plannotator), section 05.

## 1. What this changes and why

The redesigned interface shares one design language, but the review loop still hides what needs the owner's attention: the dashboard leads with storage, the catalog repeats default values on every row, an agent's finished work is only visible under the Sent filter, and several frequent actions have no keyboard route. These refinements change presentation and client behavior only. They add no server state except where noted, and every existing flow and pinned copy stays.

## 2. Contract

- **Dashboard attention first (UXR-001).** The dashboard opens with a "Needs you" band of three counts, each listing its items with links: threads whose agent dispatch is `addressed` and still open, versions published since the owner last opened that artifact, and failed dispatches. Storage moves into a compact overview. Consecutive activity entries with the same actor and verb collapse into one expandable row. "Last opened" is recorded per browser in local storage, guarded so unavailable storage degrades to "unknown" without failing.
- **Catalog rows show differences (UXR-002).** A row omits the visibility pill when the artifact is private (the default) and omits the comment count when zero. A non-zero open-thread count is a highlighted count. The row time is relative ("12 minutes ago") with the exact timestamp in the accessible name and tooltip.
- **Awaiting confirmation (UXR-003).** The comments filters add "Awaiting you": open threads whose latest dispatch is `addressed`. Cards in the Open filter show the dispatch state chip when a dispatch exists.
- **Quieter comment cards (UXR-004).** Clicking or pressing Enter on a card selects it and reveals its anchor in the page. Resolve stays visible on every card; reply and send-to-agent appear on the selected card and on hover or focus within. Split-button triggers are never truncated. With no connected agent, the send-all control becomes a sentence with a "Connect an agent" link instead of a filled button.
- **Submit with ⌘↵ (UXR-005).** Every comment and reply composer submits with ⌘↵ / Ctrl↵, with the same validation as the button.
- **Command palette and shortcut sheet (UXR-006).** ⌘K / Ctrl K opens a palette that searches artifacts in the current project and lists commands (switch version, annotate mode, send open comments, compare versions, toggle theme). `?` opens a sheet listing every shortcut, including J/K, ← →, T, C, V, F, [ ], Esc and ⌘\. Both trap focus, close on Esc and restore focus.
- **Side-by-side versions (UXR-007).** The Compare tab adds a "Side by side" view: the two selected versions render in two sandboxed frames with optional synchronized scrolling. The file-list comparison stays the default.
- **Focus toolbar starts collapsed (UXR-008).** Entering focus mode collapses the floating toolbar to its restore button, which shows the open-thread count; the first time per browser, a one-line hint names ⌘\. Existing collapse and restore behavior stays.

Deferred: desktop notifications for finished dispatches, and element-level comment anchors (depends on Plannotator support).

## 3. Proposed ledger entries

Added to `conformance.yml` on November 24, 2026. On November 25, 2026 the UXR-004-F and UXR-006-B wording below was updated for the reader layout in section 4.

```yaml
  - id: UXR-001
    kind: behavior
    behavior: The dashboard opens with a Needs-you band counting and linking addressed-but-open threads, versions newer than the owner's last visit, and failed dispatches, with storage in a compact overview and repeated activity collapsed.
    owner: web-application
    source: {file: review-refinements-spec.md, anchor: contract}
    acceptance:
      behavior: {id: UXR-001-B, description: "With one addressed open thread, one failed dispatch, and one artifact published after its last visit, the band shows 1/1/1 with links that open each item; three consecutive publishes by one actor show as one expandable row."}
      failure: {id: UXR-001-F, description: "With storage that throws, the unseen-versions count reads as unknown and the rest of the dashboard still renders; zero counts render as zero, never as missing."}
    deployments: [local]
    status: specified
    depends_on: [DSH-001]
    evidence: []

  - id: UXR-002
    kind: behavior
    behavior: Catalog rows omit the default private pill and zero comment counts, highlight non-zero open-thread counts, and show relative times with the exact time available.
    owner: web-application
    source: {file: review-refinements-spec.md, anchor: contract}
    acceptance:
      behavior: {id: UXR-002-B, description: "A private artifact with no comments shows neither pill nor count; a public-link artifact shows its pill; an artifact with two open threads shows a highlighted 2; the time reads relative and its accessible name carries the exact timestamp."}
      failure: {id: UXR-002-F, description: "A future or invalid timestamp never renders a negative or NaN relative time and falls back to the exact timestamp."}
    deployments: [local]
    status: specified
    depends_on: []
    evidence: []

  - id: UXR-003
    kind: behavior
    behavior: The comments panel offers an Awaiting-you filter of open threads whose latest dispatch is addressed, and Open-filter cards show their dispatch state.
    owner: web-application
    source: {file: review-refinements-spec.md, anchor: contract}
    acceptance:
      behavior: {id: UXR-003-B, description: "After an agent marks a dispatch addressed, its open threads appear under Awaiting you with an Addressed chip, and resolving one removes it from the filter and its count."}
      failure: {id: UXR-003-F, description: "Queued, claimed, delivered, failed, or canceled dispatches and resolved threads never appear under Awaiting you."}
    deployments: [local]
    status: specified
    depends_on: [SND-001]
    evidence: []

  - id: UXR-004
    kind: behavior
    behavior: Comment cards select and reveal their anchor on activation, keep Resolve visible, reveal reply and send actions on the selected, hovered, or focused card, and replace the send-all button with a connect prompt when no agent is connected.
    owner: web-application
    source: {file: review-refinements-spec.md, anchor: contract}
    acceptance:
      behavior: {id: UXR-004-B, description: "Activating a card by click or Enter selects it and scrolls its anchor into view; reply and send controls are reachable by keyboard on the focused card; with no agent the panel shows the connect prompt."}
      failure: {id: UXR-004-F, description: "Hidden actions are never removed from the keyboard order of the focused card, and no control label is truncated at the default comments drawer width."}
    deployments: [local]
    status: specified
    depends_on: [CMT-019]
    evidence: []

  - id: UXR-005
    kind: behavior
    behavior: Comment and reply composers submit with Command-Enter or Control-Enter under the same validation as their submit buttons.
    owner: web-application
    source: {file: review-refinements-spec.md, anchor: contract}
    acceptance:
      behavior: {id: UXR-005-B, description: "Typing a comment and pressing Control-Enter posts it once and clears the draft; the same works in a reply composer."}
      failure: {id: UXR-005-F, description: "An empty or over-limit body does not submit, and Enter during IME composition never submits."}
    deployments: [local]
    status: specified
    depends_on: [DRF-001]
    evidence: []

  - id: UXR-006
    kind: behavior
    behavior: A command palette opened with Command-K or Control-K searches artifacts and runs review commands, and a shortcut sheet opened with ? lists every review shortcut; both trap focus and restore it on close.
    owner: web-application
    source: {file: review-refinements-spec.md, anchor: contract}
    acceptance:
      behavior: {id: UXR-006-B, description: "Control-K, typing part of an artifact name, and Enter opens that artifact; a command entry enters annotate mode; ? opens the sheet listing J/K, the left and right arrows, T, C, V, F, [, ], Esc, Command-backslash, Command-K, and Command-Enter."}
      failure: {id: UXR-006-F, description: "Neither opens while typing in an input or composer, Escape closes and restores focus to the previous element, and an empty search shows no results without errors."}
    deployments: [local]
    status: specified
    depends_on: []
    evidence: []

  - id: UXR-007
    kind: behavior
    behavior: The Compare tab can render two selected versions side by side in separate sandboxed frames with optional synchronized scrolling, keeping the file comparison as the default view.
    owner: web-application
    source: {file: review-refinements-spec.md, anchor: contract}
    acceptance:
      behavior: {id: UXR-007-B, description: "Comparing v1 and v2 and choosing Side by side shows both versions' entry documents in two frames labeled with their version numbers; synchronized scrolling keeps both scrolled together."}
      failure: {id: UXR-007-F, description: "Each frame keeps the opaque-origin sandbox of single-version review, and a version without an HTML entry shows a clear unavailable state instead of a blank frame."}
    deployments: [local]
    status: specified
    depends_on: [CMT-014]
    evidence: []

  - id: UXR-008
    kind: behavior
    behavior: Entering focus mode starts with the floating toolbar collapsed to its restore button showing the open-thread count, with a one-time hint naming Command-backslash.
    owner: web-application
    source: {file: review-refinements-spec.md, anchor: contract}
    acceptance:
      behavior: {id: UXR-008-B, description: "Pressing F shows only the restore button with the open count and a hint; Command-backslash or the button expands the toolbar; the hint does not appear on the second entry."}
      failure: {id: UXR-008-F, description: "With storage that throws the hint still shows and focus mode works; existing focus-mode tests for downloading and commenting still pass."}
    deployments: [local]
    status: specified
    depends_on: [PUB-013]
    evidence: []
```

## 4. Reader layout

**Added:** November 25, 2026 (Backlog ARTSV-6, design proposal `2026-11-25_proposal_reader-redesign`).

Review is content first. The preview fills the window under one shared top bar, and everything that used to sit in fixed columns beside it now lives in drawers that start closed on every visit:

- **Drawers (UXR-009).** The catalog (目錄) opens on the left; comments (留言) and version information (版本資訊) share the right side, so opening one closes the other. Version information holds the former inspector tabs: Versions, Details, Files, Activity, and Compare. Each drawer opens from an always-visible trigger that exposes `aria-expanded` and `aria-controls`, and each drawer is a labeled region. On a wide window an open drawer narrows the preview; below 760 pixels it overlays the preview instead, never resizes it, and leaves at least 56 pixels of it visible. The page never scrolls sideways. Closing a drawer returns focus to its trigger.
- **Drawer and step shortcuts (UXR-010).** T, C, and V toggle the catalog, comments, and version drawers and move focus to the opened drawer's title; `[` and `]` remain aliases for T and C. ← and → (and the existing J and K) step to the previous or next artifact. Esc closes the most recently opened drawer before it leaves annotate or focus mode. Chords with Shift, Alt, Control, or Command, keys typed in editable fields, and keys pressed inside the preview frame are never treated as shortcuts. The shortcut sheet from UXR-006 lists every one of these keys.
- **Bottom bar (UXR-011).** A bar under the preview shows previous and next controls, the position in the catalog ("2 / 7"), the selected file path, file count and size, and on wide windows the shortcut hints. Stepping by button or key selects the next artifact's current version, so the heading, version trigger, and path always describe the same artifact. At either end of the catalog the matching control is disabled and its key does nothing.

Visual rules from the proposal apply to every page that shares the top bar: no pill badges, no accent side tabs, no boxed card rows, no tracked-caps labels, no decorative status dots, and no middle-dot-joined metadata strings. Focus is always visible, text meets WCAG AA contrast, and the blue accent is reserved for versions and dispatch states.

Ledger entries added to `conformance.yml` on November 25, 2026:

```yaml
  - id: UXR-009
    kind: behavior
    behavior: Review gives the preview the full window, with the catalog, comments, and version information in drawers that start closed, open from always-visible triggers that expose aria-expanded and aria-controls, and never cover the whole preview.
    owner: web-application
    source: {file: review-refinements-spec.md, anchor: reader-layout}
    acceptance:
      behavior: {id: UXR-009-B, description: "On a 1440-pixel window every drawer trigger reports aria-expanded false and every drawer is hidden; opening the catalog narrows the preview, the comments and version drawers share the right side so opening one closes the other, and closing a drawer returns focus to its trigger."}
      failure: {id: UXR-009-F, description: "Below 760 pixels an open drawer overlays the preview without resizing it, leaves at least 56 pixels of the preview visible, and never makes the page scroll sideways."}
    deployments: [local]
    status: implementing
    depends_on: []

  - id: UXR-010
    kind: behavior
    behavior: T, C, and V toggle the catalog, comments, and version drawers and move focus into them, left and right arrows step through artifacts, and Escape closes the most recently opened drawer, while chords with modifiers, keys typed in editable fields, and keys pressed inside the preview frame are left alone.
    owner: web-application
    source: {file: review-refinements-spec.md, anchor: reader-layout}
    acceptance:
      behavior: {id: UXR-010-B, description: "T, C, and V open their drawers and focus each drawer's title, V replaces an open comments drawer, and two Escapes close the version drawer and then the catalog, each returning focus to its trigger."}
      failure: {id: UXR-010-F, description: "Shift-T, Alt-T, Alt-C, Control-Right, and Command-Right change nothing; T, C, V, the right arrow, and Escape pressed inside the focused preview frame change nothing; T, C, and V typed in catalog search stay in the field."}
    deployments: [local]
    status: implementing
    depends_on: [UXR-009, UXR-006]

  - id: UXR-011
    kind: behavior
    behavior: The bottom bar shows the selected artifact's path, its position in the catalog, and previous and next controls, and stepping by button or arrow key keeps the heading, version, and path of one artifact together.
    owner: web-application
    source: {file: review-refinements-spec.md, anchor: reader-layout}
    acceptance:
      behavior: {id: UXR-011-B, description: "Pressing the right arrow from the first of two artifacts shows the second artifact's name, current version, path, and position 2 / 2; Previous and the left arrow return to the first artifact's name, version, and path."}
      failure: {id: UXR-011-F, description: "At the first artifact Previous is disabled and the left arrow and K change nothing; at the last artifact Next is disabled and the right arrow and J leave the name, version, path, position, and address unchanged."}
    deployments: [local]
    status: implementing
    depends_on: [UXR-009]
```
