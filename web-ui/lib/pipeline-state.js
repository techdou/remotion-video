/**
 * Pipeline 状态管理
 *
 * 在 {projectRoot}/pipeline-state.json 维护工作流状态。
 * Agent 和 Web 都读写这个文件。
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { EventEmitter } from "node:events";

// 全局事件总线（用于 SSE 推送）
export const events = new EventEmitter();
events.setMaxListeners(50);

/**
 * 创建初始 pipeline 状态
 */
export function createInitialState(projectRoot, srtPath) {
  return {
    projectRoot,
    srtPath,
    createdAt: new Date().toISOString(),
    currentStep: null,
    steps: {
      init: { status: "pending" },
      storyboard: { status: "pending" },
      creators: { status: "pending", total: 0, creators: [] },
      registry: { status: "pending" },
      validate: { status: "pending" },
      render: { status: "pending", progress: 0 },
    },
    tts: { status: "idle", provider: null, segments: { total: 0, done: 0 } },
    video: { path: null, durationSec: null, sizeMB: null },
  };
}

/**
 * 读取 pipeline 状态
 */
export function readState(projectRoot) {
  const statePath = resolve(projectRoot, "pipeline-state.json");
  if (!existsSync(statePath)) return null;
  try {
    return JSON.parse(readFileSync(statePath, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * 写入 pipeline 状态（合并写入）
 */
export function writeState(projectRoot, updater) {
  const statePath = resolve(projectRoot, "pipeline-state.json");
  let state = readState(projectRoot) || createInitialState(projectRoot);

  if (typeof updater === "function") {
    state = updater(state);
  } else {
    state = { ...state, ...updater };
  }

  state.updatedAt = new Date().toISOString();
  mkdirSync(dirname(statePath), { recursive: true });
  // 原子写：先写 tmp 再 rename，避免读到半截 JSON
  const tmpPath = statePath + ".tmp";
  writeFileSync(tmpPath, JSON.stringify(state, null, 2), "utf-8");
  renameSync(tmpPath, statePath);

  // 推送状态变更事件
  events.emit("state", { projectRoot, state });
  return state;
}

/**
 * 更新单个步骤的状态
 */
export function updateStep(projectRoot, stepName, stepData) {
  return writeState(projectRoot, (state) => {
    state.steps[stepName] = { ...state.steps[stepName], ...stepData };
    state.currentStep = stepName;
    return state;
  });
}

/**
 * 发送日志事件（SSE 推送用）
 */
export function emitLog(projectRoot, level, message) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };
  events.emit("log", { projectRoot, entry });
}

/**
 * 发送渲染进度事件
 */
export function emitRenderProgress(projectRoot, progress, stage) {
  events.emit("render-progress", { projectRoot, progress, stage });
}
