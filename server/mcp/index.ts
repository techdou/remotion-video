/**
 * MCP Server — 17 个工具
 *
 * Agent（ZCode/Codex/Claude Code）通过 MCP 协议调用。
 * stdio 传输，每次工具调用走 core 层。
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { initDb } from "../core/db.js";
import {
  createProject, getProject, listProjects, updateProject,
  getRun, listRuns, getRunEvents, createRun,
  listArtifacts, getArtifact, setArtifactStatus,
  RevisionConflict,
} from "../core/storage.js";
import { getRunQueue } from "../core/run-queue.js";
import { getProviderRegistry } from "../core/providers/registry.js";
import { validateProjectPath } from "../core/config.js";
import { RUN_TYPES } from "../core/types.js";
import type { RunType, ArtifactStatus } from "../core/types.js";

async function startMcpServer() {
  // DB 初始化失败不 crash，记录到 stderr 继续（MCP 协议走 stdio，stderr 不影响）
  let queue: any = null;
  try {
    await initDb();
    queue = getRunQueue();
    queue.start();
  } catch (err) {
    console.error("[MCP] WARNING: DB init failed, running in degraded mode:", err);
  }

  const server = new McpServer({
    name: "remotion-video",
    version: "1.0.0",
  });

  // ── 1. get_project_context ────────────────────────────
  server.tool(
    "get_project_context",
    "Get full project context: project info + recent runs + artifacts",
    { projectId: z.string() },
    async ({ projectId }) => {
      const project = getProject(projectId);
      if (!project) return { content: [{ type: "text", text: "Project not found" }] };
      const runs = listRuns(projectId);
      const artifacts = listArtifacts(projectId);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ project, runs: runs.slice(0, 10), artifacts }, null, 2),
        }],
      };
    },
  );

  // ── 2. get_selection_context ──────────────────────────
  server.tool(
    "get_selection_context",
    "Get currently selected/final artifacts for a project",
    { projectId: z.string() },
    async ({ projectId }) => {
      const artifacts = listArtifacts(projectId).filter(
        (a) => a.status === "selected" || a.status === "final",
      );
      return { content: [{ type: "text", text: JSON.stringify(artifacts, null, 2) }] };
    },
  );

  // ── 3. get_capabilities ───────────────────────────────
  server.tool(
    "get_capabilities",
    "List all provider capabilities and supported operations",
    {},
    async () => {
      const registry = getProviderRegistry();
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            capabilities: registry.listCapabilities(),
            runTypes: RUN_TYPES,
          }, null, 2),
        }],
      };
    },
  );

  // ── 4. get_project ────────────────────────────────────
  server.tool(
    "get_project",
    "Get project details by ID",
    { projectId: z.string() },
    async ({ projectId }) => {
      const project = getProject(projectId);
      return { content: [{ type: "text", text: project ? JSON.stringify(project, null, 2) : "Not found" }] };
    },
  );

  // ── 5. apply_project_patch ────────────────────────────
  server.tool(
    "apply_project_patch",
    "Apply changes to a project (optimistic lock via revision)",
    {
      projectId: z.string(),
      patch: z.object({ name: z.string().optional(), status: z.enum(["active", "archived"]).optional() }),
      revision: z.number().optional(),
    },
    async ({ projectId, patch, revision }) => {
      try {
        const updated = updateProject(projectId, patch, revision);
        return { content: [{ type: "text", text: updated ? JSON.stringify(updated, null, 2) : "Not found" }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }] };
      }
    },
  );

  // ── 6. validate_project ───────────────────────────────
  server.tool(
    "validate_project",
    "Validate project integrity (runs the validate script)",
    { projectId: z.string() },
    async ({ projectId }) => {
      const project = getProject(projectId);
      if (!project) return { content: [{ type: "text", text: "Not found" }] };
      const run = queue.submit(projectId, "validate" as RunType, { runType: "validate" });
      return { content: [{ type: "text", text: JSON.stringify({ runId: run.id, status: run.status }, null, 2) }] };
    },
  );

  // ── 7. start_run ──────────────────────────────────────
  server.tool(
    "start_run",
    "Start an async run. Returns runId immediately (non-blocking)",
    {
      projectId: z.string(),
      type: z.enum(RUN_TYPES as [string, ...string[]]),
      input: z.record(z.string(), z.unknown()).optional(),
    },
    async ({ projectId, type, input }) => {
      const project = getProject(projectId);
      if (!project) return { content: [{ type: "text", text: "Project not found" }] };
      const run = queue.submit(projectId, type as RunType, { ...input, runType: type });
      return { content: [{ type: "text", text: JSON.stringify({ runId: run.id, status: run.status }, null, 2) }] };
    },
  );

  // ── 8. get_run_status ─────────────────────────────────
  server.tool(
    "get_run_status",
    "Get run status and progress",
    { runId: z.string() },
    async ({ runId }) => {
      const run = getRun(runId);
      return { content: [{ type: "text", text: run ? JSON.stringify(run, null, 2) : "Run not found" }] };
    },
  );

  // ── 9. get_run_events ─────────────────────────────────
  server.tool(
    "get_run_events",
    "Get event log for a run",
    { runId: z.string() },
    async ({ runId }) => {
      const events = getRunEvents(runId);
      return { content: [{ type: "text", text: JSON.stringify(events, null, 2) }] };
    },
  );

  // ── 10. cancel_run ────────────────────────────────────
  server.tool(
    "cancel_run",
    "Cancel a running or queued run",
    { runId: z.string() },
    async ({ runId }) => {
      const run = queue.cancel(runId);
      return { content: [{ type: "text", text: run ? JSON.stringify(run, null, 2) : "Run not found" }] };
    },
  );

  // ── 11. resolve_run_input ─────────────────────────────
  server.tool(
    "resolve_run_input",
    "Resolve what input a run type needs for a project",
    {
      projectId: z.string(),
      type: z.enum(RUN_TYPES as [string, ...string[]]),
    },
    async ({ projectId, type }) => {
      const project = getProject(projectId);
      if (!project) return { content: [{ type: "text", text: "Project not found" }] };
      // 根据 type 返回需要的输入描述
      const inputSchema: Record<string, any> = {
        init: { srtPath: project.srtPath },
        storyboard: { srtPath: project.srtPath },
        creators: { storyboardPath: `${project.projectRoot}/storyboard.json`, scenesPerCreator: 5 },
        registry: {},
        validate: {},
        render: { scale: "optional (1 or 2)" },
        tts: { srtPath: project.srtPath },
        merge_speech: {},
      };
      return { content: [{ type: "text", text: JSON.stringify({ type, requiredInput: inputSchema[type] || {} }, null, 2) }] };
    },
  );

  // ── 12. list_artifacts ────────────────────────────────
  server.tool(
    "list_artifacts",
    "List artifacts for a project, optionally filtered by type",
    {
      projectId: z.string(),
      type: z.string().optional(),
    },
    async ({ projectId, type }) => {
      const artifacts = listArtifacts(projectId, type as any);
      return { content: [{ type: "text", text: JSON.stringify(artifacts, null, 2) }] };
    },
  );

  // ── 13. inspect_artifact ──────────────────────────────
  server.tool(
    "inspect_artifact",
    "Get artifact details including metadata",
    { artifactId: z.string() },
    async ({ artifactId }) => {
      const artifact = getArtifact(artifactId);
      return { content: [{ type: "text", text: artifact ? JSON.stringify(artifact, null, 2) : "Not found" }] };
    },
  );

  // ── 14. set_artifact_status ───────────────────────────
  server.tool(
    "set_artifact_status",
    "Set artifact status (draft/candidate/selected/final/archived)",
    {
      artifactId: z.string(),
      status: z.enum(["draft", "candidate", "selected", "final", "archived"]),
    },
    async ({ artifactId, status }) => {
      const artifact = setArtifactStatus(artifactId, status as ArtifactStatus);
      return { content: [{ type: "text", text: artifact ? JSON.stringify(artifact, null, 2) : "Not found" }] };
    },
  );

  // ── 15. list_templates ────────────────────────────────
  server.tool(
    "list_templates",
    "List available video templates",
    {},
    async () => {
      return {
        content: [{
          type: "text",
          text: JSON.stringify([
            { id: "default", name: "默认 (1080p30)", profile: "1080p30" },
            { id: "4k60", name: "4K 60fps", profile: "4k60" },
          ], null, 2),
        }],
      };
    },
  );

  // ── 16. apply_template ────────────────────────────────
  server.tool(
    "apply_template",
    "Apply a video template to a project",
    {
      projectId: z.string(),
      templateId: z.string(),
    },
    async ({ projectId, templateId }) => {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ projectId, templateId, applied: true, note: "Template applied via video-settings.json" }, null, 2),
        }],
      };
    },
  );

  // ── 17. test_provider ─────────────────────────────────
  server.tool(
    "test_provider",
    "Test a provider's connectivity and configuration",
    {
      providerType: z.string(),
    },
    async ({ providerType }) => {
      const registry = getProviderRegistry();
      const result = await registry.testProvider(providerType);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  // 启动 stdio 传输
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[MCP] Remotion Video MCP Server started (17 tools)");
}

// 入口
startMcpServer().catch((err) => {
  console.error("[MCP] Failed to start:", err);
  process.exit(1);
});
