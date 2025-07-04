# Read the F***ing Source MCP Documentation Server

A Model Context Protocol (MCP) server that provides comprehensive documentation
and source code exploration tools for different libraries and repositories.

## Features

- **Multi-source documentation**: Support for both local files and GitHub-hosted
  docs
- **Guided repository management**: Smart analysis and easy addition of new
  repositories
- **Powerful search capabilities**: Search across documentation, source code,
  and examples
- **Source code exploration**: Browse and search GitHub repositories directly
- **Example code discovery**: Find and analyze example code from multiple
  sources
- **Section-aware navigation**: Extract and fetch specific markdown sections
  with anchor support
- **Flexible structure**: Support for monorepos, nested folders, and multiple
  documentation sources
- **Real-time GitHub integration**: Live repository analysis with branch
  detection
- **Multiple formats**: Support for `.md`, `.mdx`, and `.txt` files
- **Easy integration**: Works with Claude Desktop and other MCP clients

## Quick Start

1. **Clone and install:**
   ```bash
   git clone <repository-url>
   cd rtfs-mcp
   npm install
   ```

2. **Configure GitHub token (recommended):**
   ```bash
   cp config.template.json config.json
   # Edit config.json with your GitHub token
   ```

3. **Build and start:**
   ```bash
   npm run build
   npm start
   ```

4. **Add a repository:** Use the `analyze-repository` tool followed by
   `add-repository` for instant access to any GitHub repository.

## Configuration

### GitHub API Token (Recommended)

To avoid GitHub API rate limits, configure a GitHub Personal Access Token:

1. Create a Personal Access Token at https://github.com/settings/tokens
2. Copy `config.template.json` to `config.json`
3. Add your token:

```json
{
  "github": {
    "apiKey": "your_github_token_here",
    "rateLimit": {
      "unauthenticated": 60,
      "authenticated": 5000
    }
  },
  "cache": {
    "enabled": true,
    "ttlMinutes": 10
  }
}
```

**Rate Limits:**

- Without token: 60 requests/hour
- With token: 5,000 requests/hour

### Repository Configuration

Repositories are configured in `repodata.json`. Use `repodata.template.json` as
a reference for the structure.

Each repository configuration supports:

- **Source paths**: Where the main source code lives
- **Example paths**: Where example/demo code is located
- **Documentation paths**: GitHub-hosted documentation (optional)
- **Separate docs repo**: For projects with docs in different repositories

Example repository configuration:

```json
{
  "zod": {
    "name": "Zod",
    "description": "TypeScript-first schema validation library",
    "github": "https://github.com/colinhacks/zod",
    "repo": "colinhacks/zod",
    "mainBranch": "main",
    "srcPaths": ["packages/zod/src"],
    "examplePaths": ["packages/docs/examples"],
    "docs": {
      "repo": "colinhacks/zod",
      "branch": "main",
      "paths": ["packages/docs"]
    }
  }
}
```

## Installation

```bash
# Install dependencies
npm install

# Build the project
npm run build
```

## Development

```bash
# Watch mode for development
npm run dev

# Build for production
npm run build

# Start the server
npm start
```

## Documentation Structure

### Local Documentation

```
docsdata/
├── drei/
│   ├── misc/
│   │   └── detect-gpu-use-detect-gpu.mdx
│   ├── controls/
│   └── ...
├── fiber/
│   └── ...
└── [other-libraries]/
    └── ...
```

### Repository-based Documentation

Documentation can also be fetched directly from GitHub repositories using the
`docs` configuration in `repodata.json`. This supports:

- Same repository documentation (e.g., `/docs` folder)
- Separate documentation repositories (e.g., Deno uses `denoland/docs`)
- Multiple documentation paths within a repository
- Different branches for documentation

## Available Tools

### Documentation Tools

#### `health-check`

Check if the MCP server is alive and get comprehensive server information
including available libraries, repositories, uptime, and configuration status.

#### `list-libraries`

Get a list of all available documentation libraries from both local `docsdata/`
folder and configured repositories.

#### `list-docs`

Get all documentation files for a specific library.

- **library**: The library name (e.g., 'drei', 'fiber', 'koota')

#### `get-doc`

Get the content of a specific documentation file. Supports section navigation
with `#` anchors.

