import {useEffect, useRef, useState, type ReactNode} from "react";
import {defineMessages} from "../i18n/locale.ts";
import "./review-board.css";

export const boardText = defineMessages({
  en: {reading: "Reading", board: "Review board", modes: "Review layout", centered: "Centered", free: "Free view", narrow: "Narrow", original: "Original", wide: "Wide", fit: "Fit width", zoom: "Zoom", move: "Move document (arrow keys)", reset: "Reset position"},
  "zh-TW": {reading: "閱讀", board: "審閱白板", modes: "審閱版面", centered: "置中", free: "自由視角", narrow: "窄", original: "原始", wide: "寬", fit: "符合寬度", zoom: "縮放", move: "移動文件（方向鍵）", reset: "重設位置"},
});

/** Storage failure always falls back to reading, including failed writes. */
export function useBoardMode() {
  const [enabled, setEnabled] = useState(() => {
    try { return localStorage.getItem("artifact-review-board") === "board"; }
    catch { return false; }
  });
  return {enabled, change: (next: boolean) => {
    try {
      localStorage.setItem("artifact-review-board", next ? "board" : "reading");
      setEnabled(next);
    } catch { setEnabled(false); }
  }};
}

/** Keep the child at the same React position when switching layouts. */
export function ReviewBoard({enabled, children, context, cards, cardsVisible, zoomRequest}: {readonly zoomRequest?: {readonly id: number; readonly delta: number} | null;readonly enabled: boolean; readonly children: ReactNode; readonly context?: ReactNode; readonly cards?: ReactNode; readonly cardsVisible?: boolean}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(0);
  const [width, setWidth] = useState(780);
  const [zoom, setZoom] = useState(1);
  const [free, setFree] = useState(false);
  const [position, setPosition] = useState({x: 0, y: 0});
  const drag = useRef<{x: number; y: number; left: number; top: number} | null>(null);
  useEffect(() => {
    const element = viewport.current;
    if (element === null) return undefined;
    const observer = new ResizeObserver(() => setAvailable(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const documentWidth = Math.min(width, Math.max(1, available - 48));
  const scale = Math.min(zoom, 1040 / documentWidth);
  const appliedZoom = useRef(0);
  useEffect(() => {
    if (!enabled || zoomRequest === null || zoomRequest === undefined || appliedZoom.current === zoomRequest.id) return;
    appliedZoom.current = zoomRequest.id;
    setZoom((current) => Math.max(0.4, Math.min(2, 1040 / documentWidth, Math.min(current, 1040 / documentWidth) - zoomRequest.delta * 0.002)));
  }, [documentWidth, enabled, zoomRequest]);
  const changeZoom = (next: number) => setZoom(Math.max(0.4, Math.min(2, 1040 / documentWidth, next)));
  useEffect(() => {
    const element = viewport.current;
    if (element === null || !enabled) return undefined;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setZoom((current) => Math.max(0.4, Math.min(2, 1040 / documentWidth, Math.min(current, 1040 / documentWidth) - event.deltaY * 0.002)));
    };
    element.addEventListener("wheel", wheel, {passive: false});
    return () => element.removeEventListener("wheel", wheel);
  }, [documentWidth, enabled]);
  return <div className="as-board" data-enabled={enabled} data-cards={cardsVisible}>
    {enabled ? context : null}
    {enabled ? <div className="as-board__controls" role="group" aria-label={boardText.board}>
      <button type="button" aria-pressed={!free} onClick={() => {setFree(false); setPosition({x: 0, y: 0});}}>{boardText.centered}</button>
      <button type="button" aria-pressed={free} onClick={() => setFree(true)}>{boardText.free}</button>
      <select aria-label={boardText.original} value={width} onChange={(event) => setWidth(Number(event.target.value))}>
        <option value={560}>{boardText.narrow} · 560px</option>
        <option value={780}>{boardText.original} · 780px</option>
        <option value={1040}>{boardText.wide} · 1040px</option>
      </select>
      <button type="button" aria-label={`${boardText.zoom} −`} onClick={() => changeZoom(scale - 0.1)}>−</button>
      <output aria-label={boardText.zoom}>{Math.round(scale * 100)}%</output>
      <button type="button" aria-label={`${boardText.zoom} +`} onClick={() => changeZoom(scale + 0.1)}>+</button>
      <button type="button" onClick={() => {setZoom(1); setPosition({x: 0, y: 0});}}>{boardText.fit}</button>
      <button type="button" onClick={() => setPosition({x: 0, y: 0})}>{boardText.reset}</button>
    </div> : null}
    <div className="as-board__stage">
    {enabled ? cards : null}
    <div className="as-board__viewport" ref={viewport}
      onPointerDown={(event) => {
        if (!enabled || !free || event.target !== event.currentTarget) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = {x: event.clientX, y: event.clientY, left: position.x, top: position.y};
      }}
      onPointerMove={(event) => {const start = drag.current; if (start !== null) setPosition({x: start.left + event.clientX - start.x, y: Math.max(0, start.top + event.clientY - start.y)});}}
      onPointerUp={() => {drag.current = null;}}
      onPointerCancel={() => {drag.current = null;}}
    >
      <div className="as-board__sheet" style={enabled ? {width: documentWidth, height: `calc(100% / ${scale})`, transform: `translate(${position.x}px, ${Math.max(0, position.y)}px) scale(${scale})`} : undefined}>
        {enabled && free ? <button className="as-board__handle" type="button" aria-label={boardText.move}
          onKeyDown={(event) => {
            const step = event.shiftKey ? 50 : 10;
            if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
            event.preventDefault(); event.stopPropagation();
            setPosition((current) => ({x: current.x + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0), y: Math.max(0, current.y + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0))}));
          }}
          onPointerDown={(event) => {event.currentTarget.setPointerCapture(event.pointerId); drag.current = {x: event.clientX, y: event.clientY, left: position.x, top: position.y};}}
          onPointerMove={(event) => {const start = drag.current; if (start !== null) setPosition({x: start.left + event.clientX - start.x, y: Math.max(0, start.top + event.clientY - start.y)});}}
          onPointerUp={() => {drag.current = null;}}
          onPointerCancel={() => {drag.current = null;}}
        >{boardText.move}</button> : null}
        <div className="as-board__content">{children}</div>
      </div>
    </div>
    </div>
  </div>;
}
