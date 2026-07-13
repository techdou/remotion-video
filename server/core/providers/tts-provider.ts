/**
 * TTS Provider — 包装 tts/*.py
 *
 * 调用 generate-speech.py 和 merge-speech.py，
 * 保持 Python 子系统不变。
 */

import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Provider, RunContext, RunResult } from "./base.js";
import type { ProviderCapability, ProviderTestResult } from "../types.js";
import { getTtsConfig } from "../config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TTS_DIR = resolve(__dirname, "..", "..", "..", "tts");

const SENTINELS = ["__TTS_RESULT__", "__MERGE_RESULT__"];

export class TtsProvider implements Provider {
  readonly type = "tts";
  readonly name = "TTS Provider";

  getCapabilities(): ProviderCapability {
    return {
      type: this.type,
      operations: ["tts", "merge_speech"],
      requiredConfig: ["TTS_PROVIDER"],
      optionalConfig: [
        "TTS_API_KEY", "TTS_BASE_URL", "TTS_MODEL", "TTS_VOICE",
        "MIMO_API_KEY", "MIMO_BASE_URL", "MIMO_MODEL", "MIMO_VOICE",
        "TTS_RATE", "TTS_VOLUME", "TTS_PITCH",
      ],
    };
  }

  async test(): Promise<ProviderTestResult> {
    const start = Date.now();
    const config = getTtsConfig();
    const provider = config.TTS_PROVIDER || "openai";

    if (provider === "edge") {
      return { ok: true, latencyMs: Date.now() - start, message: "Edge TTS (no key needed)" };
    }

    const requiredKey = provider === "mimo" ? "MIMO_API_KEY" : "TTS_API_KEY";
    if (!config[requiredKey]) {
      return { ok: false, latencyMs: Date.now() - start, message: `${requiredKey} not configured` };
    }
    return { ok: true, latencyMs: Date.now() - start, message: `${provider} key found`, details: { provider } };
  }

  async execute(ctx: RunContext): Promise<RunResult> {
    const runType = (ctx.input as { runType?: string })?.runType || "tts";

    if (runType === "tts") {
      return runTtsGenerate(ctx);
    } else if (runType === "merge_speech") {
      return runTtsMerge(ctx);
    }
    return { success: false, error: `Unknown TTS operation: ${runType}` };
  }
}

async function runTtsGenerate(ctx: RunContext): Promise<RunResult> {
  const scriptPath = join(TTS_DIR, "generate-speech.py");
  if (!existsSync(scriptPath)) {
    return { success: false, error: `TTS script not found: ${scriptPath}` };
  }

  const speechDir = join(ctx.projectRoot, "speech");
  const pyBin = process.platform === "win32" ? "python" : "python3";

  return new Promise((resolvePromise) => {
    const child = spawn(pyBin, [scriptPath, ctx.srtPath, speechDir], {
      cwd: ctx.projectRoot,
      env: { ...process.env, ...getTtsConfig() },
    });

    let stdoutBuffer = "";
    let stderrBuffer = "";

    child.stdout.on("data", (chunk) => { stdoutBuffer += chunk.toString(); });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderrBuffer += text;
      if (ctx.onProgress) {
        for (const line of text.split("\n")) {
          if (line.trim()) ctx.onProgress(line.trim());
        }
      }
    });

    if (ctx.signal) {
      ctx.signal.addEventListener("abort", () => child.kill("SIGTERM"));
    }

    child.on("close", (code) => {
      const result = parseTtsOutput(stdoutBuffer, code);
      if (result.success) {
        result.artifacts = [{
          type: "speech_segment",
          name: "speech-manifest.json",
          filePath: join(speechDir, "speech-manifest.json"),
          meta: result.output as any,
        }];
      }
      resolvePromise(result);
    });
  });
}

async function runTtsMerge(ctx: RunContext): Promise<RunResult> {
  const scriptPath = join(TTS_DIR, "merge-speech.py");
  const speechDir = join(ctx.projectRoot, "speech");
  const audioOutput = join(ctx.projectRoot, "public", "audio.mp3");
  const pyBin = process.platform === "win32" ? "python" : "python3";

  return new Promise((resolvePromise) => {
    const child = spawn(pyBin, [scriptPath, speechDir, audioOutput], {
      cwd: ctx.projectRoot,
      env: { ...process.env, ...getTtsConfig() },
    });

    let stdoutBuffer = "";
    child.stdout.on("data", (chunk) => { stdoutBuffer += chunk.toString(); });
    child.stderr.on("data", (chunk) => {
      if (ctx.onProgress) {
        for (const line of chunk.toString().split("\n")) {
          if (line.trim()) ctx.onProgress(line.trim());
        }
      }
    });

    if (ctx.signal) {
      ctx.signal.addEventListener("abort", () => child.kill("SIGTERM"));
    }

    child.on("close", (code) => {
      const result = parseTtsOutput(stdoutBuffer, code);
      if (result.success && existsSync(audioOutput)) {
        result.artifacts = [{
          type: "audio",
          name: "audio.mp3",
          filePath: audioOutput,
          meta: { sizeMB: Math.round((statSync(audioOutput).size / (1024 * 1024)) * 10) / 10 },
        }];
      }
      resolvePromise(result);
    });
  });
}

function parseTtsOutput(stdout: string, exitCode: number | null): RunResult {
  const trimmed = stdout.trim();
  for (const sentinel of SENTINELS) {
    const idx = trimmed.lastIndexOf(sentinel);
    if (idx !== -1) {
      try {
        const parsed = JSON.parse(trimmed.slice(idx + sentinel.length).trim());
        return { success: true, output: parsed };
      } catch { continue; }
    }
  }
  return { success: exitCode === 0, output: trimmed.slice(-200) };
}
