import {reviewAnchorRectLimit, reviewOutlineLimit, reviewProtocolVersion} from "./protocol.ts";

/** Install the reader relay inside the opaque artifact. Coordinates here are
 * inner viewport CSS pixels; ReviewFrame converts them before speaking to host.
 * The artifact remains untrusted: its messages are schema/source checked again.
 */
export function withReaderBridge(html: string): string {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const script = parsed.createElement("script");
  script.textContent = `(() => {
    const hostOrigin = ${JSON.stringify(window.location.origin)};
    let annotations = [];
    let boardMode = false;
    let headings = [];
    let scheduled = false;
    let lastOutline = '';
    let lastRects = '';
    const headingIds = new WeakMap();
    let nextId = 0;
    const send = data => parent.postMessage({...data, v: ${reviewProtocolVersion}}, hostOrigin);
    function measure() {
      scheduled = false;
      headings = Array.from(document.querySelectorAll('h1,h2,h3')).filter(node =>
        !node.closest('[data-plannotator-vim-ui]') && node.textContent.trim() && node.getClientRects().length
      ).slice(0, ${reviewOutlineLimit});
      let active = headings[0];
      for (const heading of headings) {
        if (heading.getBoundingClientRect().top <= 96) active = heading;
      }
      const entries = headings.map(heading => {
        if (!headingIds.has(heading)) headingIds.set(heading, 'as-heading-' + nextId++);
        return {id: headingIds.get(heading), title: heading.textContent.trim().slice(0, 300),
          level: Number(heading.tagName.slice(1)), active: heading === active};
      });
      const outlineJson = JSON.stringify(entries);
      if (outlineJson !== lastOutline) {lastOutline = outlineJson; send({type:'as-review-outline', entries});}
      const rects = [];
      for (const annotation of annotations) {
        const anchor = annotation.anchor?.htmlAnchor;
        if (!anchor || typeof anchor.selector !== 'string') continue;
        let node;
        try {node = document.querySelector(anchor.selector);} catch {continue;}
        if (!node || !node.getClientRects().length) continue;
        const rect = node.getBoundingClientRect();
        if (rect.bottom <= 0 || rect.top >= innerHeight || rect.right <= 0 || rect.left >= innerWidth) continue;
        rects.push({threadId: annotation.threadId, x: Math.max(0, rect.x), y: Math.max(0, rect.y), width: Math.min(innerWidth, rect.right) - Math.max(0, rect.x), height: Math.min(innerHeight, rect.bottom) - Math.max(0, rect.y)});
      }
      const rectsJson = JSON.stringify(rects);
      if (rectsJson !== lastRects) {lastRects = rectsJson; send({type:'as-review-anchor-rects', rects});}
    }
    function schedule() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(measure);
    }
    addEventListener('message', event => {
      if (event.source !== parent || event.origin !== hostOrigin || event.data?.v !== ${reviewProtocolVersion}) return;
      const data = event.data;
      if (data.type === 'as-review-board-mode' && typeof data.enabled === 'boolean') boardMode = data.enabled;
      if (data.type === 'as-review-board-annotations' && Array.isArray(data.annotations) && data.annotations.length <= ${reviewAnchorRectLimit}) {
        annotations = data.annotations; schedule();
      }
      if (data.type === 'as-review-outline-scroll' && typeof data.id === 'string' && data.id.length <= 128) {
        const heading = headings.find(node => headingIds.get(node) === data.id);
        heading?.scrollIntoView({behavior: 'instant', block:'start'}); schedule();
      }
    });
    addEventListener('wheel', event => {
      if (!boardMode || (!event.ctrlKey && !event.metaKey) || !Number.isFinite(event.deltaY)) return;
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1;
      const delta = Math.max(-2000, Math.min(2000, event.deltaY * unit));
      if (delta !== 0) send({type:'as-review-board-zoom', delta});
    }, {passive:false, capture:true});
    addEventListener('scroll', schedule, {passive:true, capture:true});
    addEventListener('resize', () => {lastRects = ''; schedule();});
    addEventListener('load', schedule, true);
    function start() {
      new MutationObserver(schedule).observe(document.body, {subtree:true, childList:true, characterData:true, attributes:true});
      new ResizeObserver(schedule).observe(document.body);
      document.fonts?.ready.then(schedule);
      send({type:'as-review-reader-ready'});
      schedule();
    }
    if (document.readyState === 'loading') addEventListener('DOMContentLoaded', start, {once:true});
    else start();
  })();`;
  parsed.head.prepend(script);
  return `${/<!doctype\b[^>]*>/iu.exec(html)?.[0] ?? ""}${parsed.documentElement.outerHTML}`;
}
