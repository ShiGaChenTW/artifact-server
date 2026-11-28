import {expect, test} from "@playwright/test";

import {reviewAnchorRectSchema} from "../../apps/web/src/review-frame/protocol.js";

import {startBrowserFixture, stopBrowserFixture} from "./browser-fixture.js";

const init = {
  annotateModeActive: false,
  annotations: ["first", "second"].map(threadId => ({
    anchor: {htmlAnchor: {selector: "#intro", tagName: "H1", text: "Introduction"}, originalText: "Introduction"},
    body: threadId,
    state: "open",
    threadId,
  })),
  baseHref: null,
  entryPath: "index.html",
  html: '<!doctype html><h1 id="intro">Introduction</h1><p>Opening paragraph.</p><div style="height:1400px"></div><h2>Later section</h2><div style="height:900px"></div>',
  isLight: true,
  readOnly: true,
  themeTokens: {},
  type: "as-review-init",
  v: 1,
};

/** Exercise the real built frame and its opaque artifact, with a tiny real host. */
function harness(): string {
  return `<!doctype html><style>html,body{margin:0}iframe{width:800px;height:600px;border:0}</style>
  <pre id="outline"></pre><pre id="rects"></pre><pre id="selected"></pre><pre id="zoom"></pre>
  <iframe id="reader" src="/review-frame"></iframe>
  <script>
  const reader = document.getElementById('reader');
  addEventListener('message', event => {
    if (event.source !== reader.contentWindow || event.origin !== location.origin) return;
    const data = event.data;
    if (data.type === 'as-review-ready') reader.contentWindow.postMessage(${JSON.stringify(init)}, location.origin);
    if (data.type === 'as-review-outline') document.getElementById('outline').textContent = JSON.stringify(data.entries);
    if (data.type === 'as-review-anchor-rects') document.getElementById('rects').textContent = JSON.stringify(data.rects);
    if (data.type === 'as-review-board-zoom') document.getElementById('zoom').textContent = String(data.delta);
    if (data.type === 'as-review-select') document.getElementById('selected').textContent = data.threadId;
  });
  </script>`;
}

test("ARTSV-7.5-B ARTSV-7.5-F: real frame outlines, collision-free numbered markers, scroll geometry and source checks", async ({browser}) => {
  const fixture = await startBrowserFixture(browser);
  try {
    await fixture.page.route("**/reader-harness", route => route.fulfill({contentType: "text/html", body: harness()}));
    await fixture.page.goto(`${fixture.server.baseUrl}/reader-harness`);
    const outer = fixture.page.frameLocator("#reader");
    const inner = outer.frameLocator("iframe");
    await expect(fixture.page.locator("#outline")).toContainText('"title":"Introduction"');
    await expect(fixture.page.locator("#outline")).toContainText('"level":2');
    const markers = outer.locator(".as-reader-marker");
    await expect(markers).toHaveCount(2);
    const first = await markers.nth(0).boundingBox();
    const second = await markers.nth(1).boundingBox();
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(second?.y).toBeGreaterThanOrEqual((first?.y ?? 0) + (first?.height ?? 0));
    await markers.nth(1).click();
    await expect(fixture.page.locator("#selected")).toHaveText("second");
    const contrasts = await markers.evaluateAll(elements => elements.map(element => {
      const style = getComputedStyle(element);
      const canvas = document.createElement("canvas"); canvas.width = 1; canvas.height = 1;
      const context = canvas.getContext("2d");
      if (context === null) throw new Error("Color sampling is unavailable");
      const luminance = (color: string) => {
        context.fillStyle = color; context.fillRect(0, 0, 1, 1);
        const channels = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map(value => {
          const channel = value / 255;
          return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
        });
        return (channels[0] ?? 0) * .2126 + (channels[1] ?? 0) * .7152 + (channels[2] ?? 0) * .0722;
      };
      const values = [luminance(style.color), luminance(style.backgroundColor)].toSorted((a, b) => a - b);
      return ((values[1] ?? 0) + .05) / ((values[0] ?? 0) + .05);
    }));
    expect(contrasts.every(value => value >= 4.5)).toBe(true);
    await expect(fixture.page.locator("#rects")).toContainText('"threadId":"first"');

    // Frame resize refreshes marker viewport coordinates. Host scaling applies
    // to these coordinates exactly once when drawing its connector overlay.
    await fixture.page.locator("#reader").evaluate(element => element.setAttribute("style", "width:900px;transform:scale(.75);transform-origin:top left"));
    await expect.poll(async () => {
      const reported = reviewAnchorRectSchema.array().parse(JSON.parse(await fixture.page.locator("#rects").textContent() ?? "[]"));
      const frameBounds = await fixture.page.locator("#reader").boundingBox();
      const markerBounds = await markers.nth(0).boundingBox();
      if (frameBounds === null || markerBounds === null || reported[0] === undefined) return 1_000;
      return Math.abs(markerBounds.x - (frameBounds.x + reported[0].x * .75));
    }).toBeLessThan(1);

    // A same-origin window that is not the host cannot drive the frame.
    await outer.locator("body").evaluate(() => {
      window.dispatchEvent(new MessageEvent("message", {source: window, origin: location.origin, data: {type: "as-review-annotations", annotations: [], v: 1}}));
    });
    await expect(markers).toHaveCount(2);

    await fixture.page.locator("#reader").evaluate(element => {
      if (!(element instanceof HTMLIFrameElement)) throw new Error("Missing frame");
      element.contentWindow?.postMessage({type: "as-review-outline-scroll", id: "as-heading-1", v: 1}, location.origin);
    });
    await expect(inner.getByRole("heading", {name: "Later section"})).toBeInViewport();
    await expect(fixture.page.locator("#outline")).toContainText('"title":"Later section","level":2,"active":true');
    await expect(markers).toHaveCount(0);
    await expect(fixture.page.locator("#rects")).toHaveText("[]");

    await fixture.page.locator("#reader").evaluate(element => {
      if (!(element instanceof HTMLIFrameElement)) throw new Error("Missing frame");
      element.contentWindow?.postMessage({type: "as-review-outline-scroll", id: "as-heading-0", v: 1}, location.origin);
    });
    await expect(markers).toHaveCount(2);
  } finally {
    await stopBrowserFixture(fixture);
  }
});


