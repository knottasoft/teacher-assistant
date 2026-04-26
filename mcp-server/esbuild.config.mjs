import { build } from "esbuild";
import { readFileSync, writeFileSync, cpSync, unlinkSync, mkdirSync, existsSync } from "fs";

// ── Step 0a: Copy JSON sources (still needed by build-fgos-db.mjs reference)
cpSync("src/data", "dist/data", { recursive: true });

// ── Step 0b: Copy fgos.db to dist/data so single-folder npm/MCPB packaging works.
// Database expected at mcp-server/data/fgos.db (built by scripts/build-fgos-db.mjs).
if (existsSync("data/fgos.db")) {
  mkdirSync("dist/data", { recursive: true });
  cpSync("data/fgos.db", "dist/data/fgos.db");
  console.log("  copied fgos.db → dist/data/fgos.db");
} else {
  console.warn("  ⚠ data/fgos.db not found — run `node ../scripts/build-fgos-db.mjs` first");
}

// ── Step 1: Bundle from compiled JS. better-sqlite3 + sqlite-vec + transformers
// ship native binaries / many heavy deps that we cannot inline; mark them external.
// The bundle remains a single JS file but pulls these from node_modules at runtime.
await build({
  entryPoints: ["dist/index.js"],
  bundle: true,
  platform: "node",
  target: "node18",
  format: "esm",
  outfile: "dist/bundle.tmp.js",
  loader: { ".json": "json" },
  external: [
    "better-sqlite3",
    "sqlite-vec",
    "@xenova/transformers",
    // node built-ins are auto-external
  ],
  minify: false,
  sourcemap: false,
  // ESM helpers for require() in CJS deps
  banner: {
    js: `import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);`,
  },
});

// ── Step 2: Add shebang (strip any existing)
let code = readFileSync("dist/bundle.tmp.js", "utf-8");
code = code.replace(/^#!.*\n/gm, "");
const final = "#!/usr/bin/env node\n" + code;
writeFileSync("dist/bundle.js", final, { mode: 0o755 });

unlinkSync("dist/bundle.tmp.js");
console.log("Bundle created: dist/bundle.js");
