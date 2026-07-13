---
name: remotion-video
description: Generates Remotion videos from SRT subtitle files — parses subtitles into storyboard scenes, creates React animation components in parallel, and renders the final MP4. Supports optional AI voiceover (TTS) with OpenAI-compatible platforms (OpenAI, SiliconFlow, Volcengine), Xiaomi MiMo TTS, or free Edge TTS. Use when the user wants to create a video from subtitles, generate an animated explainer or lecture video, convert SRT to Remotion, render a React-based video, add voiceover/dubbing/TTS to a video, or asks for subtitle-driven video generation. Also triggers on requests for video debugging with audio, re-rendering, or 4K/60fps output of an existing project.
---

# Remotion Video

Convert SRT subtitle files into rendered MP4 videos using Remotion (React-based video framework). The skill handles the full pipeline: subtitle parsing → storyboard generation → parallel scene component creation → video rendering.

## When to use

- User provides an SRT file and wants a video generated from it
- User asks to "turn subtitles into a video", "字幕转视频", "SRT 转视频"
- User wants an animated explainer, lecture, or presentation video from a transcript
- User wants to debug, re-render, or output 4K/60fps from an existing project

## When NOT to use

- User wants a whiteboard hand-drawn animation (use `whiteboard-video` skill instead)
- User wants a static slide deck or PowerPoint
- User provides raw text without SRT timing (convert to SRT first)

## Architecture

```
SRT file → storyboard.json → SceneXXX.tsx components → Remotion render → output.mp4
```

- **Template**: lightweight Remotion project (1920x1080 / 30fps), copied per video
- **Scene components**: React/TSX, generated in parallel by SubAgents (5 scenes per creator)
- **Rules**: 40+ Remotion best-practice rule files in `rules/`, loaded on demand during scene development

## Path contract

| Variable | Value |
|---|---|
| `skillRoot` | This skill's absolute directory path |
| `templateRoot` | `{skillRoot}/template` |
| `referencesRoot` | `{skillRoot}/references` |
| `scriptsRoot` | `{skillRoot}/scripts` |
| `srtPath` | User-provided SRT absolute path |
| `projectRoot` | `{dirname(srtPath)}/remotion-video-projects/{timestamp}/` |

All SubAgent prompts must contain expanded absolute paths, never variable names.

## Main workflow

Read [`references/main-workflow.md`](references/main-workflow.md) for detailed steps including SubAgent prompt templates.

Checklist:

- [ ] Get user's SRT absolute path
- [ ] Run `ensure-template-deps.js` (installs template dependencies on first use)
- [ ] Run `init-project.js --srt-path "{srtPath}"` (creates project from template)
- [ ] Record `projectRoot` and other paths from script output
- [ ] **SubAgent**: generate `storyboard.json` via `references/storyboard-parser.md`
- [ ] Validate `storyboard.json` structure
- [ ] Calculate Creator groups (5 scenes per creator, ID format: `creator-01`)
- [ ] **SubAgents (parallel)**: generate scene-plan + `SceneXXX.tsx` via `references/scene-component-creator.md`
- [ ] **(Optional) TTS**: generate speech audio from SRT and merge into single track (see below)
- [ ] Run `generate-scenes-registry.js "{projectRoot}" "{projectRoot}/storyboard.json"`
- [ ] Run `validate-project.js "{projectRoot}" "{projectRoot}/storyboard.json"`
- [ ] Render: `cd "{projectRoot}" && npx remotion render Main out/output.mp4`

## Voiceover / TTS (optional)

Generate speech audio from the SRT file and add it to the video. Two providers supported:

| Provider | Setup | Use case |
|---|---|---|
| `openai` (default) | `TTS_API_KEY` + `TTS_BASE_URL` | OpenAI / 硅基流动 / 火山方舟 / OneAPI — any OpenAI `/v1/audio/speech` compatible platform |
| `mimo` | `MIMO_API_KEY` | 小米 MiMo TTS (`/v1/chat/completions` format), preset voices / voice design / voice clone |
| `edge` | `pip install edge-tts` | Free, local, no API key needed |

Workflow:

```bash
# 1. Generate per-segment speech from SRT
python3 "{skillRoot}/tts/generate-speech.py" "{srtPath}" "{projectRoot}/speech/"

# 2. Merge segments into single audio track (by SRT timeline)
python3 "{skillRoot}/tts/merge-speech.py" "{projectRoot}/speech/" "{projectRoot}/public/audio.mp3"

# 3. Add to Main.tsx (same as debug mode)
#    See references/debug-and-rerender.md → TM.1
```

Timeline strategy: **SRT-driven**. Each speech segment is placed at its SRT `start_ms` timestamp. If TTS audio is longer than the SRT segment, a warning is issued but audio is not truncated.

Configuration via `.env` — see [`.env.example`](.env.example) for all options.

