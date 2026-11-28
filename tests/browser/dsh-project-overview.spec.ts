import {AxeBuilder} from "@axe-core/playwright";
import {expect, test, type Page} from "@playwright/test";

import {ApiClient} from "../support/agent-dispatch.js";
import {publishNew} from "../support/publishing.js";
import {
  type BrowserFixture,
  localLogin,
  startBrowserFixture,
  stopBrowserFixture,
} from "./browser-fixture.js";

/** Project ids created by `seed`, by role. */
interface SeededProjects {
  readonly alpha: string;
  readonly archived: string;
  readonly beta: string;
  readonly empty: string;
  readonly twinOne: string;
  readonly twinTwo: string;
}

/** Two projects with artifacts, a same-name pair, an empty and an archived project. */
async function seed(fixture: BrowserFixture): Promise<SeededProjects> {
  const client = new ApiClient(fixture.server, fixture.installation.apiToken);
  const alpha = await client.createProject("Alpha", "dsh-browser-alpha");
  const beta = await client.createProject("Beta", "dsh-browser-beta");
  const twinOne = await client.createProject("Twin", "dsh-browser-twin-one");
  const twinTwo = await client.createProject("Twin", "dsh-browser-twin-two");
  const empty = await client.createProject("Empty", "dsh-browser-empty");
  const archived = await client.createProject("Archived", "dsh-browser-archived");
  const publish = async (projectId: string, name: string) =>
    (await publishNew(fixture.server, fixture.installation, {
      accessSetting: "account_required",
      content: `<!doctype html><title>${name}</title><h1>${name}</h1>`,
      idempotencyKey: `dsh-browser-publish-${name.replaceAll(" ", "-")}`,
      name,
      projectId,
    })).body;
  const alphaReport = await publish(alpha, "Alpha report");
  await publish(alpha, "Alpha notes");
  await publish(beta, "Beta report");
  await publish(twinOne, "Twin report");
  await publish(archived, "Archived report");
  await client.openThread(alphaReport, "Please check the figures.", "dsh-browser-thread-alpha");
  const archive = await client.fetch(`/api/v1/projects/${archived}/archive`, {method: "POST"});
  expect(archive.status).toBe(200);
  return {alpha, archived, beta, empty, twinOne, twinTwo};
}

function projectsRegion(target: Page, name: string) {
  return target.getByRole("region", {name});
}

function projectRow(target: Page, projectId: string) {
  return target.locator(`tr[data-project-id="${projectId}"]`);
}

async function openOverview(target: Page, label: string): Promise<void> {
  await target.getByRole("tab", {name: label}).click();
}

async function expectNoPageScroll(target: Page): Promise<void> {
  expect(await target.evaluate(() => {
    const scroller = document.querySelector(".as-page__scroll");
    return document.documentElement.scrollWidth <= window.innerWidth &&
      (scroller === null || scroller.scrollWidth <= scroller.clientWidth);
  })).toBe(true);
}

