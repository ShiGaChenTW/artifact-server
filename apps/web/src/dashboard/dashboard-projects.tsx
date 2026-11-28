import type {Insights} from "@/api/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {dashboardText} from "@/i18n/messages/dashboard";
import {formatBytes, formatRelativeTime, formatTimestamp} from "@/lib/presentation";
import {dashboardHref, projectArtifactsHref} from "./dashboard-format.ts";
import {Quiet, SectionCard} from "./dashboard-sections.tsx";

const text = dashboardText.projects;

/**
 * Every project of the installation side by side, each linking to its own
 * dashboard (same window) and its own artifact list. The links sit right
 * after the name so a narrow screen shows them without scrolling the table. Shown only in the
 * All-projects scope, so the stored figure it quotes is installation-wide.
 */
export function ProjectsSection({
  filesAvailable,
  insights,
  now,
  windowLabel,
}: {
  readonly filesAvailable: boolean;
  readonly insights: Insights;
  readonly now: number;
  readonly windowLabel: string;
}) {
  const rows = insights.overview.projects;
  const nameCounts = new Map<string, number>();
  for (const row of rows) nameCounts.set(row.name, (nameCounts.get(row.name) ?? 0) + 1);
  const windowed = insights.window !== "all";
  return (
    <SectionCard description={text.description} id="dashboard-projects-title" title={text.title}>
      {rows.length === 0
        ? <Quiet>{text.noProjects}</Quiet>
        : (
          <>
            <Quiet>{windowed ? text.currentTotalsWindow(windowLabel) : text.currentTotals}</Quiet>
            <Table className="as-page-table as-project-table">
              <caption className="as-visually-hidden">{text.caption}</caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">{text.project}</TableHead>
                  <TableHead scope="col">{text.open}</TableHead>
                  <TableHead className="text-right" scope="col">{text.artifacts}</TableHead>
                  <TableHead className="text-right" scope="col">{text.versions}</TableHead>
                  <TableHead className="text-right" scope="col">{text.latestPublish}</TableHead>
                  <TableHead className="text-right" scope="col">{text.openThreads}</TableHead>
                  <TableHead className="text-right" scope="col">{text.inProgress}</TableHead>
                  <TableHead className="text-right" scope="col">{text.failed}</TableHead>
                  <TableHead className="text-right" scope="col">{text.retained}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const ambiguous = (nameCounts.get(row.name) ?? 0) > 1;
                  const empty = row.artifactCount === 0;
                  // Same-name projects stay apart: their links name the ID too.
                  const label = ambiguous ? `${row.name} (${row.projectId})` : row.name;
                  return (
                    <TableRow data-empty={empty ? "true" : undefined} data-project-id={row.projectId} key={row.projectId}>
                      <TableHead className="as-project-table__name" scope="row">
                        <span>{row.name}</span>
                        {row.archived ? <span className="as-project-table__mark">{text.archived}</span> : null}
                        {empty ? <span className="as-project-table__mark">{text.empty}</span> : null}
                        {ambiguous
                          ? <span className="as-project-table__id">{text.projectId(row.projectId)}</span>
                          : null}
                      </TableHead>
                      <TableCell>
                        <span className="as-project-table__links">
                          <a
                            aria-label={text.dashboardLabel(label)}
                            className="as-dashboard-link"
                            href={dashboardHref(row.projectId, insights.window)}
                          >
                            {text.dashboard}
                          </a>
                          <a
                            aria-label={filesAvailable ? text.filesLabel(label) : text.reviewLabel(label)}
                            className="as-dashboard-link"
                            href={projectArtifactsHref(row.projectId, filesAvailable)}
                          >
                            {filesAvailable ? text.files : text.review}
                          </a>
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{row.artifactCount}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {row.versionCount}
                        {windowed
                          ? <span className="as-project-table__detail">{text.inWindow(row.versionsInWindow, windowLabel)}</span>
                          : null}
                      </TableCell>
                      <TableCell
                        className="text-right"
                        title={row.latestVersionAt === null ? undefined : formatTimestamp(row.latestVersionAt)}
                      >
                        {row.latestVersionAt === null ? text.noneYet : formatRelativeTime(row.latestVersionAt, now)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{row.openThreads}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{row.inProgressDispatches}</TableCell>
                      <TableCell
                        className="text-right font-mono tabular-nums"
                        data-tone={row.failedDispatches > 0 ? "danger" : undefined}
                      >
                        {row.failedDispatches}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{formatBytes(row.logicalBytes)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <Quiet>{text.storageNote(formatBytes(insights.storage.storedBytes))}</Quiet>
          </>
        )}
    </SectionCard>
  );
}
