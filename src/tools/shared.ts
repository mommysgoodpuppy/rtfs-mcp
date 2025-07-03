import { readFile } from "fs/promises";
import * as path from "path";

// Repository configuration interface
export interface RepoConfig {
  name: string;
  description: string;
  github: string;
  repo: string; // owner/repo format
  mainBranch: string;
  srcPaths: string[];
  examplePaths: string[];
  docs?: {
    repo: string; // Can be different from main repo (e.g., denoland/docs)
    branch: string;
    paths: string[]; // Paths within the docs repo
  };
}

// Configuration interface
export interface Config {
  github: {
    apiKey: string;
    rateLimit: {
      unauthenticated: number;
      authenticated: number;
    };
  };
  cache: {
    enabled: boolean;
    ttlMinutes: number;
  };
}

const CONFIG_PATH = path.join(process.cwd(), "config.json");
const REPO_DATA_PATH = path.join(process.cwd(), "repodata.json");

// Helper function to load configuration
export async function loadConfig(): Promise<Config> {
  try {
    const content = await readFile(CONFIG_PATH, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    console.error(
      `Debug: Error loading config.json: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
    // Return default config
    return {
      github: {
        apiKey: "",
        rateLimit: {
          unauthenticated: 60,
          authenticated: 5000,
        },
      },
      cache: {
        enabled: false,
        ttlMinutes: 10,
      },
    };
  }
}

// Helper function to load repository configuration
export async function loadRepoData(): Promise<Record<string, RepoConfig>> {
  try {
    const content = await readFile(REPO_DATA_PATH, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    console.error(
      `Debug: Error loading repodata.json: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
    return {};
  }
}

// Helper function to fetch content from GitHub API
export async function fetchGitHubContent(
  repo: string,
  path: string = "",
  branch: string = "main",
): Promise<any> {
  const config = await loadConfig();
  const url =
    `https://api.github.com/repos/${repo}/contents/${path}?ref=${branch}`;

  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "MCP-Docs-Server/1.0.0",
  };

  // Add authorization header if API key is configured
  if (config.github.apiKey) {
    headers["Authorization"] = `token ${config.github.apiKey}`;
  }

  try {
    const response = await fetch(url, { headers });

    if (!response.ok) {
      if (response.status === 403) {
        const remaining = response.headers.get("X-RateLimit-Remaining");
        const resetTime = response.headers.get("X-RateLimit-Reset");
        const resetDate = resetTime
          ? new Date(parseInt(resetTime) * 1000).toLocaleTimeString()
          : "unknown";

        throw new Error(
          `GitHub API rate limit exceeded. Remaining: ${remaining}. Resets at: ${resetDate}. ${
            config.github.apiKey
              ? "Authenticated"
              : "Consider adding a GitHub API key to config.json for higher rate limits"
          }`,
        );
      }
      throw new Error(
        `GitHub API error: ${response.status} ${response.statusText}`,
      );
    }

    return await response.json();
  } catch (error) {
    throw new Error(
      `Failed to fetch from GitHub: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
}

// Helper function to decode base64 content from GitHub API
export function decodeGitHubContent(content: string): string {
  return Buffer.from(content, "base64").toString("utf-8");
}

// Helper function to check if a file is a source file
export function isSourceFile(filename: string): boolean {
  const sourceExtensions = [
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".py",
    ".rs",
    ".go",
    ".java",
    ".cpp",
    ".c",
    ".h",
    ".vue",
    ".svelte",
    ".astro",
    ".md",
    ".mdx",
    ".json",
  ];
  return sourceExtensions.some((ext) => filename.toLowerCase().endsWith(ext));
}

// Helper function to check if a file is an example file
export function isExampleFile(filename: string, filePath: string): boolean {
  const exampleExtensions = [
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".vue",
    ".svelte",
    ".astro",
    ".md",
    ".mdx",
  ];

  const hasExampleExtension = exampleExtensions.some((ext) =>
    filename.toLowerCase().endsWith(ext)
  );

  // Check if the file path indicates it's an example
  const pathLower = filePath.toLowerCase();
  const isInExampleDir = pathLower.includes("example") ||
    pathLower.includes("demo") ||
    pathLower.includes("sandbox") ||
    pathLower.includes("test");

  return hasExampleExtension && isInExampleDir;
}

// Helper function to get file extension for syntax highlighting
export function getFileExtension(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const extensionMap: Record<string, string> = {
    ".ts": "typescript",
    ".tsx": "tsx",
    ".js": "javascript",
    ".jsx": "jsx",
    ".py": "python",
    ".rs": "rust",
    ".go": "go",
    ".java": "java",
    ".cpp": "cpp",
    ".c": "c",
    ".h": "c",
    ".vue": "vue",
    ".svelte": "svelte",
    ".astro": "astro",
    ".json": "json",
    ".md": "markdown",
    ".mdx": "mdx",
  };
  return extensionMap[ext] || "text";
}

// Helper function to find files recursively
export async function findFilesRecursively(
  repo: string,
  path: string,
  branch: string,
  fileFilter: (filename: string, filePath: string) => boolean,
  maxDepth: number = 3,
): Promise<string[]> {
  if (maxDepth <= 0) return [];

  try {
    const contents = await fetchGitHubContent(repo, path, branch);
    if (!Array.isArray(contents)) return [];

    const files: string[] = [];

    for (const item of contents) {
      const itemPath = path ? `${path}/${item.name}` : item.name;

      if (item.type === "file" && fileFilter(item.name, itemPath)) {
        files.push(itemPath);
      } else if (item.type === "dir" && maxDepth > 1) {
        const subFiles = await findFilesRecursively(
          repo,
          itemPath,
          branch,
          fileFilter,
          maxDepth - 1,
        );
        files.push(...subFiles);
      }
    }

    return files;
  } catch (error) {
    return [];
  }
}
