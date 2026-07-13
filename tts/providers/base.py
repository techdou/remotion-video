"""
TTS Provider 统一接口定义

每个 provider 模块必须实现:
    synthesize(text, config) -> GeneratedAudio

GeneratedAudio 封装合成结果，统一为二进制音频字节。
"""

from dataclasses import dataclass
from typing import Optional


@dataclass
class GeneratedAudio:
    """统一的语音合成结果。"""
    audio_bytes: bytes           # 音频二进制数据
    ext: str = "mp3"             # 音频扩展名（mp3/wav/opus 等）
    metadata: Optional[dict] = None  # 平台特有元信息（model、voice 等）


def validate_config(required_keys: list[str], config: dict, provider_name: str):
    """校验 provider 配置是否包含所有必需的 key。"""
    missing = [k for k in required_keys if not config.get(k)]
    if missing:
        raise ValueError(
            f"[{provider_name}] 缺少必需配置: {', '.join(missing)}。"
            f"请在 skill 根目录的 .env 文件中配置对应的环境变量。"
        )
