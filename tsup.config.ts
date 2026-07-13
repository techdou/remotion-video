import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "server/index.ts",
    mcp: "server/mcp/index.ts",
    api: "server/api/index.ts",
  },
  format: ["esm"],
  target: "es2022",
  outDir: "dist",
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: ["better-sqlite3", "express", "@modelcontextprotocol/sdk"],
});
