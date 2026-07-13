/**
 * Remotion Video Server — 主入口
 *
 * 启动 Domain Service（Express API + SSE）+ Run Queue Worker。
 * MCP Server 是独立进程（`npm run mcp`），通过共享 SQLite 通信。
 *
 * 用法:
 *   node dist/index.js    — 启动 API + Worker
 *   node dist/mcp.js      — 启动 MCP Server（stdio）
 *   node dist/api.js      — 仅启动 API（同 index.js）
 */

import { initDb } from "./core/db.js";
import { getRunQueue } from "./core/run-queue.js";
import { createApiServer } from "./api/index.js";

const PORT = parseInt(process.env.WEB_UI_PORT || "3210", 10);

async function main() {
  console.log("[Server] Initializing database...");
  await initDb();

  console.log("[Server] Starting Run Queue Worker...");
  const queue = getRunQueue();
  queue.start();

  console.log("[Server] Starting Express API...");
  const app = createApiServer();

  app.listen(PORT, "127.0.0.1", () => {
    console.log("");
    console.log("╔══════════════════════════════════════════╗");
    console.log("║  Remotion Video Project Service          ║");
    console.log(`║  API:  http://127.0.0.1:${PORT}              ║`);
    console.log("║  MCP:  node dist/mcp.js (stdio)          ║");
    console.log("╚══════════════════════════════════════════╝");
    console.log("");
    console.log("Endpoints:");
    console.log("  GET  /api/health              Health check");
    console.log("  GET  /api/projects            List projects");
    console.log("  GET  /api/projects/:id        Project details");
    console.log("  POST /api/projects/:id/runs   Start a run");
    console.log("  GET  /api/runs/:runId         Run status");
    console.log("  GET  /api/events              SSE event stream");
    console.log("  GET  /api/providers           Provider capabilities");
    console.log("  GET  /api/artifacts/:id       Artifact details");
    console.log("");
  });
}

main().catch((err) => {
  console.error("[Server] Failed to start:", err);
  process.exit(1);
});
