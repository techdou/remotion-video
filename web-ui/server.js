/**
 * Remotion Video Web 控制台后端
 *
 * Express 服务器，端口 3210。
 * 提供 API + SSE 事件流 + 静态文件服务。
 */

import express from "express";
import { resolve, dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  statSync,
  createReadStream,
} from "node:fs";

import { runNodeScript, runPythonScript, runCommand } from "./lib/executor.js";
import {
  createInitialState,
  readState,
  writeState,
  updateStep,
  emitLog,
  events,
} from "./lib/pipeline-state.js";
import { renderVideo } from "./lib/render-runner.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = resolve(__dirname, "..");
const PORT = process.env.WEB_UI_PORT || 3210;

const app = express();
app.use(express.json());

// ── 静态文件 ──────────────────────────────────────────────
app.use(express.static(resolve(__dirname, "public")));

// ── CORS（仅允许 localhost 开发调试，防跨站篡改）──────────
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
  }
  next();
});

// ── 工具函数 ──────────────────────────────────────────────

/** 安全解码 projectRoot 参数（URI 编码的路径）*/
function decodePath(encoded) {
  return decodeURIComponent(encoded);
}

/** 验证路径在允许的项目基目录下（防路径穿越）*/
function validateProjectPath(projectRoot) {
  const resolved = resolve(projectRoot);
  // 精确匹配：projectRoot 的父目录必须叫 remotion-video-projects
  const parentName = basename(dirname(resolved));
  if (parentName !== "remotion-video-projects") {
    throw new Error("非法项目路径");
  }
  return resolved;
}

