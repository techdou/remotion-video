# 主流程详细步骤

SRT 字幕 → Remotion 视频的完整工作流。主 Agent 执行步骤 0-1、4，SubAgent 执行步骤 2-3。

## Path Contract

所有 SubAgent 和脚本统一使用以下绝对路径：

- `skillRoot`: `remotion-video` skill 目录的绝对路径
- `templateRoot`: `{skillRoot}/template`
- `referencesRoot`: `{skillRoot}/references`
- `scriptsRoot`: `{skillRoot}/scripts`
- `srtPath`: 用户提供的 SRT 文件绝对路径
- `projectBaseDir`: `{dirname(srtPath)}/remotion-video-projects`
- `projectRoot`: `{projectBaseDir}/{yyyy-mm-dd-hh-mm-ss}/`

**强制要求**：SubAgent prompt 中必须写入展开后的绝对路径，不要只传变量名。

---

## 步骤 0: 获取 SRT 文件

1. 询问用户 SRT 文件路径
2. 相对路径则先验证文件是否存在
3. 存在则解析为绝对路径作为 `srtPath`
4. 不存在则反馈路径无效，要求重新提供

## 步骤 1: 依赖预检与项目初始化

### 1.0 依赖预检

```bash
node "{scriptsRoot}/ensure-template-deps.js" "{templateRoot}"
```

检查 `{templateRoot}/package.json`，未安装则在 `{templateRoot}` 执行 `npm install`。

### 1.1 创建新项目

```bash
node "{scriptsRoot}/init-project.js" --srt-path "{srtPath}"
```

创建 `{projectBaseDir}/{timestamp}/`，从 `{templateRoot}` 复制模板（含已安装依赖）。

> 用户明确指定项目路径时，直接用作 `projectRoot`，跳过默认目录推导。

### 1.2 记录关键路径

从脚本输出获取 `projectRoot`、`skillRoot`、`templateRoot`、`referencesRoot`、`scriptsRoot`、`srtPath`。

## 步骤 2: 生成分镜脚本（SubAgent）

```bash
node "{scriptsRoot}/generate-storyboard.js" "{srtPath}" "{projectRoot}/groups.json" "{projectRoot}/storyboard.json"
```

SubAgent prompt 模板：

```text
你正在执行 remotion-video 工作流的"分镜生成阶段"。

首先读取以下参考协议并严格按其步骤执行：
- {referencesRoot}/storyboard-parser.md

输入参数：
- skillRoot: {skillRoot}
- projectRoot: {projectRoot}
- srtPath: {srtPath}

重要：
1. 所有路径都已展开为绝对路径，不要自行猜测
2. 需要执行的脚本位于 {scriptsRoot}/generate-storyboard.js
3. 完成后必须按参考协议中的"完成后返回"契约，返回结构化结果
```

主流程等待返回结果，读取 `storyboard.json` 验证结构正确。

## 步骤 3: 并行生成场景组件（SubAgent）

### 3.0 计算分组

```typescript
const SCENES_PER_CREATOR = 5;
const sceneCount = storyboard.scenes.length;
const creatorCount = Math.ceil(sceneCount / SCENES_PER_CREATOR);
// creatorId 格式: creator-01, creator-02, ..., creator-10（始终前导零）
```

### 3.1 为每个 Creator 生成场景数据

```bash
node "{scriptsRoot}/generate-creator-scenes.js" \
  "{projectRoot}/storyboard.json" \
  "{creatorId}" \
  "{SCENES_PER_CREATOR}" \
  "{projectRoot}/scene-plans/{creatorId}.scenes.json"
```

### 3.2 并行启动所有 Scene Creator

每个 Creator 的 SubAgent prompt：

```text
你正在执行 remotion-video 工作流的"场景规划与实现阶段"。

首先读取以下参考协议并严格按其步骤执行：
- {referencesRoot}/scene-component-creator.md

输入参数：
- skillRoot: {skillRoot}
- projectRoot: {projectRoot}
- creatorId: {creatorId}
- planPath: {projectRoot}/scene-plans/{creatorId}.json
- scenesDataPath: {projectRoot}/scene-plans/{creatorId}.scenes.json
- validateScript: {scriptsRoot}/validate-scene-plan.js

重要：
1. 所有路径都已展开为绝对路径，不要自行猜测
2. 当前 creator 的场景事实源只允许来自 {scenesDataPath}
3. 规划阶段只使用 {scenesDataPath}、{projectRoot}/cartoon-ui-style-guide.css、{projectRoot}/cartoon-ui-style-guide-reference.md 和 {skillRoot}/rules/ 下的 Remotion 最佳实践规则
4. 先生成 scene-plan JSON，再执行校验，校验通过后再编写场景组件
5. `beatPlan` 默认一段字幕对应一个 beat；如果相邻 segments 明显属于同一句连续表达，可以合并
6. 合并仅允许发生在相邻 segments 之间，禁止跳跃式组合
7. `beatPlan` 只声明 `segments` 和 `action`；实际时间必须从 scenesData[].segments 的 `relativeStart / relativeDuration` 推导
8. 场景主节奏必须绑定 scenesData[].segments[].relativeStart / relativeDuration
9. 默认保留宿主背景，在透明根层上围绕画面中部或中上区域组织主视觉；不要重建整屏背景
10. 组件接口固定为 React.FC<{ segments: Segment[] }> 且使用默认导出
11. 只负责产出 {projectRoot}/src/scenes/SceneXXX.tsx；若文件不存在则创建，若已存在则仅修改自己负责的场景文件
12. 不要手改 {projectRoot}/src/compositions/Main.tsx 或 generated-scenes.ts
13. 完成后必须按参考协议中的"完成后返回"契约，返回结构化结果
14. Remotion 最佳实践规则位于 {skillRoot}/rules/ 目录下，按需读取（如 animations.md、text-animations.md、timing.md、subtitles.md 等）
```

### 3.3 等待所有 Creator 完成

确认所有目标场景组件文件均已生成。

> `componentResults` 仅用于任务完成反馈，不作为最终注册文件组装或总时长计算的真实来源。

## 步骤 4: 合成视频

### 4.1 生成场景注册文件

```bash
node "{scriptsRoot}/generate-scenes-registry.js" \
  "{projectRoot}" \
  "{projectRoot}/storyboard.json"
```

- `generated-scenes.ts` 的 `totalDurationInFrames` 由脚本生成，不要手改
- `Main.tsx` 中的 `msToFrames` 必须使用 `useVideoConfig().fps` 动态获取帧率

### 4.2 校验项目

```bash
node "{scriptsRoot}/validate-project.js" \
  "{projectRoot}" \
  "{projectRoot}/storyboard.json"
```

校验失败时必须停止，不得继续渲染。

### 4.3 执行渲染

```bash
cd "{projectRoot}"
npx remotion render Main out/output.mp4
```

## 步骤 5: 完成

通知用户：
- 视频已生成
- 输出路径: `{projectRoot}/out/output.mp4`
- 场景数量: N
- 视频时长: X 秒
