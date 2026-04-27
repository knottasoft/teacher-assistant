import { build } from "esbuild";
import { readFileSync, writeFileSync, cpSync, unlinkSync } from "fs";

// Step 0: Copy JSON data to dist/ (tsc doesn't copy non-ts files)
cpSync("src/data", "dist/data", { recursive: true });

// Step 1: Bundle from compiled JS (after tsc) — all deps + JSON inlined.
// Banner внедряет createRequire, чтобы CJS-зависимости (iconv-lite, xlsx) могли
// требовать Node-built-ins ("buffer", "stream", ...) внутри ESM-бандла.
await build({
  entryPoints: ["dist/index.js"],
  bundle: true,
  platform: "node",
  target: "node18",
  format: "esm",
  outfile: "dist/bundle.tmp.js",
  loader: { ".json": "json" },
  external: [],
  minify: false,
  sourcemap: false,
  banner: {
    js: `import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);`,
  },
});

// Step 2: Add shebang (strip any existing shebangs)
let code = readFileSync("dist/bundle.tmp.js", "utf-8");
code = code.replace(/^#!.*\n/gm, "");
const final = "#!/usr/bin/env node\n" + code;
writeFileSync("dist/bundle.js", final, { mode: 0o755 });

// Cleanup temp
unlinkSync("dist/bundle.tmp.js");

console.log("Bundle created: dist/bundle.js");
