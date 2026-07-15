/**
 * 异步 Run 队列 + Worker
 *
 * SQLite-backed 队列，支持：
 * - Worker lease + heartbeat
 * - 崩溃恢复（超时 running run 自动标记 failed 或重新排队）
 * - 取消（AbortController）
 *
 * 参考架构：VibeCanvas 的 run-queue.ts
 */

import { EventEmitter } from "node:events";
import {
  createRun, getRun, updateRunStatus, leaseRun,
  findQueuedRuns, findStaleRuns, addRunEvent,
} from "./storage.js";
import type { Run, RunType } from "./types.js";

const POLL_INTERVAL_MS = 2000;
const HEARTBEAT_INTERVAL_MS = 15000;
const LEASE_TIMEOUT_MS = 60000;

export class RunQueue extends EventEmitter {
  private activeControllers = new Map<string, AbortController>();
  private running = false;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;

  start(): void {
    if (this.running) return;
    this.running = true;
    this.recoverStaleRuns();
    this.poll();
  }

  stop(): void {
    this.running = false;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    // 取消所有活跃 run
    for (const [, controller] of this.activeControllers) {
      controller.abort();
    }
    this.activeControllers.clear();
  }

  /**
   * 提交一个 Run（立即返回 runId，不阻塞）
   */
  submit(projectId: string, type: RunType, input?: unknown): Run {
    const run = createRun(projectId, type, input);
    this.emit("run:queued", run);
    return run;
  }

  /**
   * 取消一个 Run
   */
  cancel(runId: string): Run | null {
    const run = getRun(runId);
    if (!run) return null;

    if (run.status === "queued") {
      // 还没开始，直接标记取消
      const updated = updateRunStatus(runId, "cancelled");
      addRunEvent(runId, "cancelled", "Run cancelled before start");
      this.emit("run:cancelled", updated);
      return updated;
    }

    if (run.status === "running") {
      const controller = this.activeControllers.get(runId);
      if (controller) {
        controller.abort();
      }
      const updated = updateRunStatus(runId, "cancelled");
      addRunEvent(runId, "cancelled", "Run cancelled during execution");
      this.emit("run:cancelled", updated);
      return updated;
    }

    return run; // 已完成/已失败，不可取消
  }

  /**
   * 崩溃恢复：扫描超时的 running runs
   */
  private recoverStaleRuns(): void {
    const stale = findStaleRuns(LEASE_TIMEOUT_MS);
    for (const run of stale) {
      if (run.progress > 0) {
        // 有进度但超时 → 标记失败（可能部分完成，需人工介入）
        updateRunStatus(run.id, "failed", { error: "Worker heartbeat timeout (crash recovery)" });
        addRunEvent(run.id, "failed", "Worker crash detected, run marked as failed");
      } else {
        // 无进度 → 重置为 queued（Worker 重新 pick）
        updateRunStatus(run.id, "queued");
        addRunEvent(run.id, "log", "Run re-queued after worker crash");
      }
    }
    if (stale.length > 0) {
      console.error(`[RunQueue] Recovered ${stale.length} stale runs`);
    }
  }

  /**
   * 轮询 queued runs，交给 Runner 执行
   */
  private poll(): void {
    if (!this.running) return;

    const queued = findQueuedRuns(1);
    if (queued.length > 0) {
      const run = queued[0];
      const leased = leaseRun(run.id);
      if (leased) {
        this.executeRun(leased);
      }
    }

    this.pollTimer = setTimeout(() => this.poll(), POLL_INTERVAL_MS);
  }

  /**
   * 执行一个 Run（异步，不阻塞 poll）
   */
  private async executeRun(run: Run): Promise<void> {
    const controller = new AbortController();
    this.activeControllers.set(run.id, controller);

    // Heartbeat 定时器
    const heartbeatTimer = setInterval(() => {
      import("./storage.js").then(({ heartbeatRun }) => heartbeatRun(run.id));
    }, HEARTBEAT_INTERVAL_MS);

    // 解析 project 信息
    const { getProject } = await import("./storage.js");
    const project = getProject(run.projectId);
    if (!project) {
      updateRunStatus(run.id, "failed", { error: "Project not found" });
      this.cleanup(run.id, heartbeatTimer);
      return;
    }

    // 解析 input
    const input = run.inputJson ? JSON.parse(run.inputJson) : {};
    input.runType = run.type;

    addRunEvent(run.id, "started", `Run ${run.type} started`);
    this.emit("run:started", run);

    // 动态导入避免循环依赖
    const { getProviderRegistry } = await import("./providers/registry.js");
    const { registerArtifact } = await import("./artifact-store.js");
    const registry = getProviderRegistry();

    try {
      const result = await registry.executeRun(run.type as RunType, {
        projectRoot: project.projectRoot,
        srtPath: project.srtPath,
        input,
        signal: controller.signal,
        onProgress: (message, data) => {
          addRunEvent(run.id, "log", message, data);
          if (data?.progress !== undefined) {
            updateRunStatus(run.id, "running", { progress: data.progress as number });
          }
          this.emit("run:progress", { runId: run.id, message, data });
        },
      });

      if (result.success) {
        const updated = updateRunStatus(run.id, "completed", {
          output: result.output,
          progress: 1,
        });

        // 注册 artifacts
        if (result.artifacts) {
          for (const a of result.artifacts) {
            registerArtifact({
              projectId: project.id,
              runId: run.id,
              type: a.type as any,
              name: a.name,
              filePath: a.filePath,
              meta: a.meta,
            });
          }
        }

        addRunEvent(run.id, "completed", `Run ${run.type} completed`);
        this.emit("run:completed", updated);
      } else {
        const updated = updateRunStatus(run.id, "failed", { error: result.error });
        addRunEvent(run.id, "failed", result.error || "Run failed");
        this.emit("run:failed", updated);
      }
    } catch (err: any) {
      const updated = updateRunStatus(run.id, "failed", { error: err.message });
      addRunEvent(run.id, "failed", err.message);
      this.emit("run:failed", updated);
    }

    this.cleanup(run.id, heartbeatTimer);
  }

  private cleanup(runId: string, heartbeatTimer: ReturnType<typeof setInterval>): void {
    clearInterval(heartbeatTimer);
    this.activeControllers.delete(runId);
  }
}

// 单例
let queueInstance: RunQueue | null = null;

export function getRunQueue(): RunQueue {
  if (!queueInstance) queueInstance = new RunQueue();
  return queueInstance;
}
