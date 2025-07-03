<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# MCP Documentation Server

This is an MCP (Model Context Protocol) server project that provides comprehensive documentation and source code exploration tools for different libraries.

## Key Information

- This server provides documentation access for libraries like drei, fiber, koota, zod, and other ecosystem libraries
- You can find more info and examples at https://modelcontextprotocol.io/llms-full.txt
- The server uses TypeScript and the @modelcontextprotocol/sdk
- Documentation supports both local files (`docsdata/` folder) and GitHub-hosted docs
- Repository source code exploration via GitHub API
- The main server file is `src/index.ts` with modular tool organization

## Tools Provided

The server exposes these tools:

### Documentation Tools
- `health-check`: Check if the MCP server is alive and get server information
- `list-libraries`: Get all available documentation libraries (local + GitHub)
- `list-docs`: Get documentation files for a specific library
- `get-doc`: Get content of a specific documentation file (supports #section anchors)
- `search-docs`: Search for content within a library's documentation (suggests sections)
- `get-overview`: Get an overview of a library's documentation structure
- `get-readme`: Get README content from any GitHub repository

### Repository Source Code Tools
- `list-repositories`: Get all available source code repositories
- `browse-repo`: Browse the file structure of a source code repository
- `read-source-file`: Read the content of a specific source file from a repository
- `search-source`: Search for specific patterns in source code across a repository

### Example Code Tools
- `search-examples`: Search for example code snippets in both docs and repository examples
- `get-example`: Get a specific example file from the repository
- `list-examples`: List available example directories for a library

### Repository Management Tools (Guided Workflow)
- `analyze-repository`: Analyze a GitHub repository structure to prepare for adding it to repodata.json
- `add-repository`: Add a new repository configuration to repodata.json
- `remove-repository`: Remove a repository configuration from repodata.json

## Configuration

- `config.json`: Contains GitHub API token and other settings (create from config.template.json)
- `config.template.json`: Template for configuration file
- `repodata.json`: Contains repository configurations for source code exploration

## Development

- Build with: `npm run build`
- Start server: `npm start`
- Watch mode: `npm run dev`

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

## Repository Configuration

Each repository in `repodata.json` supports:
- **Source paths**: Where the main source code lives
- **Example paths**: Where example/demo code is located  
- **Documentation paths**: GitHub-hosted documentation (optional)
- **Separate docs repo**: For projects with docs in different repositories

## SDK Reference

- GitHub repo: https://github.com/modelcontextprotocol/create-python-server
- Documentation: https://modelcontextprotocol.io/
