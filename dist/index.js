var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/core/db.ts
var db_exports = {};
__export(db_exports, {
  closeDb: () => closeDb,
  getDb: () => getDb,
  initDb: () => initDb
});
import Database from "better-sqlite3";
import { readFileSync, readdirSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
async function initDb(dbPath) {
  if (dbInstance) return dbInstance;
  if (initializing) return initializing;
  initializing = (async () => {
    const path = dbPath || DB_PATH;
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const db = new Database(path);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.pragma("busy_timeout = 5000");
    await runMigrations(db);
    dbInstance = db;
    initializing = null;
    return db;
  })();
  try {
    return await initializing;
  } catch (err) {
    initializing = null;
    throw err;
  }
}
function getDb() {
  if (!dbInstance) {
    throw new Error("Database not initialized. Call initDb() first.");
  }
  return dbInstance;
}
function closeDb() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
async function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      executed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  let migrationsDir;
  const candidates = [
    join(__dirname, "migrations"),
    // 编译后 dist/core/migrations/
    join(process.cwd(), "server", "core", "migrations")
    // 开发时
  ];
  migrationsDir = candidates.find((p) => existsSync(p)) || candidates[0];
  if (!existsSync(migrationsDir)) {
    return;
  }
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const version = file.replace(/\.sql$/, "");
    const applied = db.prepare("SELECT version FROM schema_migrations WHERE version = ?").get(version);
    if (applied) continue;
    const sql = readFileSync(join(migrationsDir, file), "utf-8");
    db.exec(sql);
    db.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(version);
  }
}
var __dirname, dbInstance, initializing, DB_DIR, DB_PATH;
var init_db = __esm({
  "server/core/db.ts"() {
    "use strict";
    __dirname = dirname(fileURLToPath(import.meta.url));
    dbInstance = null;
    initializing = null;
    DB_DIR = join(process.cwd(), ".data");
    DB_PATH = join(DB_DIR, "remotion-video.db");
  }
});

