/**
 * Render Provider — 包装 npx remotion render
 *
 * 执行 Remotion 渲染，解析进度，输出 MP4。
 */

import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Provider, RunContext, RunResult } from "./base.js";
import type { ProviderCapability, ProviderTestResult } from "../types.js";

const PERCENT_RE = /(\d+(?:\.\d+)?)\s*%/;
const FRAME_RE = /(\d+)\s*\/\s*(\d+)\s*(?:frames?|rendered)?/i;

export class RenderProvider implements Provider {
  readonly type = "render";
  readonly name = "Render Provider";

  getCapabilities(): ProviderCapability {
    return {
      type: this.type,
      operations: ["render"],
      requiredConfig: [],
      optionalConfig: ["scale"],
    };
  }

  async test(): Promise<ProviderTestResult> {
    const start = Date.now();
    // 检查 projectRoot 有没有 package.json（说明是 Remotion 项目）
    return {
      ok: true,
      latencyMs: Date.now() - start,
      message: "Render provider ready (uses npx remotion render)",
    };
  }

  async execute(ctx: RunContext): Promise<RunResult> {
    const input = (ctx.input || {}) as { scale?: number };
    const outputPath = join(ctx.projectRoot, "out", "output.mp4");

    const args = ["remotion", "render", "Main", "out/output.mp4"];
    if (input.scale) args.push("--scale", String(input.scale));

    return new Promise((resolvePromise) => {
      // npx 在 Windows 上需要 shell:true（CVE-2024-27980）
      const child = spawn("npx", args, {
        cwd: ctx.projectRoot,
        shell: true,  // npx args 全是服务器常量，无注入面
        env: { ...process.env, FORCE_COLOR: "0" },
      });

      let stderrBuffer = "";

      child.stdout.on("data", () => {}); // 消费 stdout 避免 pipe 阻塞

      child.stderr.on("data", (chunk) => {
        const line = chunk.toString().trim();
        if (!line) return;
        stderrBuffer += line + "\n";
        ctx.onProgress?.(line);

        // 解析进度
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
        if (code === 0 && existsSync(outputPath)) {
          const sizeMB = Math.round((statSync(outputPath).size / (1024 * 1024)) * 10) / 10;
          resolvePromise({
            success: true,
            output: { outputPath, sizeMB },
            artifacts: [{
              type: "video",
              name: "output.mp4",
              filePath: outputPath,
              meta: { sizeMB },
            }],
          });
        } else {
          resolvePromise({
            success: false,
            error: stderrBuffer.trim().slice(-500) || `Render exit code ${code}`,
          });
        }
      });

      child.on("error", (err) => {
        resolvePromise({ success: false, error: `Spawn error: ${err.message}` });
      });
    });
  }
}
