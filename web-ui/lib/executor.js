/**
 * 脚本执行器 — spawn 现有 JS/Python 脚本，解析输出
 *
 * 协议：
 *   - stdout 按 __RESULT_JSON__ 分割，取最后一段 parse JSON（4个脚本用此标记）
 *   - 无标记的脚本直接 parse 整个 stdout（init/creator-scenes/ensure-deps）
 *   - Python 脚本用 __TTS_RESULT__ / __MERGE_RESULT__ 哨兵
 *   - stderr 行实时推给 onProgress 回调
 */

import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = resolve(__dirname, "..", "..");
const SCRIPTS_DIR = resolve(SKILL_ROOT, "scripts");
const TTS_DIR = resolve(SKILL_ROOT, "tts");

// 哨兵标记列表（按优先级匹配）
const SENTINELS = ["__RESULT_JSON__", "__TTS_RESULT__", "__MERGE_RESULT__"];

/**
 * 运行 Node.js 脚本
 * @param {string} scriptName - 脚本文件名（如 "init-project.js"）
 * @param {string[]} args - CLI 参数数组
 * @param {object} options - { onProgress(line), cwd }
 * @returns {Promise<object>} - 解析后的 JSON 结果
 */
export function runNodeScript(scriptName, args = [], options = {}) {
  const scriptPath = resolve(SCRIPTS_DIR, scriptName);
  if (!existsSync(scriptPath)) {
    return Promise.reject(new Error(`脚本不存在: ${scriptPath}`));
  }
  return _run("node", [scriptPath, ...args], options);
}

/**
 * 运行 Python 脚本
 * @param {string} scriptName - TTS 目录下的脚本名（如 "generate-speech.py"）
 * @param {string[]} args - CLI 参数
 * @param {object} options
 */
export function runPythonScript(scriptName, args = [], options = {}) {
  const scriptPath = resolve(TTS_DIR, scriptName);
  if (!existsSync(scriptPath)) {
    return Promise.reject(new Error(`脚本不存在: ${scriptPath}`));
  }
  // Windows 上 python3 可能不存在，用 python
  const pyBin = process.platform === "win32" ? "python" : "python3";
  return _run(pyBin, [scriptPath, ...args], options);
}

/**
 * 运行任意命令（用于 npx remotion render 等）
 */
export function runCommand(bin, args = [], options = {}) {
  return _run(bin, args, options);
}

/**
 * 核心执行函数
 */
function _run(bin, args, { onProgress, cwd } = {}) {
  return new Promise((resolvePromise, reject) => {
    // Windows 上 npx 需要 .cmd 后缀；不用 shell:true 防止命令注入
    const actualBin = process.platform === "win32" && bin === "npx" ? "npx.cmd" : bin;
    const child = spawn(actualBin, args, {
      cwd: cwd || process.cwd(),
      shell: false,
      env: { ...process.env, FORCE_COLOR: "0" },
    });

    let stdoutBuffer = "";
    let stderrBuffer = "";

    child.stdout.on("data", (chunk) => {
      stdoutBuffer += chunk.toString("utf-8");
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString("utf-8");
      stderrBuffer += text;
      // 逐行推给 onProgress
      if (onProgress) {
        for (const line of text.split("\n")) {
          const trimmed = line.trim();
          if (trimmed) onProgress(trimmed);
        }
      }
    });

    child.on("close", (code) => {
      const result = _parseOutput(stdoutBuffer, stderrBuffer, code);
      if (code === 0 || (result && result.success !== false)) {
        resolvePromise(result);
      } else {
        // 失败时把 result（可能含 errors）或原始 stderr 包装成 Error
        const errMsg = result
          ? JSON.stringify(result)
          : stderrBuffer.trim() || `进程退出码 ${code}`;
        const err = new Error(errMsg);
        err.result = result;
        err.stderr = stderrBuffer;
        reject(err);
      }
    });

    child.on("error", (err) => {
      reject(new Error(`无法启动 ${bin}: ${err.message}`));
    });
  });
}

/**
 * 解析脚本输出，提取 JSON 结果
 */
function _parseOutput(stdout, stderr, exitCode) {
  const trimmedStdout = stdout.trim();
  if (!trimmedStdout) {
    return exitCode === 0 ? { success: true } : null;
  }

  // 尝试各种哨兵标记
  for (const sentinel of SENTINELS) {
    const idx = trimmedStdout.lastIndexOf(sentinel);
    if (idx !== -1) {
      const jsonStr = trimmedStdout.slice(idx + sentinel.length).trim();
      try {
        return JSON.parse(jsonStr);
      } catch {
        continue;
      }
    }
  }

  // 无哨兵，尝试直接 parse 整个 stdout
  try {
    return JSON.parse(trimmedStdout);
  } catch {
    // 不是 JSON，返回原始文本
    return { success: exitCode === 0, raw: trimmedStdout.slice(-500) };
  }
}
