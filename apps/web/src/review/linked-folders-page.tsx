import {useCallback, useEffect, useMemo, useState} from "react";

import {
  api, type CaptureResult, type FolderLink, type InventoryEntry, type Project, type RelinkSuggestion, type Session,
} from "@/api/client";
import {ErrorPanel, StatePanel} from "@/components/product";
import {Button} from "@/components/ui/button";
import {Checkbox} from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {NativeSelect} from "@/components/ui/native-select";
import {ToggleGroup, ToggleGroupItem} from "@/components/ui/toggle-group";
import {linkedFolderText as text} from "@/i18n/messages/linked-folders";
import {displayError, formatBytes, formatRelativeTime} from "@/lib/presentation";
import {AppTopBar, FilesSectionHeader} from "./app-shell.tsx";
import {linkedFoldersPath} from "./review-routes.ts";

type InventoryFilter = "pending" | "all" | "skipped";
const inventoryFilters: readonly InventoryFilter[] = ["pending", "all", "skipped"];
const refreshMilliseconds = 5_000;

interface Selection {
  readonly linkId: string | null;
  readonly projectId: string | null;
}

/** Linked folders: link a directory, review its file list, and capture explicitly. */
export function LinkedFoldersPage({
  capabilities,
  onThemeChange,
  projects,
  theme,
}: {
  readonly capabilities: Session["capabilities"];
  readonly onThemeChange: () => void;
  readonly projects: readonly Project[];
  readonly theme: "dawn" | "moon";
}) {
  const activeProjects = useMemo(() => projects.filter((project) => project.archivedAt === null), [projects]);
  const [selection, setSelection] = useState<Selection>(() => readSelection(activeProjects));
  const [links, setLinks] = useState<readonly FolderLink[] | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const projectId = selection.projectId ?? activeProjects[0]?.id ?? null;

  const loadLinks = useCallback(async () => {
    if (projectId === null) return;
    try {
      const loaded = await api.folderLinks(projectId);
      setLinks(loaded);
      setNow(Date.now());
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught : new Error(String(caught)));
    }
  }, [projectId]);

  useEffect(() => {
    writeSelection({...selection, projectId});
    void loadLinks();
    const timer = window.setInterval(() => void loadLinks(), refreshMilliseconds);
    return () => window.clearInterval(timer);
  }, [attempt, loadLinks, projectId, selection]);

  const selectedLink = links?.find((link) => link.id === selection.linkId) ?? links?.[0] ?? null;

  return (
    <div className="as-page">
      <AppTopBar area="files" capabilities={capabilities} onThemeChange={onThemeChange} projectId={projectId} theme={theme} />
      <div className="as-page__scroll">
      <main className="as-page__wrap as-linked-page" id="main-content">
        <FilesSectionHeader
          actions={(
            <>
              {activeProjects.length > 1 ? (
                <NativeSelect
                  aria-label={text.project}
                  onChange={(event) => setSelection({linkId: null, projectId: event.target.value})}
                  size="sm"
                  value={projectId ?? ""}
                >
                  {activeProjects.map((project) => (
                    <option key={project.id} value={project.id}>{project.name}</option>
                  ))}
                </NativeSelect>
              ) : null}
              {projectId === null ? null : (
                <LinkFolderDialog
                  onLinked={(link) => {
                    setSelection({linkId: link.id, projectId});
                    void loadLinks();
                  }}
                  projectId={projectId}
                />
              )}
            </>
          )}
          capabilities={capabilities}
          counts={{linkedPending: links?.filter((link) => !link.inTrash).reduce((sum, link) => sum + link.pendingCount, 0) ?? 0}}
          current="linked"
          projectId={projectId}
          title={text.title}
        />
        <p className="as-page-description">{text.description}</p>
        {projectId === null ? <StatePanel description={text.noProjectDescription} title={text.noProjectTitle} /> : null}
        {error === null ? null : <ErrorPanel error={error} onRetry={() => setAttempt((value) => value + 1)} />}
        {links === null && error === null && projectId !== null
          ? <p className="text-sm text-muted-foreground" role="status">{text.loading}</p>
          : null}
        {links !== null && links.length === 0
          ? <StatePanel description={text.emptyDescription} title={text.emptyTitle} />
          : null}
        {links !== null && links.length > 0 ? (
          <div className="mt-5 grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
            <ul aria-label={text.title} className="as-linked-list min-w-0 lg:col-span-4">
              {links.map((link) => (
                <li key={link.id}>
                  <LinkCard
                    link={link}
                    now={now}
                    onChanged={() => void loadLinks()}
                    onSelect={() => setSelection({linkId: link.id, projectId})}
                    selected={link.id === selectedLink?.id}
                  />
                </li>
              ))}
            </ul>
            <div className="min-w-0 lg:col-span-8">
              {selectedLink === null ? null : (
                <InventoryPanel key={selectedLink.id} link={selectedLink} onChanged={() => void loadLinks()} />
              )}
            </div>
          </div>
        ) : null}
      </main>
      </div>
    </div>
  );
}

