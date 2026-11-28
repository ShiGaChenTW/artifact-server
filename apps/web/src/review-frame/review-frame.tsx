import {
  HtmlViewer,
  type Annotation,
  type ViewerHandle,
} from "@plannotator/ui/components/html-viewer";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import {withReaderBridge} from "./reader-bridge.ts";
import {withComparisonScroll} from "./comparison-scroll.ts";
import { withBaseHref } from "./base-href.ts";
import {
  comparisonScrollSchema,
  frameMessageSchema,
  reviewReaderReadySchema,
  reviewAnchorRectLimit,
  type ReviewAnchorRect,
  hostMessageSchema,
  reviewAnchorFrom,
  reviewProtocolVersion,
  type FrameMessage,
  type ReviewAnnotation,
  type ReviewInit,
  type ReviewTheme,
} from "./protocol.ts";

interface ReviewSession {
  readonly annotateModeActive: boolean;
  readonly annotations: Annotation[];
  readonly comparison: boolean;
  readonly entryPath: string;
  readonly html: string;
  readonly readOnly: boolean;
  readonly supportsAnnotateMode: boolean;
}

/** Project one host thread into the record the viewer paints and numbers. */
function toAnnotation(review: ReviewAnnotation): Annotation {
  const annotation: Annotation = {
    blockId: "",
    createdA: 0,
    endOffset: 0,
    id: review.threadId,
    originalText: review.anchor?.originalText ?? "",
    startOffset: 0,
    text: review.body,
    type: "COMMENT",
  };
  const anchor = review.anchor;
  if (anchor === null) return annotation;
  if (anchor.htmlAnchor !== null) annotation.htmlAnchor = anchor.htmlAnchor;
  if (anchor.htmlAdditionalTargets !== undefined) {
    annotation.htmlAdditionalTargets = anchor.htmlAdditionalTargets;
  }
  return annotation;
}

function sessionFrom(init: ReviewInit): ReviewSession {
  const html = withReaderBridge(withBaseHref(init.html, init.baseHref));
  return {
    annotateModeActive: init.annotateModeActive ?? true,
    annotations: init.annotations.map(toAnnotation),
    comparison: init.comparison === true,
    entryPath: init.entryPath,
    html: init.comparison === true ? withComparisonScroll(html) : html,
    readOnly: init.readOnly,
    supportsAnnotateMode: init.annotateModeActive !== undefined,
  };
}

/** Adopt the host's palette so the viewer chrome and the sandbox agree. */
function applyTheme(theme: ReviewInit | ReviewTheme): void {
  const root = document.documentElement;
  for (const [token, value] of Object.entries(theme.themeTokens)) {
    root.style.setProperty(token, value);
  }
  root.classList.toggle("light", theme.isLight);
}

/**
 * The review frame: a same-origin document whose only job is to host
 * `@plannotator/ui`'s sandboxed HTML annotation surface and relay its events
 * to the application shell. It holds no credential, makes no request, and
 * learns everything it renders from one validated `as-review-init` message.
 */
