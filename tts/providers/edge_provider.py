"""Edge TTS provider — 免费本地语音合成（无需 API Key）。

逆向 Microsoft Edge 浏览器的 Read Aloud 功能，通过 WebSocket 合成语音。
需要 pip install edge-tts（依赖 aiohttp）。

工作流: edge_tts.Communicate(text, voice).save_sync(output_path)
认证: 不需要

特点:
- 固定输出 MP3（48kbps, 24kHz, mono），不支持其他格式
- 支持数百种 Neural 语音（zh-CN-XiaoxiaoNeural 等）
- rate/volume/pitch 可调（百分比/Hz 字符串格式）

配置 (config 字典):
    TTS_VOICE  (可选) 默认 zh-CN-XiaoxiaoNeural
    TTS_RATE   (可选) 默认 "+0%"（如 "-20%", "+50%"）
    TTS_VOLUME (可选) 默认 "+0%"
    TTS_PITCH  (可选) 默认 "+0Hz"
"""

from providers.base import GeneratedAudio

DEFAULT_VOICE = "zh-CN-XiaoxiaoNeural"


def synthesize(text: str, config: dict) -> GeneratedAudio:
    """合成语音，返回 GeneratedAudio。

    config 不需要 API Key。
    config 可选: TTS_VOICE, TTS_RATE, TTS_VOLUME, TTS_PITCH
    """
    try:
        import edge_tts
    except ImportError:
        raise ImportError(
            "Edge TTS 需要 edge-tts 包。请运行: pip install edge-tts"
        )

    voice = config.get("TTS_VOICE", "").strip() or DEFAULT_VOICE
    rate = config.get("TTS_RATE", "+0%").strip() or "+0%"
    volume = config.get("TTS_VOLUME", "+0%").strip() or "+0%"
    pitch = config.get("TTS_PITCH", "+0Hz").strip() or "+0Hz"

    communicate = edge_tts.Communicate(
        text,
        voice=voice,
        rate=rate,
        volume=volume,
        pitch=pitch,
    )

    # 用 stream 收集音频字节（同步包装）
    import io
    buffer = io.BytesIO()

    # edge-tts 7.x 提供同步方法
    import asyncio

    async def _collect():
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                buffer.write(chunk["data"])

    # 在同步上下文中运行异步函数
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(_collect())
    finally:
        loop.close()

    audio_bytes = buffer.getvalue()
    if not audio_bytes:
        raise RuntimeError("Edge TTS returned empty audio data")

    return GeneratedAudio(
        audio_bytes=audio_bytes,
        ext="mp3",  # Edge TTS 固定输出 mp3
        metadata={"voice": voice, "rate": rate, "volume": volume, "pitch": pitch},
    )
