# Remotion Video — SRT 字幕驱动视频生成

> 从 SRT 字幕文件一键生成 Remotion 视频。自动完成分镜解析、并行场景组件生成、视频渲染。

## 工作原理

```text
SRT 字幕 → 语义分镜 → 并行 Scene Creator 生成 React 场景组件 → Remotion 渲染 → MP4
```

- 视频技术栈：**Remotion**（React 代码驱动渲染）
- 设计分辨率：1920×1080 / 30fps（可通过 `--scale 2` 输出 4K）
- 场景风格：卡通 UI、数据可视化、文字动画
- 场景组件由 SubAgent 并行生成（每 5 个场景一个 Creator）

## 安装

将整个 `remotion-video/` 目录放到 Agent 的 skills 目录下：

```text
.agents/skills/remotion-video/
```

**无需额外配置**。首次使用时脚本会自动在 `template/` 下安装 Node.js 依赖。

要求：
- Node.js 18+
- npm

## 快速开始

### 1. 从 SRT 生成视频

```bash
# 步骤 1: 依赖预检 + 项目初始化
node scripts/ensure-template-deps.js template/
node scripts/init-project.js --srt-path /path/to/your.srt

# 步骤 2-3: SubAgent 生成分镜和场景组件（详见 SKILL.md）

# 步骤 4: 合成视频
node scripts/generate-scenes-registry.js {projectRoot} {projectRoot}/storyboard.json
node scripts/validate-project.js {projectRoot} {projectRoot}/storyboard.json
cd {projectRoot}
npx remotion render Main out/output.mp4
```

### 2. 调试模式（加音频预览）

```bash
cp /path/to/audio.mp3 {projectRoot}/public/audio.mp3
cd {projectRoot}
npx remotion studio
```

### 3. 4K / 60fps 高分辨率输出

```bash
# 4K（保持设计分辨率不变，通过 scale 放大）
npx remotion render Main out/output-4k.mp4 --scale 2

# 60fps（需同步修改 Root.tsx fps 和 generated-scenes.ts totalDurationInFrames）
```

### 4. AI 语音播报（TTS 配音）

按 SRT 字幕自动生成语音并合并为完整音轨，添加到视频中。支持两种 provider：

```bash
# 步骤 1: 按 SRT 每段字幕生成语音
python3 tts/generate-speech.py subtitle.srt ./speech/

# 步骤 2: 按 SRT 时间轴合并为一条完整音轨
python3 tts/merge-speech.py ./speech/ {projectRoot}/public/audio.mp3

# 步骤 3: 添加到视频（参考调试模式 TM.1）
# 然后渲染或预览
```

**Provider 配置**（`.env`）：

| Provider | 配置 | 适用场景 |
|---|---|---|
| `openai`（默认） | `TTS_API_KEY` + `TTS_BASE_URL` | OpenAI / 硅基流动 / 火山方舟 / OneAPI 等所有 OpenAI `/v1/audio/speech` 兼容平台 |
| `mimo` | `MIMO_API_KEY` | 小米 MiMo TTS，预置音色 / 音色设计 / 音色克隆 |
| `edge` | `pip install edge-tts` | 免费本地，无需 API Key，支持数百种 Neural 语音 |

详见 [`.env.example`](.env.example)。

**时间轴策略**：SRT 驱动。每段语音放在其 SRT 时间点播放，动画和字幕严格对齐。

### 5. Web 控制台（可选）

浏览器操作界面——pipeline 进度可视化、配置管理、视频预览/下载：

```bash
cd web-ui
npm install   # 首次安装
node server.js
# → http://localhost:3210
```

**功能**：
- Pipeline 步骤可视化（初始化→分镜→场景组件→注册→校验→渲染）
- 并行 SubAgent 状态卡片（每个 Creator 独立状态）
- 渲染实时进度条（SSE 推送）
- TTS 触发（一键生成语音并合并）
- 配置管理（Provider 选择、API Key 编辑，保存到 .env）
- MP4 视频预览和下载
- 实时日志流

**两种使用模式**：
- **Agent 驱动**：Agent 通过 CLI 执行，Web 界面读 `pipeline-state.json` 做只读监控
- **Web 驱动**：用户在界面点击按钮触发场景注册/校验/TTS/渲染（分镜生成和场景组件创建仍需 Agent）

