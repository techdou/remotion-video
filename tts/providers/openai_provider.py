"""OpenAI 兼容 TTS provider — 同步语音合成。

支持任何兼容 OpenAI Audio Speech API 的平台（OpenAI 官方 / 硅基流动 / 火山方舟 /
OneAPI / New API 等），通过 TTS_BASE_URL 切换平台。

工作流: POST /v1/audio/speech → 直接返回二进制音频字节。
认证: Bearer TTS_API_KEY

配置 (config 字典):
    TTS_API_KEY       (必填) API Key
    TTS_BASE_URL      (可选) 默认 https://api.openai.com/v1
    TTS_MODEL         (可选) 默认 gpt-4o-mini-tts
    TTS_VOICE         (可选) 默认 alloy（硅基流动用 "模型名:音色名" 格式）
    TTS_RESPONSE_FORMAT (可选) 默认 mp3（mp3/opus/aac/flac/wav/pcm）
    TTS_SPEED         (可选) 语速 0.25-4.0，仅 tts-1/tts-1-hd 有效
    TTS_INSTRUCTIONS  (可选) 语气指令，仅 gpt-4o-mini-tts 有效
"""

import json
from urllib.request import urlopen, Request
from urllib.error import HTTPError

from providers.base import GeneratedAudio, validate_config

DEFAULT_BASE_URL = "https://api.openai.com/v1"
SPEECH_PATH = "/audio/speech"

# gpt-4o-mini-tts 忽略 speed 参数，需用 instructions 控制
_MODELS_WITHOUT_SPEED = {"gpt-4o-mini-tts"}


def synthesize(text: str, config: dict) -> GeneratedAudio:
    """合成语音，返回 GeneratedAudio。

    config 需包含: TTS_API_KEY
    config 可选: TTS_BASE_URL, TTS_MODEL, TTS_VOICE, TTS_RESPONSE_FORMAT, TTS_SPEED, TTS_INSTRUCTIONS
    """
    validate_config(["TTS_API_KEY"], config, "OpenAI TTS")

    api_key = config["TTS_API_KEY"]
    base_url = config.get("TTS_BASE_URL", "").strip().rstrip("/") or DEFAULT_BASE_URL
    model = config.get("TTS_MODEL", "gpt-4o-mini-tts").strip() or "gpt-4o-mini-tts"
    voice = config.get("TTS_VOICE", "alloy").strip() or "alloy"
    response_format = config.get("TTS_RESPONSE_FORMAT", "mp3").strip() or "mp3"
    speed = config.get("TTS_SPEED", "").strip()
    instructions = config.get("TTS_INSTRUCTIONS", "").strip()

    body = {
        "model": model,
        "input": text,
        "voice": voice,
        "response_format": response_format,
    }

    # gpt-4o-mini-tts 用 instructions 控制语气/语速，不传 speed
    if model in _MODELS_WITHOUT_SPEED:
        if instructions:
            body["instructions"] = instructions
    else:
        # tts-1 / tts-1-hd 用 speed
        if speed:
            try:
                body["speed"] = float(speed)
            except ValueError:
                pass  # 忽略非法值

    # 硅基流动等平台可能用额外字段（gain/sample_rate），透传
    if config.get("TTS_GAIN"):
        try:
            body["gain"] = float(config["TTS_GAIN"])
        except ValueError:
            pass
    if config.get("TTS_SAMPLE_RATE"):
        try:
            body["sample_rate"] = int(config["TTS_SAMPLE_RATE"])
        except ValueError:
            pass

    url = base_url + SPEECH_PATH
    req = Request(url, data=json.dumps(body).encode("utf-8"), method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("Authorization", f"Bearer {api_key}")

    try:
        with urlopen(req, timeout=120) as resp:
            audio_bytes = resp.read()
    except HTTPError as e:
        body_text = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"OpenAI TTS API error HTTP {e.code}: {body_text}") from e

    if not audio_bytes:
        raise RuntimeError("OpenAI TTS returned empty audio data")

    return GeneratedAudio(
        audio_bytes=audio_bytes,
        ext=response_format,
        metadata={"model": model, "voice": voice, "base_url": base_url},
    )
