import {useEffect, useRef, useState} from "react";
import type {ArtifactVersion, CommentThread, Version} from "@/api/client";
import {formatBytes} from "@/lib/presentation";
import {defineMessages} from "../i18n/locale.ts";
import {reviewProtocolVersion, type ReviewAnchorRect, type ReviewOutlineEntry} from "@/review-frame/protocol";

export const boardDetailsText = defineMessages({
  en: {context: "Document context", expand: "Expand context", collapse: "Collapse context", people: "Publisher and reviewers", history: "Version history", none: "None", outline: "Document outline", status: "Comment status", close: "Close", open: "Open", awaiting: "Awaiting confirmation", sent: "Dispatched", resolved: "Resolved", empty: "No headings in this preview", targets: "Dispatch targets are shown on comment threads"},
  "zh-TW": {context: "文件脈絡", expand: "展開脈絡", collapse: "收合脈絡", people: "發布者與審閱者", history: "版本歷程", none: "無", outline: "文件目錄", status: "留言狀態", close: "關閉", open: "未解決", awaiting: "待你確認", sent: "已派工", resolved: "已解決", empty: "此預覽沒有章節標題", targets: "派工對象顯示於留言串"},
});
export interface BoardStats {readonly open: number; readonly awaiting: number; readonly sent: number; readonly resolved: number}

export function BoardContext({version, path, threads, versions, onVersion, people}: {
  readonly people: {readonly reviewers: readonly string[]; readonly targets: readonly string[]};
  readonly version: ArtifactVersion | null; readonly path: string | null; readonly threads: readonly CommentThread[];
  readonly versions: readonly {readonly version: Version}[]; readonly onVersion: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const reviewers = people.reviewers.length > 0 ? people.reviewers : [...new Set(threads.map((thread) => thread.author.displayName))];
  return <section className="as-board-context" aria-label={boardDetailsText.context} data-expanded={expanded}>
    <button type="button" aria-expanded={expanded} aria-controls="as-board-context-details" onClick={() => setExpanded(!expanded)}>{expanded ? boardDetailsText.collapse : boardDetailsText.expand}</button>
    <div className="as-board-context__columns" id="as-board-context-details">
      <div><strong>{path ?? version?.manifest.entryPath ?? boardDetailsText.none}</strong>
        {expanded && version !== null ? <p className="as-board-context__facts">v{version.version.number} · {version.manifest.entries.length} · {formatBytes(version.manifest.entries.reduce((sum, entry) => sum + entry.size, 0))}</p> : null}</div>
      <div><strong>{boardDetailsText.people}</strong>{expanded ? <><p>{version?.version.publisherPrincipalId ?? boardDetailsText.none}</p><p>{reviewers.join(", ") || boardDetailsText.none}</p><p>{people.targets.join(", ") || boardDetailsText.none}</p></> : null}</div>
      <div><strong>{boardDetailsText.history}</strong>{expanded ? <ul className="as-board-context__history">{versions.map(({version: item}) => <li key={item.id}><button type="button" aria-current={item.id === version?.version.id ? "true" : undefined} onClick={() => onVersion(item.id)}>v{item.number} · {item.createdAt}</button></li>)}</ul> : null}</div>
    </div>
  </section>;
}

const scrollTo = (id: string) => {
    document.querySelector<HTMLIFrameElement>("#review-preview .as-artifact-frame")?.contentWindow?.postMessage({id, type: "as-review-outline-scroll", v: reviewProtocolVersion}, window.location.origin);
  };

export function BoardCards({outline, stats, onSpaceChange}: {readonly outline: readonly ReviewOutlineEntry[]; readonly stats: BoardStats; readonly onSpaceChange: (visible: boolean) => void}) {
  const [contents, setContents] = useState(true);
  const [status, setStatus] = useState(true);
  useEffect(() => onSpaceChange(contents || status), [contents, status, onSpaceChange]);
  return <aside className="as-board-cards" aria-label={boardDetailsText.outline}>
    {contents ? <section><header><strong>{boardDetailsText.outline}</strong><button type="button" aria-label={`${boardDetailsText.close} ${boardDetailsText.outline}`} onClick={() => setContents(false)}>×</button></header><nav aria-label={boardDetailsText.outline} tabIndex={0}>{outline.length === 0 ? <p>{boardDetailsText.empty}</p> : outline.map((entry) => <button type="button" key={entry.id} data-level={entry.level} aria-current={entry.active ? "location" : undefined} onClick={() => scrollTo(entry.id)}>{entry.title}</button>)}</nav></section> : <button type="button" onClick={() => setContents(true)}>{boardDetailsText.outline}</button>}
    {status ? <section><header><strong>{boardDetailsText.status}</strong><button type="button" aria-label={`${boardDetailsText.close} ${boardDetailsText.status}`} onClick={() => setStatus(false)}>×</button></header><dl aria-label={boardDetailsText.status} tabIndex={0}>{(["open", "awaiting", "sent", "resolved"] as const).map((key) => <div key={key}><dt>{boardDetailsText[key]}</dt><dd>{stats[key]}</dd></div>)}</dl></section> : <button type="button" onClick={() => setStatus(true)}>{boardDetailsText.status}</button>}
  </aside>;
}

/** Rectangles arrive in the outer frame's viewport; transforms are applied once here. */
export function BoardConnections({rects, selected}: {readonly rects: readonly ReviewAnchorRect[]; readonly selected: string | null}) {
  const svg = useRef<SVGSVGElement>(null);
  const [path, setPath] = useState("");
  const [hovered, setHovered] = useState<string | null>(null);
  useEffect(() => {
    const hover = (event: PointerEvent) => {
      const card = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-board-thread]") : null;
      setHovered(card?.dataset["boardThread"] ?? null);
    };
    document.addEventListener("pointerover", hover);
    return () => document.removeEventListener("pointerover", hover);
  }, []);
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      const root = svg.current?.getBoundingClientRect();
      const iframe = document.querySelector<HTMLIFrameElement>("#review-preview .as-artifact-frame");
      const marker = rects.find((rect) => rect.threadId === (hovered ?? selected));
      const card = [...document.querySelectorAll<HTMLElement>("[data-board-thread]")].find((element) => element.dataset["boardThread"] === (hovered ?? selected));
      if (root !== undefined && iframe !== null && marker !== undefined && card !== undefined) {
        const bounds = iframe.getBoundingClientRect(); const target = card.getBoundingClientRect();
        const x = bounds.left + (marker.x + marker.width) * bounds.width / iframe.clientWidth - root.left;
        const y = bounds.top + (marker.y + marker.height / 2) * bounds.height / iframe.clientHeight - root.top;
        const endX = target.left - root.left; const endY = target.top + Math.min(target.height / 2, 40) - root.top;
        setPath(target.width > 0 && bounds.width > 0 ? `M${x},${y} C${x + 48},${y} ${endX - 48},${endY} ${endX},${endY}` : "");
      } else setPath("");
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [hovered, rects, selected]);
  return <svg className="as-board-connections" ref={svg} aria-hidden="true"><path d={path} /></svg>;
}