/** 列出 SRT 目录下的所有项目 */
function listProjects(srtDir) {
  const projectsBase = join(srtDir, "remotion-video-projects");
  if (!existsSync(projectsBase)) return [];
  return readdirSync(projectsBase)
    .filter((name) => {
      const p = join(projectsBase, name);
      return statSync(p).isDirectory() && existsSync(join(p, "src", "Root.tsx"));
    })
    .map((name) => {
      const projectRoot = join(projectsBase, name);
      const state = readState(projectRoot);
      return {
        name,
        projectRoot,
        createdAt: statSync(projectRoot).birthtime.toISOString(),
        currentStep: state?.currentStep || null,
        hasVideo: existsSync(join(projectRoot, "out", "output.mp4")),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ═══════════════════════════════════════════════════════════
// API 路由
// ═══════════════════════════════════════════════════════════

// ── 健康检查 ──────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ ok: true, skill: "remotion-video", version: "1.0.0" });
});

// ── 列出项目 ──────────────────────────────────────────────
app.get("/api/projects", (req, res) => {
  const srtDir = req.query.srtDir;
  if (!srtDir) {
    return res.status(400).json({ error: "缺少 srtDir 参数" });
  }
  try {
    res.json({ projects: listProjects(srtDir) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 读取 pipeline 状态 ───────────────────────────────────
app.get("/api/pipeline/:projectRoot", (req, res) => {
  const projectRoot = decodePath(req.params.projectRoot);
  const state = readState(projectRoot);
  if (!state) {
    return res.status(404).json({ error: "无 pipeline 状态，请先初始化" });
  }
  res.json(state);
});

// ── 配置管理 ──────────────────────────────────────────────
app.get("/api/config", (req, res) => {
  const envPath = join(SKILL_ROOT, ".env");
  if (!existsSync(envPath)) {
    return res.json({ config: {} });
  }
  const config = {};
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    // 脱敏 API Key
    if (key.toLowerCase().includes("key") || key.toLowerCase().includes("token")) {
      config[key] = value ? value.slice(0, 6) + "***" : "";
    } else {
      config[key] = value;
    }
  }
  res.json({ config });
});

app.put("/api/config", (req, res) => {
  const envPath = join(SKILL_ROOT, ".env");
  const { config } = req.body;
  if (!config || typeof config !== "object") {
    return res.status(400).json({ error: "缺少 config 对象" });
  }

  // 读取现有 .env 内容（保留注释和未发送的变量）
  let existingLines = [];
  const existingConfig = {};
  if (existsSync(envPath)) {
    existingLines = readFileSync(envPath, "utf-8").split("\n");
    for (const line of existingLines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      existingConfig[key] = trimmed.slice(eq + 1).trim();
    }
  }

  // 合并：只更新提交的非脱敏值（跳过含 *** 的脱敏占位符）
  const merged = { ...existingConfig };
  for (const [key, value] of Object.entries(config)) {
    // 校验 key 只允许字母数字下划线（防注入）
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    // 跳过脱敏占位值
    if (typeof value === "string" && value.endsWith("***")) continue;
    // 拒绝换行符（防 .env 注入）
    if (typeof value === "string" && /[\n\r]/.test(value)) continue;
    // 强制类型：非字符串值转 string，null/对象/数组跳过
    if (typeof value === "number" || typeof value === "boolean") {
      merged[key] = String(value);
    } else if (typeof value === "string") {
      merged[key] = value;
    }
    // null / object / array → 跳过
  }

  // 重写 .env：保留原有注释行，更新已知 key，追加新 key
  const seenKeys = new Set();
  const outputLines = existingLines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;
    const eq = trimmed.indexOf("=");
    if (eq === -1) return line;
    const key = trimmed.slice(0, eq).trim();
    if (key in merged) {
      seenKeys.add(key);
      return `${key}=${merged[key]}`;
    }
    return line;
  });

  // 追加新 key（原 .env 中没有的）
  for (const [key, value] of Object.entries(merged)) {
    if (!seenKeys.has(key)) {
      outputLines.push(`${key}=${value}`);
    }
  }

  writeFileSync(envPath, outputLines.join("\n").replace(/\n+$/, "\n"), "utf-8");
  res.json({ ok: true });
});

// ── 触发 init ─────────────────────────────────────────────
app.post("/api/run/init", async (req, res) => {
  const { srtPath } = req.body;
  if (!srtPath || !existsSync(srtPath)) {
    return res.status(400).json({ error: "srtPath 不存在" });
  }

  try {
    emitLog(srtPath, "info", "步骤 1.0: 依赖预检...");
    const depsResult = await runNodeScript("ensure-template-deps.js", [
      join(SKILL_ROOT, "template"),
    ]);

    emitLog(srtPath, "info", "步骤 1.1: 初始化项目...");
    const initResult = await runNodeScript("init-project.js", ["--srt-path", srtPath]);

    const projectRoot = initResult.projectRoot;

    // 初始化 pipeline 状态
    writeState(projectRoot, createInitialState(projectRoot, srtPath));
    updateStep(projectRoot, "init", { status: "done", result: initResult });
    emitLog(projectRoot, "info", `项目已创建: ${projectRoot}`);

    res.json({ ok: true, projectRoot, initResult, depsResult });
  } catch (err) {
    emitLog(srtPath || "?", "error", `初始化失败: ${err.message}`);
    res.status(500).json({ error: err.message, result: err.result });
  }
});

// ── 触发场景注册 ─────────────────────────────────────────
app.post("/api/run/registry", async (req, res) => {
  const { projectRoot } = req.body;
  if (!projectRoot) return res.status(400).json({ error: "缺少 projectRoot" });

  updateStep(projectRoot, "registry", { status: "running" });
  emitLog(projectRoot, "info", "生成场景注册文件...");

  try {
    const result = await runNodeScript(
      "generate-scenes-registry.js",
      [projectRoot, join(projectRoot, "storyboard.json")],
      {
        onProgress: (line) => emitLog(projectRoot, "info", line),
      }
    );
    updateStep(projectRoot, "registry", { status: "done", result });
    emitLog(projectRoot, "info", `场景注册完成: ${result.sceneCount} 个场景`);
    res.json({ ok: true, result });
  } catch (err) {
    updateStep(projectRoot, "registry", { status: "failed", error: err.message });
    emitLog(projectRoot, "error", `场景注册失败: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── 触发校验 ─────────────────────────────────────────────
app.post("/api/run/validate", async (req, res) => {
  const { projectRoot } = req.body;
  if (!projectRoot) return res.status(400).json({ error: "缺少 projectRoot" });

  updateStep(projectRoot, "validate", { status: "running" });
  emitLog(projectRoot, "info", "校验项目...");

  try {
    const result = await runNodeScript("validate-project.js", [
      projectRoot,
      join(projectRoot, "storyboard.json"),
    ]);
    updateStep(projectRoot, "validate", { status: "done", result });
    emitLog(projectRoot, "info", "校验通过");
    res.json({ ok: true, result });
  } catch (err) {
    updateStep(projectRoot, "validate", { status: "failed", error: err.message });
    emitLog(projectRoot, "error", `校验失败: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── 触发渲染 ─────────────────────────────────────────────
app.post("/api/run/render", async (req, res) => {
  const { projectRoot, scale } = req.body;
  if (!projectRoot) return res.status(400).json({ error: "缺少 projectRoot" });

  try {
    const result = await renderVideo(projectRoot, { scale });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 触发 TTS ─────────────────────────────────────────────
app.post("/api/run/tts", async (req, res) => {
  const { projectRoot } = req.body;
  if (!projectRoot) return res.status(400).json({ error: "缺少 projectRoot" });

  const state = readState(projectRoot);
  const actualSrt = state?.srtPath;
  if (!actualSrt) {
    return res.status(400).json({ error: "pipeline 状态缺失，无法确定 SRT 路径，请先初始化项目" });
  }
  if (!existsSync(actualSrt)) {
    return res.status(400).json({ error: `SRT 文件不存在: ${actualSrt}` });
  }

  const speechDir = join(projectRoot, "speech");
  const audioOutput = join(projectRoot, "public", "audio.mp3");

  updateStep(projectRoot, "tts", { status: "running", progress: "generating" });
  emitLog(projectRoot, "info", "TTS: 生成语音分段...");

  try {
    // 步骤 1: 生成分段语音
    const genResult = await runPythonScript("generate-speech.py", [actualSrt, speechDir], {
      onProgress: (line) => emitLog(projectRoot, "tts", line),
    });

    emitLog(projectRoot, "info", `TTS: 生成完成 (${genResult.succeeded}/${genResult.total})`);

    // 步骤 2: 合并
    updateStep(projectRoot, "tts", { status: "running", progress: "merging" });
    emitLog(projectRoot, "info", "TTS: 合并音频...");

    const mergeResult = await runPythonScript("merge-speech.py", [speechDir, audioOutput], {
      onProgress: (line) => emitLog(projectRoot, "tts", line),
    });

    updateStep(projectRoot, "tts", {
      status: "done",
      provider: genResult.provider,
      segments: { total: genResult.total, done: genResult.succeeded },
      audioPath: audioOutput,
    });
    emitLog(projectRoot, "info", `TTS 完成: ${mergeResult.sizeMB} MB`);

    res.json({ ok: true, genResult, mergeResult });
  } catch (err) {
    updateStep(projectRoot, "tts", { status: "failed", error: err.message });
    emitLog(projectRoot, "error", `TTS 失败: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── 获取 composition 信息（供 Player 用）────────────────
app.get("/api/preview/:projectRoot", (req, res) => {
  const projectRoot = decodePath(req.params.projectRoot);
  const videoSettingsPath = join(projectRoot, "src", "video-settings.json");
  const generatedPath = join(projectRoot, "src", "compositions", "generated-scenes.ts");

  let videoSettings = {};
  if (existsSync(videoSettingsPath)) {
    videoSettings = JSON.parse(readFileSync(videoSettingsPath, "utf-8"));
  }

  const profile = videoSettings.profile || "1080p30";
  const profiles = videoSettings.profiles || {};
  const active = profiles[profile] || { width: 1920, height: 1080, fps: 30 };

  // 读取 totalDurationInFrames
  let durationInFrames = 150;
  if (existsSync(generatedPath)) {
    const content = readFileSync(generatedPath, "utf-8");
    const match = content.match(/totalDurationInFrames\s*=\s*(\d+)/);
    if (match) durationInFrames = parseInt(match[1]);
  }

  res.json({
    projectRoot,
    composition: {
      id: "Main",
      width: active.width,
      height: active.height,
      fps: active.fps,
      durationInFrames,
    },
    studioUrl: `http://localhost:3000`,  // Remotion Studio 的默认地址
  });
});

// ── 视频 MP4 流式播放/下载 ───────────────────────────────
app.get("/api/video/:projectRoot", (req, res) => {
  let projectRoot;
  try {
    projectRoot = validateProjectPath(decodePath(req.params.projectRoot));
  } catch {
    return res.status(403).json({ error: "非法项目路径" });
  }
  const videoPath = join(projectRoot, "out", "output.mp4");
  if (!existsSync(videoPath)) {
    return res.status(404).json({ error: "视频尚未渲染" });
  }

  const stat = statSync(videoPath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    // 支持 range 请求（视频拖动）
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;
    const stream = createReadStream(videoPath, { start, end });
    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunkSize,
      "Content-Type": "video/mp4",
    });
    stream.pipe(res);
  } else {
    res.writeHead(200, {
      "Content-Length": fileSize,
      "Content-Type": "video/mp4",
    });
    createReadStream(videoPath).pipe(res);
  }
});

// ── SSE 事件流 ───────────────────────────────────────────
app.get("/api/events", (req, res) => {
  const { projectRoot } = req.query;
  const targetRoot = projectRoot ? decodePath(projectRoot) : null;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write("\n");

  const sendEvent = (type, data) => {
    if (res.writableEnded) return;
    try {
      if (targetRoot && data.projectRoot && data.projectRoot !== targetRoot) return;
      res.write(`event: ${type}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {
      // 连接已断，静默；req close 会清理
    }
  };

  const onState = (data) => sendEvent("state", data);
  const onLog = (data) => sendEvent("log", data);
  const onRenderProgress = (data) => sendEvent("render-progress", data);

  events.on("state", onState);
  events.on("log", onLog);
  events.on("render-progress", onRenderProgress);

  // 心跳
  const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 30000);

  req.on("close", () => {
    events.off("state", onState);
    events.off("log", onLog);
    events.off("render-progress", onRenderProgress);
    clearInterval(heartbeat);
  });
});

// ── 启动服务器 ───────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════════════╗`);
  console.log(`║  Remotion Video 控制台                        ║`);
  console.log(`║  http://localhost:${PORT}                        ║`);
  console.log(`╚══════════════════════════════════════════════╝`);
  console.log(`\nSkill 根目录: ${SKILL_ROOT}`);
  console.log(`API 文档: http://localhost:${PORT}/api/health\n`);
});