// server/core/storage.ts
var storage_exports = {};
__export(storage_exports, {
  RevisionConflict: () => RevisionConflict,
  addRunEvent: () => addRunEvent,
  createArtifact: () => createArtifact,
  createProject: () => createProject,
  createRun: () => createRun,
  findQueuedRuns: () => findQueuedRuns,
  findStaleRuns: () => findStaleRuns,
  getArtifact: () => getArtifact,
  getProject: () => getProject,
  getProviderConfig: () => getProviderConfig,
  getRun: () => getRun,
  getRunEvents: () => getRunEvents,
  heartbeatRun: () => heartbeatRun,
  leaseRun: () => leaseRun,
  listArtifacts: () => listArtifacts,
  listProjects: () => listProjects,
  listProviderConfigs: () => listProviderConfigs,
  listRuns: () => listRuns,
  saveProviderConfig: () => saveProviderConfig,
  setArtifactStatus: () => setArtifactStatus,
  updateProject: () => updateProject,
  updateRunStatus: () => updateRunStatus
});
import { randomUUID } from "crypto";
function genId() {
  return randomUUID().slice(0, 8);
}
function createProject(input) {
  const db = getDb();
  const id = genId();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  db.prepare(`
    INSERT INTO projects (id, name, srt_path, project_root, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'active', ?, ?)
  `).run(id, input.name, input.srtPath, input.projectRoot, now, now);
  return getProject(id);
}
function getProject(id) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(id);
  return row ? rowToProject(row) : null;
}
function listProjects() {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM projects ORDER BY created_at DESC").all();
  return rows.map(rowToProject);
}
function updateProject(id, patch, expectedRevision) {
  const db = getDb();
  const current = getProject(id);
  if (!current) return null;
  if (expectedRevision !== void 0 && current.revision !== expectedRevision) {
    throw new RevisionConflict(id, current.revision, expectedRevision);
  }
  const updates = [];
  const values = [];
  if (patch.name !== void 0) {
    updates.push("name = ?");
    values.push(patch.name);
  }
  if (patch.status !== void 0) {
    updates.push("status = ?");
    values.push(patch.status);
  }
  updates.push("revision = revision + 1");
  updates.push("updated_at = ?");
  values.push((/* @__PURE__ */ new Date()).toISOString());
  values.push(id);
  db.prepare(`UPDATE projects SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  return getProject(id);
}
function createRun(projectId, type, input) {
  const db = getDb();
  const id = genId();
  db.prepare(`
    INSERT INTO runs (id, project_id, type, status, input_json)
    VALUES (?, ?, ?, 'queued', ?)
  `).run(id, projectId, type, input ? JSON.stringify(input) : null);
  return getRun(id);
}
function getRun(id) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM runs WHERE id = ?").get(id);
  return row ? rowToRun(row) : null;
}
function listRuns(projectId) {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM runs WHERE project_id = ? ORDER BY created_at DESC").all(projectId);
  return rows.map(rowToRun);
}
function updateRunStatus(id, status, extra) {
  const db = getDb();
  const updates = ["status = ?"];
  const values = [status];
  if (extra?.output !== void 0) {
    updates.push("output_json = ?");
    values.push(JSON.stringify(extra.output));
  }
  if (extra?.error !== void 0) {
    updates.push("error = ?");
    values.push(extra.error);
  }
  if (extra?.progress !== void 0) {
    updates.push("progress = ?");
    values.push(extra.progress);
  }
  if (status === "running") {
    updates.push("started_at = ?");
    values.push((/* @__PURE__ */ new Date()).toISOString());
  }
  if (status === "completed" || status === "failed" || status === "cancelled") {
    updates.push("completed_at = ?");
    values.push((/* @__PURE__ */ new Date()).toISOString());
  }
  values.push(id);
  db.prepare(`UPDATE runs SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  return getRun(id);
}
function leaseRun(id) {
  const db = getDb();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const result = db.prepare(`
    UPDATE runs SET status = 'running', started_at = ?, worker_lease_at = ?
    WHERE id = ? AND status = 'queued'
  `).run(now, now, id);
  if (result.changes === 0) return null;
  return getRun(id);
}
function heartbeatRun(id) {
  const db = getDb();
  db.prepare("UPDATE runs SET worker_lease_at = ? WHERE id = ? AND status = 'running'").run((/* @__PURE__ */ new Date()).toISOString(), id);
}
function findQueuedRuns(limit = 5) {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM runs WHERE status = 'queued' ORDER BY created_at ASC LIMIT ?").all(limit);
  return rows.map(rowToRun);
}
function findStaleRuns(timeoutMs = 6e4) {
  const db = getDb();
  const cutoff = new Date(Date.now() - timeoutMs).toISOString();
  const rows = db.prepare(`
    SELECT * FROM runs
    WHERE status = 'running' AND worker_lease_at < ?
  `).all(cutoff);
  return rows.map(rowToRun);
}
function addRunEvent(runId, type, message, data) {
  const db = getDb();
  db.prepare(`
    INSERT INTO run_events (run_id, type, message, data_json)
    VALUES (?, ?, ?, ?)
  `).run(runId, type, message, data ? JSON.stringify(data) : null);
}
function getRunEvents(runId) {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM run_events WHERE run_id = ? ORDER BY id ASC").all(runId);
  return rows.map((r) => ({
    runId: r.run_id,
    type: r.type,
    message: r.message,
    timestamp: r.timestamp,
    data: r.data_json ? JSON.parse(r.data_json) : void 0
  }));
}
function createArtifact(input) {
  const db = getDb();
  const id = genId();
  db.prepare(`
    INSERT INTO artifacts (id, project_id, run_id, parent_id, type, name, file_path, status, meta_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.projectId,
    input.runId || null,
    input.parentId || null,
    input.type,
    input.name,
    input.filePath || null,
    input.status || "draft",
    input.meta ? JSON.stringify(input.meta) : null
  );
  return getArtifact(id);
}
function getArtifact(id) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM artifacts WHERE id = ?").get(id);
  return row ? rowToArtifact(row) : null;
}
function listArtifacts(projectId, type) {
  const db = getDb();
  const rows = type ? db.prepare("SELECT * FROM artifacts WHERE project_id = ? AND type = ? ORDER BY created_at DESC").all(projectId, type) : db.prepare("SELECT * FROM artifacts WHERE project_id = ? ORDER BY created_at DESC").all(projectId);
  return rows.map(rowToArtifact);
}
function setArtifactStatus(id, status) {
  const db = getDb();
  db.prepare("UPDATE artifacts SET status = ? WHERE id = ?").run(status, id);
  return getArtifact(id);
}
function getProviderConfig(type) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM provider_configs WHERE provider_type = ? AND is_default = 1").get(type);
  return row ? rowToProviderConfig(row) : null;
}
function listProviderConfigs() {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM provider_configs ORDER BY created_at DESC").all();
  return rows.map(rowToProviderConfig);
}
function saveProviderConfig(type, name, config, isDefault = false) {
  const db = getDb();
  const id = genId();
  if (isDefault) {
    db.prepare("UPDATE provider_configs SET is_default = 0 WHERE provider_type = ?").run(type);
  }
  db.prepare(`
    INSERT INTO provider_configs (id, provider_type, name, config_json, is_default)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, type, name, JSON.stringify(config), isDefault ? 1 : 0);
  return listProviderConfigs().find((p) => p.id === id);
}
function rowToProject(row) {
  return {
    id: row.id,
    name: row.name,
    srtPath: row.srt_path,
    projectRoot: row.project_root,
    revision: row.revision,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
function rowToRun(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    type: row.type,
    status: row.status,
    inputJson: row.input_json,
    outputJson: row.output_json,
    error: row.error,
    progress: row.progress,
    workerLeaseAt: row.worker_lease_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at
  };
}
function rowToArtifact(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    runId: row.run_id,
    parentId: row.parent_id,
    type: row.type,
    name: row.name,
    filePath: row.file_path,
    status: row.status,
    metaJson: row.meta_json,
    createdAt: row.created_at
  };
}
function rowToProviderConfig(row) {
  return {
    id: row.id,
    providerType: row.provider_type,
    name: row.name,
    configJson: row.config_json,
    isDefault: row.is_default === 1,
    createdAt: row.created_at
  };
}
var RevisionConflict;
var init_storage = __esm({
  "server/core/storage.ts"() {
    "use strict";
    init_db();
    RevisionConflict = class extends Error {
      constructor(projectId, currentRevision, expectedRevision) {
        super(`Revision conflict: expected ${expectedRevision}, got ${currentRevision}`);
        this.projectId = projectId;
        this.currentRevision = currentRevision;
        this.expectedRevision = expectedRevision;
        this.name = "RevisionConflict";
      }
      projectId;
      currentRevision;
      expectedRevision;
    };
  }
});

// server/core/providers/script-provider.ts
import { spawn } from "child_process";
import { existsSync as existsSync2 } from "fs";
import { join as join2, resolve, dirname as dirname2 } from "path";
import { fileURLToPath as fileURLToPath2 } from "url";
function runScript(scriptPath, args, options) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("node", [scriptPath, ...args], {
      cwd: options.cwd,
      env: { ...process.env, FORCE_COLOR: "0" }
    });
    let stdoutBuffer = "";
    let stderrBuffer = "";
    child.stdout.on("data", (chunk) => {
      stdoutBuffer += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderrBuffer += text;
      if (options.onProgress) {
        for (const line of text.split("\n")) {
          if (line.trim()) options.onProgress(line.trim());
        }
      }
    });
    if (options.signal) {
      options.signal.addEventListener("abort", () => {
        child.kill("SIGTERM");
      });
    }
    child.on("close", (code) => {
      const result = parseScriptOutput(stdoutBuffer, code);
      if (code === 0 || result && result.success) {
        resolvePromise(result);
      } else {
        resolvePromise({
          success: false,
          error: result?.error || stderrBuffer.trim().slice(-500) || `Exit code ${code}`,
          output: result
        });
      }
    });
    child.on("error", (err) => {
      reject(new Error(`Failed to spawn script: ${err.message}`));
    });
  });
}
function parseScriptOutput(stdout, exitCode) {
  const trimmed = stdout.trim();
  if (!trimmed) return { success: exitCode === 0 };
  for (const sentinel of SENTINELS) {
    const idx = trimmed.lastIndexOf(sentinel);
    if (idx !== -1) {
      const jsonStr = trimmed.slice(idx + sentinel.length).trim();
      try {
        const parsed = JSON.parse(jsonStr);
        return {
          success: parsed.success !== false,
          output: parsed,
          artifacts: extractArtifacts(parsed)
        };
      } catch {
        continue;
      }
    }
  }
  try {
    const parsed = JSON.parse(trimmed);
    return {
      success: parsed.success !== false,
      output: parsed,
      artifacts: extractArtifacts(parsed)
    };
  } catch {
    return { success: exitCode === 0, output: trimmed.slice(-500) };
  }
}
function extractArtifacts(parsed) {
  const artifacts = [];
  if (parsed?.storyboardPath) {
    artifacts.push({ type: "storyboard", name: "storyboard.json", filePath: parsed.storyboardPath });
  }
  if (parsed?.outputPath) {
    artifacts.push({ type: "registry", name: "generated-scenes.ts", filePath: parsed.outputPath });
  }
  if (parsed?.projectRoot) {
    artifacts.push({ type: "manifest", name: "project", filePath: parsed.projectRoot });
  }
  return artifacts.length > 0 ? artifacts : void 0;
}
var __dirname2, SCRIPTS_DIR, SENTINELS, SCRIPT_MAP, ScriptProvider;
var init_script_provider = __esm({
  "server/core/providers/script-provider.ts"() {
    "use strict";
    __dirname2 = dirname2(fileURLToPath2(import.meta.url));
    SCRIPTS_DIR = resolve(__dirname2, "..", "..", "..", "scripts");
    SENTINELS = ["__RESULT_JSON__", "__TTS_RESULT__", "__MERGE_RESULT__"];
    SCRIPT_MAP = {
      init: {
        script: "init-project.js",
        buildArgs: (ctx) => ["--srt-path", ctx.srtPath]
      },
      storyboard: {
        script: "generate-storyboard.js",
        buildArgs: (ctx) => [ctx.srtPath, join2(ctx.projectRoot, "groups.json"), join2(ctx.projectRoot, "storyboard.json")]
      },
      creators: {
        script: "generate-creator-scenes.js",
        buildArgs: (ctx) => {
          const input = ctx.input;
          return [input.storyboardPath, input.creatorId, String(input.scenesPerCreator), input.outputPath];
        }
      },
      registry: {
        script: "generate-scenes-registry.js",
        buildArgs: (ctx) => [ctx.projectRoot, join2(ctx.projectRoot, "storyboard.json")]
      },
      validate: {
        script: "validate-project.js",
        buildArgs: (ctx) => [ctx.projectRoot, join2(ctx.projectRoot, "storyboard.json")]
      }
    };
    ScriptProvider = class {
      type = "script";
      name = "Script Provider";
      getCapabilities() {
        return {
          type: this.type,
          operations: Object.keys(SCRIPT_MAP),
          requiredConfig: [],
          optionalConfig: []
        };
      }
      async test() {
        const start = Date.now();
        try {
          const ok = existsSync2(SCRIPTS_DIR);
          return {
            ok,
            latencyMs: Date.now() - start,
            message: ok ? "Scripts directory found" : `Scripts directory not found: ${SCRIPTS_DIR}`
          };
        } catch (err) {
          return { ok: false, latencyMs: Date.now() - start, message: err.message };
        }
      }
      async execute(ctx) {
        const runType = ctx.input?.runType || ctx.runType;
        if (!runType || !SCRIPT_MAP[runType]) {
          return { success: false, error: `Unknown script type: ${runType}` };
        }
        const { script, buildArgs } = SCRIPT_MAP[runType];
        const scriptPath = join2(SCRIPTS_DIR, script);
        if (!existsSync2(scriptPath)) {
          return { success: false, error: `Script not found: ${scriptPath}` };
        }
        try {
          const result = await runScript(scriptPath, buildArgs(ctx), {
            cwd: ctx.projectRoot,
            signal: ctx.signal,
            onProgress: ctx.onProgress
          });
          return result;
        } catch (err) {
          return { success: false, error: err.message };
        }
      }
    };
  }
});

