# 调试模式、重新渲染、高分辨率输出

这三个操作都假定 `projectRoot` 已存在且场景组件已生成完毕（主流程步骤 0-5 已完成）。

## 调试模式（添加音频 + Remotion Studio 预览）

当用户说"调试模式"、"预览模式"或类似表述，并要求添加音频时执行。

### TM.0 获取音频文件

1. 用户已提供则验证文件存在，解析为绝对路径 `audioPath`
2. 未提供则向用户询问
3. 文件不存在则反馈并停止

### TM.1 添加音频到时间轴

```bash
mkdir -p "{projectRoot}/public"
cp "{audioPath}" "{projectRoot}/public/audio.mp3"
```

修改 `{projectRoot}/src/compositions/Main.tsx`：
- import 行添加 `Audio` 和 `staticFile`：
  ```typescript
  import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from "remotion";
  ```
- 在 `<AbsoluteFill>` 直接子级最前面添加：
  ```tsx
  <Audio src={staticFile("audio.mp3")} />
  ```

启动 Remotion Studio：

```bash
cd "{projectRoot}"
npx remotion studio
```

### TM.2 完成通知

告知用户 Remotion Studio 已启动，音频已添加到时间轴，可在浏览器中预览。

---

## 重新渲染

当用户说"重新渲染"、"再次渲染"或类似表述时执行。

### RR.0 移除时间轴上的音频

渲染前必须确保 `Main.tsx` 中不存在音频组件：

1. 读取 `{projectRoot}/src/compositions/Main.tsx`
2. 如果包含 `<Audio` 标签：
   - 移除 `<Audio src={staticFile("audio.mp3")} />`
   - 从 import 移除 `Audio` 和 `staticFile`（如果不再被其他代码使用）
3. 不存在则跳过

### RR.1 执行渲染

```bash
cd "{projectRoot}"
npx remotion render Main out/output.mp4
```

---

## 高分辨率 / 高帧率渲染

当用户要求 4K、60fps 或其他高于默认配置（1080p 30fps）的版本时执行。

### 关键原则：设计分辨率与输出分辨率分离

场景组件中的所有元素使用**绝对像素值**，基于 1920x1080 设计。**直接改 Root.tsx 的 width/height 会导致所有元素占比缩小**。正确做法是保持设计分辨率 1920x1080 不变，通过 `--scale` 参数放大输出分辨率。

### 常见错误（禁止使用）

| 错误做法 | 后果 |
|---------|------|
| 改 Root.tsx 的 width=3840 height=2160 | 所有场景元素占比缩小一半 |
| 用 `--width 3840 --height 2160` CLI 参数 | 同上 |
| 只改 fps 不改 totalDurationInFrames | 视频只有前半段有内容，后半段空白 |
| Main.tsx 中硬编码 `const FPS = 30` | 改了 Root.tsx fps 后场景时序错乱 |

### HR.0 确认用户需求

| 用户需求 | Root.tsx 修改 | generated-scenes.ts 修改 | 渲染命令 |
|---------|-------------|------------------------|---------|
| 4K / 超清 | 不改 | 不改 | `--scale 2` |
| 60fps | `fps={60}` | `totalDurationInFrames` 按比例换算 | 无需 scale |
| 4K 60fps | `fps={60}` | `totalDurationInFrames` 按比例换算 | `--scale 2` |

### HR.1 修改帧率（仅当用户要求高帧率时）

1. 修改 `{projectRoot}/src/Root.tsx` 中的 `fps`：

```typescript
fps={60}  // 从 30 改为 60
```

2. 修改 `{projectRoot}/src/compositions/generated-scenes.ts` 中的 `totalDurationInFrames`：

```typescript
// 帧数 = 原帧数 × (新fps / 原fps)
export const totalDurationInFrames = {原帧数 × 新fps / 原fps};
```

**关键**：`Root.tsx` 中 `<Composition>` 的 `width` 和 `height` **不要修改**，必须保持 `1920` 和 `1080`。

> 如果发现 `Main.tsx` 中有硬编码的 `FPS` 常量，必须先修复为 `useVideoConfig().fps`。

### HR.2 校验项目

```bash
node "{scriptsRoot}/validate-project.js" "{projectRoot}" "{projectRoot}/storyboard.json"
```

### HR.3 执行渲染

```bash
cd "{projectRoot}"
npx remotion render Main out/output-4k.mp4 --scale 2
```

- `--scale 2`：将 1920x1080 放大 2 倍渲染为 3840x2160
- 不需要 4K 只需 60fps 时去掉 `--scale 2`

### HR.4 完成通知

通知用户输出路径、分辨率、帧率、时长，以及 fps 修改情况。
