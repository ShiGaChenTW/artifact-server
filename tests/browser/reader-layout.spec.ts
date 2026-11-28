import {expect, test, type Page} from "@playwright/test";

import {publishNew, publishVersion} from "../support/publishing.js";
import {
  localLogin,
  startBrowserFixture,
  stopBrowserFixture,
  type BrowserFixture,
} from "./browser-fixture.js";

/*
 * The reader layout (review-refinements-spec.md, section 4): the catalog,
 * comments and version info are drawers closed at rest (UXR-009), opened from
 * always-visible triggers or T, C and V (UXR-010); arrow keys and the bottom
 * bar step through the catalog (UXR-011).
 */

function fixtureHtml(title: string): string {
  return `<!doctype html><html lang="en"><title>${title}</title><main><h1>${title}</h1></main></html>`;
}

async function publishThree(fixture: BrowserFixture): Promise<void> {
  const alpha = await publishNew(fixture.server, fixture.installation, {
    accessSetting: "account_required",
    content: fixtureHtml("Alpha body"),
    idempotencyKey: "reader-layout-alpha-0001",
    name: "Alpha plan",
    path: "plans/alpha.html",
  });
  await publishVersion(fixture.server, fixture.installation, {
    artifactId: alpha.body.artifact.id,
    content: fixtureHtml("Alpha body two"),
    expectedCurrentVersionId: alpha.body.version.id,
    idempotencyKey: "reader-layout-alpha-0002",
    path: "plans/alpha.html",
  });
  await publishNew(fixture.server, fixture.installation, {
    accessSetting: "account_required",
    content: fixtureHtml("Beta body"),
    idempotencyKey: "reader-layout-beta-0001",
    name: "Beta report",
    path: "reports/beta.html",
  });
}

function triggers(page: Page) {
  return {
    catalog: page.getByRole("button", {name: /^Catalog \d/u}),
    comments: page.getByRole("button", {name: /^Comments \d/u}),
    version: page.locator(".as-version-trigger"),
  };
}

async function openReview(fixture: BrowserFixture): Promise<void> {
  await localLogin(fixture);
  await fixture.page.goto(`${fixture.server.baseUrl}/review?project=prj_default`);
  await expect(fixture.page.getByRole("heading", {level: 1, name: "Beta report"})).toBeVisible();
}