- **library**: The library name
- **file**: The relative path to the documentation file, optionally with
  `#section`

#### `search-docs`

Search for specific content within a library's documentation with section
suggestions.

- **library**: The library name to search in
- **query**: The search query/keyword

#### `get-overview`

Get an overview of a library's documentation structure showing file
organization.

- **library**: The library name

#### `get-readme`

Get the README content from any GitHub repository.

- **repo**: GitHub repository in 'owner/repo' format or full URL
- **branch**: Branch name (optional, defaults to main/master)

### Repository Source Code Tools

#### `list-repositories`

Get a list of all available source code repositories configured in
`repodata.json`.

#### `browse-repo`

Browse the file structure of a source code repository.

- **library**: The library name (e.g., 'uikit', 'drei')
- **path**: Path within the repository (optional, defaults to root)

#### `read-source-file`

Read the content of a specific source file from a repository.

- **library**: The library name
- **filePath**: Path to the file within the repository

#### `search-source`

Search for specific patterns in source code across a repository.

- **library**: The library name to search in
- **query**: The search pattern/keyword
- **paths**: Specific paths to search within (optional, uses srcPaths from
  config by default)

### Example Code Tools

#### `search-examples`

Search for example code snippets in both documentation and repository example
directories.

- **library**: The library name to search in
- **query**: The search query/keyword to find in example code

#### `get-example`

Get a specific example file from the repository.

- **library**: The library name
- **filePath**: Path to the example file within the repository

#### `list-examples`

List available example directories for a library.

- **library**: The library name

### Repository Management Tools (Guided Workflow)

#### `analyze-repository`

Analyze a GitHub repository structure to prepare for adding it to repodata.json.
Provides comprehensive file tree analysis with expanded common directories and
suggests configuration paths.

- **url**: GitHub repository URL (e.g., 'https://github.com/owner/repo' or
  'owner/repo')
- **branch**: Branch name (optional, defaults to 'main', will try 'master' as
  fallback)

#### `add-repository`

Add a new repository configuration to repodata.json after analysis.

- **key**: Unique key for this library (e.g., 'react-spring', 'framer-motion')
- **name**: Display name for the library (e.g., '@react-spring/core')
- **description**: Short description of the library
- **repo**: GitHub repository in 'owner/repo' format
- **mainBranch**: Main branch name (usually 'main' or 'master')
- **srcPaths**: Array of source code paths within the repository
- **examplePaths**: Array of example code paths within the repository
- **docsRepo**: Documentation repository if different from main repo (optional)
- **docsBranch**: Documentation repository branch (optional, defaults to
  mainBranch)
- **docsPaths**: Array of documentation paths within the docs repository

#### `remove-repository`

Remove a repository configuration from repodata.json.

- **key**: The repository key to remove

## Adding New Libraries

### Option 1: Local Documentation

1. Create a new folder under `docsdata/[library-name]/`
2. Add markdown/mdx files with the documentation
3. The server will automatically detect and serve the new library

### Option 2: GitHub Repository (Recommended)

1. Use `analyze-repository` tool with the GitHub repo URL
2. Review the suggested configuration paths
3. Use `add-repository` tool to add it to repodata.json
4. Repository becomes immediately available for all tools

Example workflow:

```bash
# 1. Analyze the repository structure
analyze-repository url: "https://github.com/colinhacks/zod"

# 2. Add it based on the analysis
add-repository key: "zod" name: "Zod" description: "TypeScript-first schema validation" 
  repo: "colinhacks/zod" mainBranch: "main" 
  srcPaths: ["packages/zod/src"] examplePaths: ["packages/docs/examples"]
```

## Adding New Libraries

To add documentation for a new library:

1. Create a new folder under `docsdata/[library-name]/`
2. Add your documentation files (`.md`, `.mdx`, or `.txt`)
3. Organize in subfolders as needed
4. The server will automatically detect and serve the new library

## Example Queries

Once connected to Claude Desktop, you can ask:

- "What libraries have documentation available?"
- "Show me the drei documentation structure"
- "Find documentation about GPU detection in drei"
- "Get the content of the drei DetectGPU documentation"

## Development

This project uses:

- **TypeScript** for type safety
- **@modelcontextprotocol/sdk** for MCP integration
- **fs-extra** for file system operations
- **zod** for schema validation
