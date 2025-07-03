import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  decodeGitHubContent,
  fetchGitHubContent,
  findFilesRecursively,
  getFileExtension,
  isSourceFile,
  loadRepoData,
} from "./shared.js";

export function registerRepositoryTools(server: McpServer) {
  // Tool: List available repositories
  server.tool(
    "list-repositories",
    "Get a list of all available source code repositories",
    {},
    async () => {
      const repoData = await loadRepoData();
      const repos = Object.entries(repoData);

      if (repos.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No repositories configured in repodata.json",
            },
          ],
        };
      }

      const repoList = repos.map(([key, config]) =>
        `• **${key}** (${config.name})\n  ${config.description}\n  📂 ${config.github}\n  🌿 Branch: ${config.mainBranch}\n  📁 Source: ${
          config.srcPaths.join(", ")
        }\n  📝 Examples: ${config.examplePaths.join(", ")}`
      ).join("\n\n");

      return {
        content: [
          {
            type: "text",
            text: `Available source code repositories:\n\n${repoList}`,
          },
        ],
      };
    },
  );

  // Tool: Browse repository structure
  server.tool(
    "browse-repo",
    "Browse the file structure of a source code repository",
    {
      library: z.string().describe("The library name (e.g., 'uikit', 'drei')"),
      path: z.string().optional().describe(
        "Path within the repository (optional, defaults to root)",
      ),
    },
    async ({ library, path: requestedPath = "" }) => {
      const repoData = await loadRepoData();
      const config = repoData[library];

      if (!config) {
        const availableLibs = Object.keys(repoData).join(", ");
        return {
          content: [
            {
              type: "text",
              text:
                `Repository '${library}' not found. Available repositories: ${availableLibs}`,
            },
          ],
        };
      }

      try {
        const contents = await fetchGitHubContent(
          config.repo,
          requestedPath,
          config.mainBranch,
        );

        if (!Array.isArray(contents)) {
          return {
            content: [
              {
                type: "text",
                text:
                  `Path '${requestedPath}' is not a directory or does not exist in ${library}`,
              },
            ],
          };
        }

        const items = contents.map((item: any) => {
          const icon = item.type === "dir" ? "📁" : "📄";
          return `${icon} ${item.name}${item.type === "dir" ? "/" : ""}`;
        });

        const pathDisplay = requestedPath ? `/${requestedPath}` : "/";

        return {
          content: [
            {
              type: "text",
              text:
                `# ${config.name} Repository Structure\n\n**Path:** ${pathDisplay}\n**Repository:** ${config.github}\n**Branch:** ${config.mainBranch}\n\n## Contents:\n\n${
                  items.join("\n")
                }`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error browsing repository: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
            },
          ],
        };
      }
    },
  );

  // Tool: Read source file
  server.tool(
    "read-source-file",
    "Read the content of a specific source file from a repository",
    {
      library: z.string().describe("The library name (e.g., 'uikit', 'drei')"),
      filePath: z.string().describe("Path to the file within the repository"),
    },
    async ({ library, filePath }) => {
      const repoData = await loadRepoData();
      const config = repoData[library];

      if (!config) {
        const availableLibs = Object.keys(repoData).join(", ");
        return {
          content: [
            {
              type: "text",
              text:
                `Repository '${library}' not found. Available repositories: ${availableLibs}`,
            },
          ],
        };
      }

      try {
        const content = await fetchGitHubContent(
          config.repo,
          filePath,
          config.mainBranch,
        );

        if (Array.isArray(content)) {
          return {
            content: [
              {
                type: "text",
                text:
                  `Path '${filePath}' is a directory, not a file. Use browse-repo to explore directories.`,
              },
            ],
          };
        }

        if (content.type !== "file") {
          return {
            content: [
              {
                type: "text",
                text: `'${filePath}' is not a regular file.`,
              },
            ],
          };
        }

        if (content.encoding !== "base64") {
          return {
            content: [
              {
                type: "text",
                text:
                  `Cannot read file '${filePath}': unsupported encoding '${content.encoding}'`,
              },
            ],
          };
        }

        const fileContent = decodeGitHubContent(content.content);
        const fileSize = content.size;
        const fileSizeKB = (fileSize / 1024).toFixed(1);

        return {
          content: [
            {
              type: "text",
              text:
                `# ${config.name} - ${filePath}\n\n**Repository:** ${config.github}\n**Branch:** ${config.mainBranch}\n**Size:** ${fileSizeKB} KB\n**GitHub URL:** ${config.github}/blob/${config.mainBranch}/${filePath}\n\n\`\`\`${
                  getFileExtension(filePath)
                }\n${fileContent}\n\`\`\``,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error reading file: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
            },
          ],
        };
      }
    },
  );

  // Tool: Search source code
  server.tool(
    "search-source",
    "Search for specific patterns in source code across a repository",
    {
      library: z.string().describe("The library name to search in"),
      query: z.string().describe("The search pattern/keyword"),
      paths: z.array(z.string()).optional().describe(
        "Specific paths to search within (optional, uses srcPaths from config by default)",
      ),
    },
    async ({ library, query, paths }) => {
      const repoData = await loadRepoData();
      const config = repoData[library];

      if (!config) {
        const availableLibs = Object.keys(repoData).join(", ");
        return {
          content: [
            {
              type: "text",
              text:
                `Repository '${library}' not found. Available repositories: ${availableLibs}`,
            },
          ],
        };
      }

      const searchPaths = paths || config.srcPaths;
      const results: Array<{ file: string; matches: string[] }> = [];

      try {
        // This is a simplified search - in practice, you might want to implement
        // more sophisticated search using GitHub's search API or similar
        for (const searchPath of searchPaths) {
          const files = await findFilesRecursively(
            config.repo,
            searchPath,
            config.mainBranch,
            isSourceFile,
          );

          for (const file of files.slice(0, 20)) { // Limit to prevent API rate limits
            try {
              const content = await fetchGitHubContent(
                config.repo,
                file,
                config.mainBranch,
              );
              if (content.type === "file" && content.encoding === "base64") {
                const fileContent = decodeGitHubContent(content.content);
                const lines = fileContent.split("\n");
                const matches: string[] = [];

                lines.forEach((line, index) => {
                  if (line.toLowerCase().includes(query.toLowerCase())) {
                    const start = Math.max(0, index - 1);
                    const end = Math.min(lines.length - 1, index + 1);
                    const context = lines.slice(start, end + 1).join("\n");
                    matches.push(`Line ${index + 1}: ${context}`);
                  }
                });

                if (matches.length > 0) {
                  results.push({ file, matches: matches.slice(0, 5) }); // Limit matches per file
                }
              }
            } catch (error) {
              // Skip files that can't be read
            }
          }
        }

        if (results.length === 0) {
          return {
            content: [
              {
                type: "text",
                text:
                  `No matches found for "${query}" in ${library} source code.`,
              },
            ],
          };
        }

        const formattedResults = results.map((result) => {
          const matches = result.matches.map((match) => `  ${match}`).join(
            "\n\n",
          );
          return `**${result.file}:**\n${matches}`;
        }).join("\n\n---\n\n");

        return {
          content: [
            {
              type: "text",
              text:
                `Source code search results for "${query}" in ${library}:\n\n${formattedResults}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error searching source code: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
            },
          ],
        };
      }
    },
  );
}