## 目录结构

```text
remotion-video/
├── SKILL.md                      # Agent 技能定义（完整工作流编排）
├── README.md                     # 本文档
├── .gitignore
├── rules/                        # Remotion 最佳实践规则库（40+ 规则）
│   ├── animations.md             # 动画基础
│   ├── text-animations.md        # 文字动画
│   ├── timing.md                 # 插值与缓动
│   ├── transitions.md            # 场景转场
│   ├── subtitles.md              # 字幕
│   ├── audio.md                  # 音频处理
│   ├── charts.md                 # 数据可视化
│   ├── compositions.md           # Composition 配置
│   ├── assets/                   # 示例代码片段（.tsx）
│   └── ...                       # 更多规则（3D、GIF、Lottie、地图等）
├── references/                   # SubAgent 阶段协议
│   ├── storyboard-parser.md      # 分镜生成阶段协议
│   ├── scene-component-creator.md # 场景规划与实现阶段协议
│   └── theme-template-switching.md # 主题模板更换指南
├── scripts/                      # 工作流脚本
│   ├── ensure-template-deps.js   # 依赖预检
│   ├── init-project.js           # 项目初始化
│   ├── generate-storyboard.js    # 分镜生成
│   ├── generate-creator-scenes.js # Creator 场景数据
│   ├── generate-scenes-registry.js # 场景注册文件生成
│   ├── validate-project.js       # 渲染前校验
│   ├── validate-scene-plan.js    # scene-plan 校验
│   └── scene-registry-utils.js   # 工具函数
├── tts/                          # 语音合成（可选）
│   ├── generate-speech.py        # 按 SRT 分段生成语音
│   ├── merge-speech.py           # 合并分段为完整音轨（需 ffmpeg）
│   └── providers/                # TTS provider 适配层
│       ├── openai_provider.py    # OpenAI 兼容（官方/硅基/火山/OneAPI）
│       ├── mimo_provider.py      # MiMo TTS（小米，Chat Completions 格式）
│       └── edge_provider.py      # Edge TTS（免费本地，需 pip install edge-tts）
├── web-ui/                      # Web 控制台（可选）
│   ├── server.js                # Express 后端（API + SSE）
│   ├── public/                  # 前端静态文件（React SPA）
│   └── lib/                     # 脚本执行器/状态管理/渲染包装
└── template/                     # Remotion 项目模板
    ├── package.json
    ├── src/
    │   ├── Root.tsx              # Composition 根
    │   ├── index.ts              # 入口
    │   ├── design-system.ts      # 设计系统
    │   ├── video-config.ts       # 视频配置
    │   └── compositions/
    │       ├── Main.tsx          # 主合成
    │       └── generated-scenes.ts # 场景注册（脚本生成）
    ├── cartoon-ui-style-guide.css # 卡通 UI 样式
    └── tsconfig.json
```

## 工作流详解

完整工作流分 5 步（详见 [SKILL.md](SKILL.md)）：

| 步骤 | 说明 | 执行者 |
|------|------|--------|
| 0 | 获取 SRT 文件路径 | 主 Agent |
| 1 | 依赖预检 + 项目初始化 | 主 Agent |
| 2 | SRT → 分镜脚本 (storyboard.json) | SubAgent |
| 3 | 分镜 → 场景组件 (SceneXXX.tsx) | 并行 SubAgent |
| 4 | 合成视频 (generate-registry → validate → render) | 主 Agent |

### 场景组件约定

- 接口固定为 `React.FC<{ segments: Segment[] }>`，默认导出
- 节奏绑定 `segments[].relativeStart / relativeDuration`
- 开发时按需读取 `rules/` 下的 Remotion 规则
- 受保护文件：`Main.tsx`、`Root.tsx`、`generated-scenes.ts`（不手改）

## 合并说明

本 skill 合并了原先独立的两个 skill：
- `srt-remotion-video`（SRT → Remotion 视频工作流编排）
- `remotion-best-practices`（Remotion 最佳实践规则库，现为 `rules/` 目录）

合并后规则库内置于同一 skill，消除了跨 skill 的兄弟目录硬编码依赖。
