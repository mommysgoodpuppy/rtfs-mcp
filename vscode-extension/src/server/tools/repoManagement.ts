import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { writeFile } from "fs/promises";
import * as path from "path";
import { fetchGitHubContent, loadRepoData, RepoConfig } from "./shared.js";

const REPO_DATA_PATH = path.join(process.cwd(), "repodata.json");

// Helper function to normalize GitHub URL to repo format
function normalizeGitHubUrl(url: string): { repo: string; github: string } {
  // Remove trailing slash and .git
  const cleanUrl = url.replace(/\/$/, "").replace(/\.git$/, "");

  // Extract owner/repo from various GitHub URL formats
  const patterns = [
    /github\.com\/([^\/]+\/[^\/]+)/, // https://github.com/owner/repo
    /^([^\/]+\/[^\/]+)$/, // owner/repo
  ];

  for (const pattern of patterns) {
    const match = cleanUrl.match(pattern);
    if (match) {
      const repo = match[1];
      const github = `https://github.com/${repo}`;
      return { repo, github };
    }
  }

  throw new Error(`Invalid GitHub URL format: ${url}`);
}

// Helper function to analyze repository structure
async function analyzeRepository(
  repo: string,
  branch: string = "main",
): Promise<{
  structure: any[];
  fileTypeCounts: Record<string, number>;
  suggestedPaths: {
    srcPaths: string[];
    examplePaths: string[];
    docsPaths: string[];
  };
  mainBranch: string;
}> {
  try {
    // Try main branch first, fallback to master
    let actualBranch = branch;

    const fileTypeCounts: Record<string, number> = {};
    const suggestedPaths = {
      srcPaths: [] as string[],
      examplePaths: [] as string[],
      docsPaths: [] as string[],
    };

    // Helper to recursively explore interesting directories
    const exploreDirectory = async (
      dirPath: string,
      maxDepth: number = 2,
    ): Promise<any[]> => {
      if (maxDepth <= 0) return [];

      try {
        const dirContents = await fetchGitHubContent(
          repo,
          dirPath,
          actualBranch,
        );
        if (!Array.isArray(dirContents)) return [];

        const result = [];
        for (const item of dirContents) {
          const itemPath = dirPath ? `${dirPath}/${item.name}` : item.name;

          if (item.type === "file") {
            const ext = path.extname(item.name).toLowerCase();
            fileTypeCounts[ext] = (fileTypeCounts[ext] || 0) + 1;
          }

          // Check if this is an interesting directory to expand
          const shouldExpand = item.type === "dir" && (
            item.name.toLowerCase().includes("src") ||
            item.name.toLowerCase().includes("example") ||
            item.name.toLowerCase().includes("docs") ||
            item.name.toLowerCase().includes("demo") ||
            item.name.toLowerCase().includes("readme.md") ||
            item.name === "packages" ||
            item.name === "apps"
          );

          if (shouldExpand) {
            const children = await exploreDirectory(itemPath, maxDepth - 1);
            result.push({
              ...item,
              path: itemPath,
              children: children.length > 0 ? children : undefined,
            });

            // Suggest paths based on directory structure
            if (item.name.toLowerCase().includes("src")) {
              suggestedPaths.srcPaths.push(itemPath);
            }
            if (
              item.name.toLowerCase().includes("example") ||
              item.name.toLowerCase().includes("demo")
            ) {
              suggestedPaths.examplePaths.push(itemPath);
            }
            if (item.name.toLowerCase().includes("docs")) {
              suggestedPaths.docsPaths.push(itemPath);
            }
          } else {
            result.push({
              ...item,
              path: itemPath,
            });
          }
        }
        return result;
      } catch (error) {
        return [];
      }
    };

    const structure = await exploreDirectory("");

    return {
      structure,
      fileTypeCounts,
      suggestedPaths,
      mainBranch: actualBranch,
    };
  } catch (error) {
    throw new Error(
      `Failed to analyze repository: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
}

// Helper function to format file tree display
function formatFileTree(items: any[], indent: string = ""): string {
  return items.map((item) => {
    const icon = item.type === "dir" ? "📁" : "📄";
    const name = item.type === "dir" ? `${item.name}/` : item.name;
    let result = `${indent}${icon} ${name}`;

    if (item.children && item.children.length > 0) {
      result += "\n" + formatFileTree(item.children, indent + "  ");
    }

    return result;
  }).join("\n");
}

export function registerRepoManagementTools(server: McpServer) {
  // Step 1: Analyze repository structure
  server.tool(
    "analyze-repository",
    "Analyze a GitHub repository structure to prepare for adding it to repodata.json. Provides file tree with expanded common directories and suggests paths for src, examples, and docs.",
    {
      url: z.string().describe(
        "GitHub repository URL (e.g., 'https://github.com/owner/repo' or 'owner/repo')",
      ),
      branch: z.string().optional().describe(
        "Branch name (optional, defaults to 'main', will try 'master' as fallback)",
      ),
    },
    async ({ url, branch = "main" }) => {
      try {
        const { repo, github } = normalizeGitHubUrl(url);
        const analysis = await analyzeRepository(repo, branch);

        // Format file type counts
        const topFileTypes = Object.entries(analysis.fileTypeCounts)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 10)
          .map(([ext, count]) => `${ext || "(no ext)"}: ${count}`)
          .join(", ");

        const result = `# Repository Analysis: ${repo}

## 📊 Overview
- **Repository:** ${github}
- **Branch:** ${analysis.mainBranch}
- **Total file types:** ${Object.keys(analysis.fileTypeCounts).length}
- **Top file types:** ${topFileTypes}

## 📁 Repository Structure
${formatFileTree(analysis.structure)}

## 🎯 Suggested Configuration Paths

### Source Paths:
${
          analysis.suggestedPaths.srcPaths.length > 0
            ? analysis.suggestedPaths.srcPaths.map((p) => `• ${p}`).join("\n")
            : "• No obvious source directories found"
        }

### Example Paths:
${
          analysis.suggestedPaths.examplePaths.length > 0
            ? analysis.suggestedPaths.examplePaths.map((p) => `• ${p}`).join(
              "\n",
            )
            : "• No obvious example directories found"
        }

### Documentation Paths:
${
          analysis.suggestedPaths.docsPaths.length > 0
            ? analysis.suggestedPaths.docsPaths.map((p) => `• ${p}`).join("\n")
            : "• No obvious documentation directories found"
        }

## 📝 Recommended Next Steps
Use the \`add-repository\` tool with the following suggested configuration:
- **name**: (You should provide a descriptive name)
- **description**: (You should provide a description)
- **repo**: ${repo}
- **mainBranch**: ${analysis.mainBranch}
- **srcPaths**: ${JSON.stringify(analysis.suggestedPaths.srcPaths)}
- **examplePaths**: ${JSON.stringify(analysis.suggestedPaths.examplePaths)}
- **docsPaths**: ${
          JSON.stringify(analysis.suggestedPaths.docsPaths)
        } (if you want separate docs repo, modify accordingly)

**File Type Distribution:**
${
          Object.entries(analysis.fileTypeCounts)
            .sort(([, a], [, b]) => b - a)
            .map(([ext, count]) => `${ext || "(no ext)"}: ${count}`)
            .join(", ")
        }`;

        return {
          content: [
            {
              type: "text",
              text: result,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error analyzing repository: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
            },
          ],
        };
      }
    },
  );

  // Step 2: Add repository to repodata.json
  server.tool(
    "add-repository",
    "Add a new repository configuration to repodata.json. Use after analyzing the repository structure with analyze-repository.",
    {
      key: z.string().describe(
        "Unique key for this library (e.g., 'react-spring', 'framer-motion')",
      ),
      name: z.string().describe(
        "Display name for the library (e.g., '@react-spring/core')",
      ),
      description: z.string().describe("Short description of the library"),
      repo: z.string().describe("GitHub repository in 'owner/repo' format"),
      mainBranch: z.string().describe(
        "Main branch name (usually 'main' or 'master')",
      ),
      srcPaths: z.array(z.string()).describe(
        "Array of source code paths within the repository",
      ),
      examplePaths: z.array(z.string()).describe(
        "Array of example code paths within the repository",
      ),
      docsRepo: z.string().optional().describe(
        "Documentation repository if different from main repo (optional)",
      ),
      docsBranch: z.string().optional().describe(
        "Documentation repository branch (optional, defaults to mainBranch)",
      ),
      docsPaths: z.array(z.string()).optional().describe(
        "Array of documentation paths within the docs repository",
      ),
    },
    async (
      {
        key,
        name,
        description,
        repo,
        mainBranch,
        srcPaths,
        examplePaths,
        docsRepo,
        docsBranch,
        docsPaths,
      },
    ) => {
      try {
        // Load current repodata
        const currentRepoData = await loadRepoData();

        // Check if key already exists
        if (currentRepoData[key]) {
          return {
            content: [
              {
                type: "text",
                text:
                  `❌ Repository key '${key}' already exists in repodata.json. Use a different key or update the existing entry manually.`,
              },
            ],
          };
        }

        // Create new repository configuration
        const newRepo: RepoConfig = {
          name,
          description,
          github: `https://github.com/${repo}`,
          repo,
          mainBranch,
          srcPaths,
          examplePaths,
        };

        // Add docs configuration if provided
        if (docsPaths && docsPaths.length > 0) {
          newRepo.docs = {
            repo: docsRepo || repo,
            branch: docsBranch || mainBranch,
            paths: docsPaths,
          };
        }

        // Add to repodata
        const updatedRepoData = {
          ...currentRepoData,
          [key]: newRepo,
        };

        // Write back to file
        await writeFile(
          REPO_DATA_PATH,
          JSON.stringify(updatedRepoData, null, 2),
        );

        const result =
          `✅ Successfully added repository '${key}' to repodata.json!

## 📋 Configuration Added:
- **Key:** ${key}
- **Name:** ${name}
- **Description:** ${description}
- **Repository:** https://github.com/${repo}
- **Branch:** ${mainBranch}
- **Source Paths:** ${srcPaths.join(", ")}
- **Example Paths:** ${examplePaths.join(", ")}
${
            newRepo.docs
              ? `- **Docs Repository:** https://github.com/${newRepo.docs.repo}
- **Docs Branch:** ${newRepo.docs.branch}
- **Docs Paths:** ${newRepo.docs.paths.join(", ")}`
              : "- **Docs:** Using local documentation only"
          }

## 🚀 Available Tools for '${key}':
You can now use all repository and example tools with this library:
- \`browse-repo library:${key}\`
- \`read-source-file library:${key}\`
- \`search-source library:${key}\`
- \`search-examples library:${key}\`
- \`list-examples library:${key}\`
- \`get-example library:${key}\`

The new repository is immediately available for use!`;

        return {
          content: [
            {
              type: "text",
              text: result,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Error adding repository: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
            },
          ],
        };
      }
    },
  );

  // Bonus: Remove repository tool
  server.tool(
    "remove-repository",
    "Remove a repository configuration from repodata.json",
    {
      key: z.string().describe("The repository key to remove"),
    },
    async ({ key }) => {
      try {
        const currentRepoData = await loadRepoData();

        if (!currentRepoData[key]) {
          return {
            content: [
              {
                type: "text",
                text:
                  `❌ Repository key '${key}' not found in repodata.json. Available keys: ${
                    Object.keys(currentRepoData).join(", ")
                  }`,
              },
            ],
          };
        }

        // Remove the repository
        const { [key]: removed, ...updatedRepoData } = currentRepoData;

        // Write back to file
        await writeFile(
          REPO_DATA_PATH,
          JSON.stringify(updatedRepoData, null, 2),
        );

        return {
          content: [
            {
              type: "text",
              text:
                `✅ Successfully removed repository '${key}' (${removed.name}) from repodata.json!`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Error removing repository: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
            },
          ],
        };
      }
    },
  );
}
