import {useEffect, useState} from "react";

import {api, type InsightActivityEvent, type InsightWindow} from "@/api/client";
import {ErrorPanel} from "@/components/product";
import {Button} from "@/components/ui/button";
import {Skeleton} from "@/components/ui/skeleton";
import {dashboardText} from "@/i18n/messages/dashboard";
import {formatRelativeTime, formatTimestamp} from "@/lib/presentation";
import {activityActorLabel, activityGroupLabel, activityLabel, artifactReviewHref} from "./dashboard-format.ts";

const text = dashboardText.activity;

type ActivityState =
  | {readonly status: "loading"}
  | {readonly error: Error; readonly status: "failed"}
  | {
    readonly events: readonly InsightActivityEvent[];
    readonly loadingMore: boolean;
    readonly nextCursor: string | null;
    readonly status: "ready";
  };

/** Newest-first durable changes for the selected scope and window. */
export function ActivitySection({
  now,
  projectId,
  projectNames,
  window,
  windowLabel,
}: {
  readonly now: number;
  readonly projectId: string | null;
  readonly projectNames: ReadonlyMap<string, string>;
  readonly window: InsightWindow;
  readonly windowLabel: string;
}) {
  const [state, setState] = useState<ActivityState>({status: "loading"});
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    setState({status: "loading"});
    const load = async () => {
      try {
        const page = await api.insightActivity(projectId, window, null);
        if (!current) return;
        setState({
          events: page.items,
          loadingMore: false,
          nextCursor: page.nextCursor,
          status: "ready",
        });
      } catch (caught) {
        if (current) setState({error: caught instanceof Error ? caught : new Error("The activity could not be loaded."), status: "failed"});
      }
    };
    void load();
    return () => {
      current = false;
    };
  }, [attempt, projectId, window]);

  const loadMore = async (cursor: string, events: readonly InsightActivityEvent[]) => {
    setState({events, loadingMore: true, nextCursor: cursor, status: "ready"});
    try {
      const page = await api.insightActivity(projectId, window, cursor);
      setState({
        events: [...events, ...page.items],
        loadingMore: false,
        nextCursor: page.nextCursor,
        status: "ready",
      });
    } catch (caught) {
      setState({error: caught instanceof Error ? caught : new Error("The activity could not be loaded."), status: "failed"});
    }
  };

  return (
    <section aria-labelledby="dashboard-activity-title" className="as-dashboard-section">
      <div className="as-dashboard-section__head">
        <h2 id="dashboard-activity-title">{text.title} <span className="as-dashboard-section__count">{windowLabel}</span></h2>
        <span className="as-dashboard-section__aside">{text.description}</span>
      </div>
      <div>
        {state.status === "loading"
          ? (
            <div className="grid gap-3">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-11/12" />
              <Skeleton className="h-5 w-10/12" />
            </div>
          )
          : null}
        {state.status === "failed"
          ? <ErrorPanel error={state.error} onRetry={() => setAttempt((value) => value + 1)} />
          : null}
        {state.status === "ready"
          ? (
            <div className="grid gap-4">
              {state.events.length === 0
                ? <p className="text-sm text-muted-foreground">{text.empty}</p>
                : (
                  <ol aria-label={text.trail} className="as-activity">
                    {groupActivity(state.events).map(([first, ...repeated]) => {
                      const row = (event: InsightActivityEvent) => (
                        <ActivityRow
                          event={event}
                          key={event.id}
                          now={now}
                          projectName={projectId === null ? projectNames.get(event.projectId) ?? null : null}
                        />
                      );
                      if (repeated.length === 0) return row(first);
                      return (
                        <li className="as-activity__group" key={first.id}>
                          <details>
                            <summary>
                              {activityGroupLabel(first.kind, activityActorLabel(first.actor) ?? "", repeated.length + 1)}
                            </summary>
                            <ol className="as-activity as-activity--nested">{[first, ...repeated].map(row)}</ol>
                          </details>
                        </li>
                      );
                    })}
                  </ol>
                )}
              {state.nextCursor === null
                ? null
                : (
                  <Button
                    className="justify-self-end"
                    disabled={state.loadingMore}
                    onClick={() => {
                      if (state.nextCursor !== null) void loadMore(state.nextCursor, state.events);
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {state.loadingMore ? text.loading : text.showOlder}
                  </Button>
                )}
            </div>
          )
          : null}
      </div>
    </section>
  );
}

function groupActivity(events: readonly InsightActivityEvent[]): [InsightActivityEvent, ...InsightActivityEvent[]][] {
  const groups: [InsightActivityEvent, ...InsightActivityEvent[]][] = [];
  for (const event of events) {
    const previous = groups.at(-1);
    if (previous !== undefined && event.actor !== null
      && previous[0].actor?.principalId === event.actor.principalId && previous[0].kind === event.kind) {
      previous.push(event);
    } else {
      groups.push([event]);
    }
  }
  return groups;
}

function ActivityRow({
  event,
  now,
  projectName,
}: {
  readonly event: InsightActivityEvent;
  readonly now: number;
  readonly projectName: string | null;
}) {
  const actor = activityActorLabel(event.actor);
  const label = activityLabel(event.kind);
  // Reader palette: an agent (a service principal) is an instrument and reads
  // in the dispatch blue; a person and an unknown actor read in ink.
  const actorTone = event.actor?.kind === "service" ? "as-activity__actor--agent" : "";
  return (
    <li className="as-activity__row">
      <p className="as-activity__what">
        {actor === null ? null : <span className={`as-activity__actor ${actorTone}`}>{actor} </span>}
        {label.lead === "" ? null : <span>{label.lead}</span>}
        {event.artifactId === null || event.artifactName === null
          ? label.trail === ""
            ? null
            : <span>{` ${text.unknownArtifact}${label.trail}`}</span>
          : (
            <>
              {" "}
              <a className="as-dashboard-link" href={artifactReviewHref(event.projectId, event.artifactId)}>
                {event.artifactName}
              </a>
              {event.versionNumber === null
                ? null
                : <span className="as-version-number"> v{event.versionNumber}</span>}
              {label.trail === "" ? null : <span>{label.trail}</span>}
            </>
          )}
        {projectName === null
          ? null
          : <span className="as-activity__project">{projectName}</span>}
      </p>
      <time
        className="as-activity__when"
        dateTime={event.occurredAt}
        title={formatTimestamp(event.occurredAt)}
      >
        {formatRelativeTime(event.occurredAt, now)}
      </time>
    </li>
  );
}
