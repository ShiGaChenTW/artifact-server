import {createThreadOverApi} from "./comment-api.js";
import {expect, test} from "@playwright/test";
import {publishNew, publishVersion} from "../support/publishing.js";
import {localLogin, startBrowserFixture, stopBrowserFixture, type BrowserFixture} from "./browser-fixture.js";

const content = '<!doctype html><title>Board report</title><style>section{min-height:900px}</style><h1>Board report</h1><section><h2>Context</h2><p>Long report context</p></section><section><h2>Decision</h2><p>Review decision</p></section>';

test.describe("Review board", () => {
  let fixture: BrowserFixture;
  let anchoredThread: string;
  test.beforeEach(async ({browser}) => {
    fixture = await startBrowserFixture(browser);
    await fixture.page.setViewportSize({width: 1600, height: 1000});
    await localLogin(fixture);
    const published = await publishNew(fixture.server, fixture.installation, {accessSetting: "account_required", content, idempotencyKey: "board-report-00001", name: "Board report"});
    const revised = await publishVersion(fixture.server, fixture.installation, {artifactId: published.body.artifact.id, content, expectedCurrentVersionId: published.body.version.id, idempotencyKey: "board-report-00002"});
    anchoredThread = (await createThreadOverApi(fixture, {
      artifactId: published.body.artifact.id, versionId: revised.body.version.id,
      body: "Check the report heading", idempotencyKey: "board-anchor-0001",
      anchor: {htmlAnchor: {selector: "h1", tagName: "H1", text: "Board report"}, originalText: "Board report"},
    })).id;
    await fixture.page.goto(`${fixture.server.baseUrl}/review?project=prj_default`);
    await expect(fixture.page.locator("iframe.as-artifact-frame")).toBeVisible();
  });
  test.afterEach(async () => {await stopBrowserFixture(fixture);});

  test("UXR-012-B UXR-013-B UXR-014-B UXR-015-B: mode, context, widths, outline and cards form a continuous review", async () => {
    const {page} = fixture;
    const original = await page.locator("iframe.as-artifact-frame").elementHandle();
    await page.getByRole("button", {name: "Review board", exact: true}).click();
    expect(await page.locator("iframe.as-artifact-frame").evaluate((node, previous) => node === previous, original)).toBe(true);
    await expect(page.locator("#review-comments-drawer")).toBeVisible();
    const context = page.getByRole("region", {name: "Document context"});
    await context.getByRole("button", {name: "Expand context"}).click();
    await expect(context.getByRole("button", {name: "Collapse context"})).toHaveAttribute("aria-expanded", "true");
    await expect(context).toContainText("v2");
    await page.locator(".as-version-trigger").click();
    const openCount = page.locator(".as-board-cards dl > div").filter({has: page.locator("dt", {hasText: /^Open$/u})}).locator("dd");
    await context.getByRole("button", {name: /^v1 ·/u}).click();
    await expect(openCount).toHaveText("0");
    await context.getByRole("button", {name: /^v2 ·/u}).click();
    await expect(openCount).toHaveText("1");
    await page.locator(".as-version-trigger").click();
    const outline = page.getByRole("navigation", {name: "Document outline"});
    await expect(outline.getByRole("button", {name: "Decision", exact: true})).toBeVisible();
    await outline.getByRole("button", {name: "Decision", exact: true}).click();
    await expect(outline.getByRole("button", {name: "Decision", exact: true})).toHaveAttribute("aria-current", "location");
    await page.getByRole("button", {name: "Close Document outline"}).click();
    await page.getByRole("button", {name: "Close Comment status"}).click();
    await expect(page.locator('.as-board[data-cards="false"]')).toBeVisible();
    await page.getByRole("button", {name: "Document outline", exact: true}).click();
    await expect(outline).toBeVisible();
    const checkWidth = async (width: number) => {
      await page.setViewportSize({width, height: 1000});
      await page.getByRole("combobox", {name: "Original", exact: true}).selectOption("1040");
      await expect.poll(() => page.locator(".as-board__sheet").evaluate((element) => {
        const sheet = element.getBoundingClientRect(); const viewport = element.parentElement?.getBoundingClientRect();
        return sheet.width <= 1041 && viewport !== undefined && sheet.top >= viewport.top + 23;
      })).toBe(true);
      await page.screenshot({animations: "disabled", path: `test-results/board/board-width-${width}.png`});
    };
    await checkWidth(1440); await checkWidth(1920); await checkWidth(2560);
    await page.getByRole("button", {name: "Free view", exact: true}).click();
    const blank = await page.locator(".as-board__viewport").boundingBox();
    if (blank === null) throw new Error("Board viewport is missing");
    await page.mouse.move(blank.x + 8, blank.y + 8);
    await page.mouse.down();
    await page.mouse.move(blank.x + 28, blank.y + 8, {steps: 5});
    await page.mouse.up();
    await expect(page.locator(".as-board__sheet")).toHaveAttribute("style", /translate\(20px/u);
    await page.getByRole("button", {name: "Reset position", exact: true}).click();
    const handle = page.getByRole("button", {name: "Move document (arrow keys)", exact: true});
    await handle.focus(); await handle.press("ArrowRight");
    await expect(page.locator(".as-board__sheet")).toHaveAttribute("style", /translate\(10px/u);
    await page.getByRole("button", {name: "Reset position", exact: true}).click();
    await expect(page.locator(".as-board__sheet")).toHaveAttribute("style", /translate\(0px/u);
    await page.reload();
    await expect(page.getByRole("button", {name: "Review board", exact: true})).toHaveAttribute("aria-pressed", "true");
  });

  test("UXR-017-B UXR-017-F: markers connect to selected cards after transforms and ignore spoofed messages", async () => {
    const {page} = fixture;
    await page.getByRole("button", {name: "Review board", exact: true}).click();
    const frame = page.frameLocator("iframe.as-artifact-frame");
    await frame.getByRole("button", {name: "Select comment 1", exact: true}).click();
    const card = page.locator(`[data-board-thread="${anchoredThread}"]`);
    await expect(card).toHaveAttribute("aria-current", "true");
    const line = page.locator(".as-board-connections path");
    await expect(line).toHaveAttribute("d", /^M.+C/u);
    await page.getByRole("button", {name: "Zoom −", exact: true}).click();
    const beforeWheel = await page.getByRole("status", {name: "Zoom", exact: true}).textContent();
    const inner = frame.frameLocator("iframe").locator("h1");
    await inner.hover({force: true});
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, 80);
    await page.keyboard.up("Control");
    await expect(page.getByRole("status", {name: "Zoom", exact: true})).not.toHaveText(beforeWheel ?? "");
    await expect(line).toHaveAttribute("d", /^M.+C/u);
    const headingBounds = await inner.boundingBox();
    if (headingBounds === null) throw new Error("Heading is not visible after zoom");
    await page.mouse.move(headingBounds.x + 2, headingBounds.y + headingBounds.height / 2);
    await page.mouse.down();
    await page.mouse.move(headingBounds.x + Math.min(150, headingBounds.width - 2), headingBounds.y + headingBounds.height / 2, {steps: 10});
    await page.mouse.up();
    await frame.getByPlaceholder("Add a comment...", {exact: true}).fill("Feedback created after zoom");
    await frame.getByRole("button", {name: "Save", exact: true}).click();
    await expect(page.locator("#review-comments-drawer")).toContainText("Feedback created after zoom");
    await card.press("Enter");
    await page.getByRole("button", {name: "Expand context", exact: true}).click();
    await expect(line).toHaveAttribute("d", /^M.+C/u);
    await page.evaluate(() => {
      window.postMessage({type: "as-review-outline", v: 1, entries: [{id: "bad", title: "Spoofed heading", level: 1, active: true}]}, location.origin);
      window.postMessage({type: "as-review-anchor-rects", v: 1, rects: [{threadId: "bad", x: Infinity}]}, location.origin);
    });
    await expect(page.getByRole("button", {name: "Spoofed heading", exact: true})).toHaveCount(0);
    await page.screenshot({animations: "disabled", path: "test-results/board/board-desktop.png"});
    await page.getByRole("combobox", {name: "Color palette", exact: true}).selectOption("borderloop");
    const hostColor = await page.locator("html").evaluate((node) => getComputedStyle(node).getPropertyValue("--as-action").trim());
    await expect.poll(() => frame.locator("html").evaluate((node) => getComputedStyle(node).getPropertyValue("--primary").trim())).toBe(hostColor);
    await page.getByRole("button", {name: "Use light theme", exact: true}).click();
    await page.screenshot({animations: "disabled", path: "test-results/board/board-light-desktop.png"});
    await page.getByRole("button", {name: "Use dark theme", exact: true}).click();
    await page.screenshot({animations: "disabled", path: "test-results/board/board-dark-desktop.png"});
    await page.setViewportSize({width: 390, height: 844});
    await page.locator("#review-comments-drawer").getByRole("button", {name: "Close comments", exact: true}).click();
    await page.getByRole("button", {name: "Collapse context", exact: true}).click();
    await page.screenshot({animations: "disabled", path: "test-results/board/board-dark-narrow.png"});
    await page.getByRole("button", {name: "Use light theme", exact: true}).click();
    await page.screenshot({animations: "disabled", path: "test-results/board/board-light-narrow.png"});
  });

  test("UXR-015-B UXR-017-B: selecting a comment card keeps the outline and its connection", async () => {
    // UAT F2 reduced: zoom, a new comment and a reply are not needed. Selecting
    // a thread from its card names the thread's file, which used to clear the
    // board geometry while the unchanged document never re-sent it.
    const {page} = fixture;
    // A comment made by selecting text in Review records the file it was made on.
    const artifactId = new URL(page.url()).searchParams.get("artifact") ?? "";
    const versionId = new URL(page.url()).searchParams.get("version") ?? "";
    const fileThread = (await createThreadOverApi(fixture, {
      artifactId, versionId, path: "index.html", body: "Decision needs a source", idempotencyKey: "board-file-anchor-01",
      anchor: {htmlAnchor: {selector: "h2", tagName: "H2", text: "Context"}, originalText: "Context"},
    })).id;
    await page.reload();
    await page.getByRole("button", {name: "Review board", exact: true}).click();
    const outline = page.getByRole("navigation", {name: "Document outline"});
    await expect(outline.getByRole("button", {name: "Decision", exact: true})).toBeVisible();
    const card = page.locator(`[data-board-thread="${fileThread}"]`);
    await card.click({position: {x: 8, y: 8}});
    await expect(card).toHaveAttribute("aria-current", "true");
    await expect(page).toHaveURL(/[?&]path=index\.html/u);
    await expect(outline.getByRole("button", {name: "Decision", exact: true})).toBeVisible();
    await expect(outline).not.toContainText("No headings in this preview");
    await expect(page.locator(".as-board-connections path")).toHaveAttribute("d", /^M.+C/u);
  });

  test("UXR-017-B: text-only anchors connect to their selected cards", async () => {
    const {page} = fixture;
    const artifactId = new URL(page.url()).searchParams.get("artifact") ?? "";
    const versionId = new URL(page.url()).searchParams.get("version") ?? "";
    const thread = (await createThreadOverApi(fixture, {
      artifactId, versionId, path: "index.html", body: "Text selection without a selector", idempotencyKey: "board-text-anchor-01",
      anchor: {htmlAnchor: null, originalText: "Long report context"},
    })).id;
    await page.reload();
    await page.getByRole("button", {name: "Review board", exact: true}).click();
    const card = page.locator(`[data-board-thread="${thread}"]`);
    await card.click({position: {x: 8, y: 8}});
    await page.locator(".as-version-trigger").hover();
    await expect(card).toHaveAttribute("aria-current", "true");
    await expect(page.locator(".as-board-connections path")).toHaveAttribute("d", /^M.+C/u);
  });

  test("UXR-017-F: comparison clears single-document outline and geometry", async () => {
    const {page} = fixture;
    await page.getByRole("button", {name: "Review board", exact: true}).click();
    const outline = page.getByRole("navigation", {name: "Document outline"});
    await expect(outline.getByRole("button", {name: "Decision", exact: true})).toBeVisible();
    await page.locator(".as-version-trigger").click();
    await page.getByRole("tab", {name: "Versions"}).click();
    await page.getByRole("button", {name: "Compare", exact: true}).click();
    await page.getByRole("button", {name: "Side by side", exact: true}).click();
    await expect(page.locator(".as-comparison-preview")).toBeVisible();
    await expect(outline.getByRole("button", {name: "Decision", exact: true})).toHaveCount(0);
    await expect(page.locator(".as-board-connections")).toHaveCount(0);
    const before = await page.getByRole("status", {name: "Zoom", exact: true}).textContent();
    await page.getByTitle("Version 1 preview").contentFrame().frameLocator("iframe").locator("h1").hover({force: true});
    await page.keyboard.down("Control"); await page.mouse.wheel(0, 80); await page.keyboard.up("Control");
    await expect(page.getByRole("status", {name: "Zoom", exact: true})).not.toHaveText(before ?? "");
  });

  test("UXR-012-F: version drawer keeps one selected tab after a comparison and artifact switch", async () => {
    const {page} = fixture;
    await publishNew(fixture.server, fixture.installation, {accessSetting: "account_required", content: "<!doctype html><title>Other report</title><h1>Other report</h1>", idempotencyKey: "board-other-00001", name: "Other report"});
    await page.reload();
    await expect(page.locator("iframe.as-artifact-frame")).toBeVisible();
    await page.getByRole("button", {name: "Review board", exact: true}).click();
    const catalog = page.getByRole("button", {name: /^Catalog \d/u});
    await catalog.click();
    await page.getByRole("button", {name: /Board report/u}).first().click();
    await expect(page.locator(".as-bottombar__path")).toContainText("index.html");
    const drawer = page.locator("#review-version-drawer");
    await page.locator(".as-version-trigger").click();
    await drawer.getByRole("tab", {name: /^Versions/u}).click();
    await drawer.getByRole("button", {name: "Compare", exact: true}).click();
    await drawer.getByRole("button", {name: "Side by side", exact: true}).click();
    await expect(page.locator(".as-comparison-preview")).toBeVisible();
    // UAT F1 also visited a Files tab; the defect only needs the Compare tab to stay active.
    await drawer.getByRole("button", {name: "Close version info", exact: true}).click();
    const previous = page.getByRole("button", {name: "Previous artifact", exact: true});
    const next = page.getByRole("button", {name: "Next artifact", exact: true});
    const position = page.getByRole("status", {name: /position/iu});
    const start = await position.textContent();
    if (await previous.isDisabled()) {await next.click(); await expect(position).not.toHaveText(start ?? ""); await previous.click();}
    else {await previous.click(); await expect(position).not.toHaveText(start ?? ""); await next.click();}
    await expect(position).toHaveText(start ?? "");
    await page.locator(".as-version-trigger").click();
    const tabs = drawer.getByRole("tab");
    await expect(tabs.first()).toBeVisible();
    await expect(drawer.locator('[role="tab"][aria-selected="true"]')).toHaveCount(1);
    const selected = drawer.locator('[role="tab"][aria-selected="true"]');
    await expect(drawer.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", (await selected.getAttribute("id")) ?? "missing");
    await expect(drawer.getByRole("tabpanel")).not.toContainText("No comparison");
  });

  test("UXR-012-F UXR-013-F UXR-014-F UXR-015-F UXR-016-F: narrow board and storage failure recover", async () => {
    const {page} = fixture;
    await page.emulateMedia({reducedMotion: "reduce"});
    await page.setViewportSize({width: 390, height: 844});
    await page.getByRole("button", {name: "Review board", exact: true}).click();
    await expect(page.locator("#review-comments-drawer")).toBeHidden();
    await page.getByRole("button", {name: "Expand context", exact: true}).click();
    await expect.poll(() => page.locator("iframe.as-artifact-frame").evaluate((node) => node.getBoundingClientRect().height)).toBeGreaterThan(100);
    await page.getByRole("button", {name: "Collapse context", exact: true}).click();
    // Narrow cards retain independently scrollable, keyboard-accessible content.
    const counts = page.locator(".as-board-cards dl");
    await counts.focus();
    await counts.press("End");
    await expect.poll(() => counts.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
    const outlineNavigation = page.getByRole("navigation", {name: "Document outline"});
    await outlineNavigation.getByRole("button", {name: "Decision", exact: true}).focus();
    expect(await outlineNavigation.evaluate((node) => {
      const selected = document.activeElement?.getBoundingClientRect();
      const bounds = node.getBoundingClientRect();
      return selected !== undefined && selected.top >= bounds.top && selected.bottom <= bounds.bottom + 1;
    })).toBe(true);
    const comments = page.getByRole("button", {name: /^Comments \d/u});
    await comments.click();
    await expect(page.locator("#review-comments-drawer")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#review-comments-drawer")).toBeHidden();
    await expect(comments).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => {Storage.prototype.setItem = () => {throw new Error("storage unavailable");};});
    await page.getByRole("button", {name: "Reading", exact: true}).click();
    await expect(page.getByRole("button", {name: "Reading", exact: true})).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", {name: "Review board", exact: true}).click();
    await expect(page.getByRole("button", {name: "Reading", exact: true})).toHaveAttribute("aria-pressed", "true");
  });
});

test.describe("Review board on a touch phone", () => {
  let fixture: BrowserFixture;
  test.beforeEach(async ({browser}) => {
    fixture = await startBrowserFixture(browser, {hasTouch: true, isMobile: true, viewport: {width: 390, height: 844}});
    await localLogin(fixture);
    await publishNew(fixture.server, fixture.installation, {accessSetting: "account_required", content, idempotencyKey: "board-touch-00001", name: "Board report"});
    await fixture.page.goto(`${fixture.server.baseUrl}/review?project=prj_default`);
    await expect(fixture.page.locator("iframe.as-artifact-frame")).toBeVisible();
  });
  test.afterEach(async () => {await stopBrowserFixture(fixture);});

  test("UXR-013-F UXR-015-F: expanded context on a coarse-pointer phone keeps a readable preview", async () => {
    const {page} = fixture;
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    await page.getByRole("button", {name: "Review board", exact: true}).click();
    await expect(page.getByRole("navigation", {name: "Document outline"})).toBeVisible();
    await expect(page.locator(".as-board-cards dl")).toBeVisible();
    const previewHeight = () => page.locator("iframe.as-artifact-frame").evaluate((node) => node.getBoundingClientRect().height);
    const collapsed = await previewHeight();
    await page.getByRole("button", {name: "Expand context", exact: true}).click();
    await expect(page.getByRole("button", {name: "Collapse context", exact: true})).toHaveAttribute("aria-expanded", "true");
    // The board owns the space between the title bar and the bottom bar.
    // Expanded context takes the cards' place, so the document keeps at least
    // half of that space and never less than it had while context was collapsed.
    const board = await page.locator(".as-board").evaluate((node) => node.getBoundingClientRect().height);
    const expanded = await previewHeight();
    expect(expanded).toBeGreaterThanOrEqual(board / 2);
    expect(expanded).toBeGreaterThanOrEqual(collapsed);
    await expect(page.locator(".as-board-cards")).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("button", {name: "Reset position", exact: true}).click();
    await page.getByRole("button", {name: "Collapse context", exact: true}).click();
    await expect(page.getByRole("navigation", {name: "Document outline"})).toBeVisible();
    await expect(page.locator(".as-board-cards dl")).toBeVisible();
    expect(await previewHeight()).toBe(collapsed);
  });
});
