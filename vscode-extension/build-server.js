const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

async function buildServer() {
  // First, build the server with esbuild
  await esbuild.build({
    entryPoints: ["../src/index.ts"],
    bundle: true,
    outfile: "out/server.js",
    format: "cjs",
    platform: "node",
    external: ["vscode"],
    target: "node20",
    sourcemap: false,
  });

  // Then patch the output to work in extension context
  const serverPath = path.join(__dirname, "out", "server.js");
  let content = fs.readFileSync(serverPath, "utf8");

  // Replace process.cwd() calls with extension-aware path resolution
  content = content.replace(
    /process\.cwd\(\)/g,
    "(process.env.MCP_SERVER_BASE_PATH || process.cwd())",
  );

  fs.writeFileSync(serverPath, content);
  console.log("✓ Server built and patched for extension context");
}

buildServer().catch(console.error);
