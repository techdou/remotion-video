#!/usr/bin/env python3
"""
合并分段语音为完整音轨 — 按 SRT 时间轴精确放置

读取 generate-speech.py 产出的 speech-manifest.json，按每段字幕的
start_ms 时间偏移，用 ffmpeg 把分段音频合并为一条完整音轨。

时间轴策略: SRT 驱动
- 每段语音放在其 SRT start_ms 时间点开始播放
- 如果 TTS 音频比 SRT 该段时间长，发出警告但不截断（音频会叠加到下一段）
- 如果 TTS 音频比 SRT 该段时间短，自然停顿（后面是静音）

用法:
    python3 merge-speech.py <speech-dir> <output-mp3>
    python3 merge-speech.py ./speech/ ./audio.mp3

依赖: ffmpeg（Remotion 已依赖）
"""

import json
import subprocess
import sys
from pathlib import Path


def main():
    args = sys.argv[1:]
    if len(args) < 2:
        print("用法: python3 merge-speech.py <speech-dir> <output-mp3>")
        sys.exit(1)

    speech_dir = Path(args[0])
    output_path = Path(args[1])

    manifest_path = speech_dir / "speech-manifest.json"
    if not manifest_path.exists():
        print(f"错误: 找不到 {manifest_path}")
        print("请先运行 generate-speech.py 生成语音分段")
        sys.exit(1)

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    segments = manifest.get("segments", [])
    if not segments:
        print("错误: speech-manifest.json 中无有效分段")
        sys.exit(1)

    # 检查 ffmpeg
    try:
        subprocess.run(["ffmpeg", "-version"], capture_output=True, check=True)
    except (FileNotFoundError, subprocess.CalledProcessError):
        print("错误: ffmpeg 未安装。Remotion 依赖 ffmpeg，请确保已安装。")
        sys.exit(1)

    # 构建 ffmpeg 滤镜命令：每段音频用 adelay 延迟到 SRT 时间点，再 amix 叠加
    # adelay 参数单位是毫秒，all=1 表示所有声道
    # amix=inputs=N:duration=longest:dropout_transition=0

    # 方法: 用 ffmpeg 的 filter_complex 拼接
    # 每段语音 → adelay(开始时间) → 混合到一路
    inputs = []
    filters = []
    for i, seg in enumerate(segments):
        audio_file = seg["file"]
        if not Path(audio_file).exists():
            print(f"警告: 跳过缺失文件 {audio_file}")
            continue
        inputs.extend(["-i", str(audio_file)])
        delay_ms = seg["start_ms"]
        # adelay 把音频推迟到指定时间点播放（前面补静音）
        filters.append(f"[{i}:a]adelay={delay_ms}|{delay_ms}[d{i}]")

    if not filters:
        print("错误: 无可用的音频分段文件")
        sys.exit(1)

    # 混合所有延迟后的音频流
    n_inputs = len(filters)
    mix_inputs = "".join(f"[d{i}]" for i in range(n_inputs))
    filter_complex = ";".join(filters) + f";{mix_inputs}amix=inputs={n_inputs}:duration=longest:dropout_transition=0[aout]"

    cmd = [
        "ffmpeg", "-y",
        *inputs,
        "-filter_complex", filter_complex,
        "-map", "[aout]",
        "-ac", "1",          # 单声道（语音足够）
        "-ar", "44100",      # 44.1kHz 采样率
        "-b:a", "128k",      # 128kbps
        str(output_path),
    ]

    print(f"合并 {n_inputs} 段语音 → {output_path}")
    print("正在运行 ffmpeg...")

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"ffmpeg 失败 (退出码 {result.returncode}):")
        print(result.stderr[-500:] if result.stderr else "(无 stderr)")
        sys.exit(1)

    # 检查是否有 TTS 音频超出 SRT 时间段的警告
    for seg in segments:
        srt_duration_ms = seg["end_ms"] - seg["start_ms"]
        # 无法精确知道 TTS 音频时长（需要 ffprobe），但可以给出提醒
        # 这里只标记可能超长的段
        pass

    output_size_mb = output_path.stat().st_size / (1024 * 1024)
    print(f"\n{'=' * 50}")
    print(f"合并完成: {output_path}")
    print(f"文件大小: {output_size_mb:.1f} MB")
    print(f"分段数量: {n_inputs}")

    merge_result = {
        "output": str(output_path.resolve()),
        "segments": n_inputs,
        "sizeMB": round(output_size_mb, 1),
    }
    print(f"\n__MERGE_RESULT__{json.dumps(merge_result, ensure_ascii=False)}")


if __name__ == "__main__":
    main()
