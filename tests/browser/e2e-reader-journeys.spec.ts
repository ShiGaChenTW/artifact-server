import {expect, test, type Browser, type Page} from "@playwright/test";
import {z} from "zod";

import {ApiClient, dispatchPageSchema, issueApiKey, signInAdministrator} from "../support/agent-dispatch.js";
import {publishNew, publishVersion, type PublishResponse} from "../support/publishing.js";
import {apiHeaders} from "../support/runtime-harness.js";
import {
  localLogin,
  openVersionTab,
  startBrowserFixture,
  stopBrowserFixture,
  type BrowserFixture,
} from "./browser-fixture.js";
import {listThreadsOverApi} from "./comment-api.js";

/*
 * Cross-page journeys through the reader redesign (ARTSV-6.9): each one starts
 * from published artifacts on a real server, real SQLite and real disk, moves
 * between the dashboard, Review and Files, and runs once on a 1440-pixel
 * desktop and once on a 390-pixel phone.
 */

const projectId = "prj_default";

const viewports = [
  {height: 900, label: "desktop 1440", width: 1440},
  {height: 844, label: "narrow 390", width: 390},
] as const;

type Viewport = (typeof viewports)[number];

function html(heading: string): string {
  return `<!doctype html><html lang="en"><title>${heading}</title><body><main><h1>${heading}</h1>`
    + `<p id="first">The first claim.</p><p id="second">The second claim.</p></main></body></html>`;
}

/** Two artifacts and a second version of the older one: Beta lists first. */
async function publishPair(fixture: BrowserFixture, prefix: string): Promise<{
  readonly alpha: PublishResponse;
  readonly alphaTwo: PublishResponse;
  readonly beta: PublishResponse;
}> {
  const alpha = (await publishNew(fixture.server, fixture.installation, {
    accessSetting: "account_required",
    content: html("Alpha body"),
    idempotencyKey: `${prefix}-alpha-one`,
    name: "Alpha plan",
    path: "plans/alpha.html",
  })).body;
  const beta = (await publishNew(fixture.server, fixture.installation, {
    accessSetting: "account_required",
    content: html("Beta body"),
    idempotencyKey: `${prefix}-beta-one`,
    name: "Beta report",
    path: "reports/beta.html",
  })).body;
  const alphaTwo = (await publishVersion(fixture.server, fixture.installation, {
    artifactId: alpha.artifact.id,
    content: html("Alpha body two"),
    expectedCurrentVersionId: alpha.version.id,
    idempotencyKey: `${prefix}-alpha-two`,
    path: "plans/alpha.html",
  })).body;
  return {alpha, alphaTwo, beta};
}

function artifactFrame(page: Page) {
  return page.frameLocator(".as-artifact-frame").frameLocator("iframe");
}

async function openReview(page: Page, published: PublishResponse): Promise<void> {
  const url = new URL(published.links.review);
  url.searchParams.delete("view");
  await page.goto(url.href);
  await expect(artifactFrame(page).getByRole("heading", {level: 1})).toBeVisible();
}

function metric(page: Page, label: string) {
  return page.locator(".as-metric").filter({has: page.locator("dt", {hasText: label})}).locator(".as-metric__value");
}

interface ReaderLabels {
  readonly next: string;
  readonly previous: string;
}

const english: ReaderLabels = {next: "Next artifact", previous: "Previous artifact"};
const chinese: ReaderLabels = {next: "下一個 Artifact", previous: "上一個 Artifact"};

/**
 * Journey 2's reader checks, written against both interface languages: T, C
 * and V toggle the drawers and move focus into them, Escape closes the most
 * recent one and returns focus to its trigger, and the arrow keys and the
 * bottom bar step through the catalog without wrapping at either end.
 */
