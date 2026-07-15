/**
 * SQLite 连接管理
 *
 * 单例 Database 实例，WAL 模式，自动 migration。
 * 路径基于 __dirname 绝对定位，不依赖 process.cwd()。
 * Migrations 内联为字符串常量，不依赖外部文件查找。
 */

import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

let dbInstance: Database.Database | null = null;
let initializing: Promise<Database.Database> | null = null;

/**
 * 智能定位 skill root
 * 编译后 dist/mcp.js → __dirname = dist/，skill root = dist 的上一级
 * 开发时 server/core/db.ts → __dirname = server/core/，skill root = 往上两级
 */
function findSkillRoot(): string {
  const c1 = join(__dirname, "..");       // 编译模式: dist/ → skill root
  const c2 = join(__dirname, "..", ".."); // 开发模式: server/core/ → skill root
  if (existsSync(join(c1, ".env.example"))) return c1;
  if (existsSync(join(c2, ".env.example"))) return c2;
  return c2;
}

const SKILL_ROOT = findSkillRoot();
const DB_DIR = join(SKILL_ROOT, ".data");
const DB_PATH = join(DB_DIR, "remotion-video.db");

// ═══ 内联 Migrations ═══════════════════════════════════════
// 不依赖外部 .sql 文件，tsup 打包后也能正常执行
const MIGRATION_001 = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  srt_path TEXT NOT NULL,
  project_root TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  input_json TEXT,
  output_json TEXT,
  error TEXT,
  progress REAL NOT NULL DEFAULT 0,
  worker_lease_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_runs_project ON runs(project_id);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_lease ON runs(worker_lease_at) WHERE status = 'running';

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  run_id TEXT REFERENCES runs(id) ON DELETE SET NULL,
  parent_id TEXT REFERENCES artifacts(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  file_path TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  meta_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_artifacts_project ON artifacts(project_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_type ON artifacts(type);
CREATE INDEX IF NOT EXISTS idx_artifacts_status ON artifacts(status);
CREATE INDEX IF NOT EXISTS idx_artifacts_parent ON artifacts(parent_id);

CREATE TABLE IF NOT EXISTS provider_configs (
  id TEXT PRIMARY KEY,
  provider_type TEXT NOT NULL,
  name TEXT NOT NULL,
  config_json TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_providers_type ON provider_configs(provider_type);

CREATE TABLE IF NOT EXISTS run_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  data_json TEXT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_run ON run_events(run_id);
`;

const ALL_MIGRATIONS = [
  { version: "001_init", sql: MIGRATION_001 },
];

/**
 * 初始化并返回 SQLite Database 单例。
 */
export async function initDb(dbPath?: string): Promise<Database.Database> {
  if (dbInstance) return dbInstance;
  if (initializing) return initializing;

  initializing = (async () => {
    const path = dbPath || DB_PATH;
    if (!existsSync(dirname(path))) mkdirSync(dirname(path), { recursive: true });

    const db = new Database(path);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.pragma("busy_timeout = 5000");

    runMigrations(db);

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

export function getDb(): Database.Database {
  if (!dbInstance) throw new Error("Database not initialized. Call initDb() first.");
  return dbInstance;
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

/**
 * 执行内联 migrations
 */
function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      executed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  for (const migration of ALL_MIGRATIONS) {
    const applied = db
      .prepare("SELECT version FROM schema_migrations WHERE version = ?")
      .get(migration.version);
    if (applied) continue;

    db.exec(migration.sql);
    db.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(migration.version);
  }
}