## Post-render operations

These assume `projectRoot` already exists with scene components generated.

| User request | Action | Reference |
|---|---|---|
| "调试模式" / "预览模式" + add audio | Copy audio to `public/audio.mp3`, modify `Main.tsx`, launch Remotion Studio | [`references/debug-and-rerender.md`](references/debug-and-rerender.md) |
| "重新渲染" / "再次渲染" | Remove `<Audio>` from `Main.tsx` if present, re-render | [`references/debug-and-rerender.md`](references/debug-and-rerender.md) |
| 4K / 60fps | Keep design resolution 1920x1080, use `--scale 2` and/or change fps | [`references/debug-and-rerender.md`](references/debug-and-rerender.md) |
| "加语音播报" / "配音" / "TTS" | Generate speech from SRT, merge, add to timeline | This section ↑ + [`references/debug-and-rerender.md`](references/debug-and-rerender.md) TM.1 |

## Scene component conventions

- Interface: `React.FC<{ segments: Segment[] }>`, default export
- Timing bound to `segments[].relativeStart / relativeDuration` (milliseconds)
- Protected files (do not hand-edit): `Main.tsx`, `Root.tsx`, `generated-scenes.ts`
- Read `rules/` files on demand during development (animations, timing, transitions, etc.)

See [`references/data-structures.md`](references/data-structures.md) for TypeScript interfaces.

## Resources

### references/

| File | Purpose | Read by |
|---|---|---|
| `main-workflow.md` | Main workflow detailed steps + SubAgent prompt templates | Main Agent |
| `storyboard-parser.md` | Storyboard generation phase protocol | SubAgent (step 2) |
| `scene-component-creator.md` | Scene planning & implementation protocol | SubAgent (step 3) |
| `debug-and-rerender.md` | Debug mode, re-render, 4K/60fps output | Main Agent |
| `data-structures.md` | TypeScript interfaces (storyboard, scene-plan, component) | Main Agent |
| `theme-template-switching.md` | Theme/template switching guide | Main Agent |

### rules/ (Remotion best-practice library)

40+ rule files loaded on demand during scene development. Common ones:

- `animations.md` / `text-animations.md` / `timing.md` — animation & interpolation
- `transitions.md` / `sequencing.md` — scene transitions & sequence orchestration
- `subtitles.md` / `display-captions.md` — subtitles & captions
- `audio.md` / `voiceover.md` — audio & TTS
- `assets.md` / `images.md` / `fonts.md` — resource loading
- `charts.md` — data visualization
- `compositions.md` / `calculate-metadata.md` — Composition configuration

### scripts/

| Script | Purpose |
|---|---|
| `ensure-template-deps.js` | Check/install template dependencies |
| `init-project.js` | Initialize project from SRT path |
| `generate-storyboard.js` | Generate storyboard.json from SRT + groups.json |
| `generate-creator-scenes.js` | Generate scenesData JSON per creator |
| `generate-scenes-registry.js` | Generate `generated-scenes.ts` |
| `validate-project.js` | Pre-render validation |
| `validate-scene-plan.js` | Validate scene-plan JSON structure |
| `scene-registry-utils.js` | Shared utilities |

### tts/ (optional voiceover)

Python scripts for AI text-to-speech. Requires Python 3.9+. See `.env.example` for provider configuration.

| File | Purpose |
|---|---|
| `generate-speech.py` | Generate per-segment speech from SRT file |
| `merge-speech.py` | Merge segments into single audio track by SRT timeline (requires ffmpeg) |
| `providers/openai_provider.py` | OpenAI-compatible TTS (OpenAI / SiliconFlow / Volcengine / OneAPI) |
| `providers/mimo_provider.py` | MiMo TTS (Xiaomi, `/v1/chat/completions` format) |
| `providers/edge_provider.py` | Free Edge TTS (requires `pip install edge-tts`) |

### template/

Lightweight Remotion project template, distributed with the skill. First use triggers `npm install` in the template directory.

### web-ui/ (optional control panel)

Web-based control panel for monitoring pipeline progress, configuring providers, and previewing/downloading rendered videos.

```bash
cd web-ui && npm install && node server.js
# → http://localhost:3210
```

Features: pipeline step visualization, parallel SubAgent status, render progress (SSE), TTS trigger, config management (.env editor), MP4 preview/download. Reads `pipeline-state.json` for Agent-driven mode, or triggers steps directly for Web-driven mode.

## Constraints

- Node.js 18+ required
- Template default output: 1920x1080 / 30fps
- `Main.tsx`, `Root.tsx` belong to the protected host layer — do not rewrite in normal workflow
- `generated-scenes.ts` is script-generated — do not hand-edit
- `validate-project.js` failure stops the pipeline; do not render on a failing project
- For theme/template changes, read `references/theme-template-switching.md` first
