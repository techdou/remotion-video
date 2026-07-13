/**
 * 高级测试：revision 并发冲突 + Worker 崩溃恢复 + Provider 端到端
 *
 * 运行: npx tsx --test server/core/tests/advanced.test.ts
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { initDb, closeDb } from "../db.js";
import {
  createProject, getProject, updateProject,
  createRun, getRun, updateRunStatus, leaseRun, heartbeatRun,
  findQueuedRuns, findStaleRuns,
  createArtifact, listArtifacts, setArtifactStatus,
  RevisionConflict,
} from "../storage.js";
import { getRunQueue } from "../run-queue.js";
import { getProviderRegistry } from "../providers/registry.js";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

let tempDir: string;

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), "rv-adv-"));
  await initDb(join(tempDir, "test.db"));
});

afterEach(() => {
  closeDb();
  rmSync(tempDir, { recursive: true, force: true });
});

// ════════════════════════════════════════════════════════
// Revision 乐观锁并发
// ════════════════════════════════════════════════════════

describe("Revision Concurrency", () => {
  it("should allow sequential updates with correct revision", () => {
    const project = createProject({ name: "V1", srtPath: "/t.srt", projectRoot: "/t" });
    assert.equal(project.revision, 1);

    const v2 = updateProject(project.id, { name: "V2" }, 1);
    assert.equal(v2!.revision, 2);

    const v3 = updateProject(project.id, { name: "V3" }, 2);
    assert.equal(v3!.revision, 3);
  });

  it("should reject stale revision", () => {
    const project = createProject({ name: "V1", srtPath: "/t.srt", projectRoot: "/t" });
    updateProject(project.id, { name: "V2" }, 1); // revision → 2

    // 用旧的 revision=1 再改 → 应该冲突
    assert.throws(
      () => updateProject(project.id, { name: "Hacked" }, 1),
      RevisionConflict,
    );
  });

  it("should reject update with future revision", () => {
    const project = createProject({ name: "V1", srtPath: "/t.srt", projectRoot: "/t" });
    assert.throws(
      () => updateProject(project.id, { name: "Future" }, 99),
      RevisionConflict,
    );
  });

  it("should allow update without revision check (no optimistic lock)", () => {
    const project = createProject({ name: "V1", srtPath: "/t.srt", projectRoot: "/t" });
    // 不传 revision 参数 → 不检查
    const updated = updateProject(project.id, { name: "NoCheck" });
    assert.equal(updated!.name, "NoCheck");
    assert.equal(updated!.revision, 2);
  });
});

// ════════════════════════════════════════════════════════
// Worker Lease + Heartbeat + 崩溃恢复
// ════════════════════════════════════════════════════════

describe("Worker Lease & Recovery", () => {
  it("should lease a queued run", () => {
    const project = createProject({ name: "T", srtPath: "/t.srt", projectRoot: "/t" });
    const run = createRun(project.id, "render");
    assert.equal(run.status, "queued");

    const leased = leaseRun(run.id);
    assert.ok(leased);
    assert.equal(leased!.status, "running");
    assert.ok(leased!.startedAt);
  });

  it("should not lease an already-running run", () => {
    const project = createProject({ name: "T", srtPath: "/t.srt", projectRoot: "/t" });
    const run = createRun(project.id, "render");
    leaseRun(run.id); // 第一次 lease 成功

    const second = leaseRun(run.id); // 第二次应该失败
    assert.equal(second, null);
  });

  it("should update heartbeat", () => {
    const project = createProject({ name: "T", srtPath: "/t.srt", projectRoot: "/t" });
    const run = createRun(project.id, "render");
    leaseRun(run.id);

    // heartbeat 不报错就是成功
    heartbeatRun(run.id);
    const updated = getRun(run.id);
    assert.ok(updated!.workerLeaseAt);
  });

  it("should find stale runs for crash recovery", async () => {
    const project = createProject({ name: "T", srtPath: "/t.srt", projectRoot: "/t" });
    const run = createRun(project.id, "render");
    leaseRun(run.id);

    // 直接用 SQL 把 heartbeat 设为 2 分钟前（绕过时间精度问题）
    const { getDb } = await import("../db.js");
    const db = getDb();
    const oldTime = new Date(Date.now() - 120000).toISOString();
    db.prepare("UPDATE runs SET worker_lease_at = ? WHERE id = ?").run(oldTime, run.id);

    const stale = findStaleRuns(60000);
    assert.ok(stale.length >= 1, "Should find at least 1 stale run");
    const found = stale.find((r: any) => r.id === run.id);
    assert.ok(found, "Our run should be in the stale list");
  });

  it("should find queued runs", () => {
    const project = createProject({ name: "T", srtPath: "/t.srt", projectRoot: "/t" });
    createRun(project.id, "init");
    createRun(project.id, "render");

    const queued = findQueuedRuns(10);
    assert.equal(queued.length, 2);
  });
});

// ════════════════════════════════════════════════════════
// Artifact 版本树 + 状态流转
// ════════════════════════════════════════════════════════

describe("Artifact Lifecycle", () => {
  it("should create version tree via parentId", () => {
    const project = createProject({ name: "T", srtPath: "/t.srt", projectRoot: "/t" });
    const v1 = createArtifact({
      projectId: project.id, type: "video", name: "v1.mp4", status: "archived",
    });
    const v2 = createArtifact({
      projectId: project.id, type: "video", name: "v2.mp4",
      parentId: v1.id, status: "candidate",
    });
    assert.equal(v2.parentId, v1.id);
  });

  it("should transition through status lifecycle", () => {
    const project = createProject({ name: "T", srtPath: "/t.srt", projectRoot: "/t" });
    const artifact = createArtifact({
      projectId: project.id, type: "video", name: "output.mp4",
    });
    assert.equal(artifact.status, "draft");

    const candidate = setArtifactStatus(artifact.id, "candidate");
    assert.equal(candidate!.status, "candidate");

    const selected = setArtifactStatus(artifact.id, "selected");
    assert.equal(selected!.status, "selected");

    const final = setArtifactStatus(artifact.id, "final");
    assert.equal(final!.status, "final");
  });
});

// ════════════════════════════════════════════════════════
// Run Queue 完整生命周期
// ════════════════════════════════════════════════════════

describe("Run Queue Lifecycle", () => {
  it("should create and get run status", () => {
    const project = createProject({ name: "T", srtPath: "/t.srt", projectRoot: "/t" });
    // 用 createRun 直接创建（不经过 queue 的 submit，避免 Worker 后台消费）
    const run = createRun(project.id, "validate", { test: true });
    assert.equal(run.status, "queued");
    assert.equal(run.type, "validate");

    const fetched = getRun(run.id);
    assert.ok(fetched);
    const parsed = JSON.parse(fetched!.inputJson!);
    assert.equal(parsed.test, true);
  });

  it("should cancel a queued run", () => {
    const project = createProject({ name: "T", srtPath: "/t.srt", projectRoot: "/t" });
    const queue = getRunQueue();
    const run = queue.submit(project.id, "validate");
    const cancelled = queue.cancel(run.id);
    assert.equal(cancelled!.status, "cancelled");
  });

  it("should not cancel a completed run", () => {
    const project = createProject({ name: "T", srtPath: "/t.srt", projectRoot: "/t" });
    const run = createRun(project.id, "validate");
    updateRunStatus(run.id, "completed");

    const queue = getRunQueue();
    const result = queue.cancel(run.id);
    assert.equal(result!.status, "completed"); // 状态不变
  });
});

// ════════════════════════════════════════════════════════
// Provider 能力探测 + 错误处理
// ════════════════════════════════════════════════════════

describe("Provider Error Handling", () => {
  it("should return error for unknown provider type", async () => {
    const registry = getProviderRegistry();
    const result = await registry.testProvider("nonexistent");
    assert.equal(result.ok, false);
    assert.ok(result.message.includes("Unknown"));
  });

  it("should return error for unknown run type", async () => {
    const registry = getProviderRegistry();
    const result = await registry.executeRun("unknown_type" as any, {
      projectRoot: "/tmp",
      srtPath: "/tmp/test.srt",
    });
    assert.equal(result.success, false);
    assert.ok(result.error!.includes("No provider"));
  });

  it("should return error when script file does not exist", async () => {
    const registry = getProviderRegistry();
    const result = await registry.executeRun("init", {
      projectRoot: "/nonexistent",
      srtPath: "/nonexistent/test.srt",
      input: { runType: "init" },
    });
    assert.equal(result.success, false);
  });
});