// server/core/config.ts
import { readFileSync as readFileSync2, existsSync as existsSync3 } from "fs";
import { join as join3, dirname as dirname3, resolve as resolve2 } from "path";
import { fileURLToPath as fileURLToPath3 } from "url";
function loadEnv() {
  if (envCache) return envCache;
  const env = {};
  if (!existsSync3(ENV_PATH)) {
    envCache = env;
    return env;
  }
  for (const line of readFileSync2(ENV_PATH, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (key) env[key] = value;
  }
  envCache = env;
  return env;
}
function getTtsConfig() {
  const env = { ...loadEnv(), ...process.env };
  const result = {};
  for (const [k, v] of Object.entries(env)) {
    if (v && (k.startsWith("TTS_") || k.startsWith("MIMO_"))) {
      result[k] = v;
    }
  }
  return result;
}
function maskConfig(config) {
  const masked = {};
  for (const [k, v] of Object.entries(config)) {
    if (k.toLowerCase().includes("key") || k.toLowerCase().includes("token")) {
      masked[k] = v ? v.slice(0, 6) + "***" : "";
    } else {
      masked[k] = v;
    }
  }
  return masked;
}
var __dirname3, SKILL_ROOT, ENV_PATH, envCache;
var init_config = __esm({
  "server/core/config.ts"() {
    "use strict";
    __dirname3 = dirname3(fileURLToPath3(import.meta.url));
    SKILL_ROOT = resolve2(__dirname3, "..", "..");
    ENV_PATH = join3(SKILL_ROOT, ".env");
    envCache = null;
  }
});

// server/core/providers/tts-provider.ts
import { spawn as spawn2 } from "child_process";
import { existsSync as existsSync4, statSync } from "fs";
import { join as join4, resolve as resolve3, dirname as dirname4 } from "path";
import { fileURLToPath as fileURLToPath4 } from "url";
async function runTtsGenerate(ctx) {
  const scriptPath = join4(TTS_DIR, "generate-speech.py");
  if (!existsSync4(scriptPath)) {
    return { success: false, error: `TTS script not found: ${scriptPath}` };
  }
  const speechDir = join4(ctx.projectRoot, "speech");
  const pyBin = process.platform === "win32" ? "python" : "python3";
  return new Promise((resolvePromise) => {
    const child = spawn2(pyBin, [scriptPath, ctx.srtPath, speechDir], {
      cwd: ctx.projectRoot,
      env: { ...process.env, ...getTtsConfig() }
    });
    let stdoutBuffer = "";
    let stderrBuffer = "";
    child.stdout.on("data", (chunk) => {
      stdoutBuffer += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderrBuffer += text;
      if (ctx.onProgress) {
        for (const line of text.split("\n")) {
          if (line.trim()) ctx.onProgress(line.trim());
        }
      }
    });
    if (ctx.signal) {
      ctx.signal.addEventListener("abort", () => child.kill("SIGTERM"));
    }
    child.on("close", (code) => {
      const result = parseTtsOutput(stdoutBuffer, code);
      if (result.success) {
        result.artifacts = [{
          type: "speech_segment",
          name: "speech-manifest.json",
          filePath: join4(speechDir, "speech-manifest.json"),
          meta: result.output
        }];
      }
      resolvePromise(result);
    });
  });
}
async function runTtsMerge(ctx) {
  const scriptPath = join4(TTS_DIR, "merge-speech.py");
  const speechDir = join4(ctx.projectRoot, "speech");
  const audioOutput = join4(ctx.projectRoot, "public", "audio.mp3");
  const pyBin = process.platform === "win32" ? "python" : "python3";
  return new Promise((resolvePromise) => {
    const child = spawn2(pyBin, [scriptPath, speechDir, audioOutput], {
      cwd: ctx.projectRoot,
      env: { ...process.env, ...getTtsConfig() }
    });
    let stdoutBuffer = "";
    child.stdout.on("data", (chunk) => {
      stdoutBuffer += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      if (ctx.onProgress) {
        for (const line of chunk.toString().split("\n")) {
          if (line.trim()) ctx.onProgress(line.trim());
        }
      }
    });
    if (ctx.signal) {
      ctx.signal.addEventListener("abort", () => child.kill("SIGTERM"));
    }
    child.on("close", (code) => {
      const result = parseTtsOutput(stdoutBuffer, code);
      if (result.success && existsSync4(audioOutput)) {
        result.artifacts = [{
          type: "audio",
          name: "audio.mp3",
          filePath: audioOutput,
          meta: { sizeMB: Math.round(statSync(audioOutput).size / (1024 * 1024) * 10) / 10 }
        }];
      }
      resolvePromise(result);
    });
  });
}
function parseTtsOutput(stdout, exitCode) {
  const trimmed = stdout.trim();
  for (const sentinel of SENTINELS2) {
    const idx = trimmed.lastIndexOf(sentinel);
    if (idx !== -1) {
      try {
        const parsed = JSON.parse(trimmed.slice(idx + sentinel.length).trim());
        return { success: true, output: parsed };
      } catch {
        continue;
      }
    }
  }
  return { success: exitCode === 0, output: trimmed.slice(-200) };
}
var __dirname4, TTS_DIR, SENTINELS2, TtsProvider;
var init_tts_provider = __esm({
  "server/core/providers/tts-provider.ts"() {
    "use strict";
    init_config();
    __dirname4 = dirname4(fileURLToPath4(import.meta.url));
    TTS_DIR = resolve3(__dirname4, "..", "..", "..", "tts");
    SENTINELS2 = ["__TTS_RESULT__", "__MERGE_RESULT__"];
    TtsProvider = class {
      type = "tts";
      name = "TTS Provider";
      getCapabilities() {
        return {
          type: this.type,
          operations: ["tts", "merge_speech"],
          requiredConfig: ["TTS_PROVIDER"],
          optionalConfig: [
            "TTS_API_KEY",
            "TTS_BASE_URL",
            "TTS_MODEL",
            "TTS_VOICE",
            "MIMO_API_KEY",
            "MIMO_BASE_URL",
            "MIMO_MODEL",
            "MIMO_VOICE",
            "TTS_RATE",
            "TTS_VOLUME",
            "TTS_PITCH"
          ]
        };
      }
      async test() {
        const start = Date.now();
        const config = getTtsConfig();
        const provider = config.TTS_PROVIDER || "openai";
        if (provider === "edge") {
          return { ok: true, latencyMs: Date.now() - start, message: "Edge TTS (no key needed)" };
        }
        const requiredKey = provider === "mimo" ? "MIMO_API_KEY" : "TTS_API_KEY";
        if (!config[requiredKey]) {
          return { ok: false, latencyMs: Date.now() - start, message: `${requiredKey} not configured` };
        }
        return { ok: true, latencyMs: Date.now() - start, message: `${provider} key found`, details: { provider } };
      }
      async execute(ctx) {
        const runType = ctx.input?.runType || "tts";
        if (runType === "tts") {
          return runTtsGenerate(ctx);
        } else if (runType === "merge_speech") {
          return runTtsMerge(ctx);
        }
        return { success: false, error: `Unknown TTS operation: ${runType}` };
      }
    };
  }
});

// server/core/providers/render-provider.ts
import { spawn as spawn3 } from "child_process";
import { existsSync as existsSync5, statSync as statSync2 } from "fs";
import { join as join5 } from "path";
var PERCENT_RE, RenderProvider;
var init_render_provider = __esm({
  "server/core/providers/render-provider.ts"() {
    "use strict";
    PERCENT_RE = /(\d+(?:\.\d+)?)\s*%/;
    RenderProvider = class {
      type = "render";
      name = "Render Provider";
      getCapabilities() {
        return {
          type: this.type,
          operations: ["render"],
          requiredConfig: [],
          optionalConfig: ["scale"]
        };
      }
      async test() {
        const start = Date.now();
        return {
          ok: true,
          latencyMs: Date.now() - start,
          message: "Render provider ready (uses npx remotion render)"
        };
      }
      async execute(ctx) {
        const input = ctx.input || {};
        const outputPath = join5(ctx.projectRoot, "out", "output.mp4");
        const args = ["remotion", "render", "Main", "out/output.mp4"];
        if (input.scale) args.push("--scale", String(input.scale));
        return new Promise((resolvePromise) => {
          const child = spawn3("npx", args, {
            cwd: ctx.projectRoot,
            shell: true,
            // npx args 全是服务器常量，无注入面
            env: { ...process.env, FORCE_COLOR: "0" }
          });
          let stderrBuffer = "";
          child.stdout.on("data", () => {
          });
          child.stderr.on("data", (chunk) => {
            const line = chunk.toString().trim();
            if (!line) return;
            stderrBuffer += line + "\n";
            ctx.onProgress?.(line);
            const pctMatch = line.match(PERCENT_RE);
            if (pctMatch) {
              const progress = Math.min(1, Math.max(0, parseFloat(pctMatch[1]) / 100));
              ctx.onProgress?.(`progress:${Math.round(progress * 100)}%`, { progress });
            }
          });
          if (ctx.signal) {
            ctx.signal.addEventListener("abort", () => child.kill("SIGTERM"));
          }
          child.on("close", (code) => {
            if (code === 0 && existsSync5(outputPath)) {
              const sizeMB = Math.round(statSync2(outputPath).size / (1024 * 1024) * 10) / 10;
              resolvePromise({
                success: true,
                output: { outputPath, sizeMB },
                artifacts: [{
                  type: "video",
                  name: "output.mp4",
                  filePath: outputPath,
                  meta: { sizeMB }
                }]
              });
            } else {
              resolvePromise({
                success: false,
                error: stderrBuffer.trim().slice(-500) || `Render exit code ${code}`
              });
            }
          });
          child.on("error", (err) => {
            resolvePromise({ success: false, error: `Spawn error: ${err.message}` });
          });
        });
      }
    };
  }
});

// server/core/providers/registry.ts
var registry_exports = {};
__export(registry_exports, {
  ProviderRegistry: () => ProviderRegistry,
  getProviderRegistry: () => getProviderRegistry
});
function getProviderRegistry() {
  if (!registryInstance) registryInstance = new ProviderRegistry();
  return registryInstance;
}
var RUN_PROVIDER_MAP, ProviderRegistry, registryInstance;
var init_registry = __esm({
  "server/core/providers/registry.ts"() {
    "use strict";
    init_script_provider();
    init_tts_provider();
    init_render_provider();
    RUN_PROVIDER_MAP = {
      init: "script",
      storyboard: "script",
      creators: "script",
      registry: "script",
      validate: "script",
      render: "render",
      tts: "tts",
      merge_speech: "tts"
    };
    ProviderRegistry = class {
      providers = /* @__PURE__ */ new Map();
      constructor() {
        this.register(new ScriptProvider());
        this.register(new TtsProvider());
        this.register(new RenderProvider());
      }
      register(provider) {
        this.providers.set(provider.type, provider);
      }
      get(type) {
        return this.providers.get(type);
      }
      /** 根据 Run Type 获取对应 Provider */
      getByRunType(runType) {
        const providerType = RUN_PROVIDER_MAP[runType];
        return providerType ? this.providers.get(providerType) : void 0;
      }
      listCapabilities() {
        return Array.from(this.providers.values()).map((p) => p.getCapabilities());
      }
      async testProvider(type) {
        const provider = this.providers.get(type);
        if (!provider) {
          return { ok: false, latencyMs: 0, message: `Unknown provider type: ${type}` };
        }
        return provider.test();
      }
      async executeRun(runType, ctx) {
        const provider = this.getByRunType(runType);
        if (!provider) {
          return { success: false, error: `No provider for run type: ${runType}` };
        }
        return provider.execute(ctx);
      }
    };
    registryInstance = null;
  }
});

// server/core/artifact-store.ts
var artifact_store_exports = {};
__export(artifact_store_exports, {
  archiveOldVersions: () => archiveOldVersions,
  getArtifactFileInfo: () => getArtifactFileInfo,
  getArtifactStream: () => getArtifactStream,
  getArtifactTree: () => getArtifactTree,
  promoteArtifact: () => promoteArtifact,
  registerArtifact: () => registerArtifact
});
import { existsSync as existsSync6, statSync as statSync3, createReadStream } from "fs";
import { join as join6 } from "path";
function registerArtifact(input) {
  return createArtifact({
    projectId: input.projectId,
    runId: input.runId,
    type: input.type,
    name: input.name,
    filePath: input.filePath,
    status: "candidate",
    meta: input.meta
  });
}
function getArtifactStream(artifact) {
  if (!artifact.filePath || !existsSync6(artifact.filePath)) {
    return null;
  }
  return createReadStream(artifact.filePath);
}
function getArtifactFileInfo(artifact) {
  if (!artifact.filePath || !existsSync6(artifact.filePath)) {
    return { size: 0, exists: false };
  }
  return { size: statSync3(artifact.filePath).size, exists: true };
}
function promoteArtifact(id, status) {
  return setArtifactStatus(id, status);
}
function archiveOldVersions(projectId, type, keepId) {
  const artifacts = listArtifacts(projectId, type);
  for (const a of artifacts) {
    if (a.id !== keepId && a.status !== "final") {
      setArtifactStatus(a.id, "archived");
    }
  }
}
function getArtifactTree(projectId) {
  return listArtifacts(projectId);
}
var ARTIFACTS_DIR;
var init_artifact_store = __esm({
  "server/core/artifact-store.ts"() {
    "use strict";
    init_storage();
    ARTIFACTS_DIR = join6(process.cwd(), ".data", "artifacts");
  }
});

// server/index.ts
init_db();

// server/core/run-queue.ts
init_storage();
import { EventEmitter } from "events";
var POLL_INTERVAL_MS = 2e3;
var HEARTBEAT_INTERVAL_MS = 15e3;
var LEASE_TIMEOUT_MS = 6e4;
var RunQueue = class extends EventEmitter {
  activeControllers = /* @__PURE__ */ new Map();
  running = false;
  pollTimer = null;
  start() {
    if (this.running) return;
    this.running = true;
    this.recoverStaleRuns();
    this.poll();
  }
  stop() {
    this.running = false;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    for (const [, controller] of this.activeControllers) {
      controller.abort();
    }
    this.activeControllers.clear();
  }
  /**
   * 提交一个 Run（立即返回 runId，不阻塞）
   */
  submit(projectId, type, input) {
    const run = createRun(projectId, type, input);
    this.emit("run:queued", run);
    return run;
  }
  /**
   * 取消一个 Run
   */
  cancel(runId) {
    const run = getRun(runId);
    if (!run) return null;
    if (run.status === "queued") {
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
    return run;
  }
  /**
   * 崩溃恢复：扫描超时的 running runs
   */
  recoverStaleRuns() {
    const stale = findStaleRuns(LEASE_TIMEOUT_MS);
    for (const run of stale) {
      if (run.progress > 0) {
        updateRunStatus(run.id, "failed", { error: "Worker heartbeat timeout (crash recovery)" });
        addRunEvent(run.id, "failed", "Worker crash detected, run marked as failed");
      } else {
        updateRunStatus(run.id, "queued");
        addRunEvent(run.id, "log", "Run re-queued after worker crash");
      }
    }
    if (stale.length > 0) {
      console.log(`[RunQueue] Recovered ${stale.length} stale runs`);
    }
  }
  /**
   * 轮询 queued runs，交给 Runner 执行
   */
  poll() {
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
  async executeRun(run) {
    const controller = new AbortController();
    this.activeControllers.set(run.id, controller);
    const heartbeatTimer = setInterval(() => {
      Promise.resolve().then(() => (init_storage(), storage_exports)).then(({ heartbeatRun: heartbeatRun2 }) => heartbeatRun2(run.id));
    }, HEARTBEAT_INTERVAL_MS);
    const { getProject: getProject2 } = await Promise.resolve().then(() => (init_storage(), storage_exports));
    const project = getProject2(run.projectId);
    if (!project) {
      updateRunStatus(run.id, "failed", { error: "Project not found" });
      this.cleanup(run.id, heartbeatTimer);
      return;
    }
    const input = run.inputJson ? JSON.parse(run.inputJson) : {};
    input.runType = run.type;
    addRunEvent(run.id, "started", `Run ${run.type} started`);
    this.emit("run:started", run);
    const { getProviderRegistry: getProviderRegistry2 } = await Promise.resolve().then(() => (init_registry(), registry_exports));
    const { registerArtifact: registerArtifact3 } = await Promise.resolve().then(() => (init_artifact_store(), artifact_store_exports));
    const registry = getProviderRegistry2();
    try {
      const result = await registry.executeRun(run.type, {
        projectRoot: project.projectRoot,
        srtPath: project.srtPath,
        input,
        signal: controller.signal,
        onProgress: (message, data) => {
          addRunEvent(run.id, "log", message, data);
          if (data?.progress !== void 0) {
            updateRunStatus(run.id, "running", { progress: data.progress });
          }
          this.emit("run:progress", { runId: run.id, message, data });
        }
      });
      if (result.success) {
        const updated = updateRunStatus(run.id, "completed", {
          output: result.output,
          progress: 1
        });
        if (result.artifacts) {
          for (const a of result.artifacts) {
            registerArtifact3({
              projectId: project.id,
              runId: run.id,
              type: a.type,
              name: a.name,
              filePath: a.filePath,
              meta: a.meta
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
    } catch (err) {
      const updated = updateRunStatus(run.id, "failed", { error: err.message });
      addRunEvent(run.id, "failed", err.message);
      this.emit("run:failed", updated);
    }
    this.cleanup(run.id, heartbeatTimer);
  }
  cleanup(runId, heartbeatTimer) {
    clearInterval(heartbeatTimer);
    this.activeControllers.delete(runId);
  }
};
var queueInstance = null;
function getRunQueue() {
  if (!queueInstance) queueInstance = new RunQueue();
  return queueInstance;
}

// server/api/index.ts
init_storage();
import express from "express";
import { existsSync as existsSync7 } from "fs";
import { join as join7 } from "path";
init_registry();
init_config();
init_artifact_store();

// server/core/types.ts
var RUN_TYPES = [
  "init",
  "storyboard",
  "creators",
  "registry",
  "validate",
  "render",
  "tts",
  "merge_speech"
];

// server/api/index.ts
var PORT = parseInt(process.env.WEB_UI_PORT || "3210", 10);
function createApiServer() {
  const app = express();
  app.use(express.json());
  const webUiDir = join7(process.cwd(), "web-ui", "public");
  app.use(express.static(webUiDir));
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
      res.header("Access-Control-Allow-Headers", "Content-Type");
    }
    next();
  });
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "remotion-video-domain", version: "1.0.0" });
  });
  app.get("/api/projects", (_req, res) => {
    res.json({ projects: listProjects() });
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
    } catch (err) {
      res.status(409).json({ error: err.message });
    }
  });
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
    const run = queue.submit(req.params.id, type, { ...input, runType: type });
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
  app.get("/api/projects/:id/artifacts", (req, res) => {
    const type = req.query.type;
    res.json({ artifacts: listArtifacts(req.params.id, type) });
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
    const artifact = setArtifactStatus(req.params.id, status);
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
  app.get("/api/providers", (_req, res) => {
    const registry = getProviderRegistry();
    res.json({ capabilities: registry.listCapabilities() });
  });
  app.post("/api/providers/:type/test", async (req, res) => {
    const registry = getProviderRegistry();
    const result = await registry.testProvider(req.params.type);
    res.json(result);
  });
  app.get("/api/config", (_req, res) => {
    const config = loadEnv();
    const filtered = {};
    for (const [k, v] of Object.entries(config)) {
      if (k.startsWith("TTS_") || k.startsWith("MIMO_")) {
        filtered[k] = v;
      }
    }
    res.json({ config: maskConfig(filtered) });
  });
  app.get("/api/events", (req, res) => {
    const projectId = req.query.projectId;
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    });
    res.write("\n");
    const queue = getRunQueue();
    const send = (type, data) => {
      if (res.writableEnded) return;
      try {
        if (projectId && data?.run?.projectId && data.run.projectId !== projectId) return;
        res.write(`event: ${type}
`);
        res.write(`data: ${JSON.stringify(data)}

`);
      } catch {
      }
    };
    const onQueued = (run) => send("run:queued", { run });
    const onStarted = (run) => send("run:started", { run });
    const onProgress = (data) => send("run:progress", data);
    const onCompleted = (run) => send("run:completed", { run });
    const onCancelled = (run) => send("run:cancelled", { run });
    const onFailed = (run) => send("run:failed", { run });
    queue.on("run:queued", onQueued);
    queue.on("run:started", onStarted);
    queue.on("run:progress", onProgress);
    queue.on("run:completed", onCompleted);
    queue.on("run:cancelled", onCancelled);
    queue.on("run:failed", onFailed);
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(": heartbeat\n\n");
    }, 3e4);
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
  app.get("*", (req, res) => {
    const indexPath = join7(webUiDir, "index.html");
    if (existsSync7(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).json({ error: "Frontend not built" });
    }
  });
  return app;
}
async function startApiServer() {
  const { initDb: initDb2 } = await Promise.resolve().then(() => (init_db(), db_exports));
  await initDb2();
  getRunQueue().start();
  const app = createApiServer();
  app.listen(PORT, "127.0.0.1", () => {
    console.log(`
\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557`);
    console.log(`\u2551  Remotion Video Domain Service           \u2551`);
    console.log(`\u2551  http://127.0.0.1:${PORT}                    \u2551`);
    console.log(`\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D`);
  });
}
if (import.meta.url === `file://${process.argv[1]}`) {
  startApiServer().catch(console.error);
}

