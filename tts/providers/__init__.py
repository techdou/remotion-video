"""
TTS Provider 注册表与统一入口。

用法:
    from providers import get_provider
    provider = get_provider("openai")
    result = provider.synthesize("你好世界", config)
"""

from importlib import import_module

_PROVIDER_REGISTRY = {
    "openai": "providers.openai_provider",
    "edge": "providers.edge_provider",
    "mimo": "providers.mimo_provider",
}

# 每个 provider 需要的环境变量
_PROVIDER_ENV_KEYS = {
    "openai": ["TTS_API_KEY"],   # 统一用 TTS_API_KEY，搭配 TTS_BASE_URL
    "edge": [],                   # Edge TTS 不需要 API Key
    "mimo": ["MIMO_API_KEY"],    # MiMo 用独立 key 和 base_url
}

# 每个 provider 的默认配置
_PROVIDER_DEFAULTS = {
    "openai": {
        "base_url": "https://api.openai.com/v1",
        "model": "gpt-4o-mini-tts",
        "voice": "alloy",
        "response_format": "mp3",
    },
    "edge": {
        "voice": "zh-CN-XiaoxiaoNeural",
        "rate": "+0%",
        "volume": "+0%",
        "pitch": "+0Hz",
    },
    "mimo": {
        "base_url": "https://api.xiaomimimo.com/v1",
        "model": "mimo-v2.5-tts",
        "voice": "冰糖",
        "format": "wav",
        "auth_mode": "api-key",
    },
}


def list_providers() -> list[str]:
    return list(_PROVIDER_REGISTRY.keys())


def get_provider(name: str):
    """根据名称加载 provider 模块。模块必须实现 synthesize() 函数。"""
    name = name.lower().strip()
    if name not in _PROVIDER_REGISTRY:
        raise ValueError(
            f"未知 TTS provider: '{name}'。可选: {', '.join(list_providers())}"
        )
    return import_module(_PROVIDER_REGISTRY[name])


def get_required_env_keys(name: str) -> list[str]:
    name = name.lower().strip()
    return _PROVIDER_ENV_KEYS.get(name, [])


def get_defaults(name: str) -> dict:
    name = name.lower().strip()
    return _PROVIDER_DEFAULTS.get(name, {})
