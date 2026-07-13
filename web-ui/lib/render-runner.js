/**
 * Remotion 渲染包装
 *
 * 方案 A（当前）：spawn `npx remotion render Main out/output.mp4`
 * 解析 stderr 的渲染进度（Remotion CLI 输出百分比和帧号）
 *
 * 进度行格式示例：
 *   "Render frame 450 (45%)"
 *   "Rendering sequence 0: frame 450/1000"
 *   "stitching"
 */

import { runCommand } from "./executor.js";
import { updateStep, emitLog, emitRenderProgress } from "./pipeline-state.js";
import { existsSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

// 匹配百分比的正则
const PERCENT_RE = /(\d+(?:\.\d+)?)\s*%/;
// 匹配帧号的正则
const FRAME_RE = /frame\s+(\d+)\s*\/?\s*(\d+)?/i;

/**
 * 渲染视频
 * @param {string} projectRoot - 项目根目录
 * @param {object} options - { scale: 2, onProgress }
 * @returns {Promise<object>} - { outputPath, sizeMB }
 */
export async function renderVideo(projectRoot, options = {}) {
  const { scale } = options;
  const outputPath = resolve(projectRoot, "out", "output.mp4");

  updateStep(projectRoot, "render", { status: "running", progress: 0 });
  emitLog(projectRoot, "info", `开始渲染 → ${outputPath}`);

  // 构建渲染命令
  const args = ["remotion", "render", "Main", "out/output.mp4"];
  if (scale) args.push("--scale", String(scale));

  try {
    await runCommand("npx", args, {
      cwd: projectRoot,
      onProgress: (line) => {
        emitLog(projectRoot, "render", line);

        // 解析进度
        let progress = null;
        const pctMatch = line.match(PERCENT_RE);
        if (pctMatch) {
          progress = parseFloat(pctMatch[1]) / 100;
        } else {
          const frameMatch = line.match(FRAME_RE);
          if (frameMatch && frameMatch[2]) {
            progress = parseInt(frameMatch[1]) / parseInt(frameMatch[2]);
          }
        }

        if (progress !== null) {
          progress = Math.min(1, Math.max(0, progress));
          updateStep(projectRoot, "render", { status: "running", progress });
          emitRenderProgress(projectRoot, progress, line);
        }
      },
    });

    // 渲染完成
    let sizeMB = null;
    if (existsSync(outputPath)) {
      sizeMB = Math.round((statSync(outputPath).size / (1024 * 1024)) * 10) / 10;
    }

    updateStep(projectRoot, "render", { status: "done", progress: 1 });

    // 更新 video 信息
    const { writeState } = await import("./pipeline-state.js");
    writeState(projectRoot, (state) => {
      state.video = { path: outputPath, sizeMB };
      return state;
    });

    emitLog(projectRoot, "info", `渲染完成: ${sizeMB} MB`);
    return { outputPath, sizeMB };
  } catch (err) {
    updateStep(projectRoot, "render", { status: "failed", error: err.message });
    emitLog(projectRoot, "error", `渲染失败: ${err.message}`);
    throw err;
  }
}
