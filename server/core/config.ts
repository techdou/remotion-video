/**
 * 配置管理
 *
 * 从 skill 根目录的 .env 读取环境变量。
 * 敏感字段（API Key）不存 SQLite、不返回给前端。
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// 智能定位 skill root：兼容开发模式（server/core/）和编译模式（dist/）
// dist/index.js → 往上 1 级；server/core/config.ts → 往上 2 级
const _candidate1 = resolve(__dirname, "..");       // 编译模式
const _candidate2 = resolve(__dirname, "..", ".."); // 开发模式
export const SKILL_ROOT = existsSync(join(_candidate1, ".env.example"))
  ? _candidate1
  : existsSync(join(_candidate2, ".env.example"))
    ? _candidate2
    : _candidate2;

const ENV_PATH = join(SKILL_ROOT, ".env");

/** 缓存的环境变量 */
let envCache: Record<string, string> | null = null;

/**
 * 加载 .env 文件到缓存（不覆盖已有的 process.env）
 */
export function loadEnv(): Record<string, string> {
  if (envCache) return envCache;

  const env: Record<string, string> = {};
  if (!existsSync(ENV_PATH)) {
    envCache = env;
    return env;
  }

  for (const line of readFileSync(ENV_PATH, "utf-8").split("\n")) {
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

/**
 * 获取环境变量值（优先 process.env，其次 .env 文件）
 */
export function getEnv(key: string, fallback = ""): string {
  return process.env[key] || loadEnv()[key] || fallback;
}

/**
 * 获取 TTS provider 配置（含 API Key，不返回给前端）
 */
export function getTtsConfig(): Record<string, string> {
  const env = { ...loadEnv(), ...process.env } as Record<string, string>;
  // 过滤掉空值
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (v && (k.startsWith("TTS_") || k.startsWith("MIMO_"))) {
      result[k] = v;
    }
  }
  return result;
}

/**
 * 脱敏配置（用于返回给前端）
 */
export function maskConfig(config: Record<string, string>): Record<string, string> {
  const masked: Record<string, string> = {};
  for (const [k, v] of Object.entries(config)) {
    if (k.toLowerCase().includes("key") || k.toLowerCase().includes("token")) {
      masked[k] = v ? v.slice(0, 6) + "***" : "";
    } else {
      masked[k] = v;
    }
  }
  return masked;
}

/**
 * 验证路径在允许的项目基目录下（防路径穿越）
 */
export function validateProjectPath(projectRoot: string): string {
  const resolved = resolve(projectRoot);
  const parentName = basename(dirname(resolved));
  if (parentName !== "remotion-video-projects") {
    throw new Error("非法项目路径");
  }
  return resolved;
}
