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

// 匹配百分比的正则（如 "45%" 或 "Render 45%"）
const PERCENT_RE = /(\d+(?:\.\d+)?)\s*%/;
// 匹配帧号的正则（覆盖多种 Remotion 输出格式）
// "frame 450/1000"、"450/1000 frames rendered"、"450 of 1000"
const FRAME_RE = /(\d+)\s*\/\s*(\d+)\s*(?:frames?|rendered)?|frame\s+(\d+)\s*\/?\s*(\d+)?/i;

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
          if (frameMatch) {
            // 新正则有两个分支：N/M 或 frame N/M
            const current = frameMatch[1] || frameMatch[3];
            const total = frameMatch[2] || frameMatch[4];
            if (current && total) {
              progress = parseInt(current) / parseInt(total);
            }
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
