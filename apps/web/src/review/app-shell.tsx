import {GlobeIcon, Moon02Icon, Settings02Icon, Sun03Icon} from "@hugeicons/core-free-icons";
import {HugeiconsIcon} from "@hugeicons/react";
import type {MouseEvent as ReactMouseEvent, ReactNode} from "react";

import type {Session} from "@/api/client";
import {locale, setLocale} from "@/i18n/locale";
import {commonText} from "@/i18n/messages/common";
import {readerText} from "@/i18n/messages/reader";
import {reviewAppText} from "@/i18n/messages/review-app";
import {ArtifactMark} from "./artifact-mark.tsx";
import {dashboardPath, filesPath, linkedFoldersPath, trashPath} from "./review-routes.ts";

/** The application area a page belongs to, marked current in the top bar. */
export type AppArea = "dashboard" | "files" | "review" | "settings";

type Capabilities = Session["capabilities"];

interface AppTopBarProps {
  readonly area: AppArea;
  readonly capabilities: Pick<Capabilities, "fileOverview" | "linkedFolders" | "trash">;
  /** Review's project switcher and catalog trigger, placed after the brand. */
  readonly leading?: ReactNode;
  readonly onBrandClick?: (event: ReactMouseEvent<HTMLAnchorElement>) => void;
  readonly onThemeChange: () => void;
  /** The project the user is working in; nav links keep it. */
  readonly projectId?: string | null;
  /** Where the brand and the Review link go; settings returns to the Review it came from. */
  readonly reviewHref?: string;
  readonly settingsHref?: string;
  /** Quiet status text before the language switch, such as agents online. */
  readonly status?: ReactNode;
  readonly theme: "dawn" | "moon";
  /** Page-specific actions after Settings, such as signing out. */
  readonly trailing?: ReactNode;
}

function withProject(path: string, projectId: string | null | undefined): string {
  return projectId === null || projectId === undefined || projectId === ""
    ? path
    : `${path}?${new URLSearchParams({project: projectId})}`;
}

/** Where the Files nav item goes: the first file view this installation offers. */
export function filesAreaPath(
  capabilities: Pick<Capabilities, "fileOverview" | "linkedFolders" | "trash">,
): string | null {
  if (capabilities.fileOverview) return filesPath;
  if (capabilities.linkedFolders) return linkedFoldersPath;
  if (capabilities.trash) return trashPath;
  return null;
}

/**
 * The one top bar shared by Review, Files, the dashboard and settings: brand, the
 * page's own leading controls, the three areas, then language, theme and
 * settings. Every control carries a visible text label except the theme
 * switch, whose name is its action.
 */
export function AppTopBar({
  area, capabilities, leading, onBrandClick, onThemeChange, projectId, reviewHref = "/review", settingsHref, status, theme, trailing,
}: AppTopBarProps) {
  const filesHref = filesAreaPath(capabilities);
  const themeLabel = theme === "moon" ? reviewAppText.catalog.useLightTheme : reviewAppText.catalog.useDarkTheme;
  return (
    <header className="as-topbar">
      <a aria-label="Artifact Server" className="as-topbar__brand" href={reviewHref} onClick={onBrandClick} title="Artifact Server">
        <ArtifactMark className="as-topbar__mark" />
        <span className="as-topbar__brand-label">Artifact Server</span>
      </a>
      {leading}
      <span aria-hidden="true" className="as-topbar__sep" />
      <nav aria-label={readerText.nav.label} className="as-topbar__nav">
        <a aria-current={area === "review" ? "page" : undefined} href={reviewHref}>{readerText.nav.review}</a>
        <a aria-current={area === "dashboard" ? "page" : undefined} href={withProject(dashboardPath, projectId)}>
          {readerText.nav.dashboard}
        </a>
        {filesHref === null ? null : (
          <a aria-current={area === "files" ? "page" : undefined} href={withProject(filesHref, filesHref === trashPath ? null : projectId)}>
            {readerText.nav.files}
          </a>
        )}
      </nav>
      <span className="as-topbar__grow" />
      {status === undefined ? null : <span className="as-topbar__status">{status}</span>}
      <button
        aria-label={commonText.language.switchToLabel}
        className="as-bar-button"
        lang={locale === "en" ? "zh-Hant-TW" : "en"}
        onClick={() => setLocale(locale === "en" ? "zh-TW" : "en")}
        title={commonText.language.switchToLabel}
        type="button"
      >
        <HugeiconsIcon aria-hidden="true" icon={GlobeIcon} strokeWidth={1.6} />
        <span className="as-topbar__optional-label">{commonText.language.switchTo}</span>
      </button>
      <button aria-label={themeLabel} className="as-icon-button" onClick={onThemeChange} title={themeLabel} type="button">
        <HugeiconsIcon aria-hidden="true" icon={theme === "moon" ? Sun03Icon : Moon02Icon} strokeWidth={1.6} />
      </button>
      <a
        aria-current={area === "settings" ? "page" : undefined}
        className="as-bar-button"
        href={settingsHref ?? "/review/settings/projects"}
      >
        <HugeiconsIcon aria-hidden="true" icon={Settings02Icon} strokeWidth={1.6} />
        <span className="as-topbar__optional-label">{readerText.nav.settings}</span>
      </a>
      {trailing}
    </header>
  );
}

/** The three file views: the overview, linked folders, and the trash. */
export type FilesSection = "files" | "linked" | "trash";

interface FilesSectionHeaderProps {
  readonly actions?: ReactNode;
  readonly capabilities: Pick<Capabilities, "fileOverview" | "linkedFolders" | "trash">;
  /** Known counts only; a view whose count this page does not hold shows none. */
  readonly counts?: {
    readonly files?: number;
    readonly linkedPending?: number;
    readonly trash?: number;
  };
  readonly current: FilesSection;
  readonly projectId?: string | null;
  readonly title: string;
}

/**
 * The page head of the file views: the title, then one underline tab per
 * view. Each view is its own refresh-safe URL, so the tabs are links marked
 * with aria-current rather than an in-page tablist.
 */
export function FilesSectionHeader({actions, capabilities, counts, current, projectId, title}: FilesSectionHeaderProps) {
  const sections: readonly {readonly href: string; readonly id: FilesSection; readonly label: string; readonly count: string | undefined}[] = [
    ...(capabilities.fileOverview ? [{
      href: withProject(filesPath, projectId), id: "files" as const, label: readerText.files.files,
      count: counts?.files === undefined ? undefined : counts.files.toLocaleString(),
    }] : []),
    ...(capabilities.linkedFolders ? [{
      href: withProject(linkedFoldersPath, projectId), id: "linked" as const, label: readerText.files.linked,
      count: counts?.linkedPending === undefined || counts.linkedPending === 0
        ? undefined : readerText.files.pending(counts.linkedPending),
    }] : []),
    ...(capabilities.trash ? [{
      href: trashPath, id: "trash" as const, label: readerText.files.trash,
      count: counts?.trash === undefined ? undefined : counts.trash.toLocaleString(),
    }] : []),
  ];
  return (
    <div className="as-page-head">
      <h1>{title}</h1>
      {sections.length < 2 ? null : (
        <nav aria-label={readerText.files.sections} className="as-page-tabs">
          {sections.map((section) => (
            <a aria-current={section.id === current ? "page" : undefined} className="as-page-tab" href={section.href} key={section.id}>
              {section.label}
              {section.count === undefined ? null : <span className="as-page-tab__count">{section.count}</span>}
            </a>
          ))}
        </nav>
      )}
      {actions === undefined ? null : <div className="as-page-head__actions">{actions}</div>}
    </div>
  );
}
