import {expect, test} from "@playwright/test";

import {ApiClient, dispatchCreationSchema, dispatchEnvelopeSchema, issueApiKey, signInAdministrator} from "../support/agent-dispatch.js";
import {publishNew} from "../support/publishing.js";
import {type BrowserFixture, localLogin, startBrowserFixture, stopBrowserFixture} from "./browser-fixture.js";
import {createThreadOverApi} from "./comment-api.js";

test.describe("Board comment workflow", () => {
  let fixture: BrowserFixture;
  test.beforeEach(async ({browser}) => {
    fixture = await startBrowserFixture(browser);
    await fixture.page.setViewportSize({width: 1600, height: 1000});
    await fixture.context.addInitScript(() => {
      if (window.top === window) localStorage.setItem("artifact-review-board", "board");
    });
    await localLogin(fixture);
  });
  test.afterEach(async () => {await stopBrowserFixture(fixture);});

  test("UXR-016-B: board filters preserve dispatched conversations and gates only unsent open threads", async () => {
    const published = (await publishNew(fixture.server, fixture.installation, {
      accessSetting: "account_required",
      content: "<!doctype html><title>Board workflow</title><h1>Board workflow</h1>",
      idempotencyKey: "board-workflow-publish",
      name: "Board workflow",
    })).body;
    const owner = new ApiClient(fixture.server, fixture.installation.apiToken);
    const cookies = await signInAdministrator(fixture.server, fixture.installation);
    const key = await issueApiKey(fixture.server, cookies, ["agent:connect"], "Board reviewer");
    const worker = new ApiClient(fixture.server, key);
    const registered = await worker.registerAgent({
      agentSessionId: "board-comments-agent", connectionKey: "board-comments-agent",
      displayName: "Board reviewer", workingDirectory: "/board",
    });
    const seed = async (body: string) => createThreadOverApi(fixture, {
      artifactId: published.artifact.id, versionId: published.version.id,
      body, idempotencyKey: `board-thread-${body}`,
    });
    const awaiting = await seed("Awaiting confirmation");
    const sentResponse = await owner.sendDispatch({
      agentId: registered.id, projectId: published.artifact.projectId,
      threadIds: [awaiting.id], idempotencyKey: "board-awaiting-send",
    });
    const sent = dispatchCreationSchema.parse(await sentResponse.json());
    expect((await worker.claim(registered.id)).ok).toBe(true);
    expect((await worker.reportDelivered(sent.dispatch.id, registered.id)).ok).toBe(true);
    expect((await owner.setThreadState(published, awaiting.id, "resolved")).ok).toBe(true);
    const settled = dispatchEnvelopeSchema.parse(await (await owner.getDispatch(sent.dispatch.id, published.artifact.projectId)).json());
    expect(settled.dispatch.state).toBe("addressed");
    expect((await owner.setThreadState(published, awaiting.id, "open")).ok).toBe(true);
    await seed("Fresh feedback");
    const reviewUrl = new URL(published.links.review);
    reviewUrl.searchParams.delete("view");
    await fixture.page.goto(reviewUrl.href);
    const inspector = fixture.page.locator('.as-comments[data-board-mode="true"]');
    await expect(inspector).toBeVisible();
    await expect(inspector.locator(".as-comments__filters button")).toHaveCount(4);
    await inspector.getByRole("button", {name: "Awaiting you (1)", exact: true}).click();
    await expect(inspector.locator(".as-comment-card")).toHaveCount(1);
    await expect(inspector.locator(".as-comment-card")).toContainText("Awaiting confirmation");
    const awaitingCard = inspector.locator(".as-comment-card");
    await awaitingCard.press("Enter");
    await expect(awaitingCard).toHaveAttribute("aria-current", "true");
    await awaitingCard.getByRole("button", {name: "Reply", exact: true}).click();
    await awaitingCard.getByRole("textbox", {name: "Reply", exact: true}).fill("Please verify the revision");
    await awaitingCard.getByRole("button", {name: "Post reply", exact: true}).click();
    await expect(awaitingCard).toContainText("Please verify the revision");
    await inspector.getByRole("button", {name: "All", exact: true}).click();
    const gate = inspector.locator(".as-comments__board-gate");
    // Addressed work is released by the existing service and can be sent again.
    await expect(gate.getByRole("status").last()).toHaveText("2 ready to send · 2 open · 1 awaiting you");
    await gate.getByRole("button", {name: "Send to Board reviewer", exact: true}).click();
    await expect(gate.getByRole("status").last()).toHaveText("0 ready to send · 2 open · 0 awaiting you");
    await expect(inspector.locator(".as-comment-card")).toHaveCount(2);
    await expect(gate.getByRole("button", {name: "Send to Board reviewer", exact: true})).toBeDisabled();
    await expect(gate.getByRole("button", {name: "Resolve all open threads"})).toBeEnabled();
    await gate.getByRole("button", {name: "Resolve all open threads"}).click();
    await expect(gate.getByRole("status").last()).toHaveText("0 ready to send · 0 open · 0 awaiting you");
    await expect(gate.getByRole("button", {name: "Resolve all open threads"})).toBeDisabled();
    const dispatch = dispatchEnvelopeSchema.parse(await (await owner.getDispatch(sent.dispatch.id, published.artifact.projectId)).json());
    expect(dispatch.dispatch.state).toBe("addressed");
  });

  test("UXR-016-F: bulk resolution stops on an HTTP failure and preserves its error", async () => {
    const published = (await publishNew(fixture.server, fixture.installation, {
      accessSetting: "account_required", content: "<!doctype html><h1>Recovery</h1>", idempotencyKey: "resolve-recovery-publish", name: "Resolve recovery",
    })).body;
    await createThreadOverApi(fixture, {artifactId: published.artifact.id, versionId: published.version.id, body: "First review", idempotencyKey: "resolve-recovery-first"});
    await createThreadOverApi(fixture, {artifactId: published.artifact.id, versionId: published.version.id, body: "Second review", idempotencyKey: "resolve-recovery-second"});
    const url = new URL(published.links.review); url.searchParams.delete("view");
    await fixture.page.goto(url.href);
    let attempts = 0;
    await fixture.page.route("**/comments/*?*", async (route) => {
      if (route.request().method() !== "PATCH") {await route.continue(); return;}
      attempts += 1;
      if (attempts === 1) await route.fulfill({status: 503, contentType: "application/json", body: JSON.stringify({error: {code: "injected_failure", message: "Injected resolve failure"}})});
      else await route.continue();
    });
    const inspector = fixture.page.locator('.as-comments[data-board-mode="true"]');
    const gate = inspector.locator(".as-comments__board-gate");
    await expect(gate.getByRole("status").last()).toHaveText("2 ready to send · 2 open · 0 awaiting you");
    await gate.getByRole("button", {name: "Resolve all open threads"}).click();
    await expect(inspector.getByRole("alert")).toContainText("Injected resolve failure");
    expect(attempts).toBe(1);
    await expect(gate.getByRole("status").last()).toHaveText("2 ready to send · 2 open · 0 awaiting you");
  });

  test("UXR-016-F: disconnected agents leave send disabled while empty resolve explains its count", async () => {
    const published = (await publishNew(fixture.server, fixture.installation, {
      accessSetting: "account_required", content: "<!doctype html><title>Empty board</title><h1>Empty board</h1>",
      idempotencyKey: "empty-board-publish", name: "Empty board",
    })).body;
    const reviewUrl = new URL(published.links.review);
    reviewUrl.searchParams.delete("view");
    await fixture.page.goto(reviewUrl.href);
    const gate = fixture.page.locator('.as-comments[data-board-mode="true"] .as-comments__board-gate');
    await expect(gate).toBeVisible();
    await expect(gate.getByRole("button", {name: "Send to agent", exact: true})).toBeDisabled();
    await expect(gate.getByRole("button", {name: "Resolve all open threads"})).toBeDisabled();
    await expect(gate.getByRole("status").last()).toHaveText("0 ready to send · 0 open · 0 awaiting you");
    await expect(gate.getByRole("link", {name: "Connect an agent"})).toHaveAttribute("href", "/review/settings/mcp");
  });
});
