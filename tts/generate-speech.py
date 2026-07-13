#!/usr/bin/env python3
"""
语音合成脚本 — 按 SRT 字幕分段生成语音

读取 SRT 文件，为每条字幕生成一段语音，保存到输出目录。
语音段文件名按字幕序号命名（001.mp3, 002.mp3, ...），供后续合并。

用法:
    python3 generate-speech.py <srt-path> <output-dir>
    python3 generate-speech.py subtitle.srt ./speech/

配置 (skill 根目录 .env):
    TTS_PROVIDER=openai|edge  (默认 openai)
    # OpenAI 兼容:
    TTS_API_KEY=...
    TTS_BASE_URL=https://api.openai.com/v1
    TTS_MODEL=gpt-4o-mini-tts
    TTS_VOICE=alloy
    # Edge TTS:
    TTS_VOICE=zh-CN-XiaoxiaoNeural
"""

import json
import os
import re
import sys
import time
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

import providers as provider_registry


def load_env():
    """从 skill 根目录的 .env 加载环境变量。"""
    env_path = SCRIPT_DIR.parent / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        trimmed = line.strip()
        if not trimmed or trimmed.startswith("#"):
            continue
        eq = trimmed.find("=")
        if eq == -1:
            continue
        key = trimmed[:eq].strip()
        value = trimmed[eq + 1:].strip().strip('"').strip("'")
        if key and value and not os.environ.get(key):
            os.environ[key] = value


def parse_srt(srt_path: str) -> list[dict]:
    """解析 SRT 文件，返回 [{index, start_ms, end_ms, text}, ...]。"""
    content = Path(srt_path).read_text(encoding="utf-8-sig")
    blocks = re.split(r"\n\s*\n", content.strip())
    entries = []

    for block in blocks:
        lines = block.strip().split("\n")
        if len(lines) < 3:
            continue

        # 第一行是序号
        try:
            index = int(lines[0].strip())
        except ValueError:
            continue

        # 第二行是时间轴
        time_match = re.match(
            r"(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})",
            lines[1].strip(),
        )
        if not time_match:
            continue

        g = [int(x) for x in time_match.groups()]
        start_ms = g[0] * 3600000 + g[1] * 60000 + g[2] * 1000 + g[3]
        end_ms = g[4] * 3600000 + g[5] * 60000 + g[6] * 1000 + g[7]

        # 第三行起是字幕文本
        text = " ".join(lines[2:]).strip()
        if not text:
            continue

        entries.append({
            "index": index,
            "start_ms": start_ms,
            "end_ms": end_ms,
            "text": text,
        })

    return entries


def get_provider_name() -> str:
    return os.environ.get("TTS_PROVIDER", "openai").lower().strip()


def build_config() -> dict:
    return dict(os.environ)


def synthesize_segment(text, config, provider_module, index, total):
    """合成单段语音，返回 (audio_bytes, ext)。"""
    tag = f"[{index}/{total}] "
    result = provider_module.synthesize(text, config)
    print(f"{tag}合成完成: {len(result.audio_bytes)} bytes ({result.ext})")
    return result.audio_bytes, result.ext


def main():
    load_env()

    args = sys.argv[1:]
    if len(args) < 2:
        print("用法: python3 generate-speech.py <srt-path> <output-dir>")
        sys.exit(1)

    srt_path = args[0]
    output_dir = args[1]

    if not Path(srt_path).exists():
        print(f"错误: SRT 文件不存在: {srt_path}")
        sys.exit(1)

    Path(output_dir).mkdir(parents=True, exist_ok=True)

    # 解析 SRT
    entries = parse_srt(srt_path)
    if not entries:
        print("错误: SRT 文件无有效字幕条目")
        sys.exit(1)

    total = len(entries)
    print(f"SRT 解析完成: {total} 条字幕")

    # 加载 provider
    provider_name = get_provider_name()
    try:
        provider_module = provider_registry.get_provider(provider_name)
    except ValueError as e:
        print(f"错误: {e}")
        sys.exit(1)

    required_keys = provider_registry.get_required_env_keys(provider_name)
    missing = [k for k in required_keys if not os.environ.get(k)]
    if missing:
        print(f"错误: TTS provider '{provider_name}' 缺少环境变量: {', '.join(missing)}")
        if provider_name == "edge":
            print("提示: 请运行 pip install edge-tts")
        sys.exit(1)

    config = build_config()
    print(f"TTS Provider: {provider_name}")
    if provider_name == "openai":
        print(f"  Base URL: {config.get('TTS_BASE_URL', 'https://api.openai.com/v1')}")
        print(f"  Model: {config.get('TTS_MODEL', 'gpt-4o-mini-tts')}")
        print(f"  Voice: {config.get('TTS_VOICE', 'alloy')}")
    elif provider_name == "edge":
        print(f"  Voice: {config.get('TTS_VOICE', 'zh-CN-XiaoxiaoNeural')}")
    elif provider_name == "mimo":
        print(f"  Base URL: {config.get('MIMO_BASE_URL', 'https://api.xiaomimimo.com/v1')}")
        print(f"  Model: {config.get('MIMO_MODEL', 'mimo-v2.5-tts')}")
        print(f"  Voice: {config.get('MIMO_VOICE', '冰糖')}")

    # 逐段合成
    results = []
    failed = []
    pad_width = len(str(total))

    for entry in entries:
        index = entry["index"]
        text = entry["text"]
        tag = f"[{index}/{total}]"

        try:
            audio_bytes, ext = synthesize_segment(
                text, config, provider_module, index, total,
            )
            filename = f"{str(index).zfill(pad_width)}.{ext}"
            filepath = Path(output_dir) / filename
            filepath.write_bytes(audio_bytes)
            results.append({
                "index": index,
                "start_ms": entry["start_ms"],
                "end_ms": entry["end_ms"],
                "file": str(filepath),
                "text": text,
            })
        except Exception as e:
            print(f"{tag}合成失败: {e}")
            failed.append({"index": index, "error": str(e), "text": text})

    # 输出清单
    manifest = {
        "provider": provider_name,
        "total": total,
        "succeeded": len(results),
        "failed": len(failed),
        "output_dir": str(Path(output_dir).resolve()),
        "segments": results,
    }
    manifest_path = Path(output_dir) / "speech-manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"\n{'=' * 50}")
    print(f"合成完成: {len(results)} 成功, {len(failed)} 失败")
    print(f"输出目录: {output_dir}")
    print(f"清单文件: {manifest_path}")

    if failed:
        print(f"\n失败条目:")
        for f in failed:
            print(f"  #{f['index']}: {f['error'][:80]}")

    print(f"\n__TTS_RESULT__{json.dumps(manifest, ensure_ascii=False)}")


if __name__ == "__main__":
    main()
