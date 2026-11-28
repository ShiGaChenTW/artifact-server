import path from "node:path";

import {afterEach, beforeEach, describe, expect, test} from "vitest";
import {z} from "zod";

import {
  ApiClient,
  dispatchCreationSchema,
  failureSchema,
  issueApiKey,
  MutableClock,
  signInAdministrator,
} from "../support/agent-dispatch.js";
import {publishNew, publishVersion, type PublishResponse} from "../support/publishing.js";
import {
  apiHeaders,
  createTestInstallation,
  removeTestInstallation,
  type RunningTestServer,
  startTestServer,
  type TestInstallation,
} from "../support/runtime-harness.js";
import {SqliteArtifactInsightsStore} from "../../src/storage/sqlite-artifact-insights.js";

/**
 * ARTSV-8: the All-projects summary lists every project of the installation
 * with its own catalog, review, and retained-storage figures.
 */
const projectRowSchema = z.object({
  archived: z.boolean(),
  artifactCount: z.number(),
  failedDispatches: z.number(),
  inProgressDispatches: z.number(),
  latestVersionAt: z.string().nullable(),
  logicalBytes: z.number(),
  name: z.string(),
  openThreads: z.number(),
  projectId: z.string(),
  versionCount: z.number(),
  versionsInWindow: z.number(),
});
const insightsSchema = z.object({
  insights: z.object({
    overview: z.object({
      artifactCount: z.number(),
      projects: z.array(projectRowSchema),
      versionCount: z.number(),
      versionsInWindow: z.number(),
    }).loose(),
    projectId: z.string().nullable(),
    review: z.object({
      dispatches: z.record(z.string(), z.number()),
      openThreads: z.number(),
    }).loose(),
    storage: z.object({
      logicalBytes: z.number(),
      storedBytes: z.number(),
    }).loose(),
    window: z.string(),
  }),
});

type Insights = z.infer<typeof insightsSchema>["insights"];
type ProjectRow = z.infer<typeof projectRowSchema>;

/** Identical bytes published in two projects: stored once, declared twice. */
const sharedContent = "<!doctype html><title>Shared</title><p>same bytes across projects</p>";
const alphaOnlyContent = "<!doctype html><title>Alpha</title><p>alpha only</p>";
const alphaNextContent = "<!doctype html><title>Alpha</title><p>alpha second version</p>";
const trashedContent = "<!doctype html><title>Trashed</title><p>kept bytes</p>";
const twinContent = "<!doctype html><title>Twin</title>";
const archivedContent = "<!doctype html><title>Archived</title>";
const size = (content: string) => new TextEncoder().encode(content).byteLength;

async function requireStatus(response: Response, status: number, operation: string): Promise<void> {
  if (response.status !== status) {
    throw new Error(`${operation} answered ${response.status}: ${await response.text()}`);
  }
}

function row(insights: Insights, projectId: string): ProjectRow {
  const found = insights.overview.projects.find((project) => project.projectId === projectId);
  if (found === undefined) throw new Error(`Project ${projectId} has no row.`);
  return found;
}

