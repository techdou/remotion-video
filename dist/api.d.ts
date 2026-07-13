import express from 'express';

/**
 * Domain Service — Express HTTP API + SSE
 *
 * 前端控制台通过 HTTP API 操作，SSE 接收实时事件。
 * 绑定 127.0.0.1（不暴露局域网）。
 */

declare function createApiServer(): express.Express;
/**
 * 启动 Domain Service（独立进程入口）
 */
declare function startApiServer(): Promise<void>;

export { createApiServer, startApiServer };