test.describe("DSH dashboard project overview", () => {
  let fixture: BrowserFixture;
  let projects: SeededProjects;

  test.beforeEach(async ({browser}) => {
    fixture = await startBrowserFixture(browser);
    projects = await seed(fixture);
    await localLogin(fixture);
  });

  test.afterEach(async () => {
    await stopBrowserFixture(fixture);
  });

  test("DSH-008-B: every project is listed with its figures, and its links keep the scope and window across a refresh", async () => {
    const target = fixture.page;
    await target.goto(`${fixture.server.baseUrl}/review/dashboard?window=7d`);
    await openOverview(target, "Overview");
    const region = projectsRegion(target, "Projects");
    await expect(region).toBeVisible();
    await expect(region.getByText("only “in 7 days” counts versions published inside the selected window")).toBeVisible();
    await expect(region.getByText(/Stored after deduplication across this whole installation/u)).toBeVisible();
    await expect(region.locator("tbody tr")).toHaveCount(7);

    const alpha = projectRow(target, projects.alpha);
    await expect(alpha.getByRole("rowheader")).toHaveText("Alpha");
    await expect(alpha.getByRole("cell")).toHaveText([
      "DashboardFiles", "2", "22 in 7 days", /now|ago/u, "1", "0", "0", /B$/u,
    ]);
    await expect(projectRow(target, projects.empty).getByRole("rowheader")).toHaveText("EmptyEmpty");
    await expect(projectRow(target, projects.empty).getByRole("cell").nth(3)).toHaveText("None yet");
    await expect(projectRow(target, projects.archived).getByRole("rowheader")).toContainText("Archived");
    await expect(projectRow(target, projects.archived).locator(".as-project-table__mark")).toHaveText("Archived");
    // Same-name projects stay two rows, told apart by their IDs.
    await expect(projectRow(target, projects.twinOne).getByRole("rowheader")).toContainText(`ID ${projects.twinOne}`);
    await expect(projectRow(target, projects.twinTwo).getByRole("rowheader")).toContainText(`ID ${projects.twinTwo}`);

    // Light and dark themes both pass the accessibility rules.
    const axe = () => new AxeBuilder({page: target}).include("section[aria-labelledby='dashboard-projects-title']")
      .withTags(["wcag2a", "wcag2aa"]).analyze();
    expect((await axe()).violations).toEqual([]);
    await target.getByRole("button", {name: "Use light theme"}).click();
    // Theme colors transition; read contrast once they have settled.
    await target.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== "running"));
    expect((await axe()).violations).toEqual([]);

    // The drill-down links are reachable by keyboard alone.
    await target.getByRole("tab", {name: "Overview"}).focus();
    const dashboardLink = target.getByRole("link", {name: "Alpha dashboard"});
    let reached = false;
    for (let presses = 0; presses < 40 && !reached; presses += 1) {
      // Tabbing is sequential by nature: each press depends on the previous focus.
      // eslint-disable-next-line no-await-in-loop
      await target.keyboard.press("Tab");
      // eslint-disable-next-line no-await-in-loop
      reached = await dashboardLink.evaluate((element) => element === document.activeElement);
    }
    expect(reached).toBe(true);
    await target.keyboard.press("Enter");
    await expect(target).toHaveURL(`${fixture.server.baseUrl}/review/dashboard?project=${projects.alpha}&window=7d`);
    const assertAlphaScope = async () => {
      await expect(target.getByRole("combobox", {name: "Project"})).toHaveValue(projects.alpha);
      await expect(target.getByRole("button", {name: "7 days"})).toHaveAttribute("aria-pressed", "true");
      const recent = target.getByRole("region", {name: "Recent artifacts"}).getByRole("link");
      await expect(recent).toHaveCount(2);
      await expect(recent.filter({hasText: "Beta report"})).toHaveCount(0);
    };
    await assertAlphaScope();
    await target.reload();
    await expect(target).toHaveURL(`${fixture.server.baseUrl}/review/dashboard?project=${projects.alpha}&window=7d`);
    await assertAlphaScope();
    // A single project's dashboard has no cross-project table.
    await openOverview(target, "Overview");
    await expect(projectsRegion(target, "Projects")).toHaveCount(0);

    // The Files link opens only that project's artifacts, and a refresh keeps it.
    await target.goto(`${fixture.server.baseUrl}/review/dashboard`);
    await openOverview(target, "Overview");
    await target.getByRole("link", {name: "Beta files"}).click();
    await expect(target).toHaveURL(`${fixture.server.baseUrl}/review/files?project=${projects.beta}`);
    const fileRows = target.getByRole("table").getByRole("row").filter({has: target.getByRole("cell")});
    await expect(fileRows.filter({hasText: "Beta report"})).toHaveCount(1);
    await target.reload();
    await expect(fileRows.filter({hasText: "Beta report"})).toHaveCount(1);
    await expect(fileRows.filter({hasText: "Alpha"})).toHaveCount(0);
  });

  test("DSH-008-B: the project table reads in Traditional Chinese and fits a 390-pixel screen", async ({browser}) => {
    const context = await browser.newContext({viewport: {height: 844, width: 390}});
    try {
      const target = await context.newPage();
      await target.goto(fixture.server.baseUrl);
      await expect(target).toHaveURL(/\/review\?project=prj_default/u);
      await target.goto(`${fixture.server.baseUrl}/review/dashboard`);
      await expect(target.locator("html")).toHaveAttribute("lang", "zh-Hant-TW");
      await openOverview(target, "概況");
      const region = projectsRegion(target, "專案");
      await expect(region).toBeVisible();
      await expect(region.getByRole("columnheader", {name: "未解決留言串"})).toBeAttached();
      await expect(region.getByText("只有「30 天內」計算所選時間窗內發布的版本", {exact: false})).toBeVisible();
      await expect(region.getByText(/整台伺服器去重後實際儲存/u)).toBeVisible();
      await expect(projectRow(target, projects.empty).locator(".as-project-table__mark")).toHaveText("空專案");
      await expectNoPageScroll(target);
      const link = target.getByRole("link", {name: "Alpha 的儀表板"});
      await link.focus();
      await expect(link).toBeFocused();
      await expect(link).toBeInViewport();
      await expectNoPageScroll(target);
      await target.keyboard.press("Enter");
      await expect(target).toHaveURL(`${fixture.server.baseUrl}/review/dashboard?project=${projects.alpha}`);
      await expect(target.getByRole("combobox", {name: "專案"})).toHaveValue(projects.alpha);
      await expectNoPageScroll(target);
    } finally {
      await context.close();
    }
  });

  test("DSH-008-F: loading, failure, an unknown project, and an empty installation never read as zeros", async () => {
    const target = fixture.page;
    // While the summary loads, the page is busy and shows no figures.
    const {promise: held, resolve: release} = Promise.withResolvers<void>();
    await target.route("**/api/v1/insights?*", async (route) => {
      await held;
      await route.continue();
    });
    await target.goto(`${fixture.server.baseUrl}/review/dashboard`);
    await expect(target.getByLabel("Loading dashboard")).toHaveAttribute("aria-busy", "true");
    await expect(target.locator("tr[data-project-id]")).toHaveCount(0);
    release();
    await openOverview(target, "Overview");
    await expect(projectRow(target, projects.alpha)).toBeVisible();
    await target.unrouteAll({behavior: "wait"});

    // A failed read is an error with a retry, not a table of zeros.
    await target.route("**/api/v1/insights?*", (route) => route.fulfill({
      json: {error: {code: "INTERNAL_ERROR", message: "Insights failed."}},
      status: 500,
    }));
    await target.reload();
    await expect(target.getByRole("button", {name: "Try again"})).toBeVisible();
    await expect(target.locator("tr[data-project-id]")).toHaveCount(0);
    await target.unrouteAll({behavior: "wait"});

    // A drill-down to a project this installation does not have says so.
    await target.goto(`${fixture.server.baseUrl}/review/dashboard?project=prj_00000000-0000-4000-8000-00000000ffff&window=7d`);
    await expect(target.getByText("Project not found")).toBeVisible();
    await expect(target.locator("tr[data-project-id]")).toHaveCount(0);

    // An installation without projects has its own state, distinct from an empty project.
    await target.route("**/api/v1/insights?*", async (route) => {
      const response = await route.fetch();
      const body: {insights: {overview: {projects: unknown[]}}} = await response.json();
      body.insights.overview.projects = [];
      await route.fulfill({json: body, response});
    });
    await target.goto(`${fixture.server.baseUrl}/review/dashboard`);
    await openOverview(target, "Overview");
    await expect(projectsRegion(target, "Projects").getByText("This installation has no projects yet.")).toBeVisible();
    await expect(target.locator("tr[data-project-id]")).toHaveCount(0);
  });
});
