/**
 * 核心类型定义
 *
 * 所有层（core / mcp / api）共享的类型契约。
 */

// ════════════════════════════════════════════════════════
// Project
// ════════════════════════════════════════════════════════

export interface Project {
  id: string;
  name: string;
  srtPath: string;
  projectRoot: string;
  revision: number;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
}

export type ProjectStatus = "active" | "archived";

// ════════════════════════════════════════════════════════
// Run（一次工作流执行）
// ════════════════════════════════════════════════════════

export interface Run {
  id: string;
  projectId: string;
  type: RunType;
  status: RunStatus;
  inputJson: string | null;
  outputJson: string | null;
  error: string | null;
  progress: number;
  workerLeaseAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export type RunType =
  | "init"
  | "storyboard"
  | "creators"
  | "registry"
  | "validate"
  | "render"
  | "tts"
  | "merge_speech";

export type RunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

/** 允许的 Run 类型白名单 */
export const RUN_TYPES: RunType[] = [
  "init", "storyboard", "creators", "registry",
  "validate", "render", "tts", "merge_speech",
];

// ════════════════════════════════════════════════════════
// Artifact（产物）
// ════════════════════════════════════════════════════════

export interface Artifact {
  id: string;
  projectId: string;
  runId: string | null;
  parentId: string | null;       // 版本树：父 artifact
  type: ArtifactType;
  name: string;
  filePath: string | null;
  status: ArtifactStatus;
  metaJson: string | null;       // JSON 元数据（sceneCount, sizeMB 等）
  createdAt: string;
}

export type ArtifactType =
  | "storyboard"       // storyboard.json
  | "scene_plan"       // scene-plans/*.json
  | "scene_component"  // SceneXXX.tsx
  | "registry"         // generated-scenes.ts
  | "speech_segment"   // 语音分段
  | "audio"            // 合并音频
  | "video"            // 最终 MP4
  | "manifest"         // 清单文件
  | "validation";      // 校验报告

export type ArtifactStatus = "draft" | "candidate" | "selected" | "final" | "archived";

// ════════════════════════════════════════════════════════
// Provider
// ════════════════════════════════════════════════════════

export interface ProviderConfig {
  id: string;
  providerType: string;          // tts_openai | tts_edge | tts_mimo | render | script
  name: string;
  configJson: string;            // 非敏感配置（base_url, model, voice 等）
  isDefault: boolean;
  createdAt: string;
}

export interface ProviderCapability {
  type: string;                   // provider type
  operations: string[];           // 支持的操作列表
  requiredConfig: string[];       // 必需配置项
  optionalConfig: string[];       // 可选配置项
}

export interface ProviderTestResult {
  ok: boolean;
  latencyMs: number;
  message: string;
  details?: Record<string, unknown>;
}

// ════════════════════════════════════════════════════════
// Run 事件（用于 SSE 推送和事件流）
// ════════════════════════════════════════════════════════

export interface RunEvent {
  runId: string;
  type: RunEventType;
  message: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

export type RunEventType =
  | "started"
  | "progress"
  | "log"
  | "artifact_created"
  | "completed"
  | "failed"
  | "cancelled";

// ════════════════════════════════════════════════════════
// Patch（项目变更）
// ════════════════════════════════════════════════════════

export interface ProjectPatch {
  name?: string;
  status?: ProjectStatus;
}

// ════════════════════════════════════════════════════════
// 验证结果
// ════════════════════════════════════════════════════════

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ════════════════════════════════════════════════════════
// 模板
// ════════════════════════════════════════════════════════

export interface Template {
  id: string;
  name: string;
  description: string;
  profile: string;        // 视频配置档：1080p30 | 4k60
}
