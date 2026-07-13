/**
 * Script Provider — 包装现有 scripts/*.js
 *
 * 现有脚本保持 CommonJS + stdout JSON 协议不变，
 * 此 Provider 通过子进程 spawn 调用它们。
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Provider, RunContext, RunResult } from "./base.js";
import type { ProviderCapability, ProviderTestResult } from "../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// 从 dist/core/providers/ 往上到 skill 根目录的 scripts/
const SCRIPTS_DIR = resolve(__dirname, "..", "..", "..", "scripts");

// 哨兵标记（与 executor.js 一致）
const SENTINELS = ["__RESULT_JSON__", "__TTS_RESULT__", "__MERGE_RESULT__"];

// Script 映射：run type → script 文件名 + 参数构建器
const SCRIPT_MAP: Record<string, {
  script: string;
  buildArgs: (ctx: RunContext) => string[];
}> = {
  init: {
    script: "init-project.js",
    buildArgs: (ctx) => ["--srt-path", ctx.srtPath],
  },
  storyboard: {
    script: "generate-storyboard.js",
    buildArgs: (ctx) => [ctx.srtPath, join(ctx.projectRoot, "groups.json"), join(ctx.projectRoot, "storyboard.json")],
  },
  creators: {
    script: "generate-creator-scenes.js",
    buildArgs: (ctx) => {
      const input = ctx.input as { storyboardPath: string; creatorId: string; scenesPerCreator: number; outputPath: string };
      return [input.storyboardPath, input.creatorId, String(input.scenesPerCreator), input.outputPath];
    },
  },
  registry: {
    script: "generate-scenes-registry.js",
    buildArgs: (ctx) => [ctx.projectRoot, join(ctx.projectRoot, "storyboard.json")],
  },
  validate: {
    script: "validate-project.js",
    buildArgs: (ctx) => [ctx.projectRoot, join(ctx.projectRoot, "storyboard.json")],
  },
};

export class ScriptProvider implements Provider {
  readonly type = "script";
  readonly name = "Script Provider";

  getCapabilities(): ProviderCapability {
    return {
      type: this.type,
      operations: Object.keys(SCRIPT_MAP),
      requiredConfig: [],
      optionalConfig: [],
    };
  }

  async test(): Promise<ProviderTestResult> {
    const start = Date.now();
    try {
      const ok = existsSync(SCRIPTS_DIR);
      return {
        ok,
        latencyMs: Date.now() - start,
        message: ok ? "Scripts directory found" : `Scripts directory not found: ${SCRIPTS_DIR}`,
      };
    } catch (err: any) {
      return { ok: false, latencyMs: Date.now() - start, message: err.message };
    }
  }

  async execute(ctx: RunContext): Promise<RunResult> {
    const runType = (ctx.input as { runType?: string })?.runType || (ctx as any).runType;
    if (!runType || !SCRIPT_MAP[runType]) {
      return { success: false, error: `Unknown script type: ${runType}` };
    }

    const { script, buildArgs } = SCRIPT_MAP[runType];
    const scriptPath = join(SCRIPTS_DIR, script);

    if (!existsSync(scriptPath)) {
      return { success: false, error: `Script not found: ${scriptPath}` };
    }

    try {
      const result = await runScript(scriptPath, buildArgs(ctx), {
        cwd: ctx.projectRoot,
        signal: ctx.signal,
        onProgress: ctx.onProgress,
      });
      return result;
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}

/**
 * 运行 Node.js 脚本并解析输出
 */
function runScript(
  scriptPath: string,
  args: string[],
  options: {
    cwd: string;
    signal?: AbortSignal;
    onProgress?: (message: string, data?: Record<string, unknown>) => void;
  },
): Promise<RunResult> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("node", [scriptPath, ...args], {
      cwd: options.cwd,
      env: { ...process.env, FORCE_COLOR: "0" },
    });

    let stdoutBuffer = "";
    let stderrBuffer = "";

    child.stdout.on("data", (chunk) => { stdoutBuffer += chunk.toString(); });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderrBuffer += text;
      if (options.onProgress) {
        for (const line of text.split("\n")) {
          if (line.trim()) options.onProgress(line.trim());
        }
      }
    });

    // AbortSignal 支持
    if (options.signal) {
      options.signal.addEventListener("abort", () => {
        child.kill("SIGTERM");
      });
    }

    child.on("close", (code) => {
      const result = parseScriptOutput(stdoutBuffer, code);
      if (code === 0 || (result && result.success)) {
        resolvePromise(result);
      } else {
        resolvePromise({
          success: false,
          error: result?.error || stderrBuffer.trim().slice(-500) || `Exit code ${code}`,
          output: result,
        });
      }
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to spawn script: ${err.message}`));
    });
  });
}

/**
 * 解析脚本输出（哨兵标记 + JSON 回退）
 */
function parseScriptOutput(stdout: string, exitCode: number | null): RunResult {
  const trimmed = stdout.trim();
  if (!trimmed) return { success: exitCode === 0 };

  // 尝试哨兵标记
  for (const sentinel of SENTINELS) {
    const idx = trimmed.lastIndexOf(sentinel);
    if (idx !== -1) {
      const jsonStr = trimmed.slice(idx + sentinel.length).trim();
      try {
        const parsed = JSON.parse(jsonStr);
        return {
          success: parsed.success !== false,
          output: parsed,
          artifacts: extractArtifacts(parsed),
        };
      } catch { continue; }
    }
  }

  // 回退：直接 parse
  try {
    const parsed = JSON.parse(trimmed);
    return {
      success: parsed.success !== false,
      output: parsed,
      artifacts: extractArtifacts(parsed),
    };
  } catch {
    return { success: exitCode === 0, output: trimmed.slice(-500) };
  }
}

function extractArtifacts(parsed: any): RunResult["artifacts"] {
  const artifacts: NonNullable<RunResult["artifacts"]> = [];
  if (parsed?.storyboardPath) {
    artifacts.push({ type: "storyboard", name: "storyboard.json", filePath: parsed.storyboardPath });
  }
  if (parsed?.outputPath) {
    artifacts.push({ type: "registry", name: "generated-scenes.ts", filePath: parsed.outputPath });
  }
  if (parsed?.projectRoot) {
    artifacts.push({ type: "manifest", name: "project", filePath: parsed.projectRoot });
  }
  return artifacts.length > 0 ? artifacts : undefined;
}
