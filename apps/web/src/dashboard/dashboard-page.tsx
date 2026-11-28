import {useEffect, useMemo, useRef, useState} from "react";

import {ApiError, api, type Insights, type InsightWindow, type Project, type Session} from "@/api/client";
import {ErrorPanel, StatePanel} from "@/components/product";
import {ButtonLink} from "@/components/ui/button";
import {NativeSelect} from "@/components/ui/native-select";
import {Skeleton} from "@/components/ui/skeleton";
import {dashboardText} from "@/i18n/messages/dashboard";
import {readerText} from "@/i18n/messages/reader";
import {AppTopBar} from "../review/app-shell.tsx";
import {DashboardAttention} from "./dashboard-attention.tsx";
import {ActivitySection} from "./dashboard-activity.tsx";
import {dashboardWindows} from "./dashboard-format.ts";
import {
  DashboardHeadline,
  OverviewSection,
  RecentArtifacts,
  ReviewSection,
  StorageSection,
} from "./dashboard-sections.tsx";

type InsightsState =
  | {readonly status: "loading"}
  | {readonly error: Error; readonly status: "failed"}
  | {readonly insights: Insights; readonly status: "ready"};

/** Scope and window, kept in the URL so a refresh or a shared link keeps them. */
interface DashboardSelection {
  readonly projectId: string | null;
  readonly window: InsightWindow;
}

const allProjects = "";
const text = dashboardText.page;

type DashboardTab = "overview" | "queue" | "storage";
const dashboardTabs: readonly {readonly id: DashboardTab; readonly label: string}[] = [
  {id: "queue", label: readerText.dashboard.queue},
  {id: "overview", label: readerText.dashboard.overview},
  {id: "storage", label: readerText.dashboard.storage},
];