// server/index.ts
var PORT2 = parseInt(process.env.WEB_UI_PORT || "3210", 10);
async function main() {
  console.log("[Server] Initializing database...");
  await initDb();
  console.log("[Server] Starting Run Queue Worker...");
  const queue = getRunQueue();
  queue.start();
  console.log("[Server] Starting Express API...");
  const app = createApiServer();
  app.listen(PORT2, "127.0.0.1", () => {
    console.log("");
    console.log("\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557");
    console.log("\u2551  Remotion Video Project Service          \u2551");
    console.log(`\u2551  API:  http://127.0.0.1:${PORT2}              \u2551`);
    console.log("\u2551  MCP:  node dist/mcp.js (stdio)          \u2551");
    console.log("\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D");
    console.log("");
    console.log("Endpoints:");
    console.log("  GET  /api/health              Health check");
    console.log("  GET  /api/projects            List projects");
    console.log("  GET  /api/projects/:id        Project details");
    console.log("  POST /api/projects/:id/runs   Start a run");
    console.log("  GET  /api/runs/:runId         Run status");
    console.log("  GET  /api/events              SSE event stream");
    console.log("  GET  /api/providers           Provider capabilities");
    console.log("  GET  /api/artifacts/:id       Artifact details");
    console.log("");
  });
}
main().catch((err) => {
  console.error("[Server] Failed to start:", err);
  process.exit(1);
});
//# sourceMappingURL=index.js.map