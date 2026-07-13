/**
 * Provider 注册表
 *
 * 管理 Provider 实例，按 type 路由 Run 到对应 Provider。
 */

import type { Provider, RunContext, RunResult } from "./base.js";
import type { ProviderCapability, ProviderTestResult, RunType } from "../types.js";
import { ScriptProvider } from "./script-provider.js";
import { TtsProvider } from "./tts-provider.js";
import { RenderProvider } from "./render-provider.js";

// Run Type → Provider Type 映射
const RUN_PROVIDER_MAP: Record<RunType, string> = {
  init: "script",
  storyboard: "script",
  creators: "script",
  registry: "script",
  validate: "script",
  render: "render",
  tts: "tts",
  merge_speech: "tts",
};

export class ProviderRegistry {
  private providers = new Map<string, Provider>();

  constructor() {
    // 注册内置 Provider
    this.register(new ScriptProvider());
    this.register(new TtsProvider());
    this.register(new RenderProvider());
  }

  register(provider: Provider): void {
    this.providers.set(provider.type, provider);
  }

  get(type: string): Provider | undefined {
    return this.providers.get(type);
  }

  /** 根据 Run Type 获取对应 Provider */
  getByRunType(runType: RunType): Provider | undefined {
    const providerType = RUN_PROVIDER_MAP[runType];
    return providerType ? this.providers.get(providerType) : undefined;
  }

  listCapabilities(): ProviderCapability[] {
    return Array.from(this.providers.values()).map((p) => p.getCapabilities());
  }

  async testProvider(type: string): Promise<ProviderTestResult> {
    const provider = this.providers.get(type);
    if (!provider) {
      return { ok: false, latencyMs: 0, message: `Unknown provider type: ${type}` };
    }
    return provider.test();
  }

  async executeRun(runType: RunType, ctx: RunContext): Promise<RunResult> {
    const provider = this.getByRunType(runType);
    if (!provider) {
      return { success: false, error: `No provider for run type: ${runType}` };
    }
    return provider.execute(ctx);
  }
}

// 单例
let registryInstance: ProviderRegistry | null = null;

export function getProviderRegistry(): ProviderRegistry {
  if (!registryInstance) registryInstance = new ProviderRegistry();
  return registryInstance;
}
