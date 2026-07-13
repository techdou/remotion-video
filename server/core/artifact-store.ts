/**
 * Artifact 文件存储
 *
 * 管理 artifact 文件的物理存储路径和元数据。
 * 二进制文件存文件系统，元数据在 SQLite（通过 storage.ts）。
 */

import { existsSync, mkdirSync, copyFileSync, statSync, createReadStream } from "node:fs";
import { join, resolve, basename, dirname } from "node:path";
import type { Artifact, ArtifactType } from "./types.js";
import { createArtifact, getArtifact, listArtifacts, setArtifactStatus } from "./storage.js";

/** Artifact 存储根目录 */
const ARTIFACTS_DIR = join(process.cwd(), ".data", "artifacts");

/**
 * 注册一个 artifact（文件已在 projectRoot 里，只记录元数据）
 */
export function registerArtifact(input: {
  projectId: string;
  runId?: string | null;
  type: ArtifactType;
  name: string;
  filePath?: string | null;
  meta?: Record<string, unknown>;
}): Artifact {
  return createArtifact({
    projectId: input.projectId,
    runId: input.runId,
    type: input.type,
    name: input.name,
    filePath: input.filePath,
    status: "candidate",
    meta: input.meta,
  });
}

/**
 * 获取 artifact 的文件流（用于下载）
 */
export function getArtifactStream(artifact: Artifact) {
  if (!artifact.filePath || !existsSync(artifact.filePath)) {
    return null;
  }
  return createReadStream(artifact.filePath);
}

/**
 * 获取 artifact 文件信息
 */
export function getArtifactFileInfo(artifact: Artifact): { size: number; exists: boolean } {
  if (!artifact.filePath || !existsSync(artifact.filePath)) {
    return { size: 0, exists: false };
  }
  return { size: statSync(artifact.filePath).size, exists: true };
}

/**
 * 提升 artifact 状态（draft→candidate→selected→final）
 */
export function promoteArtifact(id: string, status: "candidate" | "selected" | "final"): Artifact | null {
  return setArtifactStatus(id, status);
}

/**
 * 归档旧版本（同类型只保留 selected/final 的为活跃）
 */
export function archiveOldVersions(projectId: string, type: ArtifactType, keepId: string): void {
  const artifacts = listArtifacts(projectId, type);
  for (const a of artifacts) {
    if (a.id !== keepId && a.status !== "final") {
      setArtifactStatus(a.id, "archived");
    }
  }
}

/**
 * 获取 artifact 版本树（通过 parentId 链）
 */
export function getArtifactTree(projectId: string): Artifact[] {
  return listArtifacts(projectId);
}