async function checkReaderDrawersAndStepping(page: Page, labels: ReaderLabels): Promise<void> {
  const catalog = page.getByRole("button", {name: /^(?:Catalog|目錄) \d/u});
  const comments = page.getByRole("button", {name: /^(?:Comments|留言) \d/u});
  const version = page.locator(".as-version-trigger");
  const heading = page.getByRole("heading", {level: 1});
  const position = page.locator(".as-bottombar__position");
  const path = page.locator(".as-bottombar__path");
  const previous = page.getByRole("button", {name: labels.previous, exact: true});
  const next = page.getByRole("button", {name: labels.next, exact: true});

  await expect(heading).toHaveText("Beta report");
  await Promise.all([catalog, comments, version].map((trigger) =>
    expect(trigger).toHaveAttribute("aria-expanded", "false")));

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
  await page.keyboard.press("c");
  await expect(comments).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(comments).toHaveAttribute("aria-expanded", "false");
  await expect(comments).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  // The first artifact: Previous is disabled and the left arrow changes nothing.
  await expect(position).toHaveText("1 / 2");
  await expect(path).toHaveText("reports/beta.html");
  await expect(previous).toBeDisabled();
  await page.keyboard.press("ArrowLeft");
  await expect(heading).toHaveText("Beta report");
  await expect(position).toHaveText("1 / 2");

  await page.keyboard.press("ArrowRight");
  await expect(heading).toHaveText("Alpha plan");
  await expect(page.locator(".as-version-trigger__number")).toHaveText("v2");
  await expect(path).toHaveText("plans/alpha.html");
  await expect(position).toHaveText("2 / 2");
  await expect(next).toBeDisabled();
  const lastAddress = page.url();
  // The last artifact: the right arrow does not wrap back to the first.
  await page.keyboard.press("ArrowRight");
  await expect(heading).toHaveText("Alpha plan");
  await expect(position).toHaveText("2 / 2");
  expect(page.url()).toBe(lastAddress);

  await previous.click();
  await expect(heading).toHaveText("Beta report");
  await expect(position).toHaveText("1 / 2");
  await expect(previous).toBeDisabled();
  await next.click();
  await expect(heading).toHaveText("Alpha plan");
  await expect(next).toBeDisabled();
  await page.keyboard.press("ArrowLeft");
  await expect(heading).toHaveText("Beta report");
}

/** One connected agent registered over the API with an agent:connect key. */
async function connectAgent(fixture: BrowserFixture, name: string): Promise<void> {
  const cookies = await signInAdministrator(fixture.server, fixture.installation);
  const token = await issueApiKey(fixture.server, cookies, ["agent:connect"], `${name} bridge key`);
  await new ApiClient(fixture.server, token).registerAgent({
    agentSessionId: `session-${name}`,
    connectionKey: `connection-${name}`,
    displayName: name,
    workingDirectory: `/work/${name}`,
  });
}

async function createFolder(fixture: BrowserFixture, name: string): Promise<string> {
  const response = await fetch(`${fixture.server.baseUrl}/api/v1/projects/${projectId}/folders`, {
    body: JSON.stringify({name, parentFolderId: null}),
    headers: apiHeaders(fixture.installation, `journey-folder-${name}`),
    method: "POST",
  });
  expect(response.status).toBe(201);
  return z.object({folder: z.object({id: z.string()})}).parse(await response.json()).folder.id;
}

async function currentVersionId(fixture: BrowserFixture, artifactId: string): Promise<string> {
  const response = await fetch(`${fixture.server.baseUrl}/api/v1/artifacts/${artifactId}?projectId=${projectId}`, {
    headers: {Authorization: `Bearer ${fixture.installation.apiToken}`},
  });
  expect(response.status).toBe(200);
  return z.object({artifact: z.object({currentVersionId: z.string()})}).parse(await response.json()).artifact.currentVersionId;
}

async function folderOf(fixture: BrowserFixture, artifactId: string): Promise<string | null> {
  const response = await fetch(`${fixture.server.baseUrl}/api/v1/artifacts/${artifactId}?projectId=${projectId}`, {
    headers: {Authorization: `Bearer ${fixture.installation.apiToken}`},
  });
  expect(response.status).toBe(200);
  return z.object({artifact: z.object({folderId: z.string().nullable()})}).parse(await response.json()).artifact.folderId;
}

/** Every thread on one artifact, including those a dispatch currently holds. */
async function listEveryThread(fixture: BrowserFixture, artifactId: string) {
  const response = await fetch(
    `${fixture.server.baseUrl}/api/v1/artifacts/${artifactId}/comments?projectId=${projectId}&dispatched=include`,
    {headers: {Authorization: `Bearer ${fixture.installation.apiToken}`}},
  );
  expect(response.status).toBe(200);
  return z.object({
    items: z.array(z.object({body: z.string(), replyCount: z.number(), state: z.enum(["open", "resolved"])})),
  }).parse(await response.json()).items;
}

