import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as fs from "fs-extra";
import { readdir, readFile } from "fs/promises";
import * as path from "path";
import {
  decodeGitHubContent,
  fetchGitHubContent,
  findFilesRecursively,
  loadRepoData,
  RepoConfig,
} from "./shared.js";

const DOCS_BASE_PATH = path.join(process.cwd(), "docsdata");

// Helper function to get all available libraries (both local and from repodata)
async function getAvailableLibraries(): Promise<string[]> {
  const localLibraries = await getLocalLibraries();
  const repoData = await loadRepoData();
  const repoLibraries = Object.keys(repoData);

  // Combine and deduplicate
  const allLibraries = [...new Set([...localLibraries, ...repoLibraries])];
  return allLibraries.sort();
}

// Helper function to get local libraries only
async function getLocalLibraries(): Promise<string[]> {
  try {
    if (!await fs.pathExists(DOCS_BASE_PATH)) {
      console.error(`Debug: DOCS_BASE_PATH does not exist: ${DOCS_BASE_PATH}`);
      return [];
    }

    const entries = await readdir(DOCS_BASE_PATH, { withFileTypes: true });
    console.error(
      `Debug: Found ${entries.length} entries in ${DOCS_BASE_PATH}`,
    );

    const directories = entries.filter((entry) => entry.isDirectory());
    console.error(
      `Debug: Found ${directories.length} directories: ${
        directories.map((d) => d.name).join(", ")
      }`,
    );

    return directories.map((entry) => entry.name);
  } catch (error) {
    console.error(
      `Debug: Error reading DOCS_BASE_PATH: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
    return [];
  }
}

// Helper function to find documentation files from GitHub
async function findGitHubDocFiles(
  repo: string,
  paths: string[],
  branch: string,
): Promise<string[]> {
  const files: string[] = [];

  for (const basePath of paths) {
    try {
      const foundFiles = await findFilesRecursively(
        repo,
        basePath,
        branch,
        (filename) => filename.match(/\.(md|mdx|txt)$/i) !== null,
        3,
      );
      files.push(...foundFiles);
    } catch (error) {
      console.error(`Error finding files in ${repo}:${basePath} - ${error}`);
    }
  }

  return files;
}

// Helper function to get documentation files for a library (local or GitHub)
async function getLibraryDocFiles(library: string): Promise<{
  isLocal: boolean;
  files: string[];
  repoConfig?: RepoConfig;
}> {
  const repoData = await loadRepoData();
  const repoConfig = repoData[library];

  // Check if library has GitHub docs configuration
  if (repoConfig?.docs) {
    const files = await findGitHubDocFiles(
      repoConfig.docs.repo,
      repoConfig.docs.paths,
      repoConfig.docs.branch,
    );
    return { isLocal: false, files, repoConfig };
  }

  // Fall back to local documentation
  const libraryPath = path.join(DOCS_BASE_PATH, library);
  if (await fs.pathExists(libraryPath)) {
    const files = await findDocFiles(libraryPath);
    return { isLocal: true, files };
  }

  return { isLocal: true, files: [] };
}

// Helper function to get documentation content (local or GitHub)
async function getDocumentationContent(
  library: string,
  filePath: string,
): Promise<string> {
  const repoData = await loadRepoData();
  const repoConfig = repoData[library];

  // Try GitHub docs first if configured
  if (repoConfig?.docs) {
    try {
      const fileContent = await fetchGitHubContent(
        repoConfig.docs.repo,
        filePath,
        repoConfig.docs.branch,
      );

      if (fileContent.content) {
        return decodeGitHubContent(fileContent.content);
      }
    } catch (error) {
      console.error(`Error fetching GitHub doc ${filePath}: ${error}`);
    }
  }

  // Fall back to local file
  const localPath = path.join(DOCS_BASE_PATH, library, filePath);
  try {
    return await readFile(localPath, "utf-8");
  } catch (error) {
    throw new Error(`Documentation file not found: ${filePath}`);
  }
}
async function findDocFiles(
  libraryPath: string,
  currentPath: string = "",
): Promise<string[]> {
  const fullPath = path.join(libraryPath, currentPath);
  const files: string[] = [];

  try {
    const entries = await readdir(fullPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        const subFiles = await findDocFiles(libraryPath, entryPath);
        files.push(...subFiles);
      } else if (entry.name.match(/\.(md|mdx|txt)$/i)) {
        files.push(entryPath);
      }
    }
  } catch (error) {
    // Directory doesn't exist or can't be read
  }

  return files;
}

// Helper function to search for documentation files by keyword (local or GitHub)
async function searchDocumentation(
  library: string,
  query: string,
): Promise<
  Array<
    {
      file: string;
      matches: string[];
      sections?: Array<{ title: string; anchor: string }>;
    }
  >
> {
  const { isLocal, files, repoConfig } = await getLibraryDocFiles(library);
  const results: Array<
    {
      file: string;
      matches: string[];
      sections?: Array<{ title: string; anchor: string }>;
    }
  > = [];

  for (const docFile of files) {
    try {
      const content = await getDocumentationContent(library, docFile);
      const lines = content.split("\n");
      const matches: string[] = [];
      const matchingSections: Array<{ title: string; anchor: string }> = [];

      // Check for section headers that match the query
      const headers = findSectionHeaders(content);
      const queryLower = query.toLowerCase();

      for (const header of headers) {
        if (
          header.title.toLowerCase().includes(queryLower) ||
          header.anchor.includes(queryLower)
        ) {
          matchingSections.push({ title: header.title, anchor: header.anchor });
        }
      }

      lines.forEach((line, index) => {
        if (line.toLowerCase().includes(query.toLowerCase())) {
          const start = Math.max(0, index - 1);
          const end = Math.min(lines.length - 1, index + 1);
          const context = lines.slice(start, end + 1).join("\n");
          matches.push(`Line ${index + 1}: ${context}`);
        }
      });

      if (matches.length > 0 || matchingSections.length > 0) {
        const result: any = { file: docFile, matches };
        if (matchingSections.length > 0) {
          result.sections = matchingSections;
        }
        results.push(result);
      }
    } catch (error) {
      // Skip files that can't be read
      console.error(`Error searching ${docFile}: ${error}`);
    }
  }

  return results;
}

// Helper function to extract sections from markdown content
function extractMarkdownSections(content: string): Record<string, string> {
  const lines = content.split("\n");
  const sections: Record<string, string> = {};
  let currentSection = "";
  let currentSectionName = "";
  let sectionContent: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headerMatch) {
      // Save previous section if it exists
      if (currentSectionName && sectionContent.length > 0) {
        sections[currentSectionName.toLowerCase()] = sectionContent.join("\n");
      }

      // Start new section
      const headerLevel = headerMatch[1].length;
      currentSectionName = headerMatch[2].trim();
      sectionContent = [line]; // Include the header in the section
    } else {
      sectionContent.push(line);
    }
  }

  // Save the last section
  if (currentSectionName && sectionContent.length > 0) {
    sections[currentSectionName.toLowerCase()] = sectionContent.join("\n");
  }

  return sections;
}

// Helper function to find section headers in content
function findSectionHeaders(
  content: string,
): Array<{ level: number; title: string; anchor: string }> {
  const lines = content.split("\n");
  const headers: Array<{ level: number; title: string; anchor: string }> = [];

  for (const line of lines) {
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const title = headerMatch[2].trim();
      const anchor = title.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(
        /\s+/g,
        "-",
      );
      headers.push({ level, title, anchor });
    }
  }

  return headers;
}

export function registerDocumentationTools(server: McpServer) {
  // Tool: List available libraries
  server.tool(
    "list-libraries",
    "Get a list of all available documentation libraries",
    {},
    async () => {
      const libraries = await getAvailableLibraries();
      const localLibraries = await getLocalLibraries();
      const repoData = await loadRepoData();

      let result = `Available documentation libraries:\n\n`;

      for (const lib of libraries) {
        const isLocal = localLibraries.includes(lib);
        const hasGitHubDocs = repoData[lib]?.docs;
        const source = [];

        if (isLocal) source.push("local");
        if (hasGitHubDocs) source.push("GitHub");

        result += `• ${lib} (${source.join(", ")})\n`;
      }

      return {
        content: [
          {
            type: "text",
            text: libraries.length > 0
              ? result
              : "No documentation libraries found.",
          },
        ],
      };
    },
  );

  // Tool: List documentation files for a library
  server.tool(
    "list-docs",
    "Get a list of all documentation files for a specific library",
    {
      library: z.string().describe("The library name (e.g., 'drei', 'fiber')"),
    },
    async ({ library }) => {
      const { isLocal, files, repoConfig } = await getLibraryDocFiles(library);

      if (files.length === 0) {
        const availableLibraries = await getAvailableLibraries();
        return {
          content: [
            {
              type: "text",
              text:
                `No documentation found for '${library}'. Available libraries: ${
                  availableLibraries.join(", ")
                }`,
            },
          ],
        };
      }

      const source = isLocal
        ? "local docsdata folder"
        : `GitHub (${repoConfig?.docs?.repo})`;

      return {
        content: [
          {
            type: "text",
            text: `Documentation files for ${library} (from ${source}):\n\n${
              files.map((file) => `• ${file}`).join("\n")
            }`,
          },
        ],
      };
    },
  );

  // Tool: Get specific documentation file content
  server.tool(
    "get-doc",
    "Get the content of a specific documentation file. Supports sections with # (e.g., 'file.md#section')",
    {
      library: z.string().describe("The library name"),
      file: z.string().describe(
        "The relative path to the documentation file, optionally with #section",
      ),
    },
    async ({ library, file }) => {
      // Parse file and section
      const [filePath, sectionAnchor] = file.includes("#")
        ? file.split("#")
        : [file, null];

      try {
        const content = await getDocumentationContent(library, filePath);

        if (sectionAnchor) {
          // Extract specific section
          const sections = extractMarkdownSections(content);
          const sectionContent = sections[sectionAnchor.toLowerCase()];

          if (sectionContent) {
            return {
              content: [
                {
                  type: "text",
                  text:
                    `# ${library}/${filePath}#${sectionAnchor}\n\n${sectionContent}`,
                },
              ],
            };
          } else {
            // List available sections if the requested one wasn't found
            const headers = findSectionHeaders(content);
            const availableSections = headers.map((h) =>
              `#${h.anchor} (${h.title})`
            ).join("\n• ");

            return {
              content: [
                {
                  type: "text",
                  text:
                    `Section '#${sectionAnchor}' not found in ${library}/${filePath}.\n\nAvailable sections:\n• ${availableSections}`,
                },
              ],
            };
          }
        } else {
          // Return full file content
          return {
            content: [
              {
                type: "text",
                text: `# ${library}/${file}\n\n${content}`,
              },
            ],
          };
        }
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error reading file '${file}' from library '${library}': ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
            },
          ],
        };
      }
    },
  );

  // Tool: Search documentation
  server.tool(
    "search-docs",
    "Search for specific content within a library's documentation",
    {
      library: z.string().describe("The library name to search in"),
      query: z.string().describe("The search query/keyword"),
    },
    async ({ library, query }) => {
      const { files } = await getLibraryDocFiles(library);

      if (files.length === 0) {
        const availableLibraries = await getAvailableLibraries();
        return {
          content: [
            {
              type: "text",
              text:
                `No documentation found for '${library}'. Available libraries: ${
                  availableLibraries.join(", ")
                }`,
            },
          ],
        };
      }

      const results = await searchDocumentation(library, query);

      if (results.length === 0) {
        return {
          content: [
            {
              type: "text",
              text:
                `No matches found for "${query}" in ${library} documentation.`,
            },
          ],
        };
      }

      const formattedResults = results.map((result) => {
        let output = `**${result.file}:**\n`;

        // Add section suggestions if any
        if (result.sections && result.sections.length > 0) {
          output +=
            `\n🎯 **Found matching sections - try these specific queries:**\n`;
          result.sections.forEach((section) => {
            output +=
              `• \`get-doc\` with \`${result.file}#${section.anchor}\` for "${section.title}"\n`;
          });
          output += "\n";
        }

        // Add text matches
        if (result.matches.length > 0) {
          output += `**Text matches:**\n${
            result.matches.map((match) => `  ${match}`).join("\n\n")
          }`;
        }

        return output;
      }).join("\n\n---\n\n");

      return {
        content: [
          {
            type: "text",
            text:
              `Search results for "${query}" in ${library}:\n\n${formattedResults}`,
          },
        ],
      };
    },
  );

  // Tool: Get documentation overview
  server.tool(
    "get-overview",
    "Get an overview of a library's documentation structure",
    {
      library: z.string().describe("The library name"),
    },
    async ({ library }) => {
      const { isLocal, files, repoConfig } = await getLibraryDocFiles(library);

      if (files.length === 0) {
        const availableLibraries = await getAvailableLibraries();
        return {
          content: [
            {
              type: "text",
              text:
                `No documentation found for '${library}'. Available libraries: ${
                  availableLibraries.join(", ")
                }`,
            },
          ],
        };
      }

      // Group files by directory
      const structure: Record<string, string[]> = {};

      files.forEach((file) => {
        const dir = path.dirname(file);
        const dirKey = dir === "." ? "root" : dir;

        if (!structure[dirKey]) {
          structure[dirKey] = [];
        }
        structure[dirKey].push(path.basename(file));
      });

      const source = isLocal
        ? "local docsdata folder"
        : `GitHub (${repoConfig?.docs?.repo})`;

      let overview = `# ${library} Documentation Overview\n\n`;
      overview += `**Source:** ${source}\n`;
      overview += `**Total files:** ${files.length}\n\n`;

      Object.entries(structure).forEach(([dir, files]) => {
        overview += `## ${dir}\n`;
        files.forEach((file) => {
          overview += `• ${file}\n`;
        });
        overview += "\n";
      });

      return {
        content: [
          {
            type: "text",
            text: overview,
          },
        ],
      };
    },
  );

  // NEW Tool: Get README content from any repository
  server.tool(
    "get-readme",
    "Get the README content from any GitHub repository",
    {
      repo: z.string().describe(
        "GitHub repository in 'owner/repo' format or full URL",
      ),
      branch: z.string().optional().describe(
        "Branch name (optional, defaults to main/master)",
      ),
    },
    async ({ repo, branch }) => {
      try {
        // Normalize repo format
        let repoPath = repo;
        if (repo.includes("github.com")) {
          const match = repo.match(/github\.com\/([^\/]+\/[^\/]+)/);
          if (match) {
            repoPath = match[1];
          }
        }

        // Try different README file names and branches
        const readmeFiles = ["README.md", "readme.md", "README.txt", "README"];
        const branches = branch ? [branch] : ["main", "master"];

        let content = "";
        let foundFile = "";
        let foundBranch = "";

        for (const testBranch of branches) {
          for (const readmeFile of readmeFiles) {
            try {
              const fileContent = await fetchGitHubContent(
                repoPath,
                readmeFile,
                testBranch,
              );
              if (fileContent.content) {
                content = decodeGitHubContent(fileContent.content);
                foundFile = readmeFile;
                foundBranch = testBranch;
                break;
              }
            } catch (error) {
              // Continue trying other files/branches
            }
          }
          if (content) break;
        }

        if (!content) {
          return {
            content: [
              {
                type: "text",
                text:
                  `No README file found in repository '${repoPath}'. Tried: ${
                    readmeFiles.join(", ")
                  } on branches: ${branches.join(", ")}`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text:
                `# README: ${repoPath} (${foundFile} from ${foundBranch})\n\n${content}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error fetching README from '${repo}': ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
            },
          ],
        };
      }
    },
  );
}

export { getAvailableLibraries };
