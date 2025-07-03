import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as fs from "fs-extra";
import { readdir, readFile } from "fs/promises";
import * as path from "path";
import {
  decodeGitHubContent,
  fetchGitHubContent,
  findFilesRecursively,
  getFileExtension,
  isExampleFile,
  loadRepoData,
} from "./shared.js";

const DOCS_BASE_PATH = path.join(process.cwd(), "docsdata");

// Helper function to find example files in documentation
async function findDocExamples(
  libraryPath: string,
  query: string,
): Promise<Array<{ file: string; matches: string[] }>> {
  const docFiles: string[] = [];

  // Recursively find all doc files
  const findFiles = async (currentPath: string = ""): Promise<void> => {
    const fullPath = path.join(libraryPath, currentPath);
    try {
      const entries = await readdir(fullPath, { withFileTypes: true });
      for (const entry of entries) {
        const entryPath = path.join(currentPath, entry.name);
        if (entry.isDirectory()) {
          await findFiles(entryPath);
        } else if (entry.name.match(/\.(md|mdx)$/i)) {
          docFiles.push(entryPath);
        }
      }
    } catch (error) {
      // Skip directories that can't be read
    }
  };

  await findFiles();

  const results: Array<{ file: string; matches: string[] }> = [];

  for (const docFile of docFiles) {
    try {
      const filePath = path.join(libraryPath, docFile);
      const content = await readFile(filePath, "utf-8");

      // Extract code blocks
      const codeBlocks = extractCodeBlocks(content);
      const matches: string[] = [];

      codeBlocks.forEach((block, index) => {
        if (
          block.code.toLowerCase().includes(query.toLowerCase()) ||
          (block.language &&
            block.language.toLowerCase().includes(query.toLowerCase()))
        ) {
          matches.push(
            `Code block ${index + 1} (${
              block.language || "text"
            }):\n${block.code}`,
          );
        }
      });

      if (matches.length > 0) {
        results.push({ file: docFile, matches });
      }
    } catch (error) {
      // Skip files that can't be read
    }
  }

  return results;
}

// Helper function to extract code blocks from markdown
function extractCodeBlocks(
  content: string,
): Array<{ language: string | null; code: string }> {
  const codeBlocks: Array<{ language: string | null; code: string }> = [];
  const lines = content.split("\n");
  let inCodeBlock = false;
  let currentLanguage: string | null = null;
  let currentCode: string[] = [];

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        // End of code block
        codeBlocks.push({
          language: currentLanguage,
          code: currentCode.join("\n"),
        });
        currentCode = [];
        currentLanguage = null;
        inCodeBlock = false;
      } else {
        // Start of code block
        currentLanguage = line.slice(3).trim() || null;
        inCodeBlock = true;
      }
    } else if (inCodeBlock) {
      currentCode.push(line);
    }
  }

  return codeBlocks;
}

// Helper function to search repository examples
async function searchRepoExamples(
  repo: string,
  branch: string,
  examplePaths: string[],
  query: string,
): Promise<Array<{ file: string; matches: string[] }>> {
  const results: Array<{ file: string; matches: string[] }> = [];

  for (const examplePath of examplePaths) {
    try {
      const files = await findFilesRecursively(
        repo,
        examplePath,
        branch,
        (filename, filePath) => isExampleFile(filename, filePath),
        2, // Limit depth for examples
      );

      for (const file of files.slice(0, 15)) { // Limit files to prevent rate limits
        try {
          const content = await fetchGitHubContent(repo, file, branch);
          if (content.type === "file" && content.encoding === "base64") {
            const fileContent = decodeGitHubContent(content.content);

            // Search for query in the file content
            if (fileContent.toLowerCase().includes(query.toLowerCase())) {
              const lines = fileContent.split("\n");
              const matches: string[] = [];

              lines.forEach((line, index) => {
                if (line.toLowerCase().includes(query.toLowerCase())) {
                  const start = Math.max(0, index - 2);
                  const end = Math.min(lines.length - 1, index + 2);
                  const context = lines.slice(start, end + 1).join("\n");
                  matches.push(`Line ${index + 1}:\n${context}`);
                }
              });

              if (matches.length > 0) {
                results.push({ file, matches: matches.slice(0, 3) }); // Limit matches per file
              }
            }
          }
        } catch (error) {
          // Skip files that can't be read
        }
      }
    } catch (error) {
      // Skip paths that can't be accessed
    }
  }

  return results;
}