/** The reader's Location breadcrumb for the selected artifact, on the Details tab. */
async function readerLocation(page: Page) {
  await openVersionTab(page, "Details");
  return page.locator("#review-version-drawer").getByRole("navigation", {name: "Location"})
    .locator("[aria-current=location]");
}

function journeys(viewport: Viewport): void {
  test.describe(`Reader journeys (${viewport.label})`, () => {
    let fixture: BrowserFixture;
    test.beforeEach(async ({browser}) => {
      fixture = await startBrowserFixture(browser);
      await fixture.page.setViewportSize({height: viewport.height, width: viewport.width});
      await localLogin(fixture);
    });
    test.afterEach(async () => {
      await stopBrowserFixture(fixture);
    });

    test(`UXR-001-B DSH-001-B DSH-004-B UXR-011-B: journey 1, published artifacts reach the dashboard and open in the reader (${viewport.label})`, async () => {
      const {page} = fixture;
      const alpha = (await publishNew(fixture.server, fixture.installation, {
        accessSetting: "account_required",
        content: html("Alpha body"),
        idempotencyKey: "journey-one-alpha-one",
        name: "Alpha plan",
        path: "plans/alpha.html",
      })).body;
      await publishNew(fixture.server, fixture.installation, {
        accessSetting: "account_required",
        content: html("Beta body"),
        idempotencyKey: "journey-one-beta-one",
        name: "Beta report",
        path: "reports/beta.html",
      });
      // Reading Alpha once is what makes its next version new to this owner.
      await openReview(page, alpha);
      await publishVersion(fixture.server, fixture.installation, {
        artifactId: alpha.artifact.id,
        content: html("Alpha body two"),
        expectedCurrentVersionId: alpha.version.id,
        idempotencyKey: "journey-one-alpha-two",
        path: "plans/alpha.html",
      });

      await page.goto(`${fixture.server.baseUrl}/review/dashboard?project=${projectId}`);
      await expect(page.getByRole("heading", {level: 1, name: "Dashboard"})).toBeVisible();
      await expect(metric(page, "Artifacts")).toHaveText("2");
      const band = page.getByRole("region", {name: "Needs you"});
      const newVersions = band.locator('[data-kind="versions"]');
      await expect(newVersions.locator(".as-queue__count")).toHaveText("1");
      await expect(newVersions.getByRole("link", {name: "Alpha plan"})).toBeVisible();
      await expect(newVersions.locator(".as-version-number")).toHaveText("v2");

      // Consecutive publishes collapse into one group that still links each artifact.
      const activity = page.getByRole("list", {name: "Activity trail"});
      const group = activity.locator("summary").filter({hasText: /3 versions published/u});
      await expect(group).toHaveCount(1);
      await group.click();
      const grouped = group.locator("..").getByRole("link");
      await expect(grouped).toHaveCount(3);
      await expect(grouped.filter({hasText: "Alpha plan"})).toHaveCount(2);
      await expect(grouped.filter({hasText: "Beta report"})).toHaveCount(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

      await newVersions.getByRole("link", {name: "Alpha plan"}).click();
      await expect(page).toHaveURL(/\/review\?/u);
      await expect(page.getByRole("heading", {level: 1, name: "Alpha plan"})).toBeVisible();
      await expect(artifactFrame(page).getByRole("heading", {name: "Alpha body two"})).toBeVisible();
      await expect(page.locator(".as-version-trigger__number")).toHaveText("v2");
      await expect(page.locator(".as-bottombar__path")).toHaveText("plans/alpha.html");
      await expect(page.locator(".as-bottombar__position")).toHaveText("2 / 2");
    });

    test(`UXR-009-B UXR-010-B UXR-011-B UXR-011-F: journey 2, drawer shortcuts, Escape focus return, and non-wrapping stepping (${viewport.label})`, async () => {
      const {page} = fixture;
      await publishPair(fixture, "journey-two");
      await page.goto(`${fixture.server.baseUrl}/review?project=${projectId}`);
      await checkReaderDrawersAndStepping(page, english);
    });

    test(`UXR-004-B CMT-019-B CMT-005-B PRS-004-B DSH-002-B: journey 3, annotate, reply, resolve and dispatch, then the dashboard counts change (${viewport.label})`, async () => {
      const {page} = fixture;
      const published = (await publishNew(fixture.server, fixture.installation, {
        accessSetting: "account_required",
        content: html("Annotated report"),
        idempotencyKey: "journey-three-report",
        name: "Annotated report",
        path: "index.html",
      })).body;
      await connectAgent(fixture, "Journey agent");

      await page.goto(`${fixture.server.baseUrl}/review/dashboard?project=${projectId}`);
      await expect(metric(page, "Open threads")).toHaveText("0");
      await expect(metric(page, "Dispatches")).toHaveText("0");

      await openReview(page, published);
      const reviewFrame = page.frameLocator(".as-artifact-frame");
      const commentsDrawer = page.locator("#review-comments-drawer");
      const annotate = async (selector: string, body: string): Promise<void> => {
        await artifactFrame(page).locator(selector).click();
        const composer = reviewFrame.getByPlaceholder("Add a comment...");
        await expect(composer).toBeVisible();
        await composer.fill(body);
        await reviewFrame.getByRole("button", {name: "Save", exact: true}).click();
        await expect(commentsDrawer.getByRole("article").filter({hasText: body})).toBeVisible();
      };
      await annotate("#first", "The first claim needs a source.");
      // On a phone the open drawer covers most of the preview; close it to reach the next paragraph.
      await commentsDrawer.getByRole("button", {name: "Close comments", exact: true}).click();
      await annotate("#second", "The second claim overstates the result.");

      const first = commentsDrawer.getByRole("article").filter({hasText: "The first claim needs a source."});
      await first.focus();
      await first.getByRole("button", {name: "Reply", exact: true}).click();
      await first.getByRole("textbox", {name: "Reply", exact: true}).fill("Added the citation in the next draft.");
      await first.getByRole("button", {name: "Post reply", exact: true}).click();
      await expect(first).toContainText("Added the citation in the next draft.");
      await first.getByRole("button", {name: "Resolve", exact: true}).click();
      await expect(first).toHaveCount(0);

      const second = commentsDrawer.getByRole("article").filter({hasText: "The second claim overstates the result."});
      await second.focus();
      await second.getByRole("button", {name: "Send to Journey agent", exact: true}).click();
      await expect(page.getByText("Sent 1 thread to Journey agent")).toBeVisible();
      await expect(second).toHaveCount(0);

      // The default listing hides a thread an agent now holds (DSP-004).
      expect((await listThreadsOverApi(fixture, published.artifact.id)).map(({body}) => body))
        .toEqual(["The first claim needs a source."]);
      const threads = await listEveryThread(fixture, published.artifact.id);
      expect(threads.map(({body, replyCount, state}) => ({body, replyCount, state})).toSorted((a, b) => a.body.localeCompare(b.body)))
        .toEqual([
          {body: "The first claim needs a source.", replyCount: 1, state: "resolved"},
          {body: "The second claim overstates the result.", replyCount: 0, state: "open"},
        ].toSorted((a, b) => a.body.localeCompare(b.body)));
      const dispatches = dispatchPageSchema.parse(await (await new ApiClient(fixture.server, fixture.installation.apiToken)
        .listDispatches(projectId)).json());
      expect(dispatches.items.map(({state}) => state)).toEqual(["queued"]);

      await page.goto(`${fixture.server.baseUrl}/review/dashboard?project=${projectId}`);
      await expect(metric(page, "Open threads")).toHaveText("1");
      await expect(metric(page, "Dispatches")).toHaveText("1");
      const review = page.getByRole("region", {name: "Review", exact: true});
      await expect(review).toContainText("1 of 2");
      await expect(review).toContainText("1 open, 1 of them sent to an agent.");
      await expect(review.locator(".as-dispatch-states > div").filter({has: page.locator("dt", {hasText: "Queued"})}).locator("dd"))
        .toHaveText("1");
    });

    test(`UXR-007-B ART-010-B: journey 4, open an older version, compare side by side, and make it current (${viewport.label})`, async () => {
      const {page} = fixture;
      const first = (await publishNew(fixture.server, fixture.installation, {
        accessSetting: "account_required",
        content: html("Version one heading"),
        idempotencyKey: "journey-four-one",
        name: "Versioned report",
      })).body;
      const second = (await publishVersion(fixture.server, fixture.installation, {
        artifactId: first.artifact.id,
        content: html("Version two heading"),
        expectedCurrentVersionId: first.version.id,
        idempotencyKey: "journey-four-two",
      })).body;
      await openReview(page, second);
      await expect(artifactFrame(page).getByRole("heading", {name: "Version two heading"})).toBeVisible();

      await openVersionTab(page, "Versions");
      const drawer = page.locator("#review-version-drawer");
      const firstRow = drawer.locator(".as-version-list li").filter({hasText: "Version 1"});
      await firstRow.locator(".as-version-list__select").click();
      await expect(artifactFrame(page).getByRole("heading", {name: "Version one heading"})).toBeVisible();
      await expect(page.locator(".as-version-trigger__number")).toHaveText("v1");
      expect(new URL(page.url()).searchParams.get("version")).toBe(first.version.id);

      await openVersionTab(page, "Versions");
      await drawer.getByRole("button", {name: "Compare", exact: true}).click();
      await expect(page.getByText("Changed files", {exact: true})).toBeVisible();
      await page.getByRole("button", {name: "Side by side", exact: true}).click();
      await expect(page.getByTitle("Version 1 preview").contentFrame().frameLocator("iframe")
        .getByRole("heading", {name: "Version one heading"})).toBeVisible();
      await expect(page.getByTitle("Version 2 preview").contentFrame().frameLocator("iframe")
        .getByRole("heading", {name: "Version two heading"})).toBeVisible();

      await openVersionTab(page, "Versions");
      await firstRow.getByRole("button", {name: "Make current", exact: true}).click();
      const confirmation = page.getByRole("dialog", {name: "Make Version 1 current?"});
      await confirmation.getByRole("button", {name: "Make current", exact: true}).click();
      await expect(confirmation).toHaveCount(0);
      await expect(firstRow.locator(".as-version-list__state")).toHaveText("current");
      expect(await currentVersionId(fixture, first.artifact.id)).toBe(first.version.id);
    });

    test(`FOV-004-B FLD-003-B FLD-007-B TRS-001-B TRS-002-B: journey 5, Files moves, trashes and recovers while the reader location follows (${viewport.label})`, async () => {
      const {page} = fixture;
      const folderId = await createFolder(fixture, "Journey folder");
      const filed = (await publishNew(fixture.server, fixture.installation, {
        accessSetting: "account_required",
        content: html("Filed body"),
        idempotencyKey: "journey-five-filed",
        name: "Filed report",
      })).body;
      await publishNew(fixture.server, fixture.installation, {
        accessSetting: "account_required",
        content: html("Loose body"),
        idempotencyKey: "journey-five-loose",
        name: "Loose report",
      });

      await openReview(page, filed);
      await expect(await readerLocation(page)).toHaveText("Default");

      await page.goto(`${fixture.server.baseUrl}/review/files`);
      await page.getByRole("checkbox", {name: "Select Filed report"}).click();
      const selection = page.getByRole("toolbar", {name: "Selection actions"});
      await selection.getByRole("button", {name: "Move…"}).click();
      const move = page.getByRole("dialog", {name: "Move 1 file"});
      await move.getByRole("button", {name: /Journey folder/u}).click();
      await move.getByRole("button", {name: "Move here"}).click();
      await expect(move).toBeHidden();
      await expect(page.getByText("Updated 1 file.")).toBeVisible();
      expect(await folderOf(fixture, filed.artifact.id)).toBe(folderId);

      await openReview(page, filed);
      await expect(await readerLocation(page)).toHaveText("Journey folder");

      await page.goto(`${fixture.server.baseUrl}/review/files`);
      await page.getByRole("checkbox", {name: "Select Filed report"}).click();
      await page.getByRole("toolbar", {name: "Selection actions"}).getByRole("button", {name: "Move to Trash"}).click();
      await expect(page.getByText("Moved 1 file to the trash.")).toBeVisible();

      // The reader's catalog for the folder no longer offers the trashed artifact.
      await page.goto(`${fixture.server.baseUrl}/review?project=${projectId}&folder=${folderId}`);
      await expect(page.getByRole("button", {name: "Catalog 0"})).toBeVisible();
      await page.keyboard.press("t");
      const catalog = page.getByRole("complementary", {name: "Artifact catalog"});
      await expect(catalog.getByRole("navigation", {name: "Location"})).toContainText("Journey folder");
      await expect(catalog.getByText("This folder is empty")).toBeVisible();
      await expect(catalog.getByRole("button", {name: /Filed report/u})).toHaveCount(0);

      await page.goto(`${fixture.server.baseUrl}/review/files/trash`);
      const trashed = page.getByRole("row").filter({hasText: "Filed report"});
      await trashed.getByRole("button", {name: "Recover Filed report"}).click();
      await expect(page.getByText("Recovered Filed report.")).toBeVisible();
      expect(await folderOf(fixture, filed.artifact.id)).toBe(folderId);

      await page.goto(`${fixture.server.baseUrl}/review?project=${projectId}&folder=${folderId}`);
      // The recovered artifact is back in its folder, and the reader opens it there.
      await expect(page.getByRole("heading", {level: 1, name: "Filed report"})).toBeVisible();
      await page.keyboard.press("t");
      await expect(catalog.getByRole("navigation", {name: "Location"})).toContainText("Journey folder");
      await expect(catalog.getByRole("button", {name: /Filed report/u})).toBeVisible();
      await expect(await readerLocation(page)).toHaveText("Journey folder");
    });
  });

  test(`LANG-001-B UXR-018-B UXR-010-B UXR-011-B: journey 6, language and theme switches keep the reader checks passing (${viewport.label})`, async ({browser}) => {
    await languageAndThemeJourney(browser, viewport);
  });
}

/*
 * Journey 6 needs the application's own language default, so it uses a plain
 * browser context rather than the English one the other journeys share.
 */
async function languageAndThemeJourney(browser: Browser, viewport: Viewport): Promise<void> {
  const fixture = await startBrowserFixture(browser);
  const context = await browser.newContext({viewport: {height: viewport.height, width: viewport.width}});
  try {
    await publishPair(fixture, "journey-six");
    const page = await context.newPage();
    const root = page.locator("html");
    await page.goto(fixture.server.baseUrl);
    await expect(page).toHaveURL(/\/review\?project=prj_default/u);
    await expect(root).toHaveAttribute("lang", "zh-Hant-TW");
    await expect(root).toHaveAttribute("data-review-theme", "moon");

    await page.getByRole("button", {name: "Switch to English", exact: true}).click();
    await expect(root).toHaveAttribute("lang", "en");
    await page.getByRole("button", {name: "Use light theme", exact: true}).click();
    await expect(root).toHaveAttribute("data-review-theme", "dawn");
    await expect(root).not.toHaveClass(/(?:^|\s)dark(?:\s|$)/u);
    await page.reload();
    await expect(root).toHaveAttribute("lang", "en");
    await expect(root).toHaveAttribute("data-review-theme", "dawn");
    await checkReaderDrawersAndStepping(page, english);

    await page.goto(`${fixture.server.baseUrl}/review?project=${projectId}`);
    await page.getByRole("button", {name: "切換為繁體中文", exact: true}).click();
    await expect(root).toHaveAttribute("lang", "zh-Hant-TW");
    await page.getByRole("button", {name: "使用深色主題", exact: true}).click();
    await expect(root).toHaveAttribute("data-review-theme", "moon");
    await expect(root).toHaveClass(/(?:^|\s)dark(?:\s|$)/u);
    await page.reload();
    await expect(root).toHaveAttribute("lang", "zh-Hant-TW");
    await expect(root).toHaveAttribute("data-review-theme", "moon");
    await checkReaderDrawersAndStepping(page, chinese);
  } finally {
    await context.close();
    await stopBrowserFixture(fixture);
  }
}

for (const viewport of viewports) journeys(viewport);
