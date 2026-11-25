import {
  ArrowDown01Icon, ArrowRight01Icon, Folder01Icon, Search01Icon,
} from "@hugeicons/core-free-icons";
import {HugeiconsIcon} from "@hugeicons/react";
import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import type {FormEvent, KeyboardEvent, MouseEvent} from "react";

import {
  api, type BatchItem, type BatchOperation, type FileFacets, type FileItem, fileKinds, type Folder,
  type Project, type Session,
} from "@/api/client";
import {ErrorPanel, StatePanel} from "@/components/product";
import {Button} from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {Input} from "@/components/ui/input";
import {NativeSelect, NativeSelectOption} from "@/components/ui/native-select";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "@/components/ui/table";
import {locale} from "@/i18n/locale";
import {serverErrorMessage} from "@/i18n/messages/common";
import {filesText} from "@/i18n/messages/files";
import {folderText} from "@/i18n/messages/folders";
import {reviewAppText} from "@/i18n/messages/review-app";
import {errorMessage, formatBytes, formatTimestamp, sourceFreshnessLabel} from "@/lib/presentation";
import {AppTopBar, FilesSectionHeader} from "./app-shell.tsx";
import {FolderDestinationPicker, visibleArtifactName} from "./review-folders.tsx";
import {filesPath, linkedFoldersPath} from "./review-routes.ts";

const sorts = ["updated", "created", "name", "size", "comments"] as const;
type Sort = (typeof sorts)[number];
const linkedStates = ["any", "linked", "drifted", "missing", "not-linked"] as const;
type LinkedState = (typeof linkedStates)[number];
const maximumBatch = 100;

/** Every filter lives in the URL so the page is refresh-safe and shareable. */
interface FileFilters {
  readonly project: string;
  readonly folder: string;
  readonly kind: string;
  readonly tag: string;
  readonly linked: LinkedState;
  readonly updatedAfter: string;
  readonly updatedBefore: string;
  readonly search: string;
  readonly sort: Sort;
  readonly direction: "asc" | "desc";
}

const emptyFilters: FileFilters = {
  project: "", folder: "", kind: "", tag: "", linked: "any", updatedAfter: "", updatedBefore: "",
  search: "", sort: "updated", direction: "desc",
};

function readFilters(search: string): FileFilters {
  const query = new URLSearchParams(search);
  const text = (name: string) => query.get(name) ?? "";
  const sort = sorts.find((value) => value === query.get("sort")) ?? "updated";
  return {
    project: text("project"),
    folder: text("folder"),
    kind: fileKinds.find((value) => value === query.get("kind")) ?? "",
    tag: text("tag"),
    linked: linkedStates.find((value) => value === query.get("linked")) ?? "any",
    updatedAfter: dateOnly(text("updatedAfter")),
    updatedBefore: dateOnly(text("updatedBefore")),
    search: text("search"),
    sort,
    direction: query.get("direction") === "asc" || (query.get("direction") === null && sort === "name") ? "asc" : "desc",
  };
}

function dateOnly(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/u.test(value) ? value : "";
}

/** The page URL keeps only filters that differ from the defaults. */
function pageQuery(filters: FileFilters): URLSearchParams {
  const query = new URLSearchParams();
  const values = [
    ["project", filters.project], ["folder", filters.folder], ["kind", filters.kind], ["tag", filters.tag],
    ["linked", filters.linked === "any" ? "" : filters.linked], ["updatedAfter", filters.updatedAfter],
    ["updatedBefore", filters.updatedBefore], ["search", filters.search],
    ["sort", filters.sort === "updated" ? "" : filters.sort],
    ["direction", filters.direction === (filters.sort === "name" ? "asc" : "desc") ? "" : filters.direction],
  ] as const;
  for (const [name, value] of values) if (value !== "") query.set(name, value);
  return query;
}

/** The API query for the same filters; dates are whole UTC days. */
function apiQuery(filters: FileFilters): URLSearchParams {
  const query = new URLSearchParams({sort: filters.sort, direction: filters.direction});
  if (filters.project !== "") query.set("projectId", filters.project);
  if (filters.folder !== "") query.set("folderId", filters.folder);
  if (filters.kind !== "") query.set("kind", filters.kind);
  if (filters.tag.trim() !== "") query.set("tag", filters.tag.trim());
  if (filters.linked !== "any") query.set("linked", filters.linked);
  if (filters.updatedAfter !== "") query.set("updatedAfter", `${filters.updatedAfter}T00:00:00.000Z`);
  if (filters.updatedBefore !== "") query.set("updatedBefore", `${filters.updatedBefore}T00:00:00.000Z`);
  if (filters.search.trim() !== "") query.set("search", filters.search.trim());
  return query;
}

