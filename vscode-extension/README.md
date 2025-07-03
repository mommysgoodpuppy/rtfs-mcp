# MCP Documentation Server VS Code Extension

This VS Code extension provides the MCP Documentation Server as an MCP (Model
Context Protocol) server within VS Code, enabling comprehensive documentation
and source code exploration for various libraries.

## Features

- **Automatic MCP Server Registration**: Automatically detects and registers the
  MCP Documentation Server when available in your workspace
- **Smart Configuration**: Helps create configuration files from templates
- **Build Integration**: Integrates with VS Code tasks to build the MCP server
- **Error Handling**: Provides helpful error messages and guidance when the
  server is not available

## Requirements

- VS Code 1.96.0 or later
- Node.js installed on your system
- The MCP Documentation Server project in your workspace

## Installation

1. Ensure you have the MCP Documentation Server project in your workspace
2. Install this extension
3. The extension will automatically detect and register the MCP server

## Usage

The extension automatically:

1. **Detects the MCP Server**: Looks for the built MCP Documentation Server in
   your workspace
2. **Registers the Server**: Makes it available to VS Code's language models
3. **Handles Configuration**: Prompts to create config files if missing
4. **Manages Building**: Offers to build the server if not found

### Manual Commands

- `MCP Docs Server: Build` - Manually build the MCP server
- `MCP Docs Server: Create Config` - Create config.json from template

## Configuration

The extension looks for:

- `build/index.js` - The built MCP server
- `config.json` - Server configuration (created from template if missing)
- `package.json` - To identify the MCP server project

## Troubleshooting

### Server Not Found

If you see "MCP Documentation Server not found":

1. Ensure the MCP server project is in your workspace
2. Run the build command: `npm run build`
3. Check that `build/index.js` exists

### Missing Configuration

If prompted about missing config.json:

1. Click "Create Config" when prompted
2. Or manually copy `config.template.json` to `config.json`
3. Add your GitHub token if needed for higher API limits

## Development

To develop this extension:

```bash
cd vscode-extension
npm install
npm run compile
```

Then press F5 to launch the Extension Development Host.

## License

Same as the MCP Documentation Server project.
