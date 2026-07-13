/**
 * 配置管理
 *
 * 从 skill 根目录的 .env 读取环境变量。
 * 敏感字段（API Key）不存 SQLite、不返回给前端。
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// skill 根目录：从 dist/core/ 往上两级，或从 server/core/ 往上两级
export const SKILL_ROOT = resolve(__dirname, "..", "..");

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
  const { basename, dirname } = require("node:path");
  const resolved = resolve(projectRoot);
  const parentName = basename(dirname(resolved));
  if (parentName !== "remotion-video-projects") {
    throw new Error("非法项目路径");
  }
  return resolved;
}
