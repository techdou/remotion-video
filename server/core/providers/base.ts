/**
 * Provider 基础接口
 *
 * 所有 Provider（script/tts/render）实现这个接口。
 * Provider 封装外部 CLI/API，提供能力探测和健康检查。
 */

import type { ProviderCapability, ProviderTestResult } from "../types.js";

export interface RunContext {
  projectRoot: string;
  srtPath: string;
  input?: unknown;
  signal?: AbortSignal;
  onProgress?: (message: string, data?: Record<string, unknown>) => void;
}

export interface RunResult {
  success: boolean;
  output?: unknown;
  artifacts?: Array<{
    type: string;
    name: string;
    filePath?: string;
    meta?: Record<string, unknown>;
  }>;
  error?: string;
}

export interface Provider {
  /** Provider 类型标识 */
  readonly type: string;

  /** 人类可读名称 */
  readonly name: string;

  /** 能力描述 */
  getCapabilities(): ProviderCapability;

  /** 健康检查（探测 Provider 是否可用） */
  test(): Promise<ProviderTestResult>;

  /** 执行操作 */
  execute(ctx: RunContext): Promise<RunResult>;
}
