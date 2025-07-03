#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as fs from "fs-extra";
import { readdir } from "fs/promises";
import * as path from "path";

import {
  getAvailableLibraries,
  registerDocumentationTools,
} from "./tools/docTools.js";
import { registerRepositoryTools } from "./tools/repoTools.js";
import { registerExampleTools } from "./tools/exampleTools.js";
import { registerRepoManagementTools } from "./tools/repoManagement.js";
import { loadConfig, loadRepoData } from "./tools/shared.js";

const server = new McpServer({
  name: "docs-server",
  version: "1.0.0",
  capabilities: {
    resources: {},
    tools: {},
  },
});

const DOCS_BASE_PATH = path.join(process.cwd(), "docsdata");

// Tool: Health check / server status
server.tool(
  "health-check",
  "Check if the MCP server is alive and get server information",
  {},
  async () => {
    const libraries = await getAvailableLibraries();
    const repoData = await loadRepoData();
    const config = await loadConfig();
    const repoCount = Object.keys(repoData).length;
    const hasGitHubToken = !!config.github.apiKey;

    // Debug information
    let pathExists = false;
    let pathContents: string[] = [];
    let pathError = "";

    try {
      pathExists = await fs.pathExists(DOCS_BASE_PATH);
      if (pathExists) {
        const entries = await readdir(DOCS_BASE_PATH, {
          withFileTypes: true,
        });
        pathContents = entries.map((entry) =>
          `${entry.name} (${entry.isDirectory() ? "dir" : "file"})`
        );
      }
    } catch (error) {
      pathError = error instanceof Error ? error.message : "Unknown error";
    }

    const serverInfo = {
      status: "alive",
      timestamp: new Date().toISOString(),
      version: "1.0.0",
      name: "MCP Documentation Server",
      docsBasePath: DOCS_BASE_PATH,
      availableLibraries: libraries,
      libraryCount: libraries.length,
      availableRepositories: Object.keys(repoData),
      repositoryCount: repoCount,
      hasGitHubToken,
      expectedRateLimit: hasGitHubToken
        ? config.github.rateLimit.authenticated
        : config.github.rateLimit.unauthenticated,
      nodeVersion: process.version,
      platform: process.platform,
      uptime: process.uptime(),
      // Debug info
      processWorkingDir: process.cwd(),
      pathExists,
      pathContents,
      pathError,
    };

    return {
      content: [
        {
          type: "text",
          text: `# MCP Documentation Server - Health Check

**Status:** ✅ ${serverInfo.status.toUpperCase()}
**Timestamp:** ${serverInfo.timestamp}
**Server Version:** ${serverInfo.version}
**Node.js Version:** ${serverInfo.nodeVersion}
**Platform:** ${serverInfo.platform}
**Uptime:** ${Math.floor(serverInfo.uptime)} seconds

## Configuration
- **Documentation Base Path:** ${serverInfo.docsBasePath}
- **Available Libraries:** ${serverInfo.libraryCount}
- **Available Repositories:** ${serverInfo.repositoryCount}
- **GitHub API Token:** ${
            serverInfo.hasGitHubToken ? "✅ Configured" : "❌ Not configured"
          }
- **Expected Rate Limit:** ${serverInfo.expectedRateLimit}/hour

## Debug Information
- **Process Working Directory:** ${serverInfo.processWorkingDir}
- **Docs Path Exists:** ${serverInfo.pathExists ? "✅ YES" : "❌ NO"}
- **Path Error:** ${serverInfo.pathError || "None"}

## Directory Contents:
${
            serverInfo.pathContents.length > 0
              ? serverInfo.pathContents.map((item) => `• ${item}`).join("\n")
              : "  No items found or path does not exist"
          }

## Libraries Found:
${
            serverInfo.availableLibraries.length > 0
              ? serverInfo.availableLibraries.map((lib) => `• ${lib}`).join(
                "\n",
              )
              : "  No libraries found in docsdata folder"
          }

## Repositories Configured:
${
            serverInfo.availableRepositories.length > 0
              ? serverInfo.availableRepositories.map((repo) => `• ${repo}`)
                .join(
                  "\n",
                )
              : "  No repositories found in repodata.json"
          }

## Available Tools:

### Documentation Tools:
• \`health-check\` - Check server status and information
• \`list-libraries\` - Get all available documentation libraries
• \`list-docs\` - Get documentation files for a specific library
• \`get-doc\` - Get content of a specific documentation file
• \`search-docs\` - Search for content within a library's documentation
• \`get-overview\` - Get an overview of a library's documentation structure
• \`get-readme\` - Get the README content from any GitHub repository

### Repository Tools:
• \`list-repositories\` - Get all available source code repositories
• \`browse-repo\` - Browse the file structure of a source code repository
• \`read-source-file\` - Read the content of a specific source file from a repository
• \`search-source\` - Search for specific patterns in source code across a repository

### Example Tools:
• \`search-examples\` - Search for example code snippets in docs and repository examples
• \`get-example\` - Get a specific example file from the repository
• \`list-examples\` - List available example directories for a library

### Repository Management Tools:
• \`analyze-repository\` - Analyze a GitHub repository structure to prepare for adding it to repodata.json
• \`add-repository\` - Add a new repository configuration to repodata.json
• \`remove-repository\` - Remove a repository configuration from repodata.json`,
        },
      ],
    };
  },
);

// Register all tool categories
registerDocumentationTools(server);
registerRepositoryTools(server);
registerExampleTools(server);
registerRepoManagementTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Documentation MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
