import {folderText} from "@/i18n/messages/folders";
import type {Folder} from "@/api/client";
import {
  ArtifactFolderLocation, FolderBreadcrumbs, FolderDialog, type FolderDialogAction, locateMovedArtifact,
  visibleArtifactName,
} from "./review-folders.tsx";
import {
  lazy,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  Suspense,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowRight02Icon,
  ArrowShrinkIcon,
  BookOpen01Icon,
  Cancel01Icon,
  Comment01Icon,
  Download04Icon,
  Edit02Icon,
  ExternalLinkIcon,
  File01Icon,
  Folder01Icon,
  FilterIcon,
  FullScreenIcon,
  GithubIcon,
  Home01Icon,
  KeyboardIcon,
  LayoutLeftIcon,
  Link01Icon,
  MoreHorizontalIcon,
  RefreshIcon,
  Search01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {Dialog} from "@base-ui/react/dialog";
import {Popover} from "@base-ui/react/popover";

import {setDraftPrincipal, writeDraft} from "@/components/comments/comment-drafts";
import {useCommentPoll} from "@/components/comments/comment-poll";
import {
  api,
  ApiError,
  type AccessContext,
  type ArtifactAction,
  type ArtifactComparison,
  type ArtifactDetails,
  type ArtifactPage,
  type ArtifactVersion,
  type Project,
  type Session,
  type Version,
} from "@/api/client";
import {
  actionLabel,
  formatBytes,
  formatRelativeTime,
  formatTimestamp,
  sourceDriftDescription,
  sourceFreshnessLabel,
  displayError} from "@/lib/presentation";
import {refinementText} from "@/i18n/messages/review-refinements";
import {recordReviewVisit} from "@/lib/review-visits";
import {ReviewCommandPalette, ReviewKeyboardDialog} from "./review-command-palette.tsx";
import {ComparisonPreview} from "./comparison-preview.tsx";
import {useCatalogOpenCounts} from "./use-catalog-open-counts.ts";
import {reviewAppText} from "@/i18n/messages/review-app";
import {readerText} from "@/i18n/messages/reader";
import {AppTopBar} from "./app-shell.tsx";
import artifactServerAnimationUrl from "./assets/artifact-server.svg";
import {
  useReviewComments,
  ReviewCommentsInspector,
  type ReviewCommentsInspectorHandle,
} from "./review-comments.tsx";
import {BoardContext, BoardCards, BoardConnections, type BoardStats} from "./board-details.tsx";
import type {ReviewOutlineEntry, ReviewAnchorRect} from "@/review-frame/protocol";
import {ReviewBoard, boardText, useBoardMode} from "./review-board.tsx";
import { ReviewPreview } from "./review-preview.tsx";
import {readReviewTheme, type ReviewTheme} from "./review-theme.ts";
import {ReviewProjectPicker} from "./review-project-picker.tsx";
import {
  isDashboardPath, isFilesPath, isLinkedFoldersPath, isSettingsPath, isTrashPath,
} from "./review-routes.ts";
import {FilesPage} from "./review-files.tsx";
import {MoveToTrashButton, TrashPage, useTrashUndo} from "./review-trash.tsx";
import {ReviewSettings} from "./review-settings.tsx";
import {AgentLogos, ReviewShareControl} from "./review-share.tsx";
import {useWebmcp, type WebmcpBindings} from "./webmcp.tsx";

// The linked-folders page loads only when someone opens it.
const LinkedFoldersPage = lazy(async () => ({
  default: (await import("./linked-folders-page.tsx")).LinkedFoldersPage,
}));

// The dashboard and its chart library load only when someone opens it.
const DashboardPage = lazy(async () => ({
  default: (await import("../dashboard/dashboard-page.tsx")).DashboardPage,
}));

type InspectorTab = "activity" | "compare" | "details" | "files" | "versions";
type RightDrawer = "comments" | "version";
type DrawerName = "catalog" | RightDrawer;
type ArtifactListLoadResult = "failed" | "loaded" | "skipped";
type CatalogCommentFilter = "all" | "with" | "without";
type CatalogRefreshState = "complete" | "idle" | "loading";
type CatalogSort = "comments" | "newest";
const catalogRefreshConfirmationMilliseconds = 1_600;

function reviewShortcutBlocked(event: KeyboardEvent, allowInComposite: boolean): boolean {
  if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.altKey) {
    return true;
  }

  const target = event.target instanceof Element ? event.target : null;
  // Keys pressed inside the preview never reach this window; a focused frame
  // element itself is still the artifact's, not the shell's.
  if (target instanceof HTMLIFrameElement) return true;
  if (target?.closest([
    "input",
    "textarea",
    "select",
    "[contenteditable]:not([contenteditable='false'])",
    "[role='dialog']",
    "[role='listbox']",
    "[role='menu']",
    ...(allowInComposite ? [] : ["[role='radiogroup']", "[role='slider']", "[role='tablist']"]),
  ].join(", "))) {
    return true;
  }

  return document.querySelector([
    ".as-catalog-filter-popover[data-open]",
    "[data-slot='popover-content'][data-open]",
    "[role='dialog'][data-open]",
    "[role='listbox'][data-open]",
    "[role='menu'][data-open]",
  ].join(", ")) !== null;
}

interface VersionListItem {
  readonly links: {readonly review: string; readonly version: string};
  readonly version: Version;
}

interface ReviewDownload {
  readonly href: string;
  readonly title: string;
}

interface ReviewLocation {
  readonly folderId: string | null;
  readonly artifactId: string | null;
  readonly path: string | null;
  readonly projectId: string | null;
  readonly versionId: string | null;
  readonly view: "focus" | null;
  readonly threadId?: string | null;
}

