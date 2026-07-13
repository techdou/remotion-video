/**
 * Domain Service — Express HTTP API + SSE
 *
 * 前端控制台通过 HTTP API 操作，SSE 接收实时事件。
 * 绑定 127.0.0.1（不暴露局域网）。
 */

import express from "express";
import { createReadStream, existsSync, statSync } from "node:fs";
import { join, basename, dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { EventEmitter } from "node:events";
import {
  getProject, listProjects, updateProject, createProject,
  getRun, listRuns, getRunEvents,
  listArtifacts, getArtifact, setArtifactStatus,
  updateRunStatus,
} from "../core/storage.js";
import { getRunQueue } from "../core/run-queue.js";
import { getProviderRegistry } from "../core/providers/registry.js";
import { getTtsConfig, maskConfig, loadEnv } from "../core/config.js";
import { registerArtifact, getArtifactStream, getArtifactFileInfo } from "../core/artifact-store.js";
import type { ArtifactStatus, RunType } from "../core/types.js";
import { RUN_TYPES } from "../core/types.js";

const PORT = parseInt(process.env.WEB_UI_PORT || "3210", 10);

export function createApiServer(): express.Express {
  const app = express();
  app.use(express.json());

  // 静态文件服务（前端 SPA）
  const webUiDir = join(process.cwd(), "web-ui", "public");
  app.use(express.static(webUiDir));

  // CORS（仅 localhost）
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
      res.header("Access-Control-Allow-Headers", "Content-Type");
    }
    next();
  });

  // ═══ Health ═══
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "remotion-video-domain", version: "1.0.0" });
  });

  // ═══ Projects ═══
  app.get("/api/projects", (_req, res) => {
    res.json({ projects: listProjects() });
  });

  // 创建项目：创建 DB 记录 + 提交 init run（异步，立即返回）
  app.post("/api/projects", async (req, res) => {
    const { srtPath } = req.body;
    if (!srtPath || !existsSync(srtPath)) {
      return res.status(400).json({ error: "srtPath 不存在" });
    }

    const queue = getRunQueue();
    // 智能定位 skill root：兼容开发模式（server/api/）和编译模式（dist/）
    const moduleDir = dirname(fileURLToPath(import.meta.url));
    const SKILL_ROOT = existsSync(join(moduleDir, "..", "scripts"))
      ? resolve(moduleDir, "..")       // 编译模式: dist/index.js → skill root
      : resolve(moduleDir, "..", ".."); // 开发模式: server/api/index.ts → skill root

    try {
      // 先跑 ensure-template-deps + init-project（同步等待）
      const depsResult = await runScriptAsync("node", [
        join(SKILL_ROOT, "scripts", "ensure-template-deps.js"),
        join(SKILL_ROOT, "template"),
      ]);
      if (!depsResult.success) {
        return res.status(500).json({ error: "依赖安装失败", details: depsResult });
      }

      const initResult = await runScriptAsync("node", [
        join(SKILL_ROOT, "scripts", "init-project.js"),
        "--srt-path", srtPath,
      ]);
      if (!initResult.success) {
        return res.status(500).json({ error: "项目初始化失败", details: initResult });
      }

      // 在 SQLite 注册项目
      const project = createProject({
        name: initResult.output?.projectName || new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-"),
        srtPath,
        projectRoot: initResult.output?.projectRoot || "",
      });

      // init 已同步执行完，标记为完成
      const run = queue.submit(project.id, "init", { runType: "init" });
      updateRunStatus(run.id, "completed", { output: initResult.output });

      res.json({ project, runId: run.id });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get("/api/projects/:id", (req, res) => {
    const project = getProject(req.params.id);
    if (!project) return res.status(404).json({ error: "Not found" });
    const runs = listRuns(req.params.id);
    const artifacts = listArtifacts(req.params.id);
    res.json({ project, runs: runs.slice(0, 20), artifacts });
  });

  app.patch("/api/projects/:id", (req, res) => {
    const { revision, ...patch } = req.body;
    try {
      const updated = updateProject(req.params.id, patch, revision);
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(409).json({ error: err.message });
    }
  });

  // ═══ Runs ═══
  app.get("/api/projects/:id/runs", (req, res) => {
    res.json({ runs: listRuns(req.params.id) });
  });

  app.post("/api/projects/:id/runs", (req, res) => {
    const { type, input } = req.body;
    if (!RUN_TYPES.includes(type)) {
      return res.status(400).json({ error: `Invalid run type: ${type}` });
    }
    const project = getProject(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const queue = getRunQueue();
    const run = queue.submit(req.params.id, type as RunType, { ...input, runType: type });
    res.json(run);
  });

  app.get("/api/runs/:runId", (req, res) => {
    const run = getRun(req.params.runId);
    if (!run) return res.status(404).json({ error: "Run not found" });
    res.json(run);
  });

  app.get("/api/runs/:runId/events", (req, res) => {
    res.json({ events: getRunEvents(req.params.runId) });
  });

  app.post("/api/runs/:runId/cancel", (req, res) => {
    const queue = getRunQueue();
    const run = queue.cancel(req.params.runId);
    if (!run) return res.status(404).json({ error: "Run not found" });
    res.json(run);
  });

  // ═══ Artifacts ═══
  app.get("/api/projects/:id/artifacts", (req, res) => {
    const type = req.query.type as string | undefined;
    res.json({ artifacts: listArtifacts(req.params.id, type as any) });
  });

  app.get("/api/artifacts/:id", (req, res) => {
    const artifact = getArtifact(req.params.id);
    if (!artifact) return res.status(404).json({ error: "Not found" });
    res.json(artifact);
  });

  app.patch("/api/artifacts/:id", (req, res) => {
    const { status } = req.body;
    const validStatuses = ["draft", "candidate", "selected", "final", "archived"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    const artifact = setArtifactStatus(req.params.id, status as ArtifactStatus);
    if (!artifact) return res.status(404).json({ error: "Not found" });
    res.json(artifact);
  });

  app.get("/api/artifacts/:id/download", (req, res) => {
    const artifact = getArtifact(req.params.id);
    if (!artifact) return res.status(404).json({ error: "Not found" });
    const info = getArtifactFileInfo(artifact);
    if (!info.exists) return res.status(404).json({ error: "File not found" });

    res.setHeader("Content-Disposition", `attachment; filename="${artifact.name}"`);
    const stream = getArtifactStream(artifact);
    if (stream) {
      stream.pipe(res);
    } else {
      res.status(404).json({ error: "Cannot stream file" });
    }
  });

  // ═══ Providers ═══
  app.get("/api/providers", (_req, res) => {
    const registry = getProviderRegistry();
    res.json({ capabilities: registry.listCapabilities() });
  });

  app.post("/api/providers/:type/test", async (req, res) => {
    const registry = getProviderRegistry();
    const result = await registry.testProvider(req.params.type);
    res.json(result);
  });

  // ═══ Config ═══
  app.get("/api/config", (_req, res) => {
    const config = loadEnv();
    const filtered: Record<string, string> = {};
    for (const [k, v] of Object.entries(config)) {
      if (k.startsWith("TTS_") || k.startsWith("MIMO_")) {
        filtered[k] = v;
      }
    }
    res.json({ config: maskConfig(filtered) });
  });

  // ═══ SSE 事件流 ═══
  app.get("/api/events", (req, res) => {
    const projectId = req.query.projectId as string | undefined;

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write("\n");

    const queue = getRunQueue();

    const send = (type: string, data: any) => {
      if (res.writableEnded) return;
      try {
        if (projectId && data?.run?.projectId && data.run.projectId !== projectId) return;
        res.write(`event: ${type}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch { /* 连接已断 */ }
    };

    const onQueued = (run: any) => send("run:queued", { run });
    const onStarted = (run: any) => send("run:started", { run });
    const onProgress = (data: any) => send("run:progress", data);
    const onCompleted = (run: any) => send("run:completed", { run });
    const onCancelled = (run: any) => send("run:cancelled", { run });
    const onFailed = (run: any) => send("run:failed", { run });

    queue.on("run:queued", onQueued);
    queue.on("run:started", onStarted);
    queue.on("run:progress", onProgress);
    queue.on("run:completed", onCompleted);
    queue.on("run:cancelled", onCancelled);
    queue.on("run:failed", onFailed);

    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(": heartbeat\n\n");
    }, 30000);

    req.on("close", () => {
      clearInterval(heartbeat);
      queue.off("run:queued", onQueued);
      queue.off("run:started", onStarted);
      queue.off("run:progress", onProgress);
      queue.off("run:completed", onCompleted);
      queue.off("run:cancelled", onCancelled);
      queue.off("run:failed", onFailed);
    });
  });

  // SPA fallback：非 /api 路径返回 index.html
  app.get("*", (req, res) => {
    const indexPath = join(webUiDir, "index.html");
    if (existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).json({ error: "Frontend not built" });
    }
  });

  return app;
}

// ═══ 辅助：运行脚本并解析输出 ════════════════════════════

const SENTINELS = ["__RESULT_JSON__", "__TTS_RESULT__", "__MERGE_RESULT__"];

function runScriptAsync(bin: string, args: string[]): Promise<{ success: boolean; output?: any; error?: string }> {
  return new Promise((resolvePromise) => {
    const child = spawn(bin, args, {
      cwd: process.cwd(),
      env: { ...process.env, FORCE_COLOR: "0" },
    });

    let stdoutBuffer = "";
    let stderrBuffer = "";

    child.stdout.on("data", (chunk) => { stdoutBuffer += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderrBuffer += chunk.toString(); });

    child.on("close", (code) => {
      const result = parseOutput(stdoutBuffer, code);
      resolvePromise(result);
    });

    child.on("error", (err) => {
      resolvePromise({ success: false, error: err.message });
    });
  });
}

function parseOutput(stdout: string, exitCode: number | null): { success: boolean; output?: any; error?: string } {
  const trimmed = stdout.trim();
  if (!trimmed) return { success: exitCode === 0 };

  for (const sentinel of SENTINELS) {
    const idx = trimmed.lastIndexOf(sentinel);
    if (idx !== -1) {
      try {
        const parsed = JSON.parse(trimmed.slice(idx + sentinel.length).trim());
        return { success: parsed.success !== false, output: parsed };
      } catch { continue; }
    }
  }
  try {
    const parsed = JSON.parse(trimmed);
    return { success: parsed.success !== false, output: parsed };
  } catch {
    return { success: exitCode === 0, error: trimmed.slice(-300) };
  }
}

/**
 * 启动 Domain Service（独立进程入口）
 */
export async function startApiServer(): Promise<void> {
  const { initDb } = await import("../core/db.js");
  await initDb();
  getRunQueue().start();
  const app = createApiServer();
  app.listen(PORT, "127.0.0.1", () => {
    console.log(`\n╔══════════════════════════════════════════╗`);
    console.log(`║  Remotion Video Domain Service           ║`);
    console.log(`║  http://127.0.0.1:${PORT}                    ║`);
    console.log(`╚══════════════════════════════════════════╝`);
  });
}

// 直接运行入口
if (import.meta.url === `file://${process.argv[1]}`) {
  startApiServer().catch(console.error);
}