describe("dashboard project overview", () => {
  let installation: TestInstallation;
  let server: RunningTestServer;
  let clock: MutableClock;
  let client: ApiClient;
  let alphaId: string;
  let betaId: string;
  let twinOneId: string;
  let twinTwoId: string;
  let emptyId: string;
  let archivedId: string;
  let alphaReport: PublishResponse;
  let alphaNext: PublishResponse;
  let alphaShared: PublishResponse;
  let alphaTrashed: PublishResponse;
  let betaShared: PublishResponse;

  beforeEach(async () => {
    installation = await createTestInstallation();
    clock = new MutableClock("2026-03-01T10:00:00.000Z");
    server = await startTestServer(installation, {clock});
    client = new ApiClient(server, installation.apiToken);
    alphaId = await client.createProject("Alpha", "dsh-overview-alpha");
    betaId = await client.createProject("Beta", "dsh-overview-beta");
    twinOneId = await client.createProject("Twin", "dsh-overview-twin-one");
    twinTwoId = await client.createProject("Twin", "dsh-overview-twin-two");
    emptyId = await client.createProject("Empty", "dsh-overview-empty");
    archivedId = await client.createProject("Archived", "dsh-overview-archived");

    // Forty days before "now": outside the default thirty-day window.
    alphaReport = (await publishNew(server, installation, {
      accessSetting: "account_required",
      content: alphaOnlyContent,
      idempotencyKey: "dsh-overview-alpha-report",
      name: "Alpha report",
      projectId: alphaId,
    })).body;
    clock.advance(40 * 86_400_000);

    alphaNext = await step(async () => (await publishVersion(server, installation, {
      artifactId: alphaReport.artifact.id,
      content: alphaNextContent,
      expectedCurrentVersionId: alphaReport.version.id,
      idempotencyKey: "dsh-overview-alpha-next",
      projectId: alphaId,
    })).body);
    alphaShared = await step(async () => (await publishNew(server, installation, {
      accessSetting: "account_required",
      content: sharedContent,
      idempotencyKey: "dsh-overview-alpha-shared",
      name: "Shared in Alpha",
      projectId: alphaId,
    })).body);
    betaShared = await step(async () => (await publishNew(server, installation, {
      accessSetting: "account_required",
      content: sharedContent,
      idempotencyKey: "dsh-overview-beta-shared",
      name: "Shared in Beta",
      projectId: betaId,
    })).body);
    alphaTrashed = await step(async () => (await publishNew(server, installation, {
      accessSetting: "account_required",
      content: trashedContent,
      idempotencyKey: "dsh-overview-alpha-trashed",
      name: "Trashed report",
      projectId: alphaId,
    })).body);
    await step(async () => (await publishNew(server, installation, {
      accessSetting: "account_required",
      content: twinContent,
      idempotencyKey: "dsh-overview-twin-one",
      name: "Twin one report",
      projectId: twinOneId,
    })).body);
    await step(async () => (await publishNew(server, installation, {
      accessSetting: "account_required",
      content: archivedContent,
      idempotencyKey: "dsh-overview-archived",
      name: "Archived report",
      projectId: archivedId,
    })).body);

    // Review work: an open thread on a trashed artifact must not count once
    // the artifact is deleted; a queued and a failed dispatch in Alpha.
    await step(() => client.openThread(alphaShared, "Open in Alpha.", "dsh-overview-thread-alpha"));
    const queuedThread = await step(() =>
      client.openThread(alphaShared, "Queued in Alpha.", "dsh-overview-thread-queued")
    );
    const failedThread = await step(() =>
      client.openThread(alphaShared, "Failed in Alpha.", "dsh-overview-thread-failed")
    );
    await step(() => client.openThread(alphaTrashed, "On a trashed artifact.", "dsh-overview-thread-trashed"));
    await step(() => client.openThread(betaShared, "Open in Beta.", "dsh-overview-thread-beta"));
    const agent = await step(() => client.registerAgent({
      connectionKey: "dsh-overview-agent",
      displayName: "overview agent",
      workingDirectory: "/work/overview",
    }));
    const failing = await step(async () => {
      const sent = await client.sendDispatch({
        agentId: agent.id,
        idempotencyKey: "dsh-overview-dispatch-failed",
        projectId: alphaId,
        threadIds: [failedThread.id],
      });
      await requireStatus(sent, 201, "Dispatching the failing thread");
      return dispatchCreationSchema.parse(await sent.json()).dispatch;
    });
    await step(async () => {
      await requireStatus(await client.claim(agent.id), 200, "Claiming the dispatch");
      await requireStatus(
        await client.reportFailed(failing.id, agent.id, "Agent crashed"),
        200,
        "Reporting the dispatch failed",
      );
    });
    await step(async () => requireStatus(
      await client.sendDispatch({
        agentId: agent.id,
        idempotencyKey: "dsh-overview-dispatch-queued",
        projectId: alphaId,
        threadIds: [queuedThread.id],
      }),
      201,
      "Dispatching the queued thread",
    ));

    await step(() => trash(alphaTrashed));
    await step(async () => requireStatus(
      await client.fetch(`/api/v1/projects/${archivedId}/archive`, {method: "POST"}),
      200,
      "Archiving a project",
    ));
  });

  afterEach(async () => {
    await server.stop();
    await removeTestInstallation(installation);
  });

  async function step<T>(operation: () => Promise<T>): Promise<T> {
    clock.advance(1_000);
    return operation();
  }

  async function trash(published: PublishResponse): Promise<void> {
    const deleted = await fetch(
      `${server.baseUrl}/api/v1/artifacts/${published.artifact.id}?projectId=${published.artifact.projectId}`,
      {
        body: JSON.stringify({expectedCurrentVersionId: published.version.id}),
        headers: apiHeaders(installation, `dsh-overview-trash-${published.artifact.id}`),
        method: "DELETE",
      },
    );
    await requireStatus(deleted, 200, "Trashing an artifact");
  }

  async function readInsights(query: string, reader: ApiClient = client): Promise<Insights> {
    const response = await reader.fetch(`/api/v1/insights${query}`);
    expect(response.status).toBe(200);
    return insightsSchema.parse(await response.json()).insights;
  }

  test("DSH-006-B: the All-projects summary gives each project its own catalog, review, and retained-storage figures", async () => {
    expect.hasAssertions();
    const all = await readInsights("");
    expect(all.projectId).toBeNull();
    // Every project of the installation, empty and archived included.
    expect(all.overview.projects.map((project) => project.projectId).toSorted()).toEqual([
      "prj_default", alphaId, betaId, twinOneId, twinTwoId, emptyId, archivedId,
    ].toSorted());

    expect(row(all, alphaId)).toEqual({
      archived: false,
      artifactCount: 2,
      failedDispatches: 1,
      inProgressDispatches: 1,
      latestVersionAt: alphaShared.version.createdAt,
      // Retained bytes keep the trashed artifact's version.
      logicalBytes: size(alphaOnlyContent) + size(alphaNextContent) + size(sharedContent) +
        size(trashedContent),
      name: "Alpha",
      openThreads: 3,
      projectId: alphaId,
      versionCount: 3,
      // The first version was published before the thirty-day window opened.
      versionsInWindow: 2,
    });
    expect(row(all, alphaId).latestVersionAt).not.toBe(alphaNext.version.createdAt);
    expect(row(all, betaId)).toMatchObject({
      artifactCount: 1,
      failedDispatches: 0,
      inProgressDispatches: 0,
      logicalBytes: size(sharedContent),
      openThreads: 1,
      versionCount: 1,
    });

    // Same-name projects stay two rows with their own figures.
    const twins = all.overview.projects.filter((project) => project.name === "Twin");
    expect(new Map(twins.map((project) => [project.projectId, project.artifactCount]))).toEqual(new Map([
      [twinOneId, 1],
      [twinTwoId, 0],
    ]));

    expect(row(all, emptyId)).toEqual({
      archived: false,
      artifactCount: 0,
      failedDispatches: 0,
      inProgressDispatches: 0,
      latestVersionAt: null,
      logicalBytes: 0,
      name: "Empty",
      openThreads: 0,
      projectId: emptyId,
      versionCount: 0,
      versionsInWindow: 0,
    });
    expect(row(all, archivedId)).toMatchObject({archived: true, artifactCount: 1, versionCount: 1});

    // Each row equals that project's own summary for the same window.
    const singles = await Promise.all(all.overview.projects.map(async (project) => ({
      project,
      single: await readInsights(`?projectId=${project.projectId}`),
    })));
    for (const {project, single} of singles) {
      expect(single.overview.projects).toEqual([project]);
      expect(project.artifactCount).toBe(single.overview.artifactCount);
      expect(project.versionCount).toBe(single.overview.versionCount);
      expect(project.versionsInWindow).toBe(single.overview.versionsInWindow);
      expect(project.openThreads).toBe(single.review.openThreads);
      expect(project.inProgressDispatches).toBe(
        (single.review.dispatches["queued"] ?? 0) + (single.review.dispatches["claimed"] ?? 0) +
          (single.review.dispatches["delivered"] ?? 0),
      );
      expect(project.failedDispatches).toBe(single.review.dispatches["failed"]);
      expect(project.logicalBytes).toBe(single.storage.logicalBytes);
    }

    // Declared bytes add up across projects; deduplicated stored bytes are an
    // installation figure and are smaller than that sum when content is shared.
    const declared = all.overview.projects.reduce((total, project) => total + project.logicalBytes, 0);
    expect(declared).toBe(all.storage.logicalBytes);
    expect(all.storage.storedBytes).toBe(declared - size(sharedContent));
    expect(all.overview.versionsInWindow)
      .toBe(all.overview.projects.reduce((total, project) => total + project.versionsInWindow, 0));
  });

  test("DSH-006-F: windows, deletion, and purge move only the figures their rule allows", async () => {
    expect.hasAssertions();
    // Thirty-one days later every current total holds but in-window counts empty.
    clock.advance(31 * 86_400_000);
    const later = await readInsights("");
    expect(row(later, alphaId)).toMatchObject({
      artifactCount: 2,
      failedDispatches: 1,
      inProgressDispatches: 1,
      openThreads: 3,
      versionCount: 3,
      versionsInWindow: 0,
    });
    const everything = await readInsights("?window=all");
    expect(row(everything, alphaId).versionsInWindow).toBe(3);

    // Purge ends recoverability but reclaims no bytes (file-management-spec
    // section 9.4), so retained bytes hold; trashing a shared artifact keeps
    // its bytes too, while catalog and review figures drop it.
    const cookies = await signInAdministrator(server, installation);
    const purge = await fetch(
      `${server.baseUrl}/api/v1/artifacts/${alphaTrashed.artifact.id}/purge?projectId=${alphaId}`,
      {
        body: JSON.stringify({confirm: "Trashed report"}),
        headers: new Headers({
          "Content-Type": "application/json",
          Cookie: cookies.header,
          "Idempotency-Key": "dsh-overview-purge",
          Origin: server.baseUrl,
          "Sec-Fetch-Mode": "cors",
          "Sec-Fetch-Site": "same-origin",
          "X-CSRF-Token": cookies.csrf,
        }),
        method: "POST",
      },
    );
    await requireStatus(purge, 200, "Purging the trashed artifact");
    await trash(betaShared);
    const afterPurge = await readInsights("");
    expect(row(afterPurge, alphaId)).toMatchObject({
      artifactCount: 2,
      logicalBytes: size(alphaOnlyContent) + size(alphaNextContent) + size(sharedContent) +
        size(trashedContent),
      openThreads: 3,
    });
    expect(row(afterPurge, betaId)).toMatchObject({
      artifactCount: 0,
      latestVersionAt: null,
      logicalBytes: size(sharedContent),
      openThreads: 0,
      versionCount: 0,
    });
    // Browsing the summary moved and rewrote nothing.
    const kept = await client.fetch(`/api/v1/artifacts/${alphaShared.artifact.id}?projectId=${alphaId}`);
    expect(kept.status).toBe(200);
    expect(JSON.stringify(await kept.json())).toContain(alphaShared.version.id);
  });

  test("DSH-007-B: members and artifact readers read the rows of their own installation", async () => {
    expect.hasAssertions();
    const cookies = await signInAdministrator(server, installation);
    const browser = await fetch(`${server.baseUrl}/api/v1/insights`, {
      headers: new Headers({
        Cookie: cookies.header,
        Origin: server.baseUrl,
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
      }),
    });
    expect(browser.status).toBe(200);
    const fromBrowser = insightsSchema.parse(await browser.json()).insights;
    const reader = new ApiClient(server, await issueApiKey(server, cookies, ["artifact:read"], "overview reader"));
    const fromKey = await readInsights("", reader);
    expect(fromKey.overview.projects).toEqual(fromBrowser.overview.projects);
    expect(fromKey.overview.projects).toHaveLength(7);
  });

  test("DSH-007-F: another installation's projects are never listed, drilled into, or counted", async () => {
    expect.hasAssertions();
    const other = await createTestInstallation();
    const otherServer = await startTestServer(other);
    try {
      const otherClient = new ApiClient(otherServer, other.apiToken);
      const foreignId = await otherClient.createProject("Alpha", "dsh-overview-foreign-alpha");
      await publishNew(otherServer, other, {
        accessSetting: "account_required",
        content: sharedContent,
        idempotencyKey: "dsh-overview-foreign-publish",
        name: "Foreign report",
        projectId: foreignId,
      });

      const mine = await readInsights("");
      expect(mine.overview.projects.map((project) => project.projectId)).not.toContain(foreignId);
      expect(mine.overview.projects.filter((project) => project.name === "Alpha")).toHaveLength(1);
      expect(mine.storage.logicalBytes)
        .toBe(mine.overview.projects.reduce((total, project) => total + project.logicalBytes, 0));

      // Drilling into a foreign or unknown project is refused the same way.
      const refusals = await Promise.all([foreignId, "project_00000000-0000-4000-8000-00000000ffff"]
        .map(async (projectId) => {
          const response = await client.fetch(`/api/v1/insights?projectId=${projectId}`);
          return {code: failureSchema.parse(await response.json()).error.code, status: response.status};
        }));
      expect(refusals).toEqual([
        {code: "PROJECT_NOT_FOUND", status: 404},
        {code: "PROJECT_NOT_FOUND", status: 404},
      ]);

      // The persistence adapter itself filters by installation: a store bound
      // to another installation over this very database reads nothing.
      const foreignStore = new SqliteArtifactInsightsStore(
        path.join(installation.dataDirectory, "artifact-server.db"),
        "another-installation",
      );
      try {
        const facts = await foreignStore.readInsights({listLimit: 10, projectId: null, since: null});
        expect(facts.overview.projects).toEqual([]);
        expect(facts.storage.logicalBytes).toBe(0);
        expect(facts.review.openThreads).toBe(0);
        const scoped = await foreignStore.readInsights({listLimit: 10, projectId: alphaId, since: null});
        expect(scoped.overview.projects).toEqual([]);
      } finally {
        foreignStore.close();
      }

      // A key without listing authority cannot read the rows at all.
      const cookies = await signInAdministrator(server, installation);
      const agentOnly = new ApiClient(server, await issueApiKey(server, cookies, ["agent:connect"], "agent only"));
      const denied = await agentOnly.fetch("/api/v1/insights");
      expect(denied.status).toBe(403);
      expect(failureSchema.parse(await denied.json()).error.code).toBe("AUTHORIZATION_DENIED");
      expect((await fetch(`${server.baseUrl}/api/v1/insights`)).status).toBe(401);
    } finally {
      await otherServer.stop();
      await removeTestInstallation(other);
    }
  });
});