/** Read-only overview of artifacts, review, storage, and activity. */
export function DashboardPage({
  filesCapabilities,
  onThemeChange,
  principalId,
  projects,
  theme,
}: {
  readonly filesCapabilities: Pick<Session["capabilities"], "fileOverview" | "linkedFolders" | "trash">;
  readonly onThemeChange: () => void;
  readonly principalId: string;
  readonly projects: readonly Project[];
  readonly theme: "dawn" | "moon";
}) {
  const [selection, setSelection] = useState<DashboardSelection>(readSelection);
  const [state, setState] = useState<InsightsState>({status: "loading"});
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [tab, setTab] = useState<DashboardTab>("queue");
  const tabRefs = useRef(new Map<DashboardTab, HTMLButtonElement>());
  const projectIds = useMemo(() => projects.map((project) => project.id), [projects]);
  const projectNames = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects],
  );

  useEffect(() => {
    writeSelection(selection);
    let current = true;
    setState({status: "loading"});
    const load = async () => {
      try {
        const insights = await api.insights(selection.projectId, selection.window);
        if (!current) return;
        setNow(Date.parse(insights.generatedAt));
        setState({insights, status: "ready"});
      } catch (caught) {
        if (!current) return;
        setState({
          error: caught instanceof Error ? caught : new Error("The dashboard could not be loaded."),
          status: "failed",
        });
      }
    };
    void load();
    return () => {
      current = false;
    };
  }, [attempt, selection]);

  // Tabs follow the ARIA tabs pattern: arrows move between them and select.
  const moveTab = (from: DashboardTab, step: -1 | 1): void => {
    const index = dashboardTabs.findIndex((entry) => entry.id === from);
    const next = dashboardTabs[(index + step + dashboardTabs.length) % dashboardTabs.length];
    if (next === undefined) return;
    setTab(next.id);
    tabRefs.current.get(next.id)?.focus();
  };
  const windowLabel = dashboardWindows.find((option) => option.value === selection.window)?.label ?? "";

  return (
    <div className="as-page">
      <AppTopBar
        area="dashboard"
        capabilities={filesCapabilities}
        onThemeChange={onThemeChange}
        projectId={selection.projectId}
        theme={theme}
      />
      <div className="as-page__scroll">
      <main className="as-page__wrap as-dashboard" id="main-content">
        <div className="as-page-head">
          <h1>{text.title}</h1>
          <div aria-label={readerText.dashboard.sections} className="as-page-tabs" role="tablist">
            {dashboardTabs.map((entry) => (
              <button
                aria-controls={`dashboard-panel-${entry.id}`}
                aria-selected={tab === entry.id}
                className="as-page-tab"
                id={`dashboard-tab-${entry.id}`}
                key={entry.id}
                onClick={() => setTab(entry.id)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                    event.preventDefault();
                    moveTab(entry.id, event.key === "ArrowRight" ? 1 : -1);
                  }
                }}
                ref={(element) => {
                  if (element === null) tabRefs.current.delete(entry.id);
                  else tabRefs.current.set(entry.id, element);
                }}
                role="tab"
                tabIndex={tab === entry.id ? 0 : -1}
                type="button"
              >
                {entry.label}
              </button>
            ))}
          </div>
          <div className="as-page-head__actions">
            <NativeSelect
              aria-label={text.project}
              onChange={(event) => setSelection((current) => ({
                ...current,
                projectId: event.target.value === allProjects ? null : event.target.value,
              }))}
              value={selection.projectId ?? allProjects}
            >
              <option value={allProjects}>{text.allProjects}</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </NativeSelect>
            <div aria-label={text.timeWindow} className="as-segmented" role="group">
              {dashboardWindows.map((option) => (
                <button
                  aria-pressed={selection.window === option.value}
                  className="as-bar-button"
                  key={option.value}
                  onClick={() => setSelection((current) => ({...current, window: option.value}))}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        {state.status === "loading" ? <DashboardSkeleton /> : null}
        {state.status === "failed"
          ? <DashboardFailure error={state.error} onRetry={() => setAttempt((value) => value + 1)} />
          : null}
        {state.status === "ready"
          ? (
            <>
              <div
                aria-labelledby="dashboard-tab-queue"
                className="as-dashboard__panel"
                hidden={tab !== "queue"}
                id="dashboard-panel-queue"
                role="tabpanel"
              >
                <div className="as-dashboard__grid">
                  <div className="as-dashboard__main">
                    <DashboardAttention principalId={principalId} projectId={selection.projectId} projectIds={projectIds} />
                    <ActivitySection
                      now={now}
                      projectId={selection.projectId}
                      projectNames={projectNames}
                      window={selection.window}
                      windowLabel={windowLabel}
                    />
                  </div>
                  <aside className="as-dashboard__side">
                    <DashboardHeadline insights={state.insights} />
                    <ReviewSection insights={state.insights} now={now} windowLabel={windowLabel} />
                    <RecentArtifacts
                      insights={state.insights}
                      now={now}
                      onShowOverview={() => {
                        setTab("overview");
                        tabRefs.current.get("overview")?.focus();
                      }}
                      projectNames={projectNames}
                    />
                  </aside>
                </div>
              </div>
              <div
                aria-labelledby="dashboard-tab-overview"
                className="as-dashboard__panel"
                hidden={tab !== "overview"}
                id="dashboard-panel-overview"
                role="tabpanel"
              >
                <OverviewSection insights={state.insights} now={now} projectNames={projectNames} />
              </div>
              <div
                aria-labelledby="dashboard-tab-storage"
                className="as-dashboard__panel"
                hidden={tab !== "storage"}
                id="dashboard-panel-storage"
                role="tabpanel"
              >
                <StorageSection insights={state.insights} projectNames={projectNames} />
              </div>
            </>
          )
          : null}
      </main>
      </div>
    </div>
  );
}

function DashboardFailure({
  error,
  onRetry,
}: {
  readonly error: Error;
  readonly onRetry: () => void;
}) {
  if (error instanceof ApiError && error.code === "CAPABILITY_UNAVAILABLE") {
    return (
      <StatePanel
        description={text.unavailableDescription}
        title={text.unavailableTitle}
      />
    );
  }
  if (error instanceof ApiError && error.code === "PROJECT_NOT_FOUND") {
    return (
      <StatePanel
        action={<ButtonLink href="/review/dashboard" variant="outline">{text.showAllProjects}</ButtonLink>}
        description={text.projectNotFoundDescription}
        title={text.projectNotFoundTitle}
      />
    );
  }
  return <ErrorPanel error={error} onRetry={onRetry} />;
}

function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label={text.loading} className="as-dashboard__grid">
      <Skeleton className="h-[28rem]" />
      <Skeleton className="h-[28rem]" />
    </div>
  );
}

function readSelection(): DashboardSelection {
  const query = new URLSearchParams(window.location.search);
  const requested = query.get("window");
  const chosen = dashboardWindows.find((option) => option.value === requested);
  const projectId = query.get("project");
  return {
    projectId: projectId === null || projectId === "" ? null : projectId,
    window: chosen?.value ?? "30d",
  };
}

function writeSelection(selection: DashboardSelection): void {
  const query = new URLSearchParams();
  if (selection.projectId !== null) query.set("project", selection.projectId);
  if (selection.window !== "30d") query.set("window", selection.window);
  const search = query.size === 0 ? "" : `?${query}`;
  if (window.location.search !== search) {
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${search}`);
  }
}