test.describe("Reader layout", () => {
  let fixture: BrowserFixture;
  test.beforeEach(async ({browser}) => {
    fixture = await startBrowserFixture(browser);
    await publishThree(fixture);
  });
  test.afterEach(async () => {
    await stopBrowserFixture(fixture);
  });

  test("board mode preserves the preview, remembers selection and bounds document width", async () => {
    const {page} = fixture;
    await page.setViewportSize({height: 900, width: 1440});
    await openReview(fixture);
    const frame = page.locator("iframe.as-artifact-frame");
    await expect(frame).toBeVisible();
    const original = await frame.elementHandle();
    await page.getByRole("button", {name: "Review board", exact: true}).click();
    await expect(page.getByRole("button", {name: "Review board", exact: true})).toHaveAttribute("aria-pressed", "true");
    expect(await frame.evaluate((element, previous) => element === previous, original)).toBe(true);
    await page.getByRole("combobox", {name: "Original", exact: true}).selectOption("1040");
    const checkWidth = async (width: number) => {
      await page.setViewportSize({height: 900, width});
      await expect.poll(async () => page.locator(".as-board__sheet").evaluate((element) => {
        const sheet = element.getBoundingClientRect();
        const viewport = element.parentElement?.getBoundingClientRect();
        return sheet.width <= 1041 && viewport !== undefined && sheet.top >= viewport.top + 23;
      })).toBe(true);
    };
    await checkWidth(1440);
    await checkWidth(1920);
    await checkWidth(2560);
    await checkWidth(600);
    await page.getByRole("button", {name: "Reading", exact: true}).click();
    expect(await frame.evaluate((element, previous) => element === previous, original)).toBe(true);
    await page.getByRole("button", {name: "Review board", exact: true}).click();
    await page.reload();
    await expect(page.getByRole("button", {name: "Review board", exact: true})).toHaveAttribute("aria-pressed", "true");
  });

  test("UXR-009-B: drawers start closed and toggle from their triggers, narrowing the preview on a wide screen", async () => {
    const {page} = fixture;
    await page.setViewportSize({height: 900, width: 1440});
    await openReview(fixture);
    const {catalog, comments, version} = triggers(page);
    const catalogDrawer = page.getByRole("complementary", {name: "Artifact catalog"});
    const commentsDrawer = page.locator("#review-comments-drawer");
    const versionDrawer = page.locator("#review-version-drawer");
    await Promise.all([catalog, comments, version].map((trigger) =>
      expect(trigger).toHaveAttribute("aria-expanded", "false")));
    await expect(catalog).toHaveAttribute("aria-controls", "review-catalog-drawer");
    await expect(comments).toHaveAttribute("aria-controls", "review-comments-drawer");
    await expect(version).toHaveAttribute("aria-controls", "review-version-drawer");
    await expect(catalogDrawer).toBeHidden();
    await expect(commentsDrawer).toBeHidden();
    await expect(versionDrawer).toBeHidden();

    const preview = page.locator("#review-preview");
    const fullWidth = (await preview.boundingBox())?.width ?? 0;
    await catalog.click();
    await expect(catalog).toHaveAttribute("aria-expanded", "true");
    await expect(catalogDrawer).toBeVisible();
    await expect.poll(async () => (await preview.boundingBox())?.width ?? 0).toBeLessThan(fullWidth - 300);

    // The right drawers share one side: opening one closes the other.
    await comments.click();
    await expect(comments).toHaveAttribute("aria-expanded", "true");
    await expect(commentsDrawer).toBeVisible();
    await version.click();
    await expect(version).toHaveAttribute("aria-expanded", "true");
    await expect(comments).toHaveAttribute("aria-expanded", "false");
    await expect(versionDrawer).toBeVisible();
    await expect(commentsDrawer).toBeHidden();
    await expect(catalogDrawer).toBeVisible();

    await versionDrawer.getByRole("button", {name: "Close version info"}).click();
    await expect(version).toHaveAttribute("aria-expanded", "false");
    await expect(version).toBeFocused();
  });

  test("UXR-009-F: below 760px a drawer overlays the preview, leaves a strip of it visible, and never scrolls the page sideways", async () => {
    const {page} = fixture;
    await page.setViewportSize({height: 844, width: 390});
    await openReview(fixture);
    const preview = page.locator("#review-preview");
    const previewBox = await preview.boundingBox();
    await triggers(page).catalog.click();
    const drawer = page.getByRole("complementary", {name: "Artifact catalog"});
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveCSS("position", "absolute");
    const drawerBox = await drawer.boundingBox();
    expect(drawerBox).not.toBeNull();
    expect(previewBox).not.toBeNull();
    if (drawerBox === null || previewBox === null) throw new Error("Drawer geometry was unavailable.");
    expect(drawerBox.width).toBeLessThanOrEqual(390 - 56);
    expect((await preview.boundingBox())?.width).toBe(previewBox.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await expect(page.locator(".as-bottombar__hints")).toBeHidden();
  });

  test("UXR-010-B: T, C and V toggle drawers and move focus; Escape closes the last one and returns focus", async () => {
    const {page} = fixture;
    await page.setViewportSize({height: 900, width: 1440});
    await openReview(fixture);
    const {catalog, comments, version} = triggers(page);

    await page.keyboard.press("t");
    await expect(catalog).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#review-catalog-drawer-title")).toBeFocused();
    await page.keyboard.press("c");
    await expect(comments).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#review-comments-drawer-title")).toBeFocused();
    await page.keyboard.press("v");
    await expect(version).toHaveAttribute("aria-expanded", "true");
    await expect(comments).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#review-version-drawer-title")).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(version).toHaveAttribute("aria-expanded", "false");
    await expect(version).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(catalog).toHaveAttribute("aria-expanded", "false");
    await expect(catalog).toBeFocused();
  });

  test("UXR-010-F: shortcut keys with modifiers, in editable fields, or inside the preview frame are left alone", async () => {
    const {page} = fixture;
    await page.setViewportSize({height: 900, width: 1440});
    await openReview(fixture);
    const {catalog, comments, version} = triggers(page);
    const heading = page.getByRole("heading", {level: 1});

    // Modifier chords belong to the browser and the operating system.
    await page.locator("#review-preview").focus();
    await page.keyboard.press("Shift+T");
    await page.keyboard.press("Alt+t");
    await page.keyboard.press("Alt+c");
    await page.keyboard.press("Control+ArrowRight");
    await page.keyboard.press("Meta+ArrowRight");
    await expect(catalog).toHaveAttribute("aria-expanded", "false");
    await expect(comments).toHaveAttribute("aria-expanded", "false");
    await expect(heading).toHaveText("Beta report");

    // Keys pressed inside the artifact stay with the artifact.
    const artifact = page.frameLocator(".as-artifact-frame").frameLocator("iframe");
    await artifact.getByRole("heading", {name: "Beta body"}).click();
    await expect(page.locator(".as-artifact-frame")).toBeFocused();
    await ["t", "c", "v", "ArrowRight", "Escape"].reduce<Promise<void>>(async (previous, key) => {
      await previous;
      await page.keyboard.press(key);
    }, Promise.resolve());
    await expect(catalog).toHaveAttribute("aria-expanded", "false");
    await expect(comments).toHaveAttribute("aria-expanded", "false");
    await expect(version).toHaveAttribute("aria-expanded", "false");
    await expect(heading).toHaveText("Beta report");

    // Editable fields keep their letters and arrow keys.
    await catalog.click();
    const search = page.getByRole("searchbox", {name: "Search artifacts"});
    await search.fill("");
    await search.press("c");
    await search.press("v");
    await search.press("t");
    await search.press("ArrowLeft");
    await expect(search).toHaveValue("cvt");
    await expect(catalog).toHaveAttribute("aria-expanded", "true");
    await expect(comments).toHaveAttribute("aria-expanded", "false");
    await expect(version).toHaveAttribute("aria-expanded", "false");
    await expect(heading).toHaveText("Beta report");
  });

  test("UXR-011-B: arrow keys and the bottom bar step through artifacts and keep name, version and path together", async () => {
    const {page} = fixture;
    await page.setViewportSize({height: 900, width: 1440});
    await openReview(fixture);
    const heading = page.getByRole("heading", {level: 1});
    const version = page.locator(".as-version-trigger__number");
    const path = page.locator(".as-bottombar__path");
    const position = page.locator(".as-bottombar__position");

    await expect(heading).toHaveText("Beta report");
    await expect(version).toHaveText("v1");
    await expect(path).toHaveText("reports/beta.html");
    await expect(position).toHaveText("1 / 2");
    await expect(page.locator(".as-bottombar__hints")).toContainText("Catalog");

    await page.keyboard.press("ArrowRight");
    await expect(heading).toHaveText("Alpha plan");
    await expect(version).toHaveText("v2");
    await expect(path).toHaveText("plans/alpha.html");
    await expect(position).toHaveText("2 / 2");
    await expect(page.getByRole("button", {name: "Next artifact"})).toBeDisabled();

    await page.getByRole("button", {name: "Previous artifact"}).click();
    await expect(heading).toHaveText("Beta report");
    await expect(version).toHaveText("v1");
    await expect(path).toHaveText("reports/beta.html");

    await page.keyboard.press("ArrowRight");
    await expect(heading).toHaveText("Alpha plan");
    await page.keyboard.press("ArrowLeft");
    await expect(heading).toHaveText("Beta report");
    await expect(position).toHaveText("1 / 2");
  });

  test("UXR-011-F: at either end of the catalog the step controls are disabled and change nothing", async () => {
    const {page} = fixture;
    await page.setViewportSize({height: 900, width: 1440});
    await openReview(fixture);
    const heading = page.getByRole("heading", {level: 1});
    const version = page.locator(".as-version-trigger__number");
    const path = page.locator(".as-bottombar__path");
    const position = page.locator(".as-bottombar__position");
    const previous = page.getByRole("button", {name: "Previous artifact"});
    const next = page.getByRole("button", {name: "Next artifact"});

    await expect(previous).toBeDisabled();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("k");
    await expect(heading).toHaveText("Beta report");
    await expect(version).toHaveText("v1");
    await expect(path).toHaveText("reports/beta.html");
    await expect(position).toHaveText("1 / 2");

    await next.click();
    await expect(heading).toHaveText("Alpha plan");
    await expect(next).toBeDisabled();
    const lastAddress = page.url();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("j");
    await expect(heading).toHaveText("Alpha plan");
    await expect(version).toHaveText("v2");
    await expect(path).toHaveText("plans/alpha.html");
    await expect(position).toHaveText("2 / 2");
    expect(page.url()).toBe(lastAddress);
  });
});