function CatalogFilters({
  commentFilter,
  knownTags,
  onCommentFilterChange,
  onTagFiltersChange,
  tagFilters,
}: {
  readonly commentFilter: CatalogCommentFilter;
  readonly knownTags: readonly string[];
  readonly onCommentFilterChange: (filter: CatalogCommentFilter) => void;
  readonly onTagFiltersChange: (tags: readonly string[]) => void;
  readonly tagFilters: readonly string[];
}) {
  const activeFilterCount = Number(commentFilter !== "all") + tagFilters.length;
  let triggerLabel = reviewAppText.filter.allArtifacts;
  if (commentFilter === "all" && tagFilters.length === 1) {
    triggerLabel = tagFilters[0] ?? reviewAppText.filter.oneTag;
  } else if (commentFilter === "all" && tagFilters.length > 1) {
    triggerLabel = reviewAppText.filter.tagCount(tagFilters.length);
  } else if (commentFilter === "with" && tagFilters.length === 0) {
    triggerLabel = reviewAppText.filter.withComments;
  } else if (commentFilter === "without" && tagFilters.length === 0) {
    triggerLabel = reviewAppText.filter.noComments;
  } else if (activeFilterCount > 0) {
    triggerLabel = reviewAppText.filter.filterCount(activeFilterCount);
  }
  const tags = [...new Set([...knownTags, ...tagFilters])].toSorted();
  const toggleTag = (tag: string): void => {
    onTagFiltersChange(
      tagFilters.includes(tag)
        ? tagFilters.filter((selected) => selected !== tag)
        : [...tagFilters, tag].toSorted(),
    );
  };

  return (
    <Popover.Root>
      <Popover.Trigger
        render={(
          <button
            aria-label={reviewAppText.filter.triggerLabel(activeFilterCount)}
            className="as-catalog-filter-trigger"
            type="button"
          />
        )}
      >
        <HugeiconsIcon aria-hidden="true" icon={FilterIcon} strokeWidth={1.8} />
        <span>{triggerLabel}</span>
        {activeFilterCount === 0 ? null : (
          <span aria-hidden="true" className="as-catalog-filter-trigger__count">
            {activeFilterCount}
          </span>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          align="start"
          className="as-catalog-filter-positioner"
          sideOffset={6}
        >
          <Popover.Popup aria-label={reviewAppText.filter.popupLabel} className="as-catalog-filter-popover">
            {activeFilterCount === 0 ? null : (
              <div className="as-catalog-filter-popover__actions">
                <button
                  className="as-catalog-filter-popover__clear"
                  onClick={() => {
                    onCommentFilterChange("all");
                    onTagFiltersChange([]);
                  }}
                  type="button"
                >
                  {reviewAppText.filter.clear}
                </button>
              </div>
            )}
            <fieldset>
              <legend>{reviewAppText.filter.commentsLegend}</legend>
              {([
                ["all", reviewAppText.filter.allArtifacts],
                ["with", reviewAppText.filter.withComments],
                ["without", reviewAppText.filter.noComments],
              ] as const).map(([value, label]) => (
                <label className="as-catalog-filter-option" data-selected={commentFilter === value} key={value}>
                  <input
                    checked={commentFilter === value}
                    name="catalog-comment-filter"
                    onChange={() => onCommentFilterChange(value)}
                    type="radio"
                    value={value}
                  />
                  <span>{label}</span>
                  {commentFilter === value ? (
                    <HugeiconsIcon aria-hidden="true" icon={Tick02Icon} strokeWidth={2} />
                  ) : null}
                </label>
              ))}
            </fieldset>
            <fieldset>
              <legend>{reviewAppText.filter.tagsLegend}</legend>
              <button
                aria-pressed={tagFilters.length === 0}
                className="as-catalog-filter-option"
                data-selected={tagFilters.length === 0}
                onClick={() => onTagFiltersChange([])}
                type="button"
              >
                <span>{reviewAppText.filter.anyTag}</span>
                {tagFilters.length === 0 ? (
                  <HugeiconsIcon aria-hidden="true" icon={Tick02Icon} strokeWidth={2} />
                ) : null}
              </button>
              {tags.length === 0 ? (
                <p className="as-catalog-filter-popover__empty">{reviewAppText.filter.noTags}</p>
              ) : tags.map((tag) => (
                <label className="as-catalog-filter-option" data-selected={tagFilters.includes(tag)} key={tag}>
                  <input
                    checked={tagFilters.includes(tag)}
                    name="catalog-tag-filter"
                    onChange={() => toggleTag(tag)}
                    type="checkbox"
                    value={tag}
                  />
                  <span>{tag}</span>
                  {tagFilters.includes(tag) ? (
                    <HugeiconsIcon aria-hidden="true" icon={Tick02Icon} strokeWidth={2} />
                  ) : null}
                </label>
              ))}
            </fieldset>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function ReviewKeyboardShortcuts() {
  return (
    <div className="as-keyboard-shortcuts">
      <section aria-labelledby="review-shortcuts-navigation">
        <h3 id="review-shortcuts-navigation">{reviewAppText.shortcuts.navigate}</h3>
        <dl>
          <div>
            <dt>{reviewAppText.shortcuts.previousArtifact}</dt>
            <dd><kbd>←</kbd><span>{reviewAppText.shortcuts.or}</span><kbd>K</kbd><span>{reviewAppText.shortcuts.or}</span><kbd>↑</kbd></dd>
          </div>
          <div>
            <dt>{reviewAppText.shortcuts.nextArtifact}</dt>
            <dd><kbd>→</kbd><span>{reviewAppText.shortcuts.or}</span><kbd>J</kbd><span>{reviewAppText.shortcuts.or}</span><kbd>↓</kbd></dd>
          </div>
        </dl>
      </section>
      <section aria-labelledby="review-shortcuts-layout">
        <h3 id="review-shortcuts-layout">{reviewAppText.shortcuts.layout}</h3>
        <dl>
          <div>
            <dt>{readerText.shortcuts.catalog}</dt>
            <dd><kbd>T</kbd><span>{reviewAppText.shortcuts.or}</span><kbd>[</kbd></dd>
          </div>
          <div>
            <dt>{readerText.shortcuts.comments}</dt>
            <dd><kbd>C</kbd><span>{reviewAppText.shortcuts.or}</span><kbd>]</kbd></dd>
          </div>
          <div>
            <dt>{readerText.shortcuts.version}</dt>
            <dd><kbd>V</kbd></dd>
          </div>
          <div>
            <dt>{reviewAppText.shortcuts.fullScreen}</dt>
            <dd><kbd>F</kbd></dd>
          </div>
          <div>
            <dt>{reviewAppText.shortcuts.backOrClose}</dt>
            <dd><kbd>Esc</kbd></dd>
          </div>
          <div>
            <dt>{reviewAppText.shortcuts.revealControls}</dt>
            <dd><kbd>⌘ / Ctrl</kbd><span>+</span><kbd>\</kbd></dd>
          </div>
        </dl>
      </section>
      <dl>
        <div><dt>{refinementText.palette.title}</dt><dd><kbd>⌘K / Ctrl+K</kbd></dd></div>
        <div><dt>{refinementText.palette.submit}</dt><dd><kbd>⌘↵ / Ctrl+Enter</kbd></dd></div>
        <div><dt>{reviewAppText.shortcuts.title}</dt><dd><kbd>?</kbd></dd></div>
      </dl>
    </div>
  );
}

/** Start the artifact-first Artifact Server review application. */
export function ReviewApp() {
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    setDraftPrincipal(session?.principal.id ?? null);
  }, [session]);
  const accessContextRef = useRef<AccessContext | null>(null);
  const bootstrapInFlightRef = useRef(false);
  const [projects, setProjects] = useState<readonly Project[]>([]);
  const [sessionState, setSessionState] = useState<
    "loading" | "ready" | "unauthenticated"
  >("loading");
  const [error, setError] = useState<Error | null>(null);
  const [theme, setTheme] = useState<ReviewTheme>(readReviewTheme);

  const bootstrap = useCallback(async (): Promise<void> => {
    if (bootstrapInFlightRef.current) return;
    bootstrapInFlightRef.current = true;
    setSessionState("loading");
    setError(null);
    try {
      const [loadedAccessContext, initialSession] = await Promise.all([
        api.accessContext(),
        api.session().then(
          (value) => ({kind: "authenticated" as const, value}),
          (cause: unknown) => ({cause, kind: "failed" as const}),
        ),
      ]);
      accessContextRef.current = loadedAccessContext;
      let loadedSession: Session;
      if (initialSession.kind === "authenticated") {
        loadedSession = initialSession.value;
      } else if (
        loadedAccessContext.accessMode === "local_owner"
        && initialSession.cause instanceof ApiError
        && initialSession.cause.status === 401
      ) {
        await api.localOwnerSession();
        loadedSession = await api.session();
      } else {
        throw initialSession.cause;
      }
      const loadedProjects = await api.projects();
      setSession(loadedSession);
      setProjects(loadedProjects);
      setSessionState("ready");
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        setSession(null);
        setSessionState("unauthenticated");
      } else {
        setError(
          caught instanceof Error
            ? caught
            : new Error(reviewAppText.gate.startFailed),
        );
        setSessionState("ready");
      }
    } finally {
      bootstrapInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    void bootstrap();
    const expire = (): void => {
      if (accessContextRef.current?.accessMode === "local_owner") {
        void bootstrap();
        return;
      }
      setSession(null);
      setSessionState("unauthenticated");
    };
    window.addEventListener("artifact-session-expired", expire);
    return () => window.removeEventListener("artifact-session-expired", expire);
  }, [bootstrap]);

  useEffect(() => {
    document.documentElement.dataset["reviewTheme"] = theme;
    document.documentElement.classList.toggle("dark", theme === "moon");
    try {
      window.localStorage.setItem("artifact-review-theme", theme);
    } catch {
      // The active theme still applies when storage is blocked.
    }
  }, [theme]);

  const createProject = useCallback(async (name: string): Promise<Project> => {
    const created = await api.createProject(name);
    setProjects((current) => [
      ...current.filter((project) => project.id !== created.id),
      created,
    ]);
    return created;
  }, []);
  const loadProjects = useCallback(async (): Promise<readonly Project[]> => {
    const loaded = await api.projects();
    setProjects(loaded);
    return loaded;
  }, []);

  if (sessionState === "loading") {
    return <ReviewGate description={reviewAppText.gate.loadingDescription} title={reviewAppText.gate.loadingTitle} />;
  }
  if (sessionState === "unauthenticated") {
    const returnTo = `${window.location.pathname}${window.location.search}`;
    return (
      <ReviewGate
        action={(
          <a className="as-button as-button--primary" href={`/auth/login?returnTo=${encodeURIComponent(returnTo)}`}>
            {reviewAppText.gate.signIn}
          </a>
        )}
        description={reviewAppText.gate.signInDescription}
        title={reviewAppText.gate.signInTitle}
      />
    );
  }
  if (error !== null) {
    return (
      <ReviewGate
        action={<button className="as-button" onClick={() => void bootstrap()} type="button">{reviewAppText.gate.tryAgain}</button>}
        description={displayError(error)}
        title={reviewAppText.gate.unavailableTitle}
      />
    );
  }
  if (session === null) return null;

  if (isDashboardPath(window.location.pathname)) {
    return (
      <Suspense fallback={null}>
        <DashboardPage
          filesCapabilities={session.capabilities}
          principalId={session.principal.id}
          onThemeChange={() => setTheme((current) => current === "moon" ? "dawn" : "moon")}
          projects={projects}
          theme={theme}
        />
      </Suspense>
    );
  }

  if (session.capabilities.fileOverview && isFilesPath(window.location.pathname)) {
    return (
      <FilesPage
        onThemeChange={() => setTheme((current) => current === "moon" ? "dawn" : "moon")}
        projects={projects}
        session={session}
        theme={theme}
      />
    );
  }

  if (session.capabilities.trash && isTrashPath(window.location.pathname)) {
    return (
      <TrashPage
        capabilities={session.capabilities}
        onThemeChange={() => setTheme((current) => current === "moon" ? "dawn" : "moon")}
        projects={projects}
        theme={theme}
      />
    );
  }

  if (isLinkedFoldersPath(window.location.pathname) && session.capabilities.linkedFolders) {
    return (
      <Suspense fallback={null}>
        <LinkedFoldersPage
          capabilities={session.capabilities}
          onThemeChange={() => setTheme((current) => current === "moon" ? "dawn" : "moon")}
          projects={projects}
          theme={theme}
        />
      </Suspense>
    );
  }

  if (isSettingsPath(window.location.pathname)) {
    return (
      <ReviewSettings
        onProjectsChanged={loadProjects}
        onThemeChange={() => setTheme((current) => current === "moon" ? "dawn" : "moon")}
        projects={projects}
        session={session}
        theme={theme}
      />
    );
  }

  return (
    <ArtifactReview
      onCreateProject={createProject}
      onThemeChange={() => setTheme((current) => current === "moon" ? "dawn" : "moon")}
      projects={projects}
      session={session}
      theme={theme}
    />
  );
}

function ArtifactReview({
  onCreateProject,
  onThemeChange,
  projects,
  session,
  theme,
}: {
  readonly onCreateProject: (name: string) => Promise<Project>;
  readonly onThemeChange: () => void;
  readonly projects: readonly Project[];
  readonly session: Session;
  readonly theme: ReviewTheme;
}) {
  const initialLocation = useMemo(readReviewLocation, []);
  const initialProjectId = initialLocation.projectId
    ?? projects.find((project) => project.archivedAt === null)?.id
    ?? projects[0]?.id
    ?? "";
  const [projectId, setProjectId] = useState(initialProjectId);
  const foldersAvailable = session.capabilities.folders;
  const [folderId, setFolderId] = useState(foldersAvailable ? initialLocation.folderId : null);
  const [folders, setFolders] = useState<readonly Folder[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<readonly Folder[]>([]);
  const [folderDialog, setFolderDialog] = useState<FolderDialogAction | null>(null);
  const [folderChanges, setFolderChanges] = useState(0);
  const [items, setItems] = useState<ArtifactPage["artifacts"]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(
    initialLocation.artifactId,
  );
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    initialLocation.versionId,
  );
  const [selectedPath, setSelectedPath] = useState<string | null>(
    initialLocation.path,
  );
  const [query, setQuery] = useState("");
  const searchQuery = useDeferredValue(query.trim());
  const [catalogCommentFilter, setCatalogCommentFilter] = useState<CatalogCommentFilter>("all");
  const [catalogTagFilters, setCatalogTagFilters] = useState<readonly string[]>([]);
  const [catalogKnownTags, setCatalogKnownTags] = useState<readonly string[]>([]);
  const [catalogSort, setCatalogSort] = useState<CatalogSort>("newest");
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<Error | null>(null);
  const [catalogRefreshState, setCatalogRefreshState] = useState<CatalogRefreshState>(
    "idle",
  );
  const [details, setDetails] = useState<ArtifactDetails | null>(null);
  const [versions, setVersions] = useState<readonly VersionListItem[]>([]);
  const [actions, setActions] = useState<readonly ArtifactAction[]>([]);
  const [actionNextCursor, setActionNextCursor] = useState<string | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState<Error | null>(null);
  const boardMode = useBoardMode();
  const [boardZoomRequest, setBoardZoomRequest] = useState<{readonly id: number; readonly delta: number} | null>(null);
  const receiveBoardZoom = useCallback((delta: number) => setBoardZoomRequest((current) => ({id: (current?.id ?? 0) + 1, delta})), []);
  const [boardWide, setBoardWide] = useState(() => window.matchMedia("(min-width: 761px)").matches);
  const [boardOutline, setBoardOutline] = useState<readonly ReviewOutlineEntry[]>([]);
  const [boardRects, setBoardRects] = useState<readonly ReviewAnchorRect[]>([]);
  const [boardStats, setBoardStats] = useState<BoardStats>({open: 0, awaiting: 0, sent: 0, resolved: 0});
  const [boardPeople, setBoardPeople] = useState<{readonly reviewers: readonly string[]; readonly targets: readonly string[]}>({reviewers: [], targets: []});
  const [boardCardsVisible, setBoardCardsVisible] = useState(true);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 761px)");
    const update = () => setBoardWide(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const [sideBySide, setSideBySide] = useState(false);
  const [comparison, setComparison] = useState<ArtifactComparison | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparisonError, setComparisonError] = useState<Error | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<ArtifactVersion | null>(null);
  useEffect(() => {setBoardOutline([]); setBoardRects([]);}, [selectedPath, selectedVersion?.version.id]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<Error | null>(null);
  const [linkedThreadId, setLinkedThreadId] = useState(initialLocation.threadId ?? null);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("versions");
  const [keyboardDialog, setKeyboardDialog] = useState<"palette" | "shortcuts" | null>(null);
  const [sendRequested, setSendRequested] = useState(false);
  const keyboardReturnFocus = useRef<HTMLElement | null>(null);
  const openKeyboardDialog = useCallback((dialog: "palette" | "shortcuts"): void => {
    keyboardReturnFocus.current = document.activeElement instanceof HTMLElement
      ? document.activeElement : null;
    setKeyboardDialog(dialog);
  }, []);
  // The catalog, comments and version info are drawers, all closed at rest:
  // the artifact owns the screen until the reader asks for a panel. A Review
  // URL that names a thread opens the comments drawer on that thread.
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [rightDrawer, setRightDrawer] = useState<RightDrawer | null>(linkedThreadId === null ? null : "comments");
  const drawerOrderRef = useRef<DrawerName[]>(linkedThreadId === null ? [] : ["comments"]);
  const drawerTriggerRefs = {
    catalog: useRef<HTMLButtonElement>(null),
    comments: useRef<HTMLButtonElement>(null),
    version: useRef<HTMLButtonElement>(null),
  };
  const drawerHeadingRefs = {
    catalog: useRef<HTMLHeadingElement>(null),
    comments: useRef<HTMLHeadingElement>(null),
    version: useRef<HTMLHeadingElement>(null),
  };
  const pendingDrawerFocusRef = useRef<{readonly name: DrawerName; readonly target: "heading" | "trigger"} | null>(null);
  const setDrawer = useCallback((name: DrawerName, open: boolean, moveFocus = false): void => {
    if (name === "catalog") setCatalogOpen(open);
    else setRightDrawer((current) => open ? name : current === name ? null : current);
    const others = drawerOrderRef.current.filter((entry) =>
      entry !== name && (!open || name === "catalog" || entry === "catalog"));
    drawerOrderRef.current = open ? [...others, name] : others;
    pendingDrawerFocusRef.current = moveFocus ? {name, target: open ? "heading" : "trigger"} : null;
  }, []);
  const openDrawer = useCallback((name: DrawerName): void => setDrawer(name, true), [setDrawer]);
  const [opening, setOpening] = useState(false);
  const [focusMode, setFocusMode] = useState(initialLocation.view === "focus");
  const [focusCommentsOpen, setFocusCommentsOpen] = useState(false);
  const [focusControlsCollapsed, setFocusControlsCollapsed] = useState(true);
  const [initialFocusCollapse, setInitialFocusCollapse] = useState(true);
  const [focusHint, setFocusHint] = useState(false);
  const hintShown = useRef(false);
  useEffect(() => {
    if (!focusMode) return;
    setFocusControlsCollapsed(true);
    setInitialFocusCollapse(true);
    if (hintShown.current) return;
    hintShown.current = true;
    try {
      if (window.localStorage.getItem("artifact-review-focus-hint") === "seen") return;
      window.localStorage.setItem("artifact-review-focus-hint", "seen");
    } catch {
      // In-memory state still limits the hint to once during this page visit.
    }
    setFocusHint(true);
  }, [focusMode]);
  const [focusControlsHoverArmed, setFocusControlsHoverArmed] = useState(true);
  const [focusControlsInstant, setFocusControlsInstant] = useState(false);
  const [htmlAnnotateModeActive, setHtmlAnnotateModeActive] = useState(true);
  const [homeOpen, setHomeOpen] = useState(false);
  const focusCommentsButtonRef = useRef<HTMLButtonElement>(null);
  const focusControlsRestoreRef = useRef<HTMLButtonElement>(null);
  const previewPanelRef = useRef<HTMLElement>(null);
  const commentsInspectorRef = useRef<ReviewCommentsInspectorHandle>(null);
  const catalogRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const catalogRequestGenerationRef = useRef(0);
  // Focus follows a drawer opened or closed from the keyboard, once the
  // drawer has rendered: to its heading on open, back to its trigger on close.
  // A key pressed while an earlier render's effects are still pending flushes
  // those effects first; they see the drawer in its old state and must leave
  // the request for the render that actually opens or closes it.
  useEffect(() => {
    const pending = pendingDrawerFocusRef.current;
    if (pending === null) return;
    const rendered = pending.name === "catalog" ? catalogOpen : rightDrawer === pending.name;
    if (rendered !== (pending.target === "heading")) return;
    pendingDrawerFocusRef.current = null;
    const target = pending.target === "heading"
      ? drawerHeadingRefs[pending.name].current
      : drawerTriggerRefs[pending.name].current;
    target?.focus({preventScroll: true});
  });
  const followCommentVersion = useCallback((versionId: string): void => {
    setDetailError(null);
    setSelectedVersionId(versionId);
    setSelectedPath(null);
  }, []);
  const comments = useReviewComments({
    artifactId: selectedArtifactId,
    onPathChanged: setSelectedPath,
    onVersionChanged: followCommentVersion,
    projectId,
    versionId: selectedVersionId,
  });
  useEffect(() => {
    if (details === null || details.artifact.tags.length === 0) return;
    setCatalogKnownTags((current) => [
      ...new Set([...current, ...details.artifact.tags]),
    ].toSorted());
  }, [details]);
  const openCommentCount = comments.threads.filter(
    (thread) => thread.state === "open",
  ).length;

  // Browser agent tools (WebMCP): the ref hands the adapter live view state
  // each render; registration itself lives entirely in webmcp.tsx.
  const webmcpRef = useRef<WebmcpBindings>({
    getSnapshot: () => webmcpSnapshot(),
    openArtifact: () => undefined,
    reloadComments: () => Promise.resolve(),
  });
  const webmcpSnapshot = (): ReturnType<WebmcpBindings["getSnapshot"]> => ({
    artifact: details === null ? null : {
      currentVersionId: details.artifact.currentVersionId,
      id: details.artifact.id,
      name: details.artifact.name,
    },
    loading: detailLoading || comments.loading
      || (selectedArtifactId !== null && selectedVersion === null),
    projectId,
    projectName: projects.find((project) => project.id === projectId)?.name ?? null,
    replies: comments.repliesByThread,
    threads: comments.threads,
    version: selectedVersion === null ? null : {
      createdAt: selectedVersion.version.createdAt,
      id: selectedVersion.version.id,
    },
  });
  webmcpRef.current = {
    getSnapshot: webmcpSnapshot,
    openArtifact: (artifactId, versionId) => {
      setDetailError(null);
      setSelectedArtifactId(artifactId);
      setSelectedVersionId(versionId);
      setSelectedPath(null);
    },
    reloadComments: comments.reload,
  };
  useWebmcp(webmcpRef);

  const selectedProject = projects.find((project) => project.id === projectId) ?? null;
  const catalogItems = useMemo<ArtifactPage["artifacts"]>(() => {
    if (
      details === null
      || (foldersAvailable && (details.artifact.folderId ?? null) !== folderId)
      || searchQuery !== ""
      || catalogCommentFilter !== "all"
      || catalogTagFilters.length > 0
      || items.some(({artifact}) => artifact.id === details.artifact.id)
    ) return items;
    return [{
      artifact: details.artifact,
      commentCount: comments.threads.length,
      links: details.links,
      versionCount: versions.length,
    }, ...items];
  }, [
    catalogCommentFilter,
    catalogTagFilters.length,
    comments.threads.length,
    details,
    folderId,
    foldersAvailable,
    items,
    searchQuery,
    versions.length,
  ]);
  const duplicateNames = useMemo(() => {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const {artifact} of catalogItems) {
      if (seen.has(artifact.name)) duplicates.add(artifact.name);
      seen.add(artifact.name);
    }
    return duplicates;
  }, [catalogItems]);
  const selectedIndex = catalogItems.findIndex(
    ({artifact}) => artifact.id === selectedArtifactId,
  );
  const catalogOpenCounts = useCatalogOpenCounts({
    comments: comments.threads, items: catalogItems, projectId, selectedArtifactId,
  });
  const selectedItem = selectedIndex < 0 ? null : catalogItems[selectedIndex] ?? null;
  const loadArtifacts = useCallback(async (
    cursor: string | null,
    replace: boolean,
  ): Promise<ArtifactListLoadResult> => {
    if (projectId === "") return "skipped";
    const requestGeneration = ++catalogRequestGenerationRef.current;
    setListLoading(true);
    setListError(null);
    try {
      const page = await api.artifacts(projectId, cursor, catalogTagFilters, searchQuery, {
        comments: catalogCommentFilter,
        sort: catalogSort,
        folderId: foldersAvailable ? folderId : undefined,
      });
      if (requestGeneration !== catalogRequestGenerationRef.current) return "skipped";
      setCatalogKnownTags((current) => {
        const next = new Set(current);
        for (const {artifact} of page.artifacts) {
          for (const tag of artifact.tags) next.add(tag);
        }
        return [...next].toSorted();
      });
      if ("folders" in page) {
        setBreadcrumbs(page.breadcrumbs);
        setFolders((current) => replace ? page.folders : [...current, ...page.folders]);
      }
      setItems((current) => replace ? page.artifacts : [...current, ...page.artifacts]);
      setNextCursor(page.nextCursor);
      if (replace || foldersAvailable) {
        setSelectedArtifactId((current) => {
          return current ?? page.artifacts[0]?.artifact.id ?? null;
        });
      }
      return "loaded";
    } catch (caught) {
      if (requestGeneration === catalogRequestGenerationRef.current) {
        setListError(
          caught instanceof Error ? caught : new Error(reviewAppText.catalog.listFailed),
        );
      }
      return "failed";
    } finally {
      if (requestGeneration === catalogRequestGenerationRef.current) {
        setListLoading(false);
      }
    }
  }, [catalogCommentFilter, catalogSort, catalogTagFilters, folderId, foldersAvailable, projectId, searchQuery]);

  const refreshArtifacts = useCallback(async (): Promise<void> => {
    if (listLoading) return;
    if (catalogRefreshTimerRef.current !== null) {
      clearTimeout(catalogRefreshTimerRef.current);
      catalogRefreshTimerRef.current = null;
    }
    setCatalogRefreshState("loading");
    const result = await loadArtifacts(null, true);
    if (result !== "loaded") {
      setCatalogRefreshState("idle");
      return;
    }
    setCatalogRefreshState("complete");
    catalogRefreshTimerRef.current = setTimeout(() => {
      catalogRefreshTimerRef.current = null;
      setCatalogRefreshState("idle");
    }, catalogRefreshConfirmationMilliseconds);
  }, [listLoading, loadArtifacts]);

  useEffect(() => () => {
    if (catalogRefreshTimerRef.current !== null) {
      clearTimeout(catalogRefreshTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (catalogRefreshTimerRef.current !== null) {
      clearTimeout(catalogRefreshTimerRef.current);
      catalogRefreshTimerRef.current = null;
    }
    setCatalogRefreshState("idle");
    setItems([]);
    setFolders([]);
    setBreadcrumbs([]);
    void loadArtifacts(null, true);
  }, [loadArtifacts]);

  const crossProjectMove = session.capabilities.crossProjectMove;
  // A cross-project move keeps every ID, so Review follows the artifact or
  // folder to its new project instead of showing an old project-scoped miss.
  const openMovedLocation = useCallback((nextProjectId: string, nextFolderId: string | null, artifactId: string | null): void => {
    setCatalogKnownTags([]);
    setCatalogTagFilters([]);
    setProjectId(nextProjectId);
    setFolderId(foldersAvailable ? nextFolderId : null);
    setSelectedArtifactId(artifactId);
    setDetailError(null);
  }, [foldersAvailable]);

  useEffect(() => {
    if (selectedArtifactId === null || projectId === "") {
      setDetails(null);
      setVersions([]);
      setActions([]);
      setActionNextCursor(null);
      setComparison(null);
      setSelectedVersion(null);
      return undefined;
    }
    let current = true;
    setActions([]);
    setActionNextCursor(null);
    setComparison(null);
    setDetailLoading(true);
    setDetailError(null);
    void (async () => {
      try {
        const [loadedDetails, loadedVersions] = await Promise.all([
          api.artifact(projectId, selectedArtifactId),
          api.versions(projectId, selectedArtifactId),
        ]);
        if (!current) return;
        recordReviewVisit(session.principal.id, loadedDetails.artifact.id);
        setDetails(loadedDetails);
        setVersions(loadedVersions);
        setSelectedVersionId((selected) => {
          return selected ?? loadedDetails.current.version.id;
        });
      } catch (caught) {
        if (!current) return;
        const moved = crossProjectMove && caught instanceof ApiError && caught.code === "ARTIFACT_NOT_FOUND"
          ? await locateMovedArtifact(selectedArtifactId, projectId)
          : null;
        if (!current) return;
        if (moved !== null) {
          openMovedLocation(moved.projectId, moved.folderId, moved.artifactId);
          return;
        }
        setDetails(null);
        setVersions([]);
        setSelectedVersion(null);
        setDetailError(
          caught instanceof Error ? caught : new Error(reviewAppText.errors.detailsFailed),
        );
      } finally {
        if (current) setDetailLoading(false);
      }
    })();
    return () => {
      current = false;
    };
  }, [crossProjectMove, openMovedLocation, projectId, selectedArtifactId, session.principal.id]);

  const refreshLinkedDetails = useCallback(async (): Promise<void> => {
    if (selectedArtifactId === null || projectId === "") return;
    try {
      setDetails(await api.artifact(projectId, selectedArtifactId));
    } catch {
      // Ambient freshness never replaces the last readable artifact state.
    }
  }, [projectId, selectedArtifactId]);

  useCommentPoll(
    refreshLinkedDetails,
    session.capabilities.linkedArtifacts && details?.sourceBinding !== undefined,
  );

  const loadActions = useCallback(async (cursor: string | null): Promise<void> => {
    if (selectedArtifactId === null || projectId === "") return;
    setActivityLoading(true);
    setActivityError(null);
    try {
      const page = await api.actions(projectId, selectedArtifactId, cursor);
      setActions((current) => cursor === null ? page.actions : [...current, ...page.actions]);
      setActionNextCursor(page.nextCursor);
    } catch (caught) {
      setActivityError(caught instanceof Error ? caught : new Error(reviewAppText.errors.activityFailed));
    } finally {
      setActivityLoading(false);
    }
  }, [projectId, selectedArtifactId]);

  useEffect(() => {
    if (inspectorTab === "activity" && actions.length === 0 && !activityLoading) {
      void loadActions(null);
    }
  }, [actions.length, activityLoading, inspectorTab, loadActions]);

  useEffect(() => {
    if (
      details === null
      || selectedArtifactId === null
      || selectedVersionId === null
    ) {
      setSelectedVersion(null);
      return undefined;
    }
    if (selectedVersionId === details.current.version.id) {
      setSelectedVersion(details.current);
      return undefined;
    }
    let current = true;
    setSelectedVersion(null);
    void (async () => {
      try {
        const loaded = await api.version(
          projectId,
          selectedArtifactId,
          selectedVersionId,
        );
        if (current) setSelectedVersion(loaded);
      } catch (caught) {
        if (!current) return;
        setDetailError(
          caught instanceof Error ? caught : new Error(reviewAppText.errors.versionFailed),
        );
      }
    })();
    return () => {
      current = false;
    };
  }, [details, projectId, selectedArtifactId, selectedVersionId]);

  useEffect(() => {
    const href = reviewHref({
      artifactId: selectedArtifactId,
      path: selectedPath,
      folderId,
      projectId,
      versionId: selectedVersionId,
      threadId: linkedThreadId,
      view: focusMode ? "focus" : null,
    });
    window.history.replaceState(null, "", href);
    window.sessionStorage.setItem("artifact-review-return-url", href);
  }, [focusMode, folderId, linkedThreadId, projectId, selectedArtifactId, selectedPath, selectedVersionId]);

  useEffect(() => {
    const restoreLocation = (): void => {
      const restored = readReviewLocation();
      if (restored.projectId !== null) {
        setCatalogKnownTags([]);
        setCatalogTagFilters([]);
        setProjectId(restored.projectId);
      }
      setFolderId(foldersAvailable ? restored.folderId : null);
      setSelectedArtifactId(restored.artifactId);
      setSelectedVersionId(restored.versionId);
      setSelectedPath(restored.path);
      setLinkedThreadId(restored.threadId ?? null);
      if (restored.threadId !== null && restored.threadId !== undefined) {
        setDrawer("comments", true);
      }
      setFocusHint(false);
      setFocusMode(restored.view === "focus");
    };
    window.addEventListener("popstate", restoreLocation);
    return () => window.removeEventListener("popstate", restoreLocation);
  }, [foldersAvailable, setDrawer]);

  const openRawArtifact = async (): Promise<void> => {
    if (selectedArtifactId === null || selectedVersionId === null) return;
    const popup = window.open("about:blank", "_blank");
    setOpening(true);
    setDetailError(null);
    try {
      const issued = await api.contentSession(
        projectId,
        selectedArtifactId,
        selectedVersionId,
      );
      if (popup === null) {
        window.location.assign(issued.bootstrapUrl);
      } else {
        popup.opener = null;
        popup.location.replace(issued.bootstrapUrl);
      }
    } catch (caught) {
      popup?.close();
      setDetailError(
        caught instanceof Error ? caught : new Error(reviewAppText.errors.openFailed),
      );
    } finally {
      setOpening(false);
    }
  };

  const canComment = selectedProject?.archivedAt === null
    && (
      (
        session.principal.kind === "human"
        && session.principal.authorizedByPrincipalId === null
      )
      || session.principal.capabilities.includes("comment:write")
    );
  const canManageProjects = (
    session.principal.kind === "human"
    && session.principal.authorizedByPrincipalId === null
  ) || session.principal.capabilities.includes("project:manage");
  const canManageArtifacts = selectedProject?.archivedAt === null && (
    (
      session.principal.kind === "human"
      && session.principal.authorizedByPrincipalId === null
    )
    || session.principal.capabilities.includes("artifact:manage:any")
  );
  const canDeleteAnyComment = (
    session.principal.kind === "human"
    && session.principal.authorizedByPrincipalId === null
    && session.principal.membershipRole === "administrator"
  ) || session.principal.capabilities.includes("artifact:manage:any");
  const previewKind = reviewPreviewKind(selectedVersion, selectedPath);
  // Markdown renders in the same review sandbox as HTML, so it annotates too.
  const previewAnnotatable = previewKind === "html"
    || reviewEntryIsMarkdown(selectedVersion, selectedPath);
  const download = reviewDownload(
    projectId,
    selectedArtifactId,
    selectedVersion,
  );
  const selectArtifact = useCallback((artifactId: string, versionId?: string): void => {
    setLinkedThreadId(null);
    setDetailError(null);
    setSelectedArtifactId(artifactId);
    setSelectedVersionId(versionId ?? null);
    setSelectedPath(null);
  }, []);
  const trashUndo = useTrashUndo(async (artifact) => {
    if (artifact.projectId !== projectId) return;
    await loadArtifacts(null, true);
    selectArtifact(artifact.id);
  });
  const selectProject = (nextProjectId: string): void => {
    if (nextProjectId !== projectId) {
      setCatalogKnownTags([]);
      setCatalogTagFilters([]);
      setLinkedThreadId(null);
      setFolderId(null);
      setSelectedArtifactId(null);
      setSelectedVersionId(null);
      setSelectedPath(null);
    }
    setProjectId(nextProjectId);
  };
  const navigateFolder = (id: string | null): void => {
    if (id === folderId) return;
    window.history.pushState(null, "", reviewHref({
      artifactId: null, folderId: id, path: null, projectId, versionId: null, view: null,
    }));
    setFolderId(id);
    setSelectedArtifactId(null);
    setSelectedVersionId(null);
    setSelectedPath(null);
    setDetailError(null);
  };
  const selectManifestPath = (path: string): void => {
    window.history.pushState(null, "", reviewHref({
      artifactId: selectedArtifactId,
      path,
      folderId,
      projectId,
      versionId: selectedVersionId,
      view: focusMode ? "focus" : null,
    }));
    setSelectedPath(path);
  };
  const changeTags = async (tags: readonly string[]): Promise<void> => {
    if (details === null) return;
    const changed = await api.changeTags(
      details.artifact.projectId,
      details.artifact.id,
      details.artifact.currentVersionId,
      tags,
      crypto.randomUUID(),
    );
    updateArtifact(changed.artifact);
  };
  const updateArtifact = (artifact: ArtifactDetails["artifact"]): void => {
    setCatalogKnownTags((current) => [...new Set([...current, ...artifact.tags])].toSorted());
    setDetails((current) => current?.artifact.id === artifact.id
      ? {...current, artifact}
      : current);
    setItems((current) => current.map((item) => item.artifact.id === artifact.id
      ? {...item, artifact}
      : item));
  };
  const makeVersionCurrent = async (
    versionId: string,
    expectedCurrentVersionId: string,
  ): Promise<boolean> => {
    if (details === null) return false;
    setDetailError(null);
    try {
      const restored = await api.restore(
        details.artifact.projectId,
        details.artifact.id,
        expectedCurrentVersionId,
        versionId,
        crypto.randomUUID(),
      );
      updateArtifact(restored.artifact);
      const [loadedDetails, loadedVersions] = await Promise.all([
        api.artifact(details.artifact.projectId, details.artifact.id),
        api.versions(details.artifact.projectId, details.artifact.id),
      ]);
      setDetails(loadedDetails);
      setVersions(loadedVersions);
      return true;
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        try {
          const [loadedDetails, loadedVersions] = await Promise.all([
            api.artifact(details.artifact.projectId, details.artifact.id),
            api.versions(details.artifact.projectId, details.artifact.id),
          ]);
          setDetails(loadedDetails);
          setVersions(loadedVersions);
          updateArtifact(loadedDetails.artifact);
        } catch {
          // Keep the original conflict visible when refreshing pointer state fails.
        }
        setDetailError(new Error(reviewAppText.errors.versionChanged));
        return false;
      }
      setDetailError(
        caught instanceof Error ? caught : new Error(reviewAppText.errors.makeCurrentFailed),
      );
      return false;
    }
  };
  const compareVersions = async (fromVersionId: string, toVersionId: string): Promise<void> => {
    if (details === null || fromVersionId === toVersionId) return;
    setComparisonLoading(true);
    setComparisonError(null);
    try {
      setSideBySide(false);
      setComparison(await api.comparison(
        details.artifact.projectId,
        details.artifact.id,
        fromVersionId,
        toVersionId,
      ));
      setInspectorTab("compare");
    } catch (caught) {
      setComparisonError(caught instanceof Error ? caught : new Error(reviewAppText.errors.compareFailed));
    } finally {
      setComparisonLoading(false);
    }
  };
  const captureLinkedArtifact = async (): Promise<void> => {
    if (details === null) return;
    setDetailLoading(true);
    setDetailError(null);
    try {
      const captured = await api.captureArtifact(
        details.artifact.projectId,
        details.artifact.id,
        details.artifact.currentVersionId,
        crypto.randomUUID(),
      );
      const [loadedDetails, loadedVersions] = await Promise.all([
        api.artifact(details.artifact.projectId, details.artifact.id),
        api.versions(details.artifact.projectId, details.artifact.id),
      ]);
      setDetails(loadedDetails);
      setVersions(loadedVersions);
      setSelectedVersionId(captured.version.id);
      updateArtifact(loadedDetails.artifact);
    } catch (caught) {
      setDetailError(caught instanceof Error ? caught : new Error(reviewAppText.errors.captureFailed));
    } finally {
      setDetailLoading(false);
    }
  };
  const openLinkedArtifact = async (): Promise<void> => {
    if (details === null) return;
    const popup = window.open("about:blank", "_blank");
    setDetailError(null);
    try {
      const issued = await api.liveSession(details.artifact.projectId, details.artifact.id);
      if (popup === null) window.location.assign(issued.bootstrapUrl);
      else {
        popup.opener = null;
        popup.location.replace(issued.bootstrapUrl);
      }
    } catch (caught) {
      popup?.close();
      setDetailError(caught instanceof Error ? caught : new Error(reviewAppText.errors.liveFailed));
    }
  };
  const tombstoneArtifact = async (): Promise<boolean> => {
    if (details === null) return false;
    setDetailError(null);
    try {
      await api.deleteArtifact(
        details.artifact.projectId,
        details.artifact.id,
        details.artifact.currentVersionId,
        crypto.randomUUID(),
      );
      setItems((current) => current.filter(({artifact}) => artifact.id !== details.artifact.id));
      if (session.capabilities.trash) {
        trashUndo.trashed({id: details.artifact.id, name: details.artifact.name, projectId: details.artifact.projectId});
      }
      setSelectedArtifactId(null);
      setSelectedVersionId(null);
      setSelectedPath(null);
      setDetails(null);
      setVersions([]);
      void loadArtifacts(null, true);
      return true;
    } catch (caught) {
      setDetailError(caught instanceof Error ? caught : new Error(reviewAppText.errors.deleteFailed));
      return false;
    }
  };
  const enterFocusMode = useCallback((): void => {
    window.history.pushState(null, "", reviewHref({
      artifactId: selectedArtifactId,
      path: selectedPath,
      folderId,
      projectId,
      versionId: selectedVersionId,
      view: "focus",
    }));
    setFocusCommentsOpen(false);
    setFocusControlsCollapsed(true);
    setFocusMode(true);
  }, [folderId, projectId, selectedArtifactId, selectedPath, selectedVersionId]);
  const exitFocusMode = useCallback((): void => {
    window.history.pushState(null, "", reviewHref({
      artifactId: selectedArtifactId,
      path: selectedPath,
      folderId,
      projectId,
      versionId: selectedVersionId,
      view: null,
    }));
    setFocusCommentsOpen(false);
    setFocusHint(false);
    setFocusMode(false);
  }, [folderId, projectId, selectedArtifactId, selectedPath, selectedVersionId]);
  const stepArtifact = useCallback((direction: -1 | 1): void => {
    const next = catalogItems[selectedIndex + direction];
    if (next !== undefined) {
      selectArtifact(next.artifact.id, next.artifact.currentVersionId);
    }
  }, [catalogItems, selectArtifact, selectedIndex]);
  useEffect(() => {
    const handleReviewShortcut = (event: KeyboardEvent): void => {
      if (homeOpen || keyboardDialog !== null) return;
      const key = event.key.toLowerCase();
      // Escape still closes a drawer from its own tab row; every other key
      // there belongs to the tabs.
      if (reviewShortcutBlocked(event, key === "escape")) return;

      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && key === "k") {
        event.preventDefault();
        openKeyboardDialog("palette");
        return;
      }
      if (event.metaKey || event.ctrlKey) return;
      if (key === "?") {
        event.preventDefault();
        openKeyboardDialog("shortcuts");
        return;
      }
      if (event.shiftKey) return;
      if (key === "escape") {
        const lastDrawer = drawerOrderRef.current.at(-1);
        if (focusCommentsOpen) {
          event.preventDefault();
          setFocusCommentsOpen(false);
        } else if (!focusMode && lastDrawer !== undefined) {
          event.preventDefault();
          setDrawer(lastDrawer, false, true);
        } else if (htmlAnnotateModeActive) {
          event.preventDefault();
          setHtmlAnnotateModeActive(false);
        } else if (focusMode) {
          event.preventDefault();
          exitFocusMode();
        }
        return;
      }

      if (key === "f" && selectedVersionId !== null) {
        event.preventDefault();
        if (focusMode) exitFocusMode();
        else enterFocusMode();
        return;
      }

      // C and its older alias ] toggle comments: the drawer, or the focus-mode
      // comments panel while the viewer is full screen.
      if (key === "c" || key === "]") {
        event.preventDefault();
        if (focusMode) setFocusCommentsOpen((current) => !current);
        else setDrawer("comments", rightDrawer !== "comments", true);
        return;
      }

      // T and its older alias [ toggle the catalog drawer; V the version info.
      if ((key === "t" || key === "[") && !focusMode) {
        event.preventDefault();
        setDrawer("catalog", !catalogOpen, true);
        return;
      }
      if (key === "v" && !focusMode) {
        event.preventDefault();
        setDrawer("version", rightDrawer !== "version", true);
        return;
      }

      const direction = key === "j" || key === "arrowdown" || key === "arrowright"
        ? 1
        : key === "k" || key === "arrowup" || key === "arrowleft"
          ? -1
          : 0;
      if (direction === 0) return;

      event.preventDefault();
      stepArtifact(direction);
    };

    window.addEventListener("keydown", handleReviewShortcut);
    return () => window.removeEventListener("keydown", handleReviewShortcut);
  }, [
    catalogOpen,
    enterFocusMode,
    exitFocusMode,
    focusCommentsOpen,
    focusMode,
    homeOpen,
    htmlAnnotateModeActive,
    keyboardDialog,
    openKeyboardDialog,
    rightDrawer,
    selectedVersionId,
    setDrawer,
    stepArtifact,
  ]);
  const hideFocusControls = (event: ReactMouseEvent<HTMLButtonElement>): void => {
    previewPanelRef.current?.focus({preventScroll: true});
    setInitialFocusCollapse(false);
    setFocusControlsHoverArmed(event.detail === 0);
    setFocusControlsCollapsed(true);
    if (event.detail === 0) {
      window.requestAnimationFrame(() => {
        focusControlsRestoreRef.current?.focus({preventScroll: true});
      });
    }
  };
  const showFocusControls = (): void => {
    setFocusHint(false);
    setFocusControlsHoverArmed(true);
    setFocusControlsCollapsed(false);
    window.requestAnimationFrame(() => focusCommentsButtonRef.current?.focus({preventScroll: true}));
  };
  useEffect(() => {
    if (!focusMode) return undefined;
    const revealFocusControls = (event: KeyboardEvent): void => {
      const target = event.target instanceof Element ? event.target : null;
      const isShortcut = (event.metaKey || event.ctrlKey)
        && !event.altKey
        && !event.shiftKey
        && (event.code === "Backslash" || event.key === "\\");
      if (
        !isShortcut
        || event.defaultPrevented
        || event.isComposing
        || target?.closest('[role="dialog"], [data-slot="popover-content"]')
      ) {
        return;
      }
      event.preventDefault();
      setFocusHint(false);
      setFocusControlsInstant(true);
      setFocusControlsCollapsed(false);
      window.requestAnimationFrame(() => {
        focusCommentsButtonRef.current?.focus({preventScroll: true});
        window.requestAnimationFrame(() => setFocusControlsInstant(false));
      });
    };
    window.addEventListener("keydown", revealFocusControls);
    return () => window.removeEventListener("keydown", revealFocusControls);
  }, [focusMode]);
  const returnHome = (event: ReactMouseEvent<HTMLAnchorElement>): void => {
    if (
      event.button !== 0
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey
    ) {
      return;
    }
    event.preventDefault();
    setHomeOpen(true);
  };

  const previewName = visibleArtifactName(details?.artifact.name ?? selectedItem?.artifact.name ?? "Artifact Server");
  const previewPath = selectedVersion === null ? null : selectedPath ?? selectedVersion.manifest.entryPath;
  const previewBytes = selectedVersion?.manifest.entries.reduce((sum, entry) => sum + entry.size, 0) ?? 0;
  const viewingCurrent = selectedVersion !== null && details !== null
    && selectedVersion.version.id === details.artifact.currentVersionId;
  const sendToAgent = (): void => {
    if (focusMode) setFocusCommentsOpen(true);
    else openDrawer("comments");
    setSendRequested(true);
  };
  const toggleDrawer = (name: DrawerName): void => {
    setDrawer(name, name === "catalog" ? !catalogOpen : rightDrawer !== name);
  };

  const boardComparing = inspectorTab === "compare" && comparison !== null && sideBySide;
  useEffect(() => {setBoardOutline([]); setBoardRects([]);}, [boardComparing]);
  const boardCommentsVisible = boardMode.enabled && boardWide && !focusMode && rightDrawer !== "version";
  return (
    <div
      data-board-mode={boardMode.enabled}
      className="as-app"
      data-catalog-open={catalogOpen}
      data-focus-mode={focusMode}
      data-html-annotate-mode={htmlAnnotateModeActive}
      data-right-drawer={rightDrawer ?? "none"}
    >
      <a className="as-skip-link" href="#review-preview">{reviewAppText.home.skipLink}</a>

      <Dialog.Root onOpenChange={setHomeOpen} open={homeOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="as-home-overlay__backdrop" />
          <Dialog.Popup className="as-home-overlay">
            <Dialog.Title className="as-visually-hidden">{reviewAppText.home.title}</Dialog.Title>
            <Dialog.Close
              aria-label={reviewAppText.home.close}
              className="as-icon-button as-home-overlay__close"
              title={reviewAppText.home.close}
            >
              <HugeiconsIcon aria-hidden="true" icon={Cancel01Icon} strokeWidth={1.8} />
            </Dialog.Close>
            <div className="as-home-overlay__content">
            <img
              alt=""
              aria-hidden="true"
                className="as-home-overlay__animation"
              src={artifactServerAnimationUrl}
            />
              <nav aria-label={reviewAppText.home.resources} className="as-home-resources">
                <a
                  className="as-home-resources__link"
                  href="https://github.com/plannotator/artifact-server"
                  rel="noreferrer"
                  target="_blank"
                >
                  <span className="as-home-resources__icon">
                    <HugeiconsIcon aria-hidden="true" icon={GithubIcon} strokeWidth={1.8} />
                  </span>
                  <span className="as-home-resources__identity">
                    <strong>GitHub</strong>
                    <span>{reviewAppText.home.githubDescription}</span>
                  </span>
                  <HugeiconsIcon aria-hidden="true" icon={ExternalLinkIcon} strokeWidth={1.8} />
                </a>
                <a
                  className="as-home-resources__link"
                  href="https://artifactserver.com/"
                  rel="noreferrer"
                  target="_blank"
                >
                  <span className="as-home-resources__icon">
                    <HugeiconsIcon aria-hidden="true" icon={Home01Icon} strokeWidth={1.8} />
                  </span>
                  <span className="as-home-resources__identity">
                    <strong>{reviewAppText.home.homepage}</strong>
                    <span>{reviewAppText.home.homepageDescription}</span>
                  </span>
                  <HugeiconsIcon aria-hidden="true" icon={ExternalLinkIcon} strokeWidth={1.8} />
                </a>
                <a
                  className="as-home-resources__link"
                  href="https://artifactserver.com/docs/"
                  rel="noreferrer"
                  target="_blank"
                >
                  <span className="as-home-resources__icon">
                    <HugeiconsIcon aria-hidden="true" icon={BookOpen01Icon} strokeWidth={1.8} />
                  </span>
                  <span className="as-home-resources__identity">
                    <strong>{reviewAppText.home.docs}</strong>
                    <span>{reviewAppText.home.docsDescription}</span>
                  </span>
                  <HugeiconsIcon aria-hidden="true" icon={ExternalLinkIcon} strokeWidth={1.8} />
                </a>
                {/* TODO(open-source-launch): publish the dedicated agent-connection guide at this canonical route. */}
                <a
                  className="as-home-resources__link"
                  href="https://artifactserver.com/docs/connect-agents/"
                  rel="noreferrer"
                  target="_blank"
                >
                  <span
                    aria-hidden="true"
                    className="as-home-resources__icon as-home-resources__icon--agents"
                  >
                    <AgentLogos />
                  </span>
                  <span className="as-home-resources__identity">
                    <strong>{reviewAppText.home.connectAgents}</strong>
                    <span>{reviewAppText.home.connectAgentsDescription}</span>
                  </span>
                  <HugeiconsIcon aria-hidden="true" icon={ExternalLinkIcon} strokeWidth={1.8} />
                </a>
              </nav>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      {folderDialog === null ? null : (
        <FolderDialog action={folderDialog} projectId={projectId} projectName={selectedProject?.name ?? folderText.root}
          projects={crossProjectMove ? projects.filter(({archivedAt}) => archivedAt === null) : []}
          onClose={() => setFolderDialog(null)} onChanged={(result) => {
            setFolderChanges((current) => current + 1);
            if (result?.kind === "artifact" && result.artifact.projectId !== projectId) {
              openMovedLocation(result.artifact.projectId, result.artifact.folderId, result.artifact.id);
              return;
            }
            if (result?.kind === "folder" && result.folder.projectId !== projectId) {
              openMovedLocation(result.folder.projectId, result.folder.id, null);
              return;
            }
            const artifact = result?.kind === "artifact" ? result.artifact : undefined;
            if (artifact !== undefined && details?.artifact.id === artifact.id) {
              updateArtifact({...details.artifact, ...artifact});
              setActions([]);
            }
            if (folderDialog.kind === "delete" && folderDialog.folder.id === folderId) {
              navigateFolder(folderDialog.folder.parentFolderId);
            } else {
              void loadArtifacts(null, true);
            }
          }} />
      )}

      {focusMode ? null : (
        <AppTopBar
          area="review"
          capabilities={session.capabilities}
          leading={(
            <>
              <ReviewProjectPicker
                canCreate={canManageProjects}
                onCreate={onCreateProject}
                onSelect={selectProject}
                projects={projects}
                selectedProjectId={projectId}
              />
              <button
                aria-controls="review-catalog-drawer"
                aria-expanded={catalogOpen}
                aria-keyshortcuts="T ["
                className="as-bar-button as-catalog-trigger"
                onClick={() => toggleDrawer("catalog")}
                ref={drawerTriggerRefs.catalog}
                type="button"
              >
                <HugeiconsIcon aria-hidden="true" icon={LayoutLeftIcon} strokeWidth={1.6} />
                {readerText.catalog.trigger}
                <span className="as-bar-button__count">{catalogItems.length}</span>
                <kbd aria-hidden="true">T</kbd>
              </button>
            </>
          )}
          onBrandClick={returnHome}
          onThemeChange={onThemeChange}
          projectId={selectedProject?.id ?? null}
          settingsHref={selectedProject === null
            ? "/review/settings/projects"
            : `/review/settings/projects/${encodeURIComponent(selectedProject.id)}`}
          theme={theme}
        />
      )}

      {focusMode ? null : (
        <div className="as-titlebar">
          <h1 title={previewName}>{previewName}</h1>
          {selectedVersion === null ? null : (
            <button
              aria-controls="review-version-drawer"
              aria-expanded={rightDrawer === "version"}
              aria-keyshortcuts="V"
              className="as-bar-button as-bar-button--line as-version-trigger"
              onClick={() => toggleDrawer("version")}
              ref={drawerTriggerRefs.version}
              title={readerText.title.versionLabel(selectedVersion.version.number)}
              type="button"
            >
              <span className="as-version-trigger__number">v{selectedVersion.version.number}</span>
              <span className="as-version-trigger__tag">
                {viewingCurrent ? readerText.title.currentVersion : readerText.title.earlierVersion}
              </span>
              <kbd aria-hidden="true">V</kbd>
            </button>
          )}
          <span className="as-titlebar__grow" />
          <div className="as-segmented" role="group" aria-label={boardText.modes}>
            <button className="as-bar-button" type="button" aria-pressed={!boardMode.enabled} onClick={() => boardMode.change(false)}>{boardText.reading}</button>
            <button className="as-bar-button" type="button" aria-pressed={boardMode.enabled} onClick={() => boardMode.change(true)}>{boardText.board}</button>
          </div>
          {previewAnnotatable && canComment ? (
            <div aria-label={readerText.title.modeGroup} className="as-segmented" role="group">
              <button
                aria-pressed={htmlAnnotateModeActive}
                className="as-bar-button"
                onClick={() => setHtmlAnnotateModeActive(true)}
                title={reviewAppText.focus.annotateModeDescription}
                type="button"
              >
                {reviewAppText.focus.annotateMode}
              </button>
              <button
                aria-pressed={!htmlAnnotateModeActive}
                className="as-bar-button"
                onClick={() => setHtmlAnnotateModeActive(false)}
                title={reviewAppText.focus.interactModeDescription}
                type="button"
              >
                {reviewAppText.focus.interactMode}
              </button>
            </div>
          ) : null}
          <ReviewShareControl
            details={details}
            key={`header-share-${details?.artifact.id ?? "empty"}`}
            onArtifactChanged={updateArtifact}
            selectedPath={selectedPath}
            selectedVersion={selectedVersion}
            triggerClassName="as-bar-button as-bar-button--line"
          />
          <button
            aria-controls="review-comments-drawer"
            aria-expanded={rightDrawer === "comments" || boardCommentsVisible}
            aria-keyshortcuts="C ]"
            className="as-bar-button as-bar-button--line"
            onClick={() => toggleDrawer("comments")}
            ref={drawerTriggerRefs.comments}
            type="button"
          >
            <HugeiconsIcon aria-hidden="true" icon={Comment01Icon} strokeWidth={1.6} />
            {readerText.title.comments}
            <span className="as-bar-button__count">{openCommentCount}</span>
            <kbd aria-hidden="true">C</kbd>
          </button>
          <button
            className="as-bar-button as-bar-button--accent"
            disabled={selectedVersion === null}
            onClick={sendToAgent}
            type="button"
          >
            <HugeiconsIcon aria-hidden="true" icon={ArrowRight02Icon} strokeWidth={1.6} />
            {readerText.title.sendToAgent}
          </button>
          <Popover.Root>
            <Popover.Trigger
              render={(
                <button
                  aria-label={readerText.title.more}
                  className="as-bar-button as-bar-button--line as-bar-button--icon"
                  title={readerText.title.more}
                  type="button"
                />
              )}
            >
              <HugeiconsIcon aria-hidden="true" icon={MoreHorizontalIcon} strokeWidth={1.6} />
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Positioner align="end" className="as-more-positioner" sideOffset={6}>
                <Popover.Popup aria-label={readerText.title.more} className="as-more-menu">
                  <button
                    className="as-more-menu__item"
                    disabled={selectedVersionId === null || opening}
                    onClick={() => void openRawArtifact()}
                    type="button"
                  >
                    <HugeiconsIcon aria-hidden="true" icon={ExternalLinkIcon} strokeWidth={1.6} />
                    {opening ? reviewAppText.preview.opening : reviewAppText.preview.openRaw}
                  </button>
                  <ReviewDownloadControl className="as-more-menu__item" download={download} />
                  <button
                    aria-keyshortcuts="F"
                    className="as-more-menu__item"
                    disabled={selectedVersionId === null}
                    onClick={enterFocusMode}
                    type="button"
                  >
                    <HugeiconsIcon aria-hidden="true" icon={FullScreenIcon} strokeWidth={1.6} />
                    {reviewAppText.preview.fullScreen}
                  </button>
                  <button
                    aria-keyshortcuts="?"
                    className="as-more-menu__item"
                    onClick={() => openKeyboardDialog("shortcuts")}
                    type="button"
                  >
                    <HugeiconsIcon aria-hidden="true" icon={KeyboardIcon} strokeWidth={1.6} />
                    {reviewAppText.shortcuts.title}
                  </button>
                </Popover.Popup>
              </Popover.Positioner>
            </Popover.Portal>
          </Popover.Root>
        </div>
      )}

      <main className="as-workspace">
        {boardMode.enabled && !focusMode && !boardComparing ? <BoardConnections rects={boardRects} selected={comments.selectedThreadId} /> : null}
        {focusMode ? null : (
          <aside
            aria-label={reviewAppText.catalog.label}
            className="as-drawer as-drawer--left as-catalog"
            hidden={!catalogOpen}
            id="review-catalog-drawer"
          >
            <header className="as-drawer__head">
              <h2 id="review-catalog-drawer-title" ref={drawerHeadingRefs.catalog} tabIndex={-1}>{readerText.catalog.title}</h2>
              <IconButton
                keyShortcuts="T"
                label={readerText.catalog.close}
                onClick={() => setDrawer("catalog", false, true)}
              >
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.6} />
              </IconButton>
            </header>
            {catalogOpen ? (
              <>
                <div className="as-catalog__tools">
                  <div className="as-search-group">
                    <label className="as-search">
                      <span className="as-visually-hidden">{reviewAppText.catalog.searchLabel}</span>
                      <HugeiconsIcon aria-hidden="true" icon={Search01Icon} strokeWidth={1.8} />
                      <input
                        onChange={(event) => setQuery(event.currentTarget.value)}
                        placeholder={reviewAppText.catalog.searchPlaceholder}
                        type="search"
                        value={query}
                      />
                      {query === "" ? null : (
                        <button aria-label={reviewAppText.catalog.clearSearch} onClick={() => setQuery("")} type="button">
                          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.8} />
                        </button>
                      )}
                    </label>
                    <div className="as-catalog-query-controls">
                      <CatalogFilters
                        commentFilter={catalogCommentFilter}
                        knownTags={catalogKnownTags}
                        onCommentFilterChange={setCatalogCommentFilter}
                        onTagFiltersChange={setCatalogTagFilters}
                        tagFilters={catalogTagFilters}
                      />
                      <label>
                        <span className="as-visually-hidden">{reviewAppText.catalog.sortLabel}</span>
                        <select
                          aria-label={reviewAppText.catalog.sortLabel}
                          onChange={(event) => {
                            const value = event.currentTarget.value;
                            if (value === "comments" || value === "newest") setCatalogSort(value);
                          }}
                          value={catalogSort}
                        >
                          <option value="newest">{reviewAppText.catalog.newestFirst}</option>
                          <option value="comments">{reviewAppText.catalog.mostComments}</option>
                        </select>
                      </label>
                    </div>
                  </div>
                </div>

                {foldersAvailable ? (
                  <div className="as-folder-toolbar">
                    {folderId !== null && listError !== null ? (
                      <button className="as-button as-button--ghost" type="button" onClick={() => navigateFolder(null)}>{folderText.root}</button>
                    ) : <FolderBreadcrumbs root={folderText.root} folders={breadcrumbs} onNavigate={navigateFolder} />}
                    {canManageArtifacts && !listLoading && listError === null ? (
                      <div className="as-inspector-actions">
                        <button className="as-button as-button--secondary" type="button"
                          onClick={() => setFolderDialog({kind: "create", parent: folderId})}>{folderText.newFolder}</button>
                        <CurrentFolderActions folder={breadcrumbs.at(-1)} onAction={setFolderDialog} />
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className="as-catalog__list">
                  {listError === null ? null : (
                    <InlineState description={displayError(listError)} title={reviewAppText.catalog.unavailableTitle} tone="error" />
                  )}
                  {listLoading && items.length === 0 ? (
                    <InlineState description={reviewAppText.catalog.loadingDescription} title={reviewAppText.catalog.loadingTitle} />
                  ) : null}
                  {folders.map(({id, name}) => (
                    <button className="as-artifact-card as-folder-row" key={id} type="button" onClick={() => navigateFolder(id)}>
                      <HugeiconsIcon aria-hidden="true" icon={Folder01Icon} size={16} />
                      <span className="as-artifact-card__name">{name}</span>
                      <span aria-hidden="true">›</span>
                    </button>
                  ))}
                  {!listLoading && listError === null && catalogItems.length === 0 && folders.length === 0 ? (
                    <InlineState
                      description={
                        query !== "" || catalogCommentFilter !== "all" || catalogTagFilters.length > 0
                          ? reviewAppText.catalog.noMatchDescription
                          : folderId === null ? reviewAppText.catalog.emptyDescription : folderText.emptyDescription
                      }
                      title={
                        query !== "" || catalogCommentFilter !== "all" || catalogTagFilters.length > 0
                          ? reviewAppText.catalog.noMatchTitle
                          : folderId === null ? reviewAppText.catalog.emptyTitle : folderText.empty
                      }
                    />
                  ) : null}
                  {catalogItems.map(({artifact, commentCount, versionCount}) => {
                    const openCount = catalogOpenCounts.get(artifact.id) ?? 0;
                    const timestamp = artifact.createdAt;
                    const now = Date.now();
                    const relative = Date.parse(timestamp) <= now ? formatRelativeTime(timestamp, now) : timestamp;
                    return (
                      <button
                        aria-current={artifact.id === selectedArtifactId ? "true" : undefined}
                        className="as-artifact-card"
                        data-selected={artifact.id === selectedArtifactId}
                        key={artifact.id}
                        onClick={() => selectArtifact(artifact.id, artifact.currentVersionId)}
                        type="button"
                      >
                        <span className="as-artifact-card__title-row">
                          <span className="as-artifact-card__name">{visibleArtifactName(artifact.name)}</span>
                          {artifact.accessSetting === "account_required" ? null : <AccessPill access={artifact.accessSetting} />}
                        </span>
                        <span className="as-artifact-card__meta">
                          <span className="as-artifact-card__history">
                            <span>{reviewAppText.catalog.versionCount(versionCount)}</span>
                            <time aria-label={timestamp} dateTime={timestamp} title={timestamp}>{relative}</time>
                          </span>
                          {foldersAvailable && duplicateNames.has(artifact.name)
                            ? <span title={artifact.id}>{folderText.kinds[artifact.fileKind ?? "other"]} · {compactId(artifact.id.slice(4))}</span>
                            : null}
                          {openCount === 0 && commentCount === 0 ? null : (
                            <span className="as-artifact-card__counts">
                              <span aria-label={openCount > 0 ? refinementText.openThreads(openCount) : undefined}
                                data-open-count={openCount > 0 ? openCount : undefined}>
                                <HugeiconsIcon aria-hidden="true" icon={Comment01Icon} strokeWidth={1.8} />
                                {openCount > 0 ? openCount : reviewAppText.catalog.commentCount(commentCount)}
                              </span>
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <footer className="as-app-footer as-catalog__footer">
                  <button
                    aria-busy={catalogRefreshState === "loading"}
                    aria-label={reviewAppText.catalog.refreshLabel}
                    className="as-catalog-refresh"
                    data-state={catalogRefreshState}
                    disabled={listLoading}
                    onClick={() => void refreshArtifacts()}
                    title={reviewAppText.catalog.refreshLabel}
                    type="button"
                  >
                    <HugeiconsIcon
                      aria-hidden="true"
                      className="as-catalog-refresh__icon"
                      icon={catalogRefreshState === "complete" ? Tick02Icon : RefreshIcon}
                      strokeWidth={1.8}
                    />
                    <span>
                      {catalogRefreshState === "loading"
                        ? reviewAppText.catalog.refreshing
                        : catalogRefreshState === "complete"
                          ? reviewAppText.catalog.refreshed
                          : reviewAppText.catalog.refresh}
                    </span>
                  </button>
                  <span aria-live="polite" className="as-visually-hidden">
                    {catalogRefreshState === "loading"
                      ? reviewAppText.catalog.refreshingAnnouncement
                      : catalogRefreshState === "complete"
                        ? reviewAppText.catalog.refreshedAnnouncement
                        : ""}
                  </span>
                  <div className="as-catalog__footer-actions">
                    {nextCursor === null ? null : (
                      <button disabled={listLoading} onClick={() => void loadArtifacts(nextCursor, false)} type="button">
                        {listLoading ? reviewAppText.general.loading : reviewAppText.general.loadMore}
                      </button>
                    )}
                    <button aria-label={reviewAppText.shortcuts.title} aria-keyshortcuts="?"
                      className="as-keyboard-shortcuts__trigger" onClick={() => openKeyboardDialog("shortcuts")}
                      title={reviewAppText.shortcuts.title} type="button">
                      <HugeiconsIcon aria-hidden="true" icon={KeyboardIcon} strokeWidth={1.8} />
                    </button>
                  </div>
                </footer>
              </>
            ) : null}
          </aside>
        )}

        <section
          aria-label={readerText.preview}
          className="as-preview-panel"
          id="review-preview"
          ref={previewPanelRef}
          tabIndex={-1}
        >
          {focusMode ? (
            <>
              <div
                className="as-focus-controls-dock"
                data-collapsed={focusControlsCollapsed}
                data-initial-collapse={initialFocusCollapse}
                data-comments-open={focusCommentsOpen}
                data-hover-armed={focusControlsHoverArmed}
                data-instant={focusControlsInstant}
                onPointerLeave={() => setFocusControlsHoverArmed(true)}
              >
                <span aria-hidden="true" className="as-focus-controls__hover-zone" />
                <div
                  aria-hidden={focusControlsCollapsed}
                  aria-label={reviewAppText.focus.toolbarLabel}
                  className="as-focus-controls"
                  inert={focusControlsCollapsed}
                  role="toolbar"
                >
                  {previewAnnotatable && canComment ? (
                    <button
                      aria-pressed={htmlAnnotateModeActive}
                      className="as-button as-focus-controls__button"
                      data-active={htmlAnnotateModeActive}
                      onClick={() => setHtmlAnnotateModeActive((active) => !active)}
                      title={htmlAnnotateModeActive
                        ? reviewAppText.focus.annotateModeDescription
                        : reviewAppText.focus.interactModeDescription}
                      type="button"
                    >
                      <HugeiconsIcon aria-hidden="true" icon={Edit02Icon} strokeWidth={1.8} />
                      {htmlAnnotateModeActive ? reviewAppText.focus.annotateMode : reviewAppText.focus.interactMode}
                    </button>
                  ) : null}
                  <button
                    aria-controls="review-focus-comments"
                    aria-expanded={focusCommentsOpen}
                    aria-keyshortcuts="]"
                    className="as-button as-focus-controls__button"
                    data-active={focusCommentsOpen}
                    onClick={() => setFocusCommentsOpen((current) => !current)}
                    ref={focusCommentsButtonRef}
                    title={reviewAppText.focus.toggleCommentsTitle}
                    type="button"
                  >
                    <HugeiconsIcon aria-hidden="true" icon={Comment01Icon} strokeWidth={1.8} />
                    {reviewAppText.focus.comments}
                    <span className="as-focus-controls__count">{openCommentCount}</span>
                  </button>
                  <ReviewShareControl
                    details={details}
                    key={`focus-share-${details?.artifact.id ?? "empty"}`}
                    onArtifactChanged={updateArtifact}
                    selectedPath={selectedPath}
                    selectedVersion={selectedVersion}
                    triggerClassName="as-button as-focus-controls__button"
                  />
                  <ReviewDownloadControl
                    className="as-button as-focus-controls__button"
                    download={download}
                  />
                  <button
                    aria-keyshortcuts="F"
                    className="as-button as-focus-controls__button"
                    onClick={exitFocusMode}
                    title={reviewAppText.focus.exitFullScreenTitle}
                    type="button"
                  >
                    <HugeiconsIcon aria-hidden="true" icon={ArrowShrinkIcon} strokeWidth={1.8} />
                    {reviewAppText.focus.exitFullScreen}
                  </button>
                  <button
                    aria-label={reviewAppText.focus.hideControls}
                    className="as-icon-button as-focus-controls__collapse"
                    onClick={hideFocusControls}
                    title={reviewAppText.focus.hideControls}
                    type="button"
                  >
                    <HugeiconsIcon aria-hidden="true" icon={ArrowRight01Icon} strokeWidth={1.8} />
                  </button>
                </div>
                <button
                  aria-hidden={!focusControlsCollapsed}
                  aria-keyshortcuts="Meta+\\ Control+\\"
                  aria-label={refinementText.focusRestore(reviewAppText.focus.showControls, openCommentCount)}
                  className="as-focus-controls__restore"
                  onClick={showFocusControls}
                  ref={focusControlsRestoreRef}
                  tabIndex={focusControlsCollapsed ? 0 : -1}
                  title={reviewAppText.focus.showControlsTitle}
                  type="button"
                >
                  <HugeiconsIcon aria-hidden="true" icon={ArrowLeft01Icon} strokeWidth={1.8} />
                  <span className="as-focus-controls__count">{openCommentCount}</span>
                </button>
                {focusHint && focusControlsCollapsed ? <p className="as-focus-controls__hint">{refinementText.focusHint}</p> : null}
              </div>
              <aside
                aria-hidden={!focusCommentsOpen}
                aria-labelledby="review-focus-comments-title"
                className="as-focus-comments"
                data-open={focusCommentsOpen}
                id="review-focus-comments"
                inert={!focusCommentsOpen}
              >
                <header className="as-focus-comments__header">
                  <div>
                    <HugeiconsIcon aria-hidden="true" icon={Comment01Icon} strokeWidth={1.8} />
                    <h2 id="review-focus-comments-title">{reviewAppText.focus.comments}</h2>
                    <span>{openCommentCount}</span>
                  </div>
                  <IconButton
                    keyShortcuts="] Escape"
                    label={reviewAppText.focus.closeComments}
                    onClick={() => setFocusCommentsOpen(false)}
                    title={reviewAppText.focus.closeCommentsTitle}
                  >
                    <HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.8} />
                  </IconButton>
                </header>
                <div className="as-focus-comments__body">
                  <ReviewCommentsInspector
                    boardMode={boardMode.enabled}
                    onBoardStats={setBoardStats}
                    onBoardPeople={setBoardPeople}
                    canComment={canComment}
                    canDeleteAny={canDeleteAnyComment}
                    linkedThreadId={linkedThreadId}
                    onSendRequestHandled={() => setSendRequested(false)}
                    sendRequested={sendRequested && focusCommentsOpen}
                    principalId={session.principal.id}
                    ref={commentsInspectorRef}
                    session={comments}
                    versionId={selectedVersionId}
                  />
                </div>
              </aside>
            </>
          ) : null}
          <div className="as-preview-panel__body" data-preview-kind={previewKind}>
            <ReviewBoard zoomRequest={boardZoomRequest} enabled={boardMode.enabled && !focusMode} cardsVisible={boardCardsVisible}
              context={<BoardContext people={boardPeople} version={selectedVersion} path={selectedPath} threads={comments.threads} versions={versions} onVersion={(id) => {setSelectedVersionId(id); setSelectedPath(null);}} />}
              cards={<BoardCards outline={boardComparing ? [] : boardOutline} stats={boardStats} onSpaceChange={setBoardCardsVisible} />}>
            {detailError === null ? null : (
              <div className="as-preview-error" role="alert">{displayError(detailError)}</div>
            )}
            {!focusMode && inspectorTab === "compare" && comparison !== null && sideBySide
              && comparison.from.artifactId === selectedArtifactId ? (
              <ComparisonPreview boardModeActive={boardMode.enabled} onBoardZoom={receiveBoardZoom} comparison={comparison} isLight={theme === "dawn"} key={`${comparison.from.id}:${comparison.to.id}`} />
            ) : selectedArtifactId === null ? (
              <PreviewWelcome />
            ) : detailLoading && details === null ? (
              <PreviewWelcome description={reviewAppText.preview.readingDescription} title={reviewAppText.preview.readingTitle} />
            ) : detailError !== null && selectedVersion === null ? (
              <PreviewWelcome
                description={reviewAppText.preview.targetUnavailableDescription}
                title={reviewAppText.preview.targetUnavailableTitle}
              />
            ) : (
              <ReviewPreview
                boardModeActive={boardMode.enabled && !focusMode}
                onBoardZoom={receiveBoardZoom}
                onBoardOutline={setBoardOutline}
                onBoardRects={setBoardRects}
                annotateModeActive={htmlAnnotateModeActive}
                annotations={comments.annotations}
                artifactId={selectedArtifactId}
                artifactName={visibleArtifactName(details?.artifact.name ?? selectedItem?.artifact.name ?? "Artifact")}
                isLight={theme === "dawn"}
                onOpenRawArtifact={() => void openRawArtifact()}
                onAnnotateModeChange={setHtmlAnnotateModeActive}
                onSelectAnnotation={(threadId) => {
                  comments.selectThread(threadId);
                  if (threadId !== null) {
                    if (focusMode) {
                      setFocusCommentsOpen(true);
                    } else {
                      openDrawer("comments");
                    }
                  }
                }}
                onSubmitAnnotation={async (body, anchor, path) => {
                  const saved = await comments.submit(body, anchor, path);
                  if (!saved && selectedArtifactId !== null && selectedVersionId !== null) {
                    // The in-frame composer discards its text on failure; keep
                    // it as this version's new-thread draft instead.
                    writeDraft({
                      artifactId: selectedArtifactId,
                      principalId: session.principal.id,
                      threadId: null,
                      versionId: selectedVersionId,
                    }, body);
                  }
                  if (saved && !focusMode) {
                    openDrawer("comments");
                  }
                  return saved;
                }}
                onUnanchoredChange={comments.updateUnanchored}
                opening={opening}
                projectId={projectId}
                readOnly={!canComment}
                selectionAttempt={comments.selectionAttempt}
                selectedThreadId={comments.selectedThreadId}
                selectedPath={selectedPath}
                version={selectedVersion}
              />
            )}
            </ReviewBoard>
          </div>
        </section>

        {focusMode ? null : (
          <aside
            aria-labelledby="review-comments-drawer-title"
            className="as-drawer as-drawer--right as-comments-drawer"
            hidden={rightDrawer !== "comments" && !boardCommentsVisible}
            id="review-comments-drawer"
          >
            <header className="as-drawer__head">
              <h2 id="review-comments-drawer-title" ref={drawerHeadingRefs.comments} tabIndex={-1}>
                {readerText.drawer.comments}
              </h2>
              <IconButton
                keyShortcuts="C"
                label={readerText.drawer.closeComments}
                onClick={() => setDrawer("comments", false, true)}
              >
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.6} />
              </IconButton>
            </header>
            {rightDrawer === "comments" || boardMode.enabled ? (
              <div className="as-drawer__body as-inspector__body">
                {details === null || selectedVersion === null ? (
                  <InlineState description={reviewAppText.inspector.nothingDescription} title={reviewAppText.inspector.nothingTitle} />
                ) : (
                  <ReviewCommentsInspector
                    boardMode={boardMode.enabled}
                    onBoardStats={setBoardStats}
                    onBoardPeople={setBoardPeople}
                    canComment={canComment}
                    canDeleteAny={canDeleteAnyComment}
                    linkedThreadId={linkedThreadId}
                    onSendRequestHandled={() => setSendRequested(false)}
                    principalId={session.principal.id}
                    ref={commentsInspectorRef}
                    sendRequested={sendRequested}
                    session={comments}
                    versionId={selectedVersionId}
                  />
                )}
              </div>
            ) : null}
          </aside>
        )}

        {focusMode ? null : (
          <aside
            aria-labelledby="review-version-drawer-title"
            className="as-drawer as-drawer--right as-inspector"
            hidden={rightDrawer !== "version"}
            id="review-version-drawer"
          >
            <header className="as-drawer__head">
              <h2 id="review-version-drawer-title" ref={drawerHeadingRefs.version} tabIndex={-1}>
                {readerText.drawer.version}
              </h2>
              <IconButton
                keyShortcuts="V"
                label={readerText.drawer.closeVersion}
                onClick={() => setDrawer("version", false, true)}
              >
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.6} />
              </IconButton>
            </header>
            {rightDrawer === "version" ? (
              <>
                <div aria-label={readerText.drawer.versionTabs} className="as-tabs" role="tablist">
                  <InspectorTabButton active={inspectorTab === "versions"} count={versions.length} label={reviewAppText.inspector.versionsTab} onClick={() => setInspectorTab("versions")} tab="versions" />
                  <InspectorTabButton active={inspectorTab === "details"} label={reviewAppText.inspector.detailsTab} onClick={() => setInspectorTab("details")} tab="details" />
                  <InspectorTabButton active={inspectorTab === "files"} count={selectedVersion?.manifest.entries.length ?? 0} label={reviewAppText.inspector.filesTab} onClick={() => setInspectorTab("files")} tab="files" />
                  <InspectorTabButton active={inspectorTab === "activity"} label={reviewAppText.inspector.activityTab} onClick={() => setInspectorTab("activity")} tab="activity" />
                  {comparison === null ? null : (
                    <InspectorTabButton active={inspectorTab === "compare"} label={reviewAppText.inspector.compareTab} onClick={() => setInspectorTab("compare")} tab="compare" />
                  )}
                </div>
                <div
                  aria-labelledby={`review-inspector-tab-${inspectorTab}`}
                  className="as-drawer__body as-inspector__body"
                  id="review-inspector-panel"
                  role="tabpanel"
                >
                  {details === null || selectedVersion === null ? (
                    <InlineState description={reviewAppText.inspector.nothingDescription} title={reviewAppText.inspector.nothingTitle} />
                  ) : inspectorTab === "details" ? (
                    <DetailsInspector
                      canManage={canManageArtifacts}
                      details={details}
                      linkedArtifacts={session.capabilities.linkedArtifacts}
                      trashAvailable={session.capabilities.trash}
                      placement={foldersAvailable ? (
                        <ArtifactFolderLocation artifact={details.artifact}
                          key={`${details.artifact.id}:${details.artifact.folderId ?? "root"}:${folderChanges}`}
                          projectName={selectedProject?.name ?? folderText.root}>
                          {canManageArtifacts ? (
                            <>
                              <button className="as-button" type="button" onClick={() =>
                                setFolderDialog({kind: "move", subject: {kind: "artifact", record: details.artifact}})}>
                                {folderText.move}
                              </button>
                              <button className="as-button" type="button" onClick={() =>
                                setFolderDialog({kind: "rename", subject: {kind: "artifact", record: details.artifact}})}>
                                {folderText.rename}
                              </button>
                            </>
                          ) : null}
                        </ArtifactFolderLocation>
                      ) : null}
                      onCapture={captureLinkedArtifact}
                      onOpenLive={openLinkedArtifact}
                      onTagsChange={changeTags}
                      onTombstone={tombstoneArtifact}
                      version={selectedVersion}
                    />
                  ) : inspectorTab === "files" ? (
                    <FilesInspector
                      onSelect={selectManifestPath}
                      selectedPath={selectedPath ?? selectedVersion.manifest.entryPath}
                      version={selectedVersion}
                    />
                  ) : inspectorTab === "versions" ? (
                    <VersionsInspector
                      canManage={canManageArtifacts}
                      comparisonLoading={comparisonLoading}
                      currentVersionId={details.artifact.currentVersionId}
                      onCompare={compareVersions}
                      onMakeCurrent={makeVersionCurrent}
                      onSelect={(versionId) => {
                        setDetailError(null);
                        setSelectedVersionId(versionId);
                        setSelectedPath(null);
                      }}
                      selectedVersionId={selectedVersionId}
                      versions={versions}
                    />
                  ) : inspectorTab === "activity" ? (
                    <ActivityInspector
                      actions={actions}
                      error={activityError}
                      loading={activityLoading}
                      nextCursor={actionNextCursor}
                      onLoadMore={() => void loadActions(actionNextCursor)}
                    />
                  ) : (
                    <ComparisonInspector
                      comparison={comparison}
                      error={comparisonError}
                      onViewChange={setSideBySide}
                      sideBySide={sideBySide}
                    />
                  )}
                </div>
              </>
            ) : null}
          </aside>
        )}
        {keyboardDialog === null ? null : (
          <ReviewKeyboardDialog
            close={() => setKeyboardDialog(null)}
            restoreFocus={keyboardReturnFocus.current}
            title={keyboardDialog === "palette" ? refinementText.palette.title : reviewAppText.shortcuts.title}
          >
            {keyboardDialog === "shortcuts" ? <ReviewKeyboardShortcuts /> : (
              <ReviewCommandPalette
                commands={[
                  {label: refinementText.palette.switchVersion, run: () => {
                    exitFocusMode();
                    openDrawer("version");
                    setInspectorTab("versions");
                  }},
                  {label: refinementText.palette.annotate, run: () => setHtmlAnnotateModeActive(true)},
                  {label: refinementText.palette.send, run: sendToAgent},
                  {label: refinementText.palette.compare, run: () => {
                    exitFocusMode();
                    openDrawer("version");
                    setInspectorTab(comparison === null ? "versions" : "compare");
                  }},
                  {label: refinementText.palette.theme, run: onThemeChange},
                ]}
                onClose={() => setKeyboardDialog(null)}
                onSelect={(artifactId, versionId) => {
                  exitFocusMode();
                  selectArtifact(artifactId, versionId);
                }}
                projectId={projectId}
              />
            )}
          </ReviewKeyboardDialog>
        )}
        {trashUndo.element}
      </main>

      {focusMode ? null : (
        <footer className="as-bottombar">
          <button
            aria-keyshortcuts="ArrowLeft K"
            aria-label={reviewAppText.footer.previousArtifact}
            className="as-bar-button"
            disabled={selectedIndex <= 0}
            onClick={() => stepArtifact(-1)}
            type="button"
          >
            <HugeiconsIcon aria-hidden="true" icon={ArrowLeft01Icon} strokeWidth={1.6} />
            <span className="as-bottombar__label">{readerText.bottom.previous}</span>
          </button>
          <span aria-label={readerText.bottom.position} aria-live="polite" className="as-bottombar__position" role="status">
            {selectedIndex < 0 ? "0" : selectedIndex + 1} / {catalogItems.length}
          </span>
          <button
            aria-keyshortcuts="ArrowRight J"
            aria-label={reviewAppText.footer.nextArtifact}
            className="as-bar-button"
            disabled={selectedIndex < 0 || selectedIndex >= catalogItems.length - 1}
            onClick={() => stepArtifact(1)}
            type="button"
          >
            <span className="as-bottombar__label">{readerText.bottom.next}</span>
            <HugeiconsIcon aria-hidden="true" icon={ArrowRight01Icon} strokeWidth={1.6} />
          </button>
          <span className="as-bottombar__path" title={previewPath ?? undefined}>
            {previewPath ?? reviewAppText.footer.noVersion}
          </span>
          {selectedVersion === null ? null : (
            <span className="as-bottombar__meta">
              <span>{readerText.bottom.files(selectedVersion.manifest.entries.length)}</span>
              <span>{formatBytes(previewBytes)}</span>
            </span>
          )}
          <span aria-label={readerText.bottom.hints} className="as-bottombar__hints" role="group">
            <span><kbd>←</kbd><kbd>→</kbd> {readerText.bottom.switch}</span>
            <span><kbd>T</kbd> {readerText.bottom.catalog}</span>
            <span><kbd>C</kbd> {readerText.bottom.comments}</span>
            <span><kbd>V</kbd> {readerText.bottom.version}</span>
          </span>
          <button
            className="as-bar-button as-preview-footer__reload"
            disabled={comments.loading || selectedVersion === null}
            onClick={() => void (
              commentsInspectorRef.current?.reload() ?? comments.reload()
            )}
            type="button"
          >
            <HugeiconsIcon aria-hidden="true" icon={RefreshIcon} strokeWidth={1.6} />
            <span className="as-bottombar__label">
              {comments.loading ? reviewAppText.general.loading : reviewAppText.footer.reload}
            </span>
          </button>
        </footer>
      )}
    </div>
  );
}

function reviewDownload(
  projectId: string,
  artifactId: string | null,
  version: ArtifactVersion | null,
): ReviewDownload | null {
  if (artifactId === null || version === null) return null;
  const entries = version.manifest.entries;
  const onlyEntry = entries.length === 1 ? entries[0] : undefined;
  if (onlyEntry !== undefined) {
    return {
      href: api.versionFileUrl(
        projectId,
        artifactId,
        version.version.id,
        onlyEntry.path,
      ),
      title: reviewAppText.download.file(onlyEntry.path),
    };
  }
  return {
    href: api.versionArchiveUrl(projectId, artifactId, version.version.id),
    title: reviewAppText.download.archive(entries.length),
  };
}

function ReviewDownloadControl({
  className,
  download,
}: {
  readonly className: string;
  readonly download: ReviewDownload | null;
}) {
  if (download === null) {
    return (
      <button aria-label={reviewAppText.download.label} className={className} disabled type="button">
        <HugeiconsIcon aria-hidden="true" icon={Download04Icon} strokeWidth={1.8} />
        <span className="as-button__label">{reviewAppText.download.label}</span>
      </button>
    );
  }
  return (
    <a
      aria-label={reviewAppText.download.label}
      className={className}
      download
      href={download.href}
      title={download.title}
    >
      <HugeiconsIcon aria-hidden="true" icon={Download04Icon} strokeWidth={1.8} />
      <span className="as-button__label">{reviewAppText.download.label}</span>
    </a>
  );
}

function CurrentFolderActions({folder, onAction}: {
  readonly folder: Folder | undefined;
  readonly onAction: (action: FolderDialogAction) => void;
}) {
  if (folder === undefined) return null;
  return (
    <Popover.Root>
      <Popover.Trigger className="as-button" aria-label={folderText.folderActions(folder.name)}>…</Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={4}>
          <Popover.Popup className="as-folder-menu">
            <button className="as-button as-button--ghost" type="button"
              onClick={() => onAction({kind: "rename", subject: {kind: "folder", record: folder}})}>{folderText.rename}</button>
            <button className="as-button as-button--ghost" type="button"
              onClick={() => onAction({kind: "move", subject: {kind: "folder", record: folder}})}>{folderText.move}</button>
            <button className="as-button as-button--ghost" type="button"
              onClick={() => onAction({kind: "delete", folder})}>{folderText.delete}</button>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function DetailsInspector({
  canManage,
  details,
  linkedArtifacts,
  onCapture,
  onOpenLive,
  onTagsChange,
  onTombstone,
  placement,
  trashAvailable,
  version,
}: {
  readonly canManage: boolean;
  readonly details: ArtifactDetails;
  readonly linkedArtifacts: boolean;
  readonly onCapture: () => Promise<void>;
  readonly onOpenLive: () => Promise<void>;
  readonly onTagsChange: (tags: readonly string[]) => Promise<void>;
  readonly onTombstone: () => Promise<boolean>;
  readonly placement?: ReactNode;
  readonly trashAvailable: boolean;
  readonly version: ArtifactVersion;
}) {
  const linkedDriftDescription = details.sourceBinding === undefined
    ? null
    : sourceDriftDescription(details.sourceBinding.status, "captured");
  return (
    <div className="as-inspector-stack">
      <InspectorSection count={5} title={reviewAppText.details.artifactSection}>
        <InspectorRow label={reviewAppText.details.name} title={visibleArtifactName(details.artifact.name)} value={visibleArtifactName(details.artifact.name)} />
        <InspectorRow
          label={reviewAppText.details.access}
          value={<AccessPill access={details.artifact.accessSetting} />}
        />
        <InspectorRow label={reviewAppText.details.created} title={formatTimestamp(details.artifact.createdAt)} value={formatTimestamp(details.artifact.createdAt)} />
        <InspectorRow label={reviewAppText.details.artifactId} mono title={details.artifact.id} value={details.artifact.id} />
        <InspectorRow label={reviewAppText.details.projectId} mono title={details.artifact.projectId} value={details.artifact.projectId} />
      </InspectorSection>
      {placement}
      <InspectorSection count={5} title={reviewAppText.details.versionSection}>
        <InspectorRow label={reviewAppText.details.number} title={String(version.version.number)} value={String(version.version.number)} />
        <InspectorRow label={reviewAppText.details.saved} title={formatTimestamp(version.version.createdAt)} value={formatTimestamp(version.version.createdAt)} />
        <InspectorRow label={reviewAppText.details.entry} mono title={version.manifest.entryPath} value={version.manifest.entryPath} />
        <InspectorRow label={reviewAppText.details.routing} title={version.version.routingMode} value={version.version.routingMode} />
        <InspectorRow label={reviewAppText.details.versionId} mono title={version.version.id} value={version.version.id} />
      </InspectorSection>
      <TagsInspector
        artifact={details.artifact}
        key={details.artifact.id}
        onChange={onTagsChange}
      />
      {details.sourceBinding === undefined ? null : (
        <InspectorSection count={2} title={reviewAppText.details.linkedSourceSection}>
          <InspectorRow label={reviewAppText.details.state} value={sourceFreshnessLabel(details.sourceBinding.status)} />
          <InspectorRow label={reviewAppText.details.path} mono value={details.sourceBinding.path} />
          {linkedDriftDescription === null ? null : (
            <p className="as-inspector-empty">{linkedDriftDescription}</p>
          )}
          <div className="as-inspector-actions">
            {canManage && details.sourceBinding.status !== "in-sync" ? (
              <button className="as-button as-button--primary" onClick={() => void onCapture()} type="button">
                {reviewAppText.details.captureCurrent}
              </button>
            ) : null}
            {linkedArtifacts && details.links.live !== undefined ? (
              <button className="as-button" onClick={() => void onOpenLive()} type="button">
                {reviewAppText.details.openLive}
              </button>
            ) : null}
          </div>
        </InspectorSection>
      )}
      {canManage ? (
        <InspectorSection count={0} title={reviewAppText.details.dangerZone}>
          {trashAvailable
            ? <MoveToTrashButton onTrash={onTombstone} />
            : <TombstoneArtifactControl artifact={details.artifact} onConfirm={onTombstone} />}
        </InspectorSection>
      ) : null}
    </div>
  );
}

function TagsInspector({
  artifact,
  onChange,
}: {
  readonly artifact: ArtifactDetails["artifact"];
  readonly onChange: (tags: readonly string[]) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [pending, setPending] = useState(false);
  const [value, setValue] = useState(artifact.tags.join(", "));

  useEffect(() => {
    if (!editing) setValue(artifact.tags.join(", "));
  }, [artifact.tags, editing]);

  const cancel = (): void => {
    setEditing(false);
    setError(null);
    setValue(artifact.tags.join(", "));
  };
  const save = async (): Promise<void> => {
    setPending(true);
    setError(null);
    try {
      await onChange(
        value.split(",").map((tag) => tag.trim()).filter((tag) => tag !== ""),
      );
      setEditing(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught : new Error(reviewAppText.errors.tagsFailed));
    } finally {
      setPending(false);
    }
  };

  return (
    <InspectorSection
      action={editing ? null : (
        <button
          className="as-inspector-section__action"
          onClick={() => setEditing(true)}
          type="button"
        >
          {reviewAppText.tags.edit}
        </button>
      )}
      count={artifact.tags.length}
      title={reviewAppText.tags.title}
    >
      {editing ? (
        <form
          className="as-tag-editor"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label className="as-visually-hidden" htmlFor={`review-tags-${artifact.id}`}>
            {reviewAppText.tags.title}
          </label>
          <input
            autoFocus
            disabled={pending}
            id={`review-tags-${artifact.id}`}
            onChange={(event) => setValue(event.currentTarget.value)}
            placeholder={reviewAppText.tags.placeholder}
            value={value}
          />
          <p>{reviewAppText.tags.hint}</p>
          {error === null ? null : (
            <p className="as-tag-editor__error" role="alert">{displayError(error)}</p>
          )}
          <div className="as-tag-editor__actions">
            <button className="as-button as-button--primary" disabled={pending} type="submit">
              {pending ? reviewAppText.tags.saving : reviewAppText.tags.save}
            </button>
            <button className="as-button" disabled={pending} onClick={cancel} type="button">
              {reviewAppText.general.cancel}
            </button>
          </div>
        </form>
      ) : artifact.tags.length === 0 ? (
        <p className="as-inspector-empty">{reviewAppText.tags.empty}</p>
      ) : artifact.tags.map((tag) => (
        <span className="as-tag" key={tag}>{tag}</span>
      ))}
    </InspectorSection>
  );
}

function FilesInspector({
  onSelect,
  selectedPath,
  version,
}: {
  readonly onSelect: (path: string) => void;
  readonly selectedPath: string;
  readonly version: ArtifactVersion;
}) {
  return (
    <div className="as-inspector-stack">
      <InspectorSection count={version.manifest.entries.length} title={reviewAppText.files.manifest}>
        <ol className="as-file-list">
          {version.manifest.entries.map((entry) => (
            <li key={entry.path}>
              <button
                aria-current={selectedPath === entry.path ? "true" : undefined}
                data-selected={selectedPath === entry.path}
                onClick={() => onSelect(entry.path)}
                type="button"
              >
                <span className="as-file-list__icon"><HugeiconsIcon icon={File01Icon} strokeWidth={1.8} /></span>
                <span className="as-file-list__identity">
                  <code>{entry.path}</code>
                  <small>{entry.mediaType}</small>
                </span>
                <span className="as-file-list__size">{formatBytes(entry.size)}</span>
              </button>
            </li>
          ))}
        </ol>
      </InspectorSection>
    </div>
  );
}

function VersionsInspector({
  canManage,
  comparisonLoading,
  currentVersionId,
  onCompare,
  onMakeCurrent,
  onSelect,
  selectedVersionId,
  versions,
}: {
  readonly canManage: boolean;
  readonly comparisonLoading: boolean;
  readonly currentVersionId: string;
  readonly onCompare: (fromVersionId: string, toVersionId: string) => Promise<void>;
  readonly onMakeCurrent: (
    versionId: string,
    expectedCurrentVersionId: string,
  ) => Promise<boolean>;
  readonly onSelect: (versionId: string) => void;
  readonly selectedVersionId: string | null;
  readonly versions: readonly VersionListItem[];
}) {
  const [fromVersionId, setFromVersionId] = useState(
    versions.at(-1)?.version.id ?? currentVersionId,
  );
  const [toVersionId, setToVersionId] = useState(currentVersionId);
  return (
    <div className="as-inspector-stack">
      {versions.length < 2 ? null : (
        <InspectorSection count={2} title={reviewAppText.versions.compareSection}>
          <form
            className="as-compare-form"
            onSubmit={(event) => {
              event.preventDefault();
              void onCompare(fromVersionId, toVersionId);
            }}
          >
            <label>
              <span>{reviewAppText.versions.from}</span>
              <select onChange={(event) => setFromVersionId(event.currentTarget.value)} value={fromVersionId}>
                {versions.map(({version}) => <option key={version.id} value={version.id}>{reviewAppText.versions.versionNumber(version.number)}</option>)}
              </select>
            </label>
            <label>
              <span>{reviewAppText.versions.to}</span>
              <select onChange={(event) => setToVersionId(event.currentTarget.value)} value={toVersionId}>
                {versions.map(({version}) => <option key={version.id} value={version.id}>{reviewAppText.versions.versionNumber(version.number)}</option>)}
              </select>
            </label>
            <button className="as-button" disabled={comparisonLoading || fromVersionId === toVersionId} type="submit">
              {comparisonLoading ? reviewAppText.versions.comparing : reviewAppText.versions.compare}
            </button>
          </form>
        </InspectorSection>
      )}
      <InspectorSection count={versions.length} title={reviewAppText.versions.history}>
        <ol className="as-version-list">
          {versions.map(({version}) => (
            <li key={version.id}>
              <div className="as-version-list__row">
                <button
                  aria-current={selectedVersionId === version.id ? "true" : undefined}
                  className="as-version-list__select"
                  data-selected={selectedVersionId === version.id}
                  onClick={() => onSelect(version.id)}
                  type="button"
                >
                  <span>
                    <strong>{reviewAppText.versions.versionNumber(version.number)}</strong>
                    <time dateTime={version.createdAt}>{formatTimestamp(version.createdAt)}</time>
                  </span>
                  <span className="as-version-list__state">
                    {version.id === currentVersionId ? reviewAppText.versions.current : compactId(version.id)}
                  </span>
                </button>
                {!canManage || version.id === currentVersionId ? null : (
                  <MakeCurrentControl
                    expectedCurrentVersionId={currentVersionId}
                    onConfirm={onMakeCurrent}
                    version={version}
                  />
                )}
              </div>
            </li>
          ))}
        </ol>
      </InspectorSection>
    </div>
  );
}

function ActivityInspector({
  actions,
  error,
  loading,
  nextCursor,
  onLoadMore,
}: {
  readonly actions: readonly ArtifactAction[];
  readonly error: Error | null;
  readonly loading: boolean;
  readonly nextCursor: string | null;
  readonly onLoadMore: () => void;
}) {
  return (
    <div className="as-inspector-stack">
      <InspectorSection count={actions.length} title={reviewAppText.activity.section}>
        {error === null ? null : <p className="as-inspector-error" role="alert">{displayError(error)}</p>}
        {actions.length === 0 && loading ? <p className="as-inspector-empty">{reviewAppText.activity.loading}</p> : null}
        {actions.length === 0 && !loading ? <p className="as-inspector-empty">{reviewAppText.activity.empty}</p> : null}
        <ol className="as-activity-list">
          {actions.map((action) => (
            <li key={action.id}>
              <strong>{actionLabel(action.action)}</strong>
              <time dateTime={action.createdAt}>{formatTimestamp(action.createdAt)}</time>
              <code title={action.principalId}>{compactId(action.principalId)}</code>
            </li>
          ))}
        </ol>
        {nextCursor === null ? null : (
          <button className="as-button" disabled={loading} onClick={onLoadMore} type="button">
            {loading ? reviewAppText.general.loading : reviewAppText.general.loadMore}
          </button>
        )}
      </InspectorSection>
    </div>
  );
}

function ComparisonInspector({
  comparison,
  error,
  onViewChange,
  sideBySide,
}: {
  readonly comparison: ArtifactComparison | null;
  readonly error: Error | null;
  readonly onViewChange: (sideBySide: boolean) => void;
  readonly sideBySide: boolean;
}) {
  if (error !== null) return <InlineState description={displayError(error)} title={reviewAppText.comparison.unavailableTitle} />;
  if (comparison === null) return <InlineState description={reviewAppText.comparison.noneDescription} title={reviewAppText.comparison.noneTitle} />;
  const changedEntries = [
    ...comparison.added.map((entry) => ({kind: reviewAppText.comparison.added, path: entry.path})),
    ...comparison.changed.map((entry) => ({kind: reviewAppText.comparison.changed, path: entry.after.path})),
    ...comparison.removed.map((entry) => ({kind: reviewAppText.comparison.removed, path: entry.path})),
    ...comparison.renamed.map((entry) => ({kind: reviewAppText.comparison.renamed, path: `${entry.from.path} → ${entry.to.path}`})),
  ];
  return (
    <div className="as-inspector-stack">
      <div aria-label={refinementText.compare.label} className="as-comparison-view" role="group">
        <button aria-pressed={!sideBySide} className="as-button" onClick={() => onViewChange(false)} type="button">
          {refinementText.compare.files}
        </button>
        <button aria-pressed={sideBySide} className="as-button" onClick={() => onViewChange(true)} type="button">
          {refinementText.compare.sideBySide}
        </button>
      </div>
      <InspectorSection count={2} title={reviewAppText.comparison.title(comparison.from.number, comparison.to.number)}>
        <div className="as-comparison-summary">
          <span>{reviewAppText.comparison.addedCount(comparison.added.length)}</span>
          <span>{reviewAppText.comparison.changedCount(comparison.changed.length)}</span>
          <span>{reviewAppText.comparison.removedCount(comparison.removed.length)}</span>
          <span>{reviewAppText.comparison.renamedCount(comparison.renamed.length)}</span>
          <span>{reviewAppText.comparison.unchangedCount(comparison.unchangedCount)}</span>
        </div>
      </InspectorSection>
      {sideBySide ? null : <InspectorSection count={changedEntries.length} title={reviewAppText.comparison.changedFiles}>
        {changedEntries.length === 0 ? <p className="as-inspector-empty">{reviewAppText.comparison.sameFiles}</p> : (
          <ol className="as-comparison-list">
            {changedEntries.map((entry) => (
              <li key={`${entry.kind}-${entry.path}`}><span>{entry.kind}</span><code>{entry.path}</code></li>
            ))}
          </ol>
        )}
      </InspectorSection>}
    </div>
  );
}

function TombstoneArtifactControl({
  artifact,
  onConfirm,
}: {
  readonly artifact: ArtifactDetails["artifact"];
  readonly onConfirm: () => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const confirm = async (): Promise<void> => {
    if (value !== artifact.name) return;
    setPending(true);
    const removed = await onConfirm();
    setPending(false);
    if (removed) setOpen(false);
  };
  return (
    <Dialog.Root onOpenChange={(nextOpen) => {
      setOpen(nextOpen);
      if (!nextOpen) setValue("");
    }} open={open}>
      <Dialog.Trigger className="as-button as-button--danger">{reviewAppText.tombstone.trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="as-confirm-dialog__backdrop" />
        <Dialog.Popup className="as-confirm-dialog">
          <Dialog.Title>{reviewAppText.tombstone.title(visibleArtifactName(artifact.name))}</Dialog.Title>
          <Dialog.Description>
            {reviewAppText.tombstone.description}
          </Dialog.Description>
          <label>
            <span className="as-visually-hidden">{reviewAppText.tombstone.nameLabel}</span>
            <input autoFocus onChange={(event) => setValue(event.currentTarget.value)} value={value} />
          </label>
          <div className="as-confirm-dialog__actions">
            <Dialog.Close className="as-button">{reviewAppText.general.cancel}</Dialog.Close>
            <button className="as-button as-button--danger" disabled={pending || value !== artifact.name} onClick={() => void confirm()} type="button">
              {pending ? reviewAppText.tombstone.deleting : reviewAppText.tombstone.trigger}
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function MakeCurrentControl({
  expectedCurrentVersionId,
  onConfirm,
  version,
}: {
  readonly expectedCurrentVersionId: string;
  readonly onConfirm: (
    versionId: string,
    expectedCurrentVersionId: string,
  ) => Promise<boolean>;
  readonly version: Version;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const confirm = async (): Promise<void> => {
    setPending(true);
    await onConfirm(version.id, expectedCurrentVersionId);
    setPending(false);
    setOpen(false);
  };
  return (
    <Dialog.Root onOpenChange={setOpen} open={open}>
      <Dialog.Trigger className="as-version-list__make-current">
        {reviewAppText.makeCurrent.trigger}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="as-confirm-dialog__backdrop" />
        <Dialog.Popup className="as-confirm-dialog">
          <Dialog.Title>{reviewAppText.makeCurrent.title(version.number)}</Dialog.Title>
          <Dialog.Description>
            {reviewAppText.makeCurrent.description(version.number)}
          </Dialog.Description>
          <div className="as-confirm-dialog__actions">
            <Dialog.Close className="as-button" disabled={pending}>{reviewAppText.general.cancel}</Dialog.Close>
            <button
              className="as-button as-button--primary"
              disabled={pending}
              onClick={() => void confirm()}
              type="button"
            >
              {pending ? reviewAppText.makeCurrent.pending : reviewAppText.makeCurrent.trigger}
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function InspectorSection({
  action,
  children,
  count,
  title,
}: {
  readonly action?: React.ReactNode;
  readonly children: React.ReactNode;
  readonly count: number;
  readonly title: string;
}) {
  return (
    <section className="as-inspector-section">
      <header>
        <h2>{title}</h2>
        <span>{count}</span>
        {action}
      </header>
      <div className="as-inspector-section__body">{children}</div>
    </section>
  );
}

function InspectorRow({
  label,
  mono = false,
  title,
  value,
}: {
  readonly label: string;
  readonly mono?: boolean;
  readonly title?: string;
  readonly value: ReactNode;
}) {
  return (
    <dl className="as-inspector-row">
      <dt>{label}</dt>
      <dd
        className={mono ? "as-mono" : undefined}
        title={title}
      >
        {value}
      </dd>
    </dl>
  );
}

function InspectorTabButton({
  active,
  count,
  label,
  onClick,
  tab,
}: {
  readonly active: boolean;
  readonly count?: number;
  readonly label: string;
  readonly onClick: () => void;
  readonly tab: InspectorTab;
}) {
  return (
    <button
      aria-controls="review-inspector-panel"
      aria-selected={active}
      className="as-tab"
      data-active={active}
      id={`review-inspector-tab-${tab}`}
      onClick={onClick}
      role="tab"
      type="button"
    >
      {label}
      {count === undefined ? null : <span>{count}</span>}
    </button>
  );
}

function IconButton({
  active,
  children,
  disabled = false,
  keyShortcuts,
  label,
  onClick,
  title,
}: {
  readonly active?: boolean;
  readonly children: React.ReactNode;
  readonly disabled?: boolean;
  readonly keyShortcuts?: string;
  readonly label: string;
  readonly onClick: () => void;
  readonly title?: string;
}) {
  return (
    <button
      aria-keyshortcuts={keyShortcuts}
      aria-label={label}
      aria-pressed={active}
      className="as-icon-button"
      data-active={active}
      disabled={disabled}
      onClick={onClick}
      title={title ?? label}
      type="button"
    >
      {children}
    </button>
  );
}

function AccessPill({access}: {readonly access: ArtifactDetails["artifact"]["accessSetting"]}) {
  return (
    <span className="as-pill" data-access={access}>
      {access === "public_link" ? reviewAppText.access.public : reviewAppText.access.private}
    </span>
  );
}

function PreviewWelcome({
  description = reviewAppText.preview.welcomeDescription,
  title = reviewAppText.preview.welcomeTitle,
}: {
  readonly description?: string;
  readonly title?: string;
}) {
  return (
    <div className="as-preview-welcome">
      <span aria-hidden="true"><HugeiconsIcon icon={Link01Icon} strokeWidth={1.4} /></span>
      <h2>{title}</h2>
      <p>{reviewAppText.preview.welcomeTagline}</p>
      <small>{description}</small>
    </div>
  );
}

function InlineState({
  description,
  title,
  tone = "neutral",
}: {
  readonly description: string;
  readonly title: string;
  readonly tone?: "error" | "neutral";
}) {
  return (
    <div className="as-inline-state" data-tone={tone} role="status">
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

function ReviewGate({
  action,
  description,
  title,
}: {
  readonly action?: React.ReactNode;
  readonly description: string;
  readonly title: string;
}) {
  return (
    <main className="as-gate">
      <section>
        <span aria-hidden="true" className="as-gate__mark">A</span>
        <h1>{title}</h1>
        <p>Artifact Server</p>
        <small>{description}</small>
        {action}
      </section>
    </main>
  );
}

function readReviewLocation(): ReviewLocation {
  const search = new URLSearchParams(window.location.search);
  return {
    artifactId: search.get("artifact"),
    folderId: search.get("folder"),
    path: search.get("path"),
    projectId: search.get("project"),
    threadId: search.get("thread"),
    versionId: search.get("version"),
    view: search.get("view") === "focus" ? "focus" : null,
  };
}

function reviewHref(location: ReviewLocation): string {
  const search = new URLSearchParams();
  if (location.projectId !== null && location.projectId !== "") {
    search.set("project", location.projectId);
  }
  if (location.folderId !== null) search.set("folder", location.folderId);
  if (location.artifactId !== null) search.set("artifact", location.artifactId);
  if (location.versionId !== null) search.set("version", location.versionId);
  if (location.path !== null) search.set("path", location.path);
  if (location.threadId !== null && location.threadId !== undefined) search.set("thread", location.threadId);
  if (location.view !== null) search.set("view", location.view);
  return search.size === 0 ? "/review" : `/review?${search}`;
}

function reviewPreviewKind(
  version: ArtifactVersion | null,
  selectedPath: string | null,
): "html" | "media" | "other" {
  if (version === null) return "other";
  const path = selectedPath ?? version.manifest.entryPath;
  const mediaType = version.manifest.entries
    .find((entry) => entry.path === path)
    ?.mediaType.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (mediaType === "text/html") return "html";
  if (mediaType?.startsWith("image/") || mediaType?.startsWith("video/")) {
    return "media";
  }
  return "other";
}

function reviewEntryIsMarkdown(
  version: ArtifactVersion | null,
  selectedPath: string | null,
): boolean {
  if (version === null) return false;
  const path = selectedPath ?? version.manifest.entryPath;
  const mediaType = version.manifest.entries
    .find((entry) => entry.path === path)
    ?.mediaType.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  return mediaType === "text/markdown" || mediaType === "text/x-markdown";
}

function compactId(value: string): string {
  const unprefixed = value.startsWith("ver_") ? value.slice(4) : value;
  return unprefixed.slice(0, 8);
}