type Loaded =
  | {readonly status: "loading"}
  | {readonly status: "failed"; readonly error: Error}
  | {readonly status: "ready"; readonly items: readonly FileItem[]; readonly nextCursor: string | null};

interface Failure {
  readonly file: FileItem;
  readonly status: "conflict" | "not-found" | "refused";
  readonly code: string;
  readonly message: string;
  readonly currentVersionId: string | null;
}

/** Untracked linked-folder entries are not files; the Files header only counts them (spec section 11.1). */
interface LinkedPending {
  readonly entries: number;
  readonly folders: number;
  readonly projectId: string | null;
}

interface BatchOutcome {
  readonly succeeded: readonly FileItem[];
  readonly failures: readonly Failure[];
}

type Dialogs =
  | {readonly kind: "move"}
  | {readonly kind: "tag"; readonly adding: boolean}
  | {readonly kind: "result"; readonly operation: BatchOperation; readonly parameters: BatchParameters; readonly failures: readonly Failure[]};

interface BatchParameters {
  readonly toFolderId?: string | null;
  readonly toProjectId?: string;
  readonly tags?: readonly string[];
}

/** The cross-project Files page with page-local folder navigation and batch actions (FOV-004). */
export function FilesPage({
  onThemeChange, projects, session, theme,
}: {
  readonly onThemeChange: () => void;
  readonly projects: readonly Project[];
  readonly session: Session;
  readonly theme: "dawn" | "moon";
}) {
  const [filters, setFilters] = useState(() => readFilters(window.location.search));
  const [searchDraft, setSearchDraft] = useState(filters.search);
  const [loaded, setLoaded] = useState<Loaded>({status: "loading"});
  const [facets, setFacets] = useState<FileFacets | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const anchor = useRef<number | null>(null);
  const [dialog, setDialog] = useState<Dialogs | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{readonly text: string; readonly undo?: readonly FileItem[]} | null>(null);
  const [linkedPending, setLinkedPending] = useState<LinkedPending | null>(null);
  const canBatch = session.capabilities.batch;
  // The folder tree is a permanent column on a wide screen and a toggled
  // drawer on a narrow one.
  const wide = useWideViewport();
  const [treeOpen, setTreeOpen] = useState(false);
  const treeToggleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (wide || !treeOpen) return undefined;
    const close = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      setTreeOpen(false);
      treeToggleRef.current?.focus();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [treeOpen, wide]);
  const projectNames = useMemo(() => new Map(projects.map(({id, name}) => [id, name])), [projects]);

  useEffect(() => {
    const next = pageQuery(filters).toString();
    window.history.replaceState(null, "", next === "" ? filesPath : `${filesPath}?${next}`);
    let current = true;
    setLoaded({status: "loading"});
    void (async () => {
      try {
        const query = apiQuery(filters);
        const [page, counts] = await Promise.all([
          api.files(new URLSearchParams([...query, ["limit", "50"]])),
          api.fileFacets(query),
        ]);
        if (!current) return;
        setLoaded({status: "ready", items: page.items, nextCursor: page.nextCursor});
        setFacets(counts);
        setSelected(new Set());
        anchor.current = null;
      } catch (caught) {
        if (current) setLoaded({status: "failed", error: caught instanceof Error ? caught : new Error(filesText.loading)});
      }
    })();
    return () => { current = false; };
  }, [filters, attempt]);

  useEffect(() => {
    if (!session.capabilities.linkedFolders) return undefined;
    let current = true;
    const projectIds = filters.project === "" ? projects.map(({id}) => id) : [filters.project];
    void (async () => {
      const links = (await Promise.all(projectIds.map(async (projectId) => {
        try {
          return await api.folderLinks(projectId);
        } catch {
          return [];
        }
      }))).flat().filter((link) => !link.inTrash && link.pendingCount > 0);
      if (!current) return;
      setLinkedPending(links.length === 0 ? null : {
        entries: links.reduce((sum, link) => sum + link.pendingCount, 0),
        folders: links.length,
        projectId: filters.project === "" ? null : filters.project,
      });
    })();
    return () => { current = false; };
  }, [session.capabilities.linkedFolders, projects, filters.project, attempt]);

  useEffect(() => {
    if (searchDraft === filters.search) return undefined;
    const timer = window.setTimeout(() => setFilters((current) => ({...current, search: searchDraft})), 250);
    return () => window.clearTimeout(timer);
  }, [searchDraft, filters.search]);

  const change = (next: Partial<FileFilters>) => setFilters((current) => ({...current, ...next}));
  const items = loaded.status === "ready" ? loaded.items : [];
  const selectedItems = items.filter(({id}) => selected.has(id));

  const loadMore = async (cursor: string) => {
    const page = await api.files(new URLSearchParams([...apiQuery(filters), ["limit", "50"], ["cursor", cursor]]));
    setLoaded((current) => current.status !== "ready" ? current
      : {status: "ready", items: [...current.items, ...page.items], nextCursor: page.nextCursor});
  };

  const toggle = (index: number, event: MouseEvent<HTMLInputElement>) => {
    const item = items[index];
    if (item === undefined) return;
    const checked = event.currentTarget.checked;
    const from = event.shiftKey && anchor.current !== null ? Math.min(anchor.current, index) : index;
    const to = event.shiftKey && anchor.current !== null ? Math.max(anchor.current, index) : index;
    setSelected((current) => {
      const next = new Set(current);
      for (const {id} of items.slice(from, to + 1)) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
    anchor.current = index;
  };

  const selectAllShortcut = (event: KeyboardEvent<HTMLElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a" && canBatch) {
      event.preventDefault();
      setSelected(new Set(items.map(({id}) => id)));
    }
  };

  const run = async (operation: BatchOperation, files: readonly FileItem[], parameters: BatchParameters) => {
    setPending(true);
    setNotice(null);
    try {
      const outcome = await runBatches(operation, files, parameters);
      setDialog(outcome.failures.length > 0 ? {kind: "result", operation, parameters, failures: outcome.failures} : null);
      const succeeded = outcome.succeeded.length;
      if (operation === "trash") setNotice({text: filesText.trashed(succeeded), undo: outcome.succeeded});
      else if (operation === "recover") setNotice({text: filesText.recovered(succeeded)});
      else setNotice({text: filesText.done(succeeded)});
      setAttempt((value) => value + 1);
      return outcome;
    } catch (caught) {
      setNotice({text: errorMessage(caught instanceof Error ? caught : new Error(filesText.loading))});
      return null;
    } finally {
      setPending(false);
    }
  };

  const total = facets?.total ?? items.length;
  const facetCount = (kind: string) => facets?.kinds.find((facet) => facet.kind === kind)?.count ?? 0;
  const filtered = pageQuery({...filters, sort: emptyFilters.sort, direction: emptyFilters.direction}).toString() !== "";
  const selectedProject = projects.find(({id}) => id === filters.project) ?? null;

  return (
    <div className="as-page">
      <AppTopBar
        area="files"
        capabilities={session.capabilities}
        onThemeChange={onThemeChange}
        projectId={filters.project === "" ? null : filters.project}
        theme={theme}
      />
      <div className="as-page__scroll">
      <main className="as-page__wrap as-files" id="main-content">
        <FilesSectionHeader
          capabilities={session.capabilities}
          counts={{files: total, linkedPending: linkedPending?.entries ?? 0}}
          current="files"
          projectId={filters.project === "" ? null : filters.project}
          title={filesText.title}
        />
        <section aria-label={filesText.filters} className="as-files-toolbar">
          <button
            aria-controls="files-folder-tree"
            aria-expanded={treeOpen}
            className="as-bar-button as-bar-button--line as-files-tree-toggle"
            onClick={() => setTreeOpen((open) => !open)}
            ref={treeToggleRef}
            type="button"
          >
            <HugeiconsIcon aria-hidden="true" icon={Folder01Icon} strokeWidth={1.6} />
            {filesText.folderPicker}
          </button>
          <label className="as-files-search">
            <span className="as-visually-hidden">{filesText.search}</span>
            <HugeiconsIcon aria-hidden="true" icon={Search01Icon} strokeWidth={1.6} />
            <Input onChange={(event) => setSearchDraft(event.currentTarget.value)} placeholder={filesText.search} type="search" value={searchDraft} />
          </label>
          <label>
            <span className="as-visually-hidden">{filesText.project}</span>
            <NativeSelect onChange={(event) => change({project: event.currentTarget.value, folder: ""})} value={filters.project}>
              <NativeSelectOption value="">{filesText.allProjects}</NativeSelectOption>
              {projects.map(({id, name}) => <NativeSelectOption key={id} value={id}>{name}</NativeSelectOption>)}
            </NativeSelect>
          </label>
          <label>
            <span className="as-visually-hidden">{filesText.kind}</span>
            <NativeSelect onChange={(event) => change({kind: event.currentTarget.value})} value={filters.kind}>
              <NativeSelectOption value="">{filesText.allKinds}</NativeSelectOption>
              {fileKinds.map((kind) => (
                <NativeSelectOption key={kind} value={kind}>
                  {`${folderText.kinds[kind]} (${facetCount(kind)})`}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
          <label>
            <span className="as-visually-hidden">{filesText.linked}</span>
            <NativeSelect onChange={(event) => change({linked: linkedStates.find((value) => value === event.currentTarget.value) ?? "any"})} value={filters.linked}>
              {linkedStates.map((state) => <NativeSelectOption key={state} value={state}>{filesText.linkedStates[state]}</NativeSelectOption>)}
            </NativeSelect>
          </label>
          <label className="as-files-field">
            <span>{filesText.tag}</span>
            <Input className="w-32" list="files-tag-facets" maxLength={40} onChange={(event) => change({tag: event.currentTarget.value})} value={filters.tag} />
            <datalist id="files-tag-facets">
              {facets?.tags.map(({tag}) => <option key={tag} value={tag} />)}
            </datalist>
          </label>
          <label className="as-files-field">
            <span>{filesText.updatedAfter}</span>
            <Input className="w-36" onChange={(event) => change({updatedAfter: event.currentTarget.value})} type="date" value={filters.updatedAfter} />
          </label>
          <label className="as-files-field">
            <span>{filesText.updatedBefore}</span>
            <Input className="w-36" onChange={(event) => change({updatedBefore: event.currentTarget.value})} type="date" value={filters.updatedBefore} />
          </label>
          <label>
            <span className="as-visually-hidden">{filesText.sort}</span>
            <NativeSelect
              onChange={(event) => {
                const sort = sorts.find((value) => value === event.currentTarget.value) ?? "updated";
                change({sort, direction: sort === "name" ? "asc" : "desc"});
              }}
              value={filters.sort}
            >
              {sorts.map((sort) => <NativeSelectOption key={sort} value={sort}>{filesText.sorts[sort]}</NativeSelectOption>)}
            </NativeSelect>
          </label>
          <button
            aria-pressed={filters.direction === "asc"}
            className="as-bar-button as-bar-button--line"
            onClick={() => change({direction: filters.direction === "asc" ? "desc" : "asc"})}
            type="button"
          >
            {filters.direction === "asc" ? filesText.ascending : filesText.descending}
          </button>
          {filtered ? (
            <button className="as-bar-button" onClick={() => { setSearchDraft(""); setFilters({...emptyFilters, sort: filters.sort, direction: filters.direction}); }} type="button">
              {filesText.clear}
            </button>
          ) : null}
          {linkedPending === null ? null : (
            <aside aria-label={filesText.linkedPendingLabel} className="as-files-notice">
              <span>{filesText.linkedPending(linkedPending.entries, linkedPending.folders)}</span>
              {" "}
              <a
                href={linkedPending.projectId === null
                  ? linkedFoldersPath
                  : `${linkedFoldersPath}?${new URLSearchParams({project: linkedPending.projectId})}`}
              >
                {filesText.reviewPending}
              </a>
            </aside>
          )}
        </section>
        <div className="as-files-body">
          <FolderColumn
            hidden={!wide && !treeOpen}
            onSelectFolder={(folder) => {
              change({folder});
              if (!wide) setTreeOpen(false);
            }}
            onSelectProject={(project) => change({project, folder: ""})}
            projects={projects}
            selectedFolder={filters.folder}
            selectedProject={selectedProject}
          />
          <section className="as-files-list">
            <p aria-live="polite" className="as-files-status" role="status">
              {notice?.text}
              {notice?.undo !== undefined && notice.undo.length > 0 ? (
                <button
                  className="as-bar-button as-bar-button--line"
                  disabled={pending}
                  onClick={() => { const undo = notice.undo ?? []; void run("recover", undo, {}); }}
                  type="button"
                >
                  {filesText.undo}
                </button>
              ) : null}
            </p>
            {canBatch && selectedItems.length > 0 ? (
              <div aria-label={filesText.selection} className="as-files-selection" role="toolbar">
                <span className="as-files-selection__count">{filesText.selected(selectedItems.length)}</span>
                {selectedItems.length > maximumBatch ? (
                  <span className="text-xs text-muted-foreground">{filesText.batches(Math.ceil(selectedItems.length / maximumBatch))}</span>
                ) : null}
                {session.capabilities.folders ? (
                  <Button disabled={pending} onClick={() => setDialog({kind: "move"})} size="sm" type="button" variant="ghost">{filesText.move}</Button>
                ) : null}
                <Button disabled={pending} onClick={() => setDialog({kind: "tag", adding: true})} size="sm" type="button" variant="ghost">{filesText.addTag}</Button>
                <Button disabled={pending} onClick={() => setDialog({kind: "tag", adding: false})} size="sm" type="button" variant="ghost">{filesText.removeTag}</Button>
                {session.capabilities.trash ? (
                  <Button disabled={pending} onClick={() => void run("trash", selectedItems, {})} size="sm" type="button" variant="destructive">
                    {filesText.moveToTrash}
                  </Button>
                ) : null}
                <Button disabled={pending} onClick={() => setSelected(new Set())} size="sm" type="button" variant="ghost">{filesText.clearSelection}</Button>
              </div>
            ) : null}
            {loaded.status === "loading" ? <StatePanel description={filesText.loading} title={filesText.title} />
              : loaded.status === "failed" ? <ErrorPanel error={loaded.error} onRetry={() => setAttempt((value) => value + 1)} />
              : loaded.items.length === 0 ? (
                <StatePanel
                  description={filtered ? filesText.emptyDescription : filesText.emptyInstallationDescription}
                  title={filtered ? filesText.empty : filesText.emptyInstallation}
                />
              ) : (
                <FileTable
                  canSelect={canBatch}
                  items={loaded.items}
                  nextCursor={loaded.nextCursor}
                  onKeyDown={selectAllShortcut}
                  onLoadMore={loadMore}
                  onSelectAll={(checked) => setSelected(checked ? new Set(items.map(({id}) => id)) : new Set())}
                  onToggle={toggle}
                  projectNames={projectNames}
                  selected={selected}
                  total={total}
                />
              )}
          </section>
        </div>
      </main>
      </div>
      {dialog?.kind === "move" ? (
        <MoveDialog
          count={selectedItems.length}
          crossProject={session.capabilities.crossProjectMove}
          initialProjectId={selectedItems[0]?.projectId ?? projects[0]?.id ?? ""}
          onClose={() => setDialog(null)}
          onConfirm={(toProjectId, toFolderId) => void run("move", selectedItems, {toProjectId, toFolderId})}
          pending={pending}
          projects={projects.filter(({archivedAt}) => archivedAt === null)}
          sourceProjectIds={new Set(selectedItems.map(({projectId}) => projectId))}
        />
      ) : null}
      {dialog?.kind === "tag" ? (
        <TagDialog
          adding={dialog.adding}
          count={selectedItems.length}
          onClose={() => setDialog(null)}
          onConfirm={(tag) => void run(dialog.adding ? "tag-add" : "tag-remove", selectedItems, {tags: [tag]})}
          pending={pending}
        />
      ) : null}
      {dialog?.kind === "result" ? (
        <ResultDialog
          failures={dialog.failures}
          onClose={() => setDialog(null)}
          onRetry={async (failure) => {
            const retried = failure.currentVersionId === null ? failure.file
              : {...failure.file, currentVersionId: failure.currentVersionId};
            const outcome = await runBatches(dialog.operation, [retried], dialog.parameters);
            setAttempt((value) => value + 1);
            return outcome.failures[0] ?? null;
          }}
        />
      ) : null}
    </div>
  );
}

/** Run consecutive batches of up to 100 and collect one combined outcome. */
async function runBatches(
  operation: BatchOperation, files: readonly FileItem[], parameters: BatchParameters,
): Promise<BatchOutcome> {
  const chunks = Array.from({length: Math.ceil(files.length / maximumBatch)}, (_, index) =>
    files.slice(index * maximumBatch, (index + 1) * maximumBatch));
  return chunks.reduce<Promise<BatchOutcome>>(async (previous, chunk) => {
    const sofar = await previous;
    const result = await api.batch({
      operation, items: chunk.map(batchItem), params: parameters, idempotencyKey: crypto.randomUUID(),
    });
    const succeeded = [...sofar.succeeded];
    const failures = [...sofar.failures];
    for (const entry of result.results) {
      const file = chunk[entry.index];
      if (file === undefined) continue;
      if (entry.status === "ok") succeeded.push(file);
      else failures.push({
        file,
        status: entry.status,
        code: entry.error?.code ?? "",
        message: entry.error?.message ?? "",
        currentVersionId: entry.error?.currentVersionId ?? null,
      });
    }
    return {succeeded, failures};
  }, Promise.resolve({succeeded: [], failures: []}));
}

function batchItem(file: FileItem): BatchItem {
  return {kind: "artifact", projectId: file.projectId, artifactId: file.id, expectedCurrentVersionId: file.currentVersionId};
}

function reviewHref(file: FileItem): string {
  return `/review?${new URLSearchParams({project: file.projectId, artifact: file.id})}`;
}

function FileTable({
  canSelect, items, nextCursor, onKeyDown, onLoadMore, onSelectAll, onToggle, projectNames, selected, total,
}: {
  readonly canSelect: boolean;
  readonly items: readonly FileItem[];
  readonly nextCursor: string | null;
  readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  readonly onLoadMore: (cursor: string) => Promise<void>;
  readonly onSelectAll: (checked: boolean) => void;
  readonly onToggle: (index: number, event: MouseEvent<HTMLInputElement>) => void;
  readonly projectNames: ReadonlyMap<string, string>;
  readonly selected: ReadonlySet<string>;
  readonly total: number;
}) {
  const [loadingMore, setLoadingMore] = useState(false);
  const allSelected = items.length > 0 && items.every(({id}) => selected.has(id));
  return (
    <section className="as-files-table" onKeyDown={onKeyDown}>
      <Table>
        <TableHeader>
          <TableRow>
            {canSelect ? (
              <TableHead className="w-8">
                <input
                  aria-label={filesText.selectAll}
                  checked={allSelected}
                  className="as-files-check"
                  onChange={(event) => onSelectAll(event.currentTarget.checked)}
                  type="checkbox"
                />
              </TableHead>
            ) : null}
            <TableHead>{filesText.columns.name}</TableHead>
            <TableHead className="as-files-col-project">{filesText.project}</TableHead>
            <TableHead>{reviewAppText.inspector.versionsTab}</TableHead>
            <TableHead className="as-files-col-optional">{filesText.columns.kind}</TableHead>
            <TableHead className="as-files-col-optional">{filesText.columns.tags}</TableHead>
            <TableHead className="as-files-col-optional text-right">{filesText.columns.comments}</TableHead>
            <TableHead>{filesText.columns.linked}</TableHead>
            <TableHead className="as-files-col-optional text-right">{filesText.columns.size}</TableHead>
            <TableHead className="text-right">{filesText.columns.updated}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item, index) => (
            <TableRow data-state={selected.has(item.id) ? "selected" : undefined} key={item.id}>
              {canSelect ? (
                <TableCell>
                  <input
                    aria-label={filesText.selectRow(item.name)}
                    checked={selected.has(item.id)}
                    className="as-files-check"
                    onChange={() => undefined}
                    onClick={(event) => onToggle(index, event)}
                    type="checkbox"
                  />
                </TableCell>
              ) : null}
              <TableCell className="as-files-name">
                <a href={reviewHref(item)} title={filesText.openInReview}>
                  {visibleArtifactName(item.name)}
                </a>
                {item.folderPath.length === 0 ? null : (
                  <span className="as-files-name__folder">{item.folderPath.map(({name}) => name).join("/")}</span>
                )}
              </TableCell>
              <TableCell className="as-files-col-project">{projectNames.get(item.projectId) ?? item.projectName}</TableCell>
              <TableCell><span className="as-files-version">v{item.currentVersionNumber}</span></TableCell>
              <TableCell className="as-files-col-optional">{folderText.kinds[item.fileKind]}</TableCell>
              <TableCell className="as-files-col-optional max-w-[12rem] truncate">{item.tags.join(", ")}</TableCell>
              <TableCell className="as-files-col-optional as-files-num">{item.commentCount}</TableCell>
              <TableCell className="as-files-source" data-source={item.linked ?? "not-linked"}>
                {item.linked === null ? filesText.linkedStates["not-linked"] : sourceFreshnessLabel(item.linked)}
              </TableCell>
              <TableCell className="as-files-col-optional as-files-num">{formatBytes(item.size)}</TableCell>
              <TableCell className="as-files-num">{formatTimestamp(item.updatedAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="as-files-foot">
        <span>{filesText.count(items.length, total)}</span>
        {nextCursor === null ? null : (
          <button
            className="as-bar-button as-bar-button--line"
            disabled={loadingMore}
            onClick={() => {
              setLoadingMore(true);
              void onLoadMore(nextCursor).finally(() => setLoadingMore(false));
            }}
            type="button"
          >
            {filesText.loadMore}
          </button>
        )}
      </div>
    </section>
  );
}

/**
 * Page-local folder navigation: projects, then that project's folders loaded
 * on demand. It belongs to the Files page, not to application navigation, and
 * folds into a Folder disclosure on narrow viewports.
 */
function FolderColumn({
  hidden, onSelectFolder, onSelectProject, projects, selectedFolder, selectedProject,
}: {
  readonly hidden: boolean;
  readonly onSelectFolder: (folderId: string) => void;
  readonly onSelectProject: (projectId: string) => void;
  readonly projects: readonly Project[];
  readonly selectedFolder: string;
  readonly selectedProject: Project | null;
}) {
  return (
    <nav aria-label={filesText.folders} className="as-files-tree" hidden={hidden} id="files-folder-tree">
      <h2>{filesText.folders}</h2>
      {selectedProject === null ? (
        <>
          <p className="as-files-tree__hint">{filesText.chooseProject}</p>
          <ul>
            {projects.map(({id, name}) => (
              <li key={id}>
                <button className="as-files-tree__node" onClick={() => onSelectProject(id)} type="button">
                  <HugeiconsIcon aria-hidden="true" icon={Folder01Icon} strokeWidth={1.6} />
                  <span>{name}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <ul>
          <li>
            <button
              aria-current={selectedFolder === "" ? "location" : undefined}
              className="as-files-tree__node"
              onClick={() => onSelectFolder("")}
              type="button"
            >
              <HugeiconsIcon aria-hidden="true" icon={Folder01Icon} strokeWidth={1.6} />
              <span>{selectedProject.name} · {filesText.allFolders}</span>
            </button>
            <FolderBranch onSelect={onSelectFolder} parentId={null} projectId={selectedProject.id} selected={selectedFolder} />
          </li>
        </ul>
      )}
    </nav>
  );
}

function FolderBranch({
  onSelect, parentId, projectId, selected,
}: {
  readonly onSelect: (folderId: string) => void;
  readonly parentId: string | null;
  readonly projectId: string;
  readonly selected: string;
}) {
  const [folders, setFolders] = useState<readonly Folder[] | null>(null);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    let current = true;
    void (async () => {
      try {
        const page = await api.folders(projectId, parentId);
        if (current) setFolders(page.folders);
      } catch {
        if (current) setFolders([]);
      }
    })();
    return () => { current = false; };
  }, [projectId, parentId]);
  if (folders === null || folders.length === 0) return null;
  return (
    <ul className="as-files-tree__branch">
      {folders.map((folder) => {
        const expanded = open.has(folder.id);
        return (
          <li key={folder.id}>
            <div className="as-files-tree__row">
              <button
                aria-expanded={expanded}
                aria-label={expanded ? filesText.collapse(folder.name) : filesText.expand(folder.name)}
                className="as-icon-button as-files-tree__twisty"
                onClick={() => setOpen((current) => {
                  const next = new Set(current);
                  if (expanded) next.delete(folder.id);
                  else next.add(folder.id);
                  return next;
                })}
                type="button"
              >
                <HugeiconsIcon icon={expanded ? ArrowDown01Icon : ArrowRight01Icon} strokeWidth={1.8} />
              </button>
              <button
                aria-current={selected === folder.id ? "location" : undefined}
                className="as-files-tree__node"
                onClick={() => onSelect(folder.id)}
                type="button"
              >
                {folder.name}
              </button>
            </div>
            {expanded ? <FolderBranch onSelect={onSelect} parentId={folder.id} projectId={projectId} selected={selected} /> : null}
          </li>
        );
      })}
    </ul>
  );
}

function useWideViewport(): boolean {
  const query = "(min-width: 761px)";
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setWide(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return wide;
}

function MoveDialog({
  count, crossProject, initialProjectId, onClose, onConfirm, pending, projects, sourceProjectIds,
}: {
  readonly count: number;
  readonly crossProject: boolean;
  readonly initialProjectId: string;
  readonly onClose: () => void;
  readonly onConfirm: (toProjectId: string, toFolderId: string | null) => void;
  readonly pending: boolean;
  readonly projects: readonly Project[];
  readonly sourceProjectIds: ReadonlySet<string>;
}) {
  const [projectId, setProjectId] = useState(initialProjectId);
  const [destination, setDestination] = useState<string | null>(null);
  const choices = crossProject ? projects : projects.filter(({id}) => sourceProjectIds.has(id));
  const project = choices.find(({id}) => id === projectId);
  return (
    <Dialog onOpenChange={(next) => { if (!next && !pending) onClose(); }} open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{filesText.moveTitle(count)}</DialogTitle>
          {projectId !== initialProjectId || sourceProjectIds.size > 1 ? (
            <DialogDescription>{folderText.crossProjectNote}</DialogDescription>
          ) : null}
        </DialogHeader>
        {choices.length > 1 ? (
          <label className="grid gap-1.5 text-sm">
            {folderText.project}
            <NativeSelect disabled={pending} onChange={(event) => { setProjectId(event.currentTarget.value); setDestination(null); }} value={projectId}>
              {choices.map(({id, name}) => <NativeSelectOption key={id} value={id}>{name}</NativeSelectOption>)}
            </NativeSelect>
          </label>
        ) : null}
        {project === undefined ? null : (
          <FolderDestinationPicker
            destination={destination}
            disabled={pending}
            excludedId={null}
            key={project.id}
            onNavigate={setDestination}
            projectId={project.id}
            projectName={project.name}
          />
        )}
        <DialogFooter>
          <Button disabled={pending} onClick={onClose} type="button" variant="outline">{folderText.cancel}</Button>
          <Button disabled={pending || project === undefined} onClick={() => onConfirm(projectId, destination)} type="button">
            {pending ? filesText.working : folderText.moveHere}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TagDialog({
  adding, count, onClose, onConfirm, pending,
}: {
  readonly adding: boolean;
  readonly count: number;
  readonly onClose: () => void;
  readonly onConfirm: (tag: string) => void;
  readonly pending: boolean;
}) {
  const [value, setValue] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (value.trim() !== "") onConfirm(value.trim());
  };
  return (
    <Dialog onOpenChange={(next) => { if (!next && !pending) onClose(); }} open>
      <DialogContent>
        <form className="grid gap-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{filesText.tagTitle(adding, count)}</DialogTitle>
          </DialogHeader>
          <label className="grid gap-1.5 text-sm">
            <span>{filesText.tagLabel}</span>
            <Input autoComplete="off" autoFocus maxLength={40} onChange={(event) => setValue(event.currentTarget.value)} value={value} />
          </label>
          <DialogFooter>
            <Button onClick={onClose} type="button" variant="outline">{folderText.cancel}</Button>
            <Button disabled={pending || value.trim() === ""} type="submit">{pending ? filesText.working : filesText.apply}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Per-item failures, each with a plain reason and a retry. */
function ResultDialog({
  failures, onClose, onRetry,
}: {
  readonly failures: readonly Failure[];
  readonly onClose: () => void;
  readonly onRetry: (failure: Failure) => Promise<Failure | null>;
}) {
  const [remaining, setRemaining] = useState(failures);
  const [retrying, setRetrying] = useState<string | null>(null);
  const retry = useCallback(async (failure: Failure) => {
    setRetrying(failure.file.id);
    try {
      const again = await onRetry(failure);
      setRemaining((current) => current.flatMap((entry) => entry.file.id !== failure.file.id ? [entry] : again === null ? [] : [again]));
    } finally {
      setRetrying(null);
    }
  }, [onRetry]);
  return (
    <Dialog onOpenChange={(next) => { if (!next) onClose(); }} open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{filesText.resultTitle(failures.length)}</DialogTitle>
          <DialogDescription>{filesText.resultDescription}</DialogDescription>
        </DialogHeader>
        <ul className="grid max-h-80 gap-2 overflow-y-auto">
          {remaining.map((failure) => (
            <li className="flex items-start justify-between gap-3 border-b border-[var(--color-rule)] pb-2 text-sm" key={failure.file.id}>
              <div className="min-w-0">
                <p className="truncate font-medium">{visibleArtifactName(failure.file.name)}</p>
                <p className="text-xs text-muted-foreground">
                  {filesText.statuses[failure.status]}: {reason(failure)}
                </p>
              </div>
              <Button
                aria-label={`${filesText.retry} ${failure.file.name}`}
                disabled={retrying !== null}
                onClick={() => void retry(failure)}
                size="xs"
                type="button"
                variant="outline"
              >
                {retrying === failure.file.id ? filesText.retrying : filesText.retry}
              </Button>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button onClick={onClose} type="button" variant="outline">{filesText.close}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function reason(failure: Failure): string {
  return locale === "en" ? failure.message : serverErrorMessage(failure.code) ?? failure.message;
}
