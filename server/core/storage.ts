/**
 * 存储 CRUD 层
 *
 * projects / runs / artifacts / run_events 的增删改查。
 * 所有操作使用 prepared statements 防注入。
 * 使用 revision 乐观锁控制项目并发修改。
 */

import { randomUUID } from "node:crypto";
import { getDb } from "./db.js";
import type {
  Project, Run, Artifact, RunEvent, RunType, RunStatus,
  ArtifactType, ArtifactStatus, ProjectPatch, ProviderConfig,
} from "./types.js";

// ════════════════════════════════════════════════════════
// 辅助：生成 ID
// ════════════════════════════════════════════════════════

function genId(): string {
  return randomUUID().slice(0, 8);
}

// ════════════════════════════════════════════════════════
// Projects
// ════════════════════════════════════════════════════════

export function createProject(input: {
  name: string;
  srtPath: string;
  projectRoot: string;
}): Project {
  const db = getDb();
  const id = genId();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO projects (id, name, srt_path, project_root, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'active', ?, ?)
  `).run(id, input.name, input.srtPath, input.projectRoot, now, now);
  return getProject(id)!;
}

export function getProject(id: string): Project | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as any;
  return row ? rowToProject(row) : null;
}

export function listProjects(): Project[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM projects ORDER BY created_at DESC").all() as any[];
  return rows.map(rowToProject);
}

export function updateProject(id: string, patch: ProjectPatch, expectedRevision?: number): Project | null {
  const db = getDb();
  const current = getProject(id);
  if (!current) return null;

  // 乐观锁
  if (expectedRevision !== undefined && current.revision !== expectedRevision) {
    throw new RevisionConflict(id, current.revision, expectedRevision);
  }

  const updates: string[] = [];
  const values: any[] = [];
  if (patch.name !== undefined) { updates.push("name = ?"); values.push(patch.name); }
  if (patch.status !== undefined) { updates.push("status = ?"); values.push(patch.status); }
  updates.push("revision = revision + 1");
  updates.push("updated_at = ?");
  values.push(new Date().toISOString());
  values.push(id);

  db.prepare(`UPDATE projects SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  return getProject(id);
}

// ════════════════════════════════════════════════════════
// Runs
// ════════════════════════════════════════════════════════

export function createRun(projectId: string, type: RunType, input?: unknown): Run {
  const db = getDb();
  const id = genId();
  db.prepare(`
    INSERT INTO runs (id, project_id, type, status, input_json)
    VALUES (?, ?, ?, 'queued', ?)
  `).run(id, projectId, type, input ? JSON.stringify(input) : null);
  return getRun(id)!;
}

export function getRun(id: string): Run | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM runs WHERE id = ?").get(id) as any;
  return row ? rowToRun(row) : null;
}

export function listRuns(projectId: string): Run[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM runs WHERE project_id = ? ORDER BY created_at DESC").all(projectId) as any[];
  return rows.map(rowToRun);
}

export function updateRunStatus(
  id: string,
  status: RunStatus,
  extra?: { output?: unknown; error?: string; progress?: number },
): Run | null {
  const db = getDb();
  const updates: string[] = ["status = ?"];
  const values: any[] = [status];

  if (extra?.output !== undefined) {
    updates.push("output_json = ?");
    values.push(JSON.stringify(extra.output));
  }
  if (extra?.error !== undefined) {
    updates.push("error = ?");
    values.push(extra.error);
  }
  if (extra?.progress !== undefined) {
    updates.push("progress = ?");
    values.push(extra.progress);
  }
  if (status === "running") {
    updates.push("started_at = ?");
    values.push(new Date().toISOString());
  }
  if (status === "completed" || status === "failed" || status === "cancelled") {
    updates.push("completed_at = ?");
    values.push(new Date().toISOString());
  }
  values.push(id);

  db.prepare(`UPDATE runs SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  return getRun(id);
}

/** Worker lease：认领 queued run */
export function leaseRun(id: string): Run | null {
  const db = getDb();
  const now = new Date().toISOString();
  const result = db.prepare(`
    UPDATE runs SET status = 'running', started_at = ?, worker_lease_at = ?
    WHERE id = ? AND status = 'queued'
  `).run(now, now, id);
  if (result.changes === 0) return null;
  return getRun(id);
}

/** 更新 heartbeat（Worker 还活着）*/
export function heartbeatRun(id: string): void {
  const db = getDb();
  db.prepare("UPDATE runs SET worker_lease_at = ? WHERE id = ? AND status = 'running'")
    .run(new Date().toISOString(), id);
}

/** 查找可认领的 queued runs */
export function findQueuedRuns(limit = 5): Run[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM runs WHERE status = 'queued' ORDER BY created_at ASC LIMIT ?")
    .all(limit) as any[];
  return rows.map(rowToRun);
}

/** 查找超时的 running runs（崩溃恢复） */
export function findStaleRuns(timeoutMs = 60000): Run[] {
  const db = getDb();
  const cutoff = new Date(Date.now() - timeoutMs).toISOString();
  const rows = db.prepare(`
    SELECT * FROM runs
    WHERE status = 'running' AND worker_lease_at < ?
  `).all(cutoff) as any[];
  return rows.map(rowToRun);
}

// ════════════════════════════════════════════════════════
// Run Events
// ════════════════════════════════════════════════════════

export function addRunEvent(runId: string, type: string, message: string, data?: unknown): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO run_events (run_id, type, message, data_json)
    VALUES (?, ?, ?, ?)
  `).run(runId, type, message, data ? JSON.stringify(data) : null);
}