export function registerExampleTools(server: McpServer) {
  // Tool: Search examples across documentation and repositories
  server.tool(
    "search-examples",
    "Search for example code snippets in both documentation and repository example directories",
    {
      library: z.string().describe("The library name to search in"),
      query: z.string().describe(
        "The search query/keyword to find in example code",
      ),
    },
    async ({ library, query }) => {
      const repoData = await loadRepoData();
      const config = repoData[library];

      if (!config) {
        const availableLibs = Object.keys(repoData).join(", ");
        return {
          content: [
            {
              type: "text",
              text:
                `Library '${library}' not found. Available libraries: ${availableLibs}`,
            },
          ],
        };
      }

      const docResults: Array<{ file: string; matches: string[] }> = [];
      const repoResults: Array<{ file: string; matches: string[] }> = [];

      // Search documentation examples
      const libraryPath = path.join(DOCS_BASE_PATH, library);
      if (await fs.pathExists(libraryPath)) {
        const docExamples = await findDocExamples(libraryPath, query);
        docResults.push(...docExamples);
      }

      // Search repository examples
      try {
        const repoExamples = await searchRepoExamples(
          config.repo,
          config.mainBranch,
          config.examplePaths,
          query,
        );
        repoResults.push(...repoExamples);
      } catch (error) {
        console.error(
          `Error searching repository examples: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        );
      }

      if (docResults.length === 0 && repoResults.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No example code found for "${query}" in ${library}.`,
            },
          ],
        };
      }

      let result =
        `# Example Code Search Results for "${query}" in ${library}\n\n`;

      if (docResults.length > 0) {
        result += `## 📚 Documentation Examples\n\n`;
        docResults.forEach((docResult, index) => {
          result += `### ${index + 1}. ${docResult.file}\n\n`;
          docResult.matches.forEach((match) => {
            result += `${match}\n\n---\n\n`;
          });
        });
      }

      if (repoResults.length > 0) {
        result += `## 🔗 Repository Examples\n\n`;
        repoResults.forEach((repoResult, index) => {
          result += `### ${index + 1}. ${repoResult.file}\n\n`;
          result +=
            `**GitHub:** ${config.github}/blob/${config.mainBranch}/${repoResult.file}\n\n`;
          repoResult.matches.forEach((match) => {
            result += `\`\`\`${
              getFileExtension(repoResult.file)
            }\n${match}\n\`\`\`\n\n---\n\n`;
          });
        });
      }

      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };
    },
  );

  // Tool: Get specific example file
  server.tool(
    "get-example",
    "Get a specific example file from the repository",
    {
      library: z.string().describe("The library name"),
      filePath: z.string().describe(
        "Path to the example file within the repository",
      ),
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
                `# ${config.name} Example - ${filePath}\n\n**Repository:** ${config.github}\n**Branch:** ${config.mainBranch}\n**Size:** ${fileSizeKB} KB\n**GitHub URL:** ${config.github}/blob/${config.mainBranch}/${filePath}\n\n\`\`\`${
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
              text: `Error reading example file: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
            },
          ],
        };
      }
    },
  );

  // Tool: List example directories
  server.tool(
    "list-examples",
    "List available example directories for a library",
    {
      library: z.string().describe("The library name"),
    },
    async ({ library }) => {
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

      let result = `# ${config.name} Example Directories\n\n`;
      result += `**Repository:** ${config.github}\n\n`;

      for (const examplePath of config.examplePaths) {
        try {
          const contents = await fetchGitHubContent(
            config.repo,
            examplePath,
            config.mainBranch,
          );

          if (Array.isArray(contents)) {
            result += `## ${examplePath}/\n\n`;
            const items = contents
              .filter((item: any) =>
                item.type === "dir" ||
                isExampleFile(item.name, `${examplePath}/${item.name}`)
              )
              .map((item: any) => {
                const icon = item.type === "dir" ? "📁" : "📄";
                return `${icon} ${item.name}${item.type === "dir" ? "/" : ""}`;
              });

            if (items.length > 0) {
              result += `${items.join("\n")}\n\n`;
            } else {
              result += `No example files found.\n\n`;
            }
          }
        } catch (error) {
          result += `## ${examplePath}/\n\nError accessing directory: ${
            error instanceof Error ? error.message : "Unknown error"
          }\n\n`;
        }
      }

      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };
    },
  );
}
