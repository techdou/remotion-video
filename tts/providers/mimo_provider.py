"""MiMo TTS provider — 小米 MiMo 语音合成。

与 OpenAI /v1/audio/speech 格式不同，MiMo 使用 /v1/chat/completions 端点：
- 要合成的文本放在 messages[].role=assistant 的 content 中
- 风格/语气/音色描述放在 messages[].role=user 的 content 中
- 音频配置放在 audio 字段
- 认证默认用 api-key header（不是 Bearer），可选 --auth-mode bearer

工作流: POST /v1/chat/completions → choices[0].message.audio.data (base64) → 解码为音频字节
认证: api-key header (或 Bearer)

参考: mimo-lecture-audio-skill

配置 (config 字典):
    MIMO_API_KEY     (必填) API Key
    MIMO_BASE_URL    (可选) 默认 https://api.xiaomimimo.com/v1
    MIMO_MODEL       (可选) 默认 mimo-v2.5-tts
    MIMO_VOICE       (可选) 默认 冰糖（预置音色）
    MIMO_FORMAT      (可选) 默认 wav
    MIMO_STYLE       (可选) 默认课程讲解风格指令
    MIMO_AUTH_MODE   (可选) api-key 或 bearer，默认 api-key
"""

import base64
import json
import ssl
from urllib.request import urlopen, Request
from urllib.error import HTTPError

from providers.base import GeneratedAudio, validate_config

# Windows 上 Python 可能找不到 CA 证书，禁用 SSL 验证
_SSL_CONTEXT = ssl.create_default_context()
_SSL_CONTEXT.check_hostname = False
_SSL_CONTEXT.verify_mode = ssl.CERT_NONE

DEFAULT_BASE_URL = "https://api.xiaomimimo.com/v1"
ENDPOINT_PATH = "/chat/completions"

DEFAULT_STYLE = (
    "用温柔、清晰、适合课程讲解的语气朗读，语速中等偏慢，声音自然亲切。"
    "遇到重要概念时适当停顿，遇到步骤、定义、对比和案例时保持清楚的节奏感。"
    "不要像新闻播音，也不要过度情绪化。"
)

# 预置音色
PRESET_VOICES = ["mimo_default", "冰糖", "茉莉", "苏打", "白桦", "Mia", "Chloe", "Milo", "Dean"]


def _build_auth_headers(api_key: str, auth_mode: str) -> dict:
    """构建认证 header。MiMo 默认用 api-key header，也支持 Bearer。"""
    mode = (auth_mode or "api-key").strip().lower()
    if mode in ("api-key", "apikey", "api_key"):
        return {"api-key": api_key}
    if mode in ("bearer", "authorization"):
        return {"Authorization": f"Bearer {api_key}"}
    raise ValueError(f"未知的 auth_mode: {auth_mode}（可选: api-key, bearer）")


def synthesize(text: str, config: dict) -> GeneratedAudio:
    """合成语音，返回 GeneratedAudio。

    config 需包含: MIMO_API_KEY
    config 可选: MIMO_BASE_URL, MIMO_MODEL, MIMO_VOICE, MIMO_FORMAT, MIMO_STYLE, MIMO_AUTH_MODE
    """
    validate_config(["MIMO_API_KEY"], config, "MiMo TTS")

    api_key = config["MIMO_API_KEY"]
    base_url = config.get("MIMO_BASE_URL", "").strip().rstrip("/") or DEFAULT_BASE_URL
    model = config.get("MIMO_MODEL", "mimo-v2.5-tts").strip() or "mimo-v2.5-tts"
    voice = config.get("MIMO_VOICE", "冰糖").strip() or "冰糖"
    audio_format = config.get("MIMO_FORMAT", "wav").strip().lower() or "wav"
    style = config.get("MIMO_STYLE", "").strip() or DEFAULT_STYLE
    auth_mode = config.get("MIMO_AUTH_MODE", "api-key").strip() or "api-key"

    # 构建 audio 字段
    audio_obj = {"format": audio_format}

    # 不同模型的 voice 处理
    if model == "mimo-v2.5-tts-voicedesign":
        # voice design 模式：不传 voice，用 style 作为 user content
        # voice_design_prompt 可通过 MIMO_VOICE_DESIGN_PROMPT 配置
        voice_design_prompt = config.get("MIMO_VOICE_DESIGN_PROMPT", "").strip()
        user_content = "\n".join(p for p in [voice_design_prompt, style] if p).strip() or DEFAULT_STYLE
        audio_obj["optimize_text_preview"] = True
        voice_for_log = "voice-design"
    elif model == "mimo-v2.5-tts-voiceclone":
        # voice clone 模式：voice 字段传音频 data URL
        # MIMO_VOICE_SAMPLE_PATH 指定本地音频文件，自动转 data URL
        sample_path = config.get("MIMO_VOICE_SAMPLE_PATH", "").strip()
        if sample_path:
            from pathlib import Path
            audio_obj["voice"] = _file_to_data_url(Path(sample_path))
        elif voice.startswith("data:audio/"):
            audio_obj["voice"] = voice
        else:
            raise ValueError(
                "MiMo voiceclone 需要配置 MIMO_VOICE_SAMPLE_PATH（本地音频路径）"
                "或 MIMO_VOICE（data:audio/...;base64,... 格式）"
            )
        user_content = style
        voice_for_log = "voiceclone"
    else:
        # 默认预置音色模式
        audio_obj["voice"] = voice
        user_content = style
        voice_for_log = voice

    # 构建请求体（核心：text 在 assistant.content，style 在 user.content）
    payload = {
        "model": model,
        "messages": [
            {"role": "user", "content": user_content},
            {"role": "assistant", "content": text},
        ],
        "audio": audio_obj,
    }

    url = base_url + ENDPOINT_PATH
    req = Request(url, data=json.dumps(payload, ensure_ascii=False).encode("utf-8"), method="POST")
    req.add_header("Content-Type", "application/json")
    for k, v in _build_auth_headers(api_key, auth_mode).items():
        req.add_header(k, v)

    try:
        with urlopen(req, timeout=120, context=_SSL_CONTEXT) as resp:
            response = json.loads(resp.read().decode("utf-8"))
    except HTTPError as e:
        body_text = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"MiMo TTS API error HTTP {e.code}: {body_text[:200]}") from e

    # 提取音频：choices[0].message.audio.data 是 base64
    try:
        message = response["choices"][0]["message"]
        audio_data = message["audio"]["data"]
    except (KeyError, IndexError, TypeError):
        raise RuntimeError(f"MiMo TTS 响应无音频数据: {json.dumps(response, ensure_ascii=False)[:300]}")

    # 去掉可能的 data: 前缀
    if audio_data.startswith("data:") and "," in audio_data:
        audio_data = audio_data.split(",", 1)[1]

    audio_bytes = base64.b64decode(audio_data)
    if not audio_bytes:
        raise RuntimeError("MiMo TTS 返回空音频数据")

    return GeneratedAudio(
        audio_bytes=audio_bytes,
        ext=audio_format,
        metadata={
            "model": model,
            "voice": voice_for_log,
            "base_url": base_url,
            "format": audio_format,
        },
    )


def _file_to_data_url(path) -> str:
    """将本地音频文件转为 data URL。"""
    import mimetypes
    raw = path.read_bytes()
    encoded = base64.b64encode(raw).decode("utf-8")
    mime = mimetypes.guess_type(str(path))[0] or "audio/wav"
    return f"data:{mime};base64,{encoded}"
