/**
 * SQLite 连接管理
 *
 * 单例 Database 实例，WAL 模式，自动 migration。
 */

import Database from "better-sqlite3";
import { readFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

let dbInstance: Database.Database | null = null;
let initializing: Promise<Database.Database> | null = null;

const DB_DIR = join(process.cwd(), ".data");
const DB_PATH = join(DB_DIR, "remotion-video.db");

/**
 * 初始化并返回 SQLite Database 单例。
 * 幂等：多次调用返回同一实例。
 */
export async function initDb(dbPath?: string): Promise<Database.Database> {
  if (dbInstance) return dbInstance;
  if (initializing) return initializing;

  initializing = (async () => {
    const path = dbPath || DB_PATH;
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const db = new Database(path);

    // WAL 模式（并发读写不阻塞）
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.pragma("busy_timeout = 5000");

    // 执行 migrations
    await runMigrations(db);

    dbInstance = db;
    initializing = null;
    return db;
  })();

  try {
    return await initializing;
  } catch (err) {
    initializing = null; // 清除失败状态，允许重试
    throw err;
  }
}

/**
 * 同步获取 Database（必须先 initDb）
 */
export function getDb(): Database.Database {
  if (!dbInstance) {
    throw new Error("Database not initialized. Call initDb() first.");
  }
  return dbInstance;
}

/**
 * 关闭 Database（测试用）
 */
export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

/**
 * 执行 migration SQL 文件
 *
 * 维护一个 schema_migrations 表跟踪已执行的 migration。
 */
async function runMigrations(db: Database.Database): Promise<void> {
  // 创建 migration 跟踪表
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      executed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // 查找 migration 文件（兼容开发 tsup 和编译 dist 两种路径）
  let migrationsDir: string;
  const candidates = [
    join(__dirname, "migrations"),           // 编译后 dist/core/migrations/
    join(process.cwd(), "server", "core", "migrations"), // 开发时
  ];
  migrationsDir = candidates.find((p) => existsSync(p)) || candidates[0];

  if (!existsSync(migrationsDir)) {
    // 没有 migration 目录，跳过
    return;
  }

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const version = file.replace(/\.sql$/, "");
    const applied = db
      .prepare("SELECT version FROM schema_migrations WHERE version = ?")
      .get(version);

    if (applied) continue; // 已执行

    const sql = readFileSync(join(migrationsDir, file), "utf-8");
    db.exec(sql);
    db.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(version);
  }
}