export function getRunEvents(runId: string): RunEvent[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM run_events WHERE run_id = ? ORDER BY id ASC").all(runId) as any[];
  return rows.map((r) => ({
    runId: r.run_id,
    type: r.type,
    message: r.message,
    timestamp: r.timestamp,
    data: r.data_json ? JSON.parse(r.data_json) : undefined,
  }));
}

// ════════════════════════════════════════════════════════
// Artifacts
// ════════════════════════════════════════════════════════

export function createArtifact(input: {
  projectId: string;
  runId?: string | null;
  parentId?: string | null;
  type: ArtifactType;
  name: string;
  filePath?: string | null;
  status?: ArtifactStatus;
  meta?: unknown;
}): Artifact {
  const db = getDb();
  const id = genId();
  db.prepare(`
    INSERT INTO artifacts (id, project_id, run_id, parent_id, type, name, file_path, status, meta_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, input.projectId, input.runId || null, input.parentId || null,
    input.type, input.name, input.filePath || null,
    input.status || "draft", input.meta ? JSON.stringify(input.meta) : null,
  );
  return getArtifact(id)!;
}

export function getArtifact(id: string): Artifact | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM artifacts WHERE id = ?").get(id) as any;
  return row ? rowToArtifact(row) : null;
}

export function listArtifacts(projectId: string, type?: ArtifactType): Artifact[] {
  const db = getDb();
  const rows = type
    ? db.prepare("SELECT * FROM artifacts WHERE project_id = ? AND type = ? ORDER BY created_at DESC")
        .all(projectId, type) as any[]
    : db.prepare("SELECT * FROM artifacts WHERE project_id = ? ORDER BY created_at DESC")
        .all(projectId) as any[];
  return rows.map(rowToArtifact);
}

export function setArtifactStatus(id: string, status: ArtifactStatus): Artifact | null {
  const db = getDb();
  db.prepare("UPDATE artifacts SET status = ? WHERE id = ?").run(status, id);
  return getArtifact(id);
}

// ════════════════════════════════════════════════════════
// Provider Configs
// ════════════════════════════════════════════════════════

export function getProviderConfig(type: string): ProviderConfig | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM provider_configs WHERE provider_type = ? AND is_default = 1")
    .get(type) as any;
  return row ? rowToProviderConfig(row) : null;
}

export function listProviderConfigs(): ProviderConfig[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM provider_configs ORDER BY created_at DESC").all() as any[];
  return rows.map(rowToProviderConfig);
}

export function saveProviderConfig(type: string, name: string, config: Record<string, unknown>, isDefault = false): ProviderConfig {
  const db = getDb();
  const id = genId();
  if (isDefault) {
    // 取消同类型的其他 default
    db.prepare("UPDATE provider_configs SET is_default = 0 WHERE provider_type = ?").run(type);
  }
  db.prepare(`
    INSERT INTO provider_configs (id, provider_type, name, config_json, is_default)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, type, name, JSON.stringify(config), isDefault ? 1 : 0);
  return listProviderConfigs().find((p) => p.id === id)!;
}

// ════════════════════════════════════════════════════════
// Revision Conflict
// ════════════════════════════════════════════════════════

export class RevisionConflict extends Error {
  constructor(
    public projectId: string,
    public currentRevision: number,
    public expectedRevision: number,
  ) {
    super(`Revision conflict: expected ${expectedRevision}, got ${currentRevision}`);
    this.name = "RevisionConflict";
  }
}

// ════════════════════════════════════════════════════════
// Row 映射
// ════════════════════════════════════════════════════════

function rowToProject(row: any): Project {
  return {
    id: row.id,
    name: row.name,
    srtPath: row.srt_path,
    projectRoot: row.project_root,
    revision: row.revision,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToRun(row: any): Run {
  return {
    id: row.id,
    projectId: row.project_id,
    type: row.type,
    status: row.status,
    inputJson: row.input_json,
    outputJson: row.output_json,
    error: row.error,
    progress: row.progress,
    workerLeaseAt: row.worker_lease_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

function rowToArtifact(row: any): Artifact {
  return {
    id: row.id,
    projectId: row.project_id,
    runId: row.run_id,
    parentId: row.parent_id,
    type: row.type,
    name: row.name,
    filePath: row.file_path,
    status: row.status,
    metaJson: row.meta_json,
    createdAt: row.created_at,
  };
}

function rowToProviderConfig(row: any): ProviderConfig {
  return {
    id: row.id,
    providerType: row.provider_type,
    name: row.name,
    configJson: row.config_json,
    isDefault: row.is_default === 1,
    createdAt: row.created_at,
  };
}