export function ReviewFrame(): React.ReactNode {
  const [session, setSession] = useState<ReviewSession | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [anchorRects, setAnchorRects] = useState<ReviewAnchorRect[]>([]);
  const unanchoredIdsRef = useRef<ReadonlySet<string>>(new Set<string>());
  const reviewAnnotations = useRef<ReviewAnnotation[]>([]);
  const markerLayerRef = useRef<HTMLDivElement>(null);
  const comparePaneRef = useRef<HTMLDivElement>(null);
  const boardMode = useRef(false);
  const comparisonActive = useRef(false);
  const previousFocus = useRef<string | null>(null);
  const focusFrame = useRef(0);
  const viewerRef = useRef<ViewerHandle | null>(null);
  const paintedIdsRef = useRef<ReadonlySet<string>>(new Set<string>());

  const send = useCallback((message: FrameMessage): void => {
    window.parent.postMessage(message, window.location.origin);
  }, []);

  useEffect(() => {
    const wheel = (event: WheelEvent) => {
      if (!boardMode.current || (!event.ctrlKey && !event.metaKey)) return;
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1;
      send({type: "as-review-board-zoom", delta: Math.max(-2000, Math.min(2000, event.deltaY * unit)), v: reviewProtocolVersion});
    };
    window.addEventListener("wheel", wheel, {passive: false});
    return () => window.removeEventListener("wheel", wheel);
  }, [send]);

  useEffect(() => {
    // Framed by the application shell or nothing: a top-level review frame has
    // no host to authenticate against, so it never listens and never speaks.
    const framed = window.parent !== window;
    const onMessage = (event: MessageEvent<unknown>): void => {
      const pane = comparePaneRef.current?.querySelector("iframe")?.contentWindow;
      if (pane !== undefined && pane !== null && event.source === pane && event.origin === "null") {
        const reader = frameMessageSchema.safeParse(event.data);
        if (reader.success && reader.data.type === "as-review-board-zoom") {
          if (boardMode.current) send(reader.data);
          return;
        }
        if (reader.success && reader.data.type === "as-review-outline") {
          send(reader.data);
          return;
        }
        if (reader.success && reader.data.type === "as-review-anchor-rects") {
          const element = comparePaneRef.current?.querySelector("iframe");
          if (element !== undefined && element !== null) {
            const bounds = element.getBoundingClientRect();
            setAnchorRects(reader.data.rects.filter(rect => !unanchoredIdsRef.current.has(rect.threadId) && reviewAnnotations.current.some(annotation => annotation.threadId === rect.threadId)).map(rect => ({
              threadId: rect.threadId, width: rect.width, height: rect.height, x: rect.x + bounds.x, y: rect.y + bounds.y,
            })));
          }
          return;
        }
        if (reviewReaderReadySchema.safeParse(event.data).success) {
          pane.postMessage({type: "as-review-board-mode", enabled: boardMode.current, v: reviewProtocolVersion}, "*");
          pane.postMessage({type: "as-review-board-annotations", annotations: reviewAnnotations.current.slice(0, reviewAnchorRectLimit), v: reviewProtocolVersion}, "*");
          return;
        }
        const scroll = comparisonScrollSchema.safeParse(event.data);
        if (scroll.success) send({...scroll.data, v: reviewProtocolVersion});
        return;
      }
      if (event.source !== window.parent) return;
      if (event.origin !== window.location.origin) return;
      const parsed = hostMessageSchema.safeParse(event.data);
      if (!parsed.success) return;
      const message = parsed.data;
      if (message.type === "as-review-init") {
        applyTheme(message);
        reviewAnnotations.current = message.annotations;
        unanchoredIdsRef.current = new Set<string>();
        setAnchorRects([]);
        comparisonActive.current = message.comparison === true;
        paintedIdsRef.current = new Set(
          message.annotations.map((annotation) => annotation.threadId),
        );
        setSession(sessionFrom(message));
        return;
      }
      if (message.type === "as-review-board-mode") {
        boardMode.current = message.enabled;
        pane?.postMessage(message, "*");
        return;
      }
      if (message.type === "as-review-theme") {
        applyTheme(message);
        return;
      }
      if (message.type === "as-review-annotations") {
        reviewAnnotations.current = message.annotations;
        pane?.postMessage({type: "as-review-board-annotations", annotations: message.annotations.slice(0, reviewAnchorRectLimit), v: reviewProtocolVersion}, "*");
        const annotations = message.annotations.map(toAnnotation);
        setSession((current) =>
          current === null ? current : {...current, annotations}
        );
        return;
      }
      if (message.type === "as-review-annotate-mode") {
        setSession((current) =>
          current === null
            ? current
            : {...current, annotateModeActive: message.active}
        );
        return;
      }
      if (message.type === "as-review-outline-scroll") {
        pane?.postMessage(message, "*");
        return;
      }
      if (message.type === "as-review-scroll") {
        if (comparisonActive.current) pane?.postMessage({type: "as-comparison-scroll-to", progress: message.progress}, "*");
        return;
      }
      window.cancelAnimationFrame(focusFrame.current);
      if (message.threadId !== null && previousFocus.current === message.threadId) {
        setSelectedThreadId(null);
        focusFrame.current = window.requestAnimationFrame(() => setSelectedThreadId(message.threadId));
      } else {
        setSelectedThreadId(message.threadId);
      }
      previousFocus.current = message.threadId;
    };
    if (framed) {
      window.addEventListener("message", onMessage);
      send({type: "as-review-ready", v: reviewProtocolVersion});
    }
    return () => {
      window.cancelAnimationFrame(focusFrame.current);
      window.removeEventListener("message", onMessage);
    };
  }, [send]);

  // The viewer paints marks for its initial prop set when the bridge reports
  // ready; every later arrival or removal is reconciled by id so a replaced
  // optimistic annotation leaves no orphan marker behind.
  const annotations = session?.annotations;
  useEffect(() => {
    const viewer = viewerRef.current;
    if (viewer === null || annotations === undefined) return;
    const painted = paintedIdsRef.current;
    const next = new Set(annotations.map((annotation) => annotation.id));
    for (const id of painted) {
      if (!next.has(id)) viewer.removeHighlight(id);
    }
    const added = annotations.filter(
      (annotation) => !painted.has(annotation.id),
    );
    if (added.length > 0) viewer.applySharedAnnotations(added);
    paintedIdsRef.current = next;
  }, [annotations]);

  const handleAdd = useCallback((annotation: Annotation): void => {
    setSession((current) =>
      current === null
        ? current
        : {...current, annotations: [...current.annotations, annotation]}
    );
    send({
      anchor: reviewAnchorFrom(
        annotation.originalText,
        annotation.htmlAnchor,
        annotation.htmlAdditionalTargets,
      ),
      body: annotation.text ?? "",
      originalText: annotation.originalText,
      type: "as-review-submit",
      v: reviewProtocolVersion,
    });
  }, [send]);

  const handleSelect = useCallback((threadId: string | null): void => {
    previousFocus.current = threadId;
    setSelectedThreadId(threadId);
    send({threadId, type: "as-review-select", v: reviewProtocolVersion});
  }, [send]);

  const handleUnanchored = useCallback((threadIds: string[]): void => {
    const unanchored = new Set(threadIds);
    unanchoredIdsRef.current = unanchored;
    setAnchorRects(current => current.filter(rect => !unanchored.has(rect.threadId)));
    send({threadIds, type: "as-review-unanchored", v: reviewProtocolVersion});
  }, [send]);

  const requestAnnotateMode = useCallback((active: boolean): void => {
    send({
      active,
      type: "as-review-annotate-mode-request",
      v: reviewProtocolVersion,
    });
  }, [send]);

  useLayoutEffect(() => {
    const layer = markerLayerRef.current;
    const rects: ReviewAnchorRect[] = [];
    for (const marker of layer?.querySelectorAll<HTMLButtonElement>("button[data-thread-id]") ?? []) {
      const threadId = marker.dataset["threadId"];
      if (threadId === undefined) continue;
      const {x, y, width, height} = marker.getBoundingClientRect();
      rects.push({threadId, x, y, width, height});
    }
    if (session !== null) send({type: "as-review-anchor-rects", rects, v: reviewProtocolVersion});
  }, [anchorRects, session, send]);

  if (session === null) {
    return (
      <p className="p-4 text-sm text-muted-foreground" role="status">
        Waiting for the artifact to load.
      </p>
    );
  }

  const viewer = (
    <HtmlViewer
      annotateModeActive={session.annotateModeActive}
      annotations={session.annotations}
      fullViewport
      hideControls
      inputMethod="pinpoint"
      mode="comment"
      onAddAnnotation={handleAdd}
      onAnnotateModeExit={session.supportsAnnotateMode
        ? () => requestAnnotateMode(false)
        : undefined}
      onAnnotateModeToggle={session.supportsAnnotateMode
        ? () => requestAnnotateMode(!session.annotateModeActive)
        : undefined}
      onSelectAnnotation={handleSelect}
      onUnanchoredChange={handleUnanchored}
      rawHtml={session.html}
      readOnly={session.readOnly}
      ref={viewerRef}
      selectedAnnotationId={selectedThreadId}
      title={`Artifact review: ${session.entryPath}`}
    />
  );
  let previousMarkerY = -32;
  const markers = anchorRects.toSorted((a, b) => a.y - b.y).map(rect => {
    const y = Math.max(4, rect.y, previousMarkerY + 30);
    previousMarkerY = y;
    return {threadId: rect.threadId, x: rect.x, width: rect.width, height: rect.height, y};
  }).filter(rect => rect.y + 28 <= window.innerHeight);
  return <div className="as-reader-frame" ref={comparePaneRef}>
    {viewer}
    {!session.comparison && <div className="as-reader-markers" ref={markerLayerRef}>
      {markers.map(rect => <button
        aria-label={`Select comment ${session.annotations.findIndex(annotation => annotation.id === rect.threadId) + 1}`}
        aria-pressed={selectedThreadId === rect.threadId}
        className="as-reader-marker"
        data-thread-id={rect.threadId}
        key={rect.threadId}
        onClick={() => handleSelect(rect.threadId)}
        style={{top: rect.y}}
        type="button"
      >{session.annotations.findIndex(annotation => annotation.id === rect.threadId) + 1}</button>)}
    </div>}
  </div>;
}
