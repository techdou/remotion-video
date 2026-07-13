# 数据结构参考

## storyboard.json

由步骤 2（分镜生成阶段）产出，步骤 3-4 消费。

```typescript
interface Storyboard {
  totalDuration: number;       // 总时长（毫秒）
  sceneCount: number;
  scenes: {
    id: string;                // scene_001, scene_002, ...
    startTime: number;         // 场景起始时间（毫秒，绝对）
    duration: number;          // 场景时长（毫秒）
    segments: {
      text: string;            // 字幕文本
      relativeStart: number;   // 场景内相对起始（毫秒）
      relativeDuration: number;// 该段时长（毫秒）
    }[];
    semanticTags?: string[];
    visualHint?: string;
  }[];
}
```

## scene-plan JSON

由步骤 3（场景规划阶段）产出，每个 Creator 一个。

```typescript
interface ScenePlanCard {
  sceneId: string;
  goal: string;
  layout: string;
  visualCore: string;
  surface: string;
  emphasis: string;
  screenShouldShow: string[];
  beatPlan: {
    segments: number[];        // 绑定的 segment 索引
    action: string;            // 该 beat 的动画动作描述
  }[];
}
```

## SceneComponentResult

Creator 完成后的返回结构。

```typescript
interface SceneComponentResult {
  sceneId: string;
  componentPath: string;       // {projectRoot}/src/scenes/SceneXXX.tsx
  componentName?: string;
  planPath?: string;           // {projectRoot}/scene-plans/{creatorId}.json
}
```

## 场景组件接口约定

所有 `SceneXXX.tsx` 必须遵循：

```typescript
import React from "react";

interface Segment {
  text: string;
  relativeStart: number;
  relativeDuration: number;
}

const SceneXXX: React.FC<{ segments: Segment[] }> = ({ segments }) => {
  // 场景实现
};

export default SceneXXX;
```

- 固定使用**默认导出**
- props 固定为 `{ segments: Segment[] }`
- `segments` 的时间值直接来自 `storyboard.json` 的 `scenes[].segments[]`