test("ARTSV-7.5-B: modifier wheel zoom is relayed only while board mode owns the artifact surface", async ({browser}) => {
  const fixture = await startBrowserFixture(browser);
  try {
    await fixture.page.route("**/reader-harness", route => route.fulfill({contentType: "text/html", body: harness()}));
    await fixture.page.goto(`${fixture.server.baseUrl}/reader-harness`);
    const artifact = fixture.page.frameLocator("#reader").frameLocator("iframe").locator("body");
    await expect(artifact.getByRole("heading", {name: "Introduction"})).toBeVisible();
    const disabled = await artifact.evaluate(element => {
      const event = new WheelEvent("wheel", {deltaY: 100, ctrlKey: true, bubbles: true, cancelable: true});
      element.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(disabled).toBe(false);
    await expect(fixture.page.locator("#zoom")).toBeEmpty();

    await fixture.page.locator("#reader").evaluate(element => {
      if (!(element instanceof HTMLIFrameElement)) throw new Error("Missing frame");
      element.contentWindow?.postMessage({type: "as-review-board-mode", enabled: true, v: 1}, location.origin);
    });
    await expect.poll(() => artifact.evaluate(element => {
      const event = new WheelEvent("wheel", {deltaY: 100, ctrlKey: true, bubbles: true, cancelable: true});
      element.dispatchEvent(event);
      return event.defaultPrevented;
    })).toBe(true);
    await expect(fixture.page.locator("#zoom")).toHaveText("100");
    const meta = await artifact.evaluate(element => {
      const event = new WheelEvent("wheel", {deltaY: -10_000, metaKey: true, bubbles: true, cancelable: true});
      element.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(meta).toBe(true);
    await expect(fixture.page.locator("#zoom")).toHaveText("-2000");
    const ordinary = await artifact.evaluate(element => {
      const event = new WheelEvent("wheel", {deltaY: 100, bubbles: true, cancelable: true});
      element.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(ordinary).toBe(false);

    await fixture.page.locator("#reader").evaluate(element => {
      if (!(element instanceof HTMLIFrameElement)) throw new Error("Missing frame");
      element.contentWindow?.postMessage({type: "as-review-board-mode", enabled: false, v: 1}, location.origin);
    });
    await expect.poll(() => artifact.evaluate(element => {
      const event = new WheelEvent("wheel", {deltaY: 100, metaKey: true, bubbles: true, cancelable: true});
      element.dispatchEvent(event);
      return event.defaultPrevented;
    })).toBe(false);
  } finally {
    await stopBrowserFixture(fixture);
  }
});