function LinkFolderDialog({onLinked, projectId}: {
  readonly onLinked: (link: FolderLink) => void;
  readonly projectId: string;
}) {
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const submit = async () => {
    setPending(true);
    setError(null);
    try {
      const link = await api.linkFolder(projectId, path.trim(), name.trim() === "" ? null : name.trim(), crypto.randomUUID());
      setOpen(false);
      setPath("");
      setName("");
      onLinked(link);
    } catch (caught) {
      setError(caught instanceof Error ? caught : new Error(String(caught)));
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog onOpenChange={(next) => {
      setOpen(next);
      if (!next) setError(null);
    }} open={open}>
      <DialogTrigger render={<Button size="sm" type="button" />}>{text.linkFolder}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{text.linkFolder}</DialogTitle>
          <DialogDescription>{text.linkDescription}</DialogDescription>
        </DialogHeader>
        {error === null ? null : <p className="text-sm text-destructive" role="alert">{displayError(error)}</p>}
        <div className="grid gap-2">
          <Label htmlFor="linked-folder-path">{text.directoryPath}</Label>
          <Input
            autoFocus
            className="font-mono"
            id="linked-folder-path"
            onChange={(event) => setPath(event.currentTarget.value)}
            placeholder="/Users/you/project/out"
            spellCheck={false}
            value={path}
          />
          <Label htmlFor="linked-folder-name">{text.folderName}</Label>
          <Input
            id="linked-folder-name"
            maxLength={120}
            onChange={(event) => setName(event.currentTarget.value)}
            value={name}
          />
        </div>
        <DialogFooter>
          <Button disabled={pending} onClick={() => setOpen(false)} type="button" variant="outline">{text.cancel}</Button>
          <Button disabled={pending || path.trim() === ""} onClick={() => void submit()} type="button">
            {pending ? text.linking : text.link}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LinkCard({link, now, onChanged, onSelect, selected}: {
  readonly link: FolderLink;
  readonly now: number;
  readonly onChanged: () => void;
  readonly onSelect: () => void;
  readonly selected: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const name = baseName(link.path);
  const run = async (operation: () => Promise<FolderLink | void>) => {
    setBusy(true);
    setError(null);
    try {
      await operation();
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught : new Error(String(caught)));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      aria-current={selected ? "true" : undefined}
      aria-label={name}
      className="as-linked-row"
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <button
          aria-label={text.showFiles(name)}
          className="min-w-0 text-left font-heading text-sm font-semibold hover:underline focus-visible:outline-2 focus-visible:outline-ring"
          onClick={onSelect}
          type="button"
        >
          <span className="block truncate">{name}</span>
        </button>
        <span className="as-linked-row__state" data-state={link.state}>{text.states[link.state]}</span>
      </div>
      <p className="font-mono text-xs break-all text-muted-foreground">{link.path}</p>
      <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{text.files(link.entryCount)}</span>
        <span>{text.pending(link.pendingCount)}</span>
        {link.skippedCount > 0 ? <span>{text.skipped(link.skippedCount)}</span> : null}
        {link.ignoredCount > 0 ? <span>{text.ignored(link.ignoredCount)}</span> : null}
      </p>
      <p className="text-xs text-muted-foreground" role="status">
        {link.scanActivity === "idle"
          ? link.lastScanCompletedAt === null ? text.neverScanned : text.lastScan(formatRelativeTime(link.lastScanCompletedAt, now))
          : text.scanActivity[link.scanActivity]}
      </p>
      {link.inTrash ? <p className="text-xs text-muted-foreground">{text.inTrashHint}</p> : null}
      {link.state === "unavailable" ? <p className="text-xs text-destructive">{text.unavailableHint}</p> : null}
      {link.state === "over-limit" ? (
        <p className="text-xs text-destructive">
          {link.overLimitReason === "ignore-file" ? text.overLimitIgnoreFile : text.overLimitEntries}
        </p>
      ) : null}
      {error === null ? null : <p className="text-xs text-destructive" role="alert">{displayError(error)}</p>}
      <div className="flex flex-wrap gap-2">
        {link.inTrash ? null : (
          <>
            <Button
              disabled={busy}
              onClick={() => void run(() => api.scanFolderLink(link.id))}
              size="sm"
              type="button"
              variant="outline"
            >
              {text.scanNow}
            </Button>
            <Button
              disabled={busy}
              onClick={() => void run(() => api.updateFolderLink(link, {paused: !link.paused}))}
              size="sm"
              type="button"
              variant="outline"
            >
              {link.paused ? text.resume : text.pause}
            </Button>
          </>
        )}
        <Dialog onOpenChange={setConfirmUnlink} open={confirmUnlink}>
          <DialogTrigger render={<Button disabled={busy} size="sm" type="button" variant="ghost" />}>{text.unlink}</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{text.unlinkTitle(name)}</DialogTitle>
              <DialogDescription>{text.unlinkDescription}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button disabled={busy} onClick={() => setConfirmUnlink(false)} type="button" variant="outline">{text.cancel}</Button>
              <Button
                disabled={busy}
                onClick={() => void run(async () => {
                  await api.unlinkFolder(link);
                  setConfirmUnlink(false);
                })}
                type="button"
                variant="destructive"
              >
                {busy ? text.unlinking : text.unlink}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </section>
  );
}

function InventoryPanel({link, onChanged}: {
  readonly link: FolderLink;
  readonly onChanged: () => void;
}) {
  const [filter, setFilter] = useState<InventoryFilter>("pending");
  const [entries, setEntries] = useState<readonly InventoryEntry[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [results, setResults] = useState<readonly CaptureResult[]>([]);
  const [suggestions, setSuggestions] = useState<readonly RelinkSuggestion[]>([]);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const scanStamp = link.lastScanCompletedAt;

  const load = useCallback(async (after: string | null) => {
    try {
      const page = await api.folderLinkInventory(link.id, filter, after);
      setEntries((current) => after === null || current === null ? page.entries : [...current, ...page.entries]);
      setCursor(page.nextCursor);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught : new Error(String(caught)));
    }
  }, [filter, link.id]);

  useEffect(() => {
    void load(null);
    void api.relinkSuggestions(link.id).then(setSuggestions, () => setSuggestions([]));
  }, [load, link.id, scanStamp]);

  const capture = async (entryIds: readonly string[] | "all") => {
    setCapturing(true);
    setError(null);
    try {
      setResults(await api.captureFolderLink(link.id, entryIds, crypto.randomUUID()));
      setSelected(new Set());
      onChanged();
      await load(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught : new Error(String(caught)));
    } finally {
      setCapturing(false);
    }
  };

  const preview = async (entry: InventoryEntry) => {
    try {
      const session = await api.entryLiveSession(link.id, entry.id);
      window.open(session.bootstrapUrl, "_blank", "noopener,noreferrer");
    } catch (caught) {
      setError(caught instanceof Error ? caught : new Error(String(caught)));
    }
  };

  const relink = async (suggestion: RelinkSuggestion) => {
    try {
      await api.acceptRelink(link.id, suggestion, crypto.randomUUID());
      setSuggestions((current) => current.filter((candidate) => candidate !== suggestion));
      onChanged();
      await load(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught : new Error(String(caught)));
    }
  };

  return (
    <section aria-labelledby="linked-folder-inventory" className="as-linked-inventory grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-base font-semibold" id="linked-folder-inventory">
          {text.inventoryOf(baseName(link.path))}
        </h2>
        <ToggleGroup
          aria-label={text.filterLabel}
          onValueChange={(values) => {
            const chosen = inventoryFilters.find((option) => values.includes(option));
            if (chosen !== undefined) {
              setFilter(chosen);
              setSelected(new Set());
            }
          }}
          size="sm"
          spacing={0}
          value={[filter]}
          variant="outline"
        >
          {inventoryFilters.map((option) => (
            <ToggleGroupItem key={option} value={option}>{text.filters[option]}</ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      {suggestions.length === 0 ? null : (
        <div className="as-linked-note grid gap-2">
          <h3 className="text-sm font-semibold">{text.relinkTitle}</h3>
          {suggestions.map((suggestion) => (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm" key={`${suggestion.artifactId}:${suggestion.toEntryId}`}>
              <span className="min-w-0 break-all">{text.relinkSuggestion(suggestion.fromRelativePath, suggestion.toRelativePath)}</span>
              <Button onClick={() => void relink(suggestion)} size="sm" type="button" variant="outline">{text.relink}</Button>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={capturing || link.inTrash || link.pendingCount === 0}
          onClick={() => void capture("all")}
          size="sm"
          type="button"
        >
          {capturing ? text.capturing : text.captureAll}
        </Button>
        {selected.size === 0 || link.inTrash ? null : (
          <Button disabled={capturing} onClick={() => void capture([...selected])} size="sm" type="button" variant="outline">
            {text.captureSelected(selected.size)}
          </Button>
        )}
      </div>
      {error === null ? null : <p className="text-sm text-destructive" role="alert">{displayError(error)}</p>}
      {results.length === 0 ? null : (
        <div aria-live="polite" className="as-linked-note grid gap-1 text-sm">
          <h3 className="font-semibold">{text.resultsTitle}</h3>
          <ul className="grid gap-1">
            {results.map((result) => (
              <li className="flex flex-wrap justify-between gap-2" key={result.entryId}>
                <span className="min-w-0 font-mono text-xs break-all">{result.relativePath ?? result.entryId}</span>
                <span className={result.status === "refused" ? "text-destructive" : "text-muted-foreground"}>
                  {text.resultStatuses[result.status]}
                  {result.status === "refused" && result.code !== null ? ` (${result.code})` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {entries === null ? <p className="text-sm text-muted-foreground" role="status">{text.loading}</p> : null}
      {entries !== null && entries.length === 0 ? (
        filter === "pending"
          ? <StatePanel description={text.noPendingDescription} title={text.noPendingTitle} />
          : <StatePanel description={text.noEntriesDescription} title={text.noEntriesTitle} />
      ) : null}
      {entries !== null && entries.length > 0 ? (
        <div className="as-page-table relative min-w-0 overflow-x-auto">
          <table className="w-full min-w-[28rem] text-sm">
            <thead>
              <tr className="text-left">
                <th className="w-8" scope="col"><span className="sr-only">{text.selectEntry("")}</span></th>
                <th scope="col">{text.pathColumn}</th>
                <th scope="col">{text.stateColumn}</th>
                <th className="text-right" scope="col">{text.sizeColumn}</th>
                <th className="text-right" scope="col"><span className="sr-only">{text.actionsColumn}</span></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    {entry.pending ? (
                      <Checkbox
                        aria-label={text.selectEntry(entry.relativePath)}
                        checked={selected.has(entry.id)}
                        onCheckedChange={(checked) => setSelected((current) => {
                          const next = new Set(current);
                          if (checked) next.add(entry.id);
                          else next.delete(entry.id);
                          return next;
                        })}
                      />
                    ) : null}
                  </td>
                  <td className="as-linked-path font-mono text-xs">{entry.relativePath}</td>
                  <td className="text-xs"><EntryStatus entry={entry} /></td>
                  <td className="text-right text-xs text-muted-foreground tabular-nums">
                    {entry.size === null ? "—" : formatBytes(entry.size)}
                  </td>
                  <td className="text-right">
                    {entry.state === "untracked" ? (
                      <Button
                        aria-label={text.previewEntry(entry.relativePath)}
                        onClick={() => void preview(entry)}
                        size="xs"
                        type="button"
                        variant="ghost"
                      >
                        {text.preview}
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {cursor === null ? null : (
        <Button onClick={() => void load(cursor)} size="sm" type="button" variant="outline">{text.loadMore}</Button>
      )}
    </section>
  );
}

/** The entry's state, with why it was skipped or how it compares to its capture underneath. */
function EntryStatus({entry}: {readonly entry: InventoryEntry}) {
  const reason = entry.skipReason;
  const detail = entry.state === "skipped" && reason !== null && isSkipReason(reason)
    ? text.skipReasons[reason]
    : entry.state === "tracked" && entry.freshness !== null
      ? text.freshness[entry.freshness]
      : null;
  return (
    <>
      <span className="block">{text.entryStates[entry.state]}</span>
      {detail === null ? null : <span className="block text-muted-foreground">{detail}</span>}
    </>
  );
}

function isSkipReason(reason: string): reason is keyof typeof text.skipReasons {
  return Object.hasOwn(text.skipReasons, reason);
}

function baseName(path: string): string {
  const index = path.lastIndexOf("/");
  return index < 0 ? path : path.slice(index + 1);
}

function readSelection(projects: readonly Project[]): Selection {
  const query = new URLSearchParams(window.location.search);
  const project = query.get("project");
  return {
    linkId: query.get("link"),
    projectId: project !== null && projects.some((candidate) => candidate.id === project) ? project : null,
  };
}

function writeSelection(selection: Selection): void {
  const query = new URLSearchParams();
  if (selection.projectId !== null) query.set("project", selection.projectId);
  if (selection.linkId !== null) query.set("link", selection.linkId);
  const search = query.toString();
  const next = search === "" ? linkedFoldersPath : `${linkedFoldersPath}?${search}`;
  if (`${window.location.pathname}${window.location.search}` !== next) {
    window.history.replaceState(window.history.state, "", next);
  }
}
