# Remotion Video — Agent 驱动的视频生成项目服务

> 从 SRT 字幕到完整 Remotion 视频的端到端工作流。支持 MCP 驱动、多 Provider TTS 语音合成、异步任务队列、实时 Web 控制台。

> **Provenance | 来源**：改编自 B 站 [YangAgent](https://space.bilibili.com/) 分享的 Remotion 视频生成方案，在原工作流基础上重构为 MCP + 异步队列架构。

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)]()
[![MCP](https://img.shields.io/badge/MCP-17%20tools-green)]()
[![SQLite](https://img.shields.io/badge/SQLite-WAL-orange)]()
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## 架构

```
用户 → ZCode / Codex / Claude Code → Skill (SKILL.md)
                                         ↓
                                   MCP Server (17 工具, stdio)
                                         ↓
                                  Domain Service (Express + SSE)
                                         ↓
                             Core (SQLite + Provider + Artifact + Run 队列)
                                         ↓
                           scripts/*.js + tts/*.py + Remotion CLI
                                         ↓
                                    Web 控制台 (React SPA)
```

**四层分离**：

| 层 | 目录 | 职责 |
|---|---|---|
| **Skill** | `SKILL.md` + `references/` | 触发条件、工作流编排、质量标准 |
| **MCP Server** | `server/mcp/` | 17 个 MCP 工具，Agent 通过 stdio 调用 |
| **Domain Service** | `server/api/` + `server/core/` | Express API + SSE + SQLite + 异步队列 + Worker |
| **Provider** | `server/core/providers/` | 封装 scripts/*.js / tts/*.py / Remotion CLI |

## 快速开始

### 安装

```bash
git clone https://github.com/techdou/remotion-video.git
cd remotion-video

# 安装后端依赖
npm install

# 安装前端依赖
cd web-ui && npm install && cd ..

# 安装模板依赖（首次）
cd template && npm install && cd ..
```

### 构建

```bash
# 构建后端（TypeScript → dist/）
npm run build

# 构建前端（JSX → app.js）
npx esbuild web-ui/public/app.jsx --bundle --format=iife --jsx=transform \
  --outfile=web-ui/public/app.js
```

### 启动

```bash
# 启动 Domain Service（API + Worker + Web 控制台）
node dist/index.js
# → http://127.0.0.1:3210

# 启动 MCP Server（另一个终端，供 Agent 调用）
node dist/mcp.js
```

## 核心能力

### MCP Server（17 个工具）

Agent 通过 MCP 协议调用以下工具，所有长任务异步执行（立即返回 `runId`）：

| 工具 | 用途 |
|---|---|
| `get_project_context` | 获取项目完整上下文（project + runs + artifacts） |
| `get_capabilities` | 列出 Provider 能力和支持的 run 类型 |
| `start_run` | 提交异步任务（init/render/tts/validate 等） |
| `get_run_status` | 查询任务状态和进度 |
| `cancel_run` | 取消运行中的任务 |
| `list_artifacts` | 列出项目产物 |
| `set_artifact_status` | 设置产物状态（draft→candidate→selected→final） |
| `test_provider` | 测试 Provider 连通性 |
| ... | 完整 17 个工具见 `server/mcp/index.ts` |

### 异步 Run 队列

- **SQLite-backed**：任务持久化，进程崩溃不丢失
- **Worker Lease + Heartbeat**：防止任务被重复执行
- **崩溃恢复**：启动时扫描超时 run，自动标记 failed 或重新排队
- **AbortSignal**：取消信号贯穿 Provider → 子进程 → 下载 → 重试

### Provider 系统

三种 Provider 封装现有脚本，通过子进程 spawn 调用（不修改原脚本）：

| Provider | 包装对象 | 操作 |
|---|---|---|
| `script` | `scripts/*.js` (CommonJS) | init / storyboard / creators / registry / validate |
| `tts` | `tts/*.py` (Python) | tts（语音合成）/ merge_speech（合并音轨） |
| `render` | `npx remotion render` | render（视频渲染） |

### TTS 语音合成（3 个 Provider）

| Provider | 平台 | 配置 |
|---|---|---|
| `openai` (默认) | OpenAI / 硅基流动 / 火山方舟 / OneAPI | `TTS_API_KEY` + `TTS_BASE_URL` |
| `mimo` | 小米 MiMo | `MIMO_API_KEY`（Chat Completions 格式） |
| `edge` | Edge TTS | 免费本地，无需 API Key |

配置见 `.env.example`。时间轴策略：SRT 驱动，每段语音放在原始时间点。

### Artifact 系统

每个产物记录：ID、类型、状态（draft→candidate→selected→final→archived）、来源 Run、父 Artifact（版本树）。

### Web 控制台

多页面 SPA，学者暖色系设计（亚麻 #F5F3EE + 陶杯 #C0785A + 衬线字体）：

- **控制台**：项目统计、活跃任务、最近项目
- **项目**：项目列表 + 新建
- **项目工作区**：Pipeline 步骤 / 产物版本 / 任务记录（三标签页）
- **Provider**：能力列表 + 连通性测试
- **设置**：TTS 配置管理

## 目录结构

```
remotion-video/
├── server/                      # TS 业务内核
│   ├── core/
│   │   ├── types.ts             # 接口定义
│   │   ├── db.ts                # SQLite + WAL + migration
│   │   ├── storage.ts           # CRUD + revision 乐观锁
│   │   ├── run-queue.ts         # 异步队列 + Worker + 崩溃恢复
│   │   ├── artifact-store.ts    # 产物文件存储 + 版本管理
│   │   ├── config.ts            # .env 读取 + 脱敏 + 路径防护
│   │   ├── providers/           # Provider 系统
│   │   │   ├── base.ts          # 接口
│   │   │   ├── script-provider.ts
│   │   │   ├── tts-provider.ts
│   │   │   ├── render-provider.ts
│   │   │   └── registry.ts
│   │   ├── migrations/          # SQL 迁移
│   │   └── tests/               # 34 个测试
│   ├── mcp/index.ts             # MCP Server (17 工具)
│   ├── api/index.ts             # Express API + SSE
│   └── index.ts                 # 主入口
├── web-ui/                      # React 控制台
│   ├── public/
│   │   ├── app.jsx              # 源码（需编译）
│   │   ├── styles.css
│   │   └── vendor/              # React 18 本地化
│   └── ...
├── scripts/                     # 工作流脚本 (CommonJS)
├── tts/                         # TTS Python 子系统
│   ├── generate-speech.py
│   ├── merge-speech.py
│   └── providers/               # openai / mimo / edge
├── template/                    # Remotion 项目模板
├── rules/                       # 40+ Remotion 最佳实践规则
├── references/                  # 工作流协议文档
├── SKILL.md                     # Agent 技能定义
├── .env.example                 # TTS 配置模板
├── tsconfig.json
└── tsup.config.ts
```

## 测试

```bash
# 运行全部 34 个测试
npx tsx --test server/core/tests/storage.test.ts server/core/tests/advanced.test.ts
```

覆盖：Project CRUD、Run 生命周期、Artifact 版本树、revision 乐观锁并发、Worker lease/heartbeat、崩溃恢复、Provider 能力探测和错误处理。

## 安全

- **绑定 127.0.0.1**：Domain Service 不暴露局域网
- **路径穿越防护**：`validateProjectPath` 精确匹配项目目录
- **API Key 脱敏**：GET 返回 `sk-abc***`，PUT 跳过脱敏值
- **CORS 限制**：仅允许 localhost
- **配置合并写入**：保留 .env 注释，key 格式校验，拒绝换行注入

## 依赖

| 依赖 | 用途 |
|---|---|
| Node.js 18+ | 运行环境 |
| Python 3.9+ | TTS 子系统 |
| ffmpeg | 语音合并 |
| `better-sqlite3` | SQLite 驱动 |
| `@modelcontextprotocol/sdk` | MCP Server |
| `express` | HTTP API |
| `edge-tts` (可选) | 免费 TTS |

## License

MIT © 2026 [techdou](https://github.com/techdou)
