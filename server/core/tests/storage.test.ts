/**
 * Core 测试：storage + run-queue + provider registry
 *
 * 运行: npm test
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { initDb, closeDb } from "../db.js";
import {
  createProject, getProject, listProjects, updateProject,
  createRun, getRun, listRuns, updateRunStatus,
  createArtifact, listArtifacts, setArtifactStatus,
  addRunEvent, getRunEvents,
  RevisionConflict,
} from "../storage.js";
import { getProviderRegistry } from "../providers/registry.js";
import { getRunQueue } from "../run-queue.js";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

let tempDir: string;

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), "rv-test-"));
  await initDb(join(tempDir, "test.db"));
});

afterEach(() => {
  closeDb();
  rmSync(tempDir, { recursive: true, force: true });
});

// ════════════════════════════════════════════════════════
// Project CRUD
// ════════════════════════════════════════════════════════

describe("Project Storage", () => {
  it("should create and get a project", () => {
    const project = createProject({
      name: "Test Video",
      srtPath: "/tmp/test.srt",
      projectRoot: "/tmp/project",
    });
    assert.ok(project.id);
    assert.equal(project.name, "Test Video");
    assert.equal(project.status, "active");
    assert.equal(project.revision, 1);

    const fetched = getProject(project.id);
    assert.deepEqual(fetched, project);
  });

  it("should list projects", () => {
    createProject({ name: "A", srtPath: "/a.srt", projectRoot: "/a" });
    createProject({ name: "B", srtPath: "/b.srt", projectRoot: "/b" });
    const list = listProjects();
    assert.equal(list.length, 2);
  });

  it("should update with revision increment", () => {
    const project = createProject({ name: "Original", srtPath: "/t.srt", projectRoot: "/t" });
    const updated = updateProject(project.id, { name: "Renamed" });
    assert.equal(updated!.name, "Renamed");
    assert.equal(updated!.revision, 2);
  });

  it("should reject update with wrong revision", () => {
    const project = createProject({ name: "Test", srtPath: "/t.srt", projectRoot: "/t" });
    assert.throws(
      () => updateProject(project.id, { name: "Hack" }, 999),
      RevisionConflict,
    );
  });

  it("should archive a project", () => {
    const project = createProject({ name: "Test", srtPath: "/t.srt", projectRoot: "/t" });
    const archived = updateProject(project.id, { status: "archived" });
    assert.equal(archived!.status, "archived");
  });
});

// ════════════════════════════════════════════════════════
// Run CRUD
// ════════════════════════════════════════════════════════

describe("Run Storage", () => {
  it("should create a queued run", () => {
    const project = createProject({ name: "T", srtPath: "/t.srt", projectRoot: "/t" });
    const run = createRun(project.id, "render", { scale: 2 });
    assert.equal(run.status, "queued");
    assert.equal(run.type, "render");
    assert.ok(run.id);
  });

  it("should update run status to running then completed", () => {
    const project = createProject({ name: "T", srtPath: "/t.srt", projectRoot: "/t" });
    const run = createRun(project.id, "render");

    const running = updateRunStatus(run.id, "running");
    assert.equal(running!.status, "running");
    assert.ok(running!.startedAt);

    const completed = updateRunStatus(run.id, "completed", { output: { path: "/out.mp4" } });
    assert.equal(completed!.status, "completed");
    assert.ok(completed!.completedAt);
    assert.ok(completed!.outputJson);
  });

  it("should track progress", () => {
    const project = createProject({ name: "T", srtPath: "/t.srt", projectRoot: "/t" });
    const run = createRun(project.id, "render");
    updateRunStatus(run.id, "running", { progress: 0.5 });
    const updated = getRun(run.id);
    assert.equal(updated!.progress, 0.5);
  });

  it("should list runs by project", () => {
    const project = createProject({ name: "T", srtPath: "/t.srt", projectRoot: "/t" });
    createRun(project.id, "init");
    createRun(project.id, "render");
    const runs = listRuns(project.id);
    assert.equal(runs.length, 2);
  });
});

// ════════════════════════════════════════════════════════
// Run Events
// ════════════════════════════════════════════════════════

describe("Run Events", () => {
  it("should add and retrieve events", () => {
    const project = createProject({ name: "T", srtPath: "/t.srt", projectRoot: "/t" });
    const run = createRun(project.id, "render");
    addRunEvent(run.id, "started", "Run started");
    addRunEvent(run.id, "progress", "50%", { progress: 0.5 });
    const events = getRunEvents(run.id);
    assert.equal(events.length, 2);
    assert.equal(events[0].type, "started");
    assert.equal(events[1].data?.progress, 0.5);
  });
});

// ════════════════════════════════════════════════════════
// Artifact
// ════════════════════════════════════════════════════════

describe("Artifact Storage", () => {
  it("should create and list artifacts", () => {
    const project = createProject({ name: "T", srtPath: "/t.srt", projectRoot: "/t" });
    const run = createRun(project.id, "render");
    const artifact = createArtifact({
      projectId: project.id,
      runId: run.id,
      type: "video",
      name: "output.mp4",
      filePath: "/out/output.mp4",
      status: "candidate",
    });
    assert.ok(artifact.id);

    const list = listArtifacts(project.id);
    assert.equal(list.length, 1);
    assert.equal(list[0].type, "video");
  });

  it("should update artifact status", () => {
    const project = createProject({ name: "T", srtPath: "/t.srt", projectRoot: "/t" });
    const artifact = createArtifact({
      projectId: project.id,
      type: "video",
      name: "output.mp4",
    });
    const updated = setArtifactStatus(artifact.id, "final");
    assert.equal(updated!.status, "final");
  });

  it("should filter by type", () => {
    const project = createProject({ name: "T", srtPath: "/t.srt", projectRoot: "/t" });
    createArtifact({ projectId: project.id, type: "video", name: "v.mp4" });
    createArtifact({ projectId: project.id, type: "audio", name: "a.mp3" });
    const videos = listArtifacts(project.id, "video");
    assert.equal(videos.length, 1);
    assert.equal(videos[0].type, "video");
  });
});

// ════════════════════════════════════════════════════════
// Provider Registry
// ════════════════════════════════════════════════════════

describe("Provider Registry", () => {
  it("should list capabilities", () => {
    const registry = getProviderRegistry();
    const caps = registry.listCapabilities();
    assert.ok(caps.length >= 3); // script + tts + render
    const types = caps.map((c) => c.type);
    assert.ok(types.includes("script"));
    assert.ok(types.includes("tts"));
    assert.ok(types.includes("render"));
  });

  it("should route run type to correct provider", () => {
    const registry = getProviderRegistry();
    assert.ok(registry.getByRunType("render")?.type === "render");
    assert.ok(registry.getByRunType("tts")?.type === "tts");
    assert.ok(registry.getByRunType("init")?.type === "script");
  });

  it("should test provider health", async () => {
    const registry = getProviderRegistry();
    const result = await registry.testProvider("render");
    assert.ok(result.ok);
    assert.ok(result.latencyMs >= 0);
  });
});

// ════════════════════════════════════════════════════════
// Run Queue (basic lifecycle)
// ════════════════════════════════════════════════════════

describe("Run Queue", () => {
  it("should submit and cancel a run", () => {
    const project = createProject({ name: "T", srtPath: "/t.srt", projectRoot: "/t" });
    const queue = getRunQueue();
    const run = queue.submit(project.id, "validate");
    assert.equal(run.status, "queued");

    const cancelled = queue.cancel(run.id);
    assert.equal(cancelled!.status, "cancelled");
  });
});
