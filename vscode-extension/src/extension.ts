import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

export function activate(context: vscode.ExtensionContext) {
  const didChangeEmitter = new vscode.EventEmitter<void>();

  context.subscriptions.push(
    vscode.lm.registerMcpServerDefinitionProvider("mcpDocsServerProvider", {
      onDidChangeMcpServerDefinitions: didChangeEmitter.event,

      provideMcpServerDefinitions: async () => {
        const servers: vscode.McpServerDefinition[] = [];

        // Use the bundled server from the extension
        const serverPath = path.join(
          context.extensionPath,
          "out",
          "server.js",
        );

        if (fs.existsSync(serverPath)) {
          servers.push(
            new vscode.McpStdioServerDefinition(
              "MCP Documentation Server",
              "node",
              [serverPath],
              {
                NODE_ENV: "production",
                EXTENSION_PATH: context.extensionPath,
                MCP_SERVER_BASE_PATH: path.join(
                  context.extensionPath,
                  "out",
                ),
              },
              "1.0.0",
            ),
          );
        }

        return servers;
      },

      resolveMcpServerDefinition: async (
        server: vscode.McpServerDefinition,
      ) => {
        if (server.label === "MCP Documentation Server") {
          // Check if the bundled server exists
          const serverPath = path.join(
            context.extensionPath,
            "out",
            "server.js",
          );

          if (!fs.existsSync(serverPath)) {
            vscode.window.showErrorMessage(
              "MCP Documentation Server not found in extension bundle.",
            );
            throw new Error("MCP Documentation Server not found");
          }

          // Check for config files in workspace or create default
          await ensureConfiguration(context);

          vscode.window.showInformationMessage(
            "MCP Documentation Server started successfully",
          );
        }

        return server;
      },
    }),
  );

  // Register command to show server info
  context.subscriptions.push(
    vscode.commands.registerCommand("mcpDocsServer.build", showServerInfo),
  );

  // Register command to create config from template
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "mcpDocsServer.createConfig",
      createConfigFromTemplate,
    ),
  );
}

/**
 * Ensure configuration files are available
 */
async function ensureConfiguration(context: vscode.ExtensionContext) {
  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (!workspaceFolders || workspaceFolders.length === 0) {
    // No workspace, create config in extension storage
    const configPath = path.join(
      context.globalStorageUri.fsPath,
      "config.json",
    );
    const repodataPath = path.join(
      context.globalStorageUri.fsPath,
      "repodata.json",
    );

    await fs.promises.mkdir(context.globalStorageUri.fsPath, {
      recursive: true,
    });

    if (!fs.existsSync(configPath)) {
      const defaultConfig = {
        github: {
          apiKey: "",
        },
      };
      await fs.promises.writeFile(
        configPath,
        JSON.stringify(defaultConfig, null, 2),
      );
    }

    if (!fs.existsSync(repodataPath)) {
      await fs.promises.writeFile(repodataPath, "{}");
    }

    return;
  }

  // Check workspace for config files
  for (const folder of workspaceFolders) {
    const configPath = path.join(folder.uri.fsPath, "config.json");
    const templatePath = path.join(folder.uri.fsPath, "config.template.json");

    if (!fs.existsSync(configPath) && fs.existsSync(templatePath)) {
      const response = await vscode.window.showInformationMessage(
        "Would you like to create config.json from the template?",
        "Create Config",
        "Skip",
      );

      if (response === "Create Config") {
        await createConfigFromTemplate();
      }
      break;
    }
  }
}

/**
 * Show information about the bundled server
 */
async function showServerInfo() {
  vscode.window.showInformationMessage(
    "MCP Documentation Server is bundled with this extension. No build required!",
  );
}

/**
 * Create config.json from template
 */
async function createConfigFromTemplate() {
  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (!workspaceFolders) {
    vscode.window.showErrorMessage("No workspace folder found");
    return;
  }

  // Find the workspace folder containing the MCP server
  let mcpWorkspaceFolder: vscode.WorkspaceFolder | undefined;

  for (const folder of workspaceFolders) {
    const templatePath = path.join(folder.uri.fsPath, "config.template.json");
    if (fs.existsSync(templatePath)) {
      mcpWorkspaceFolder = folder;
      break;
    }
  }

  if (!mcpWorkspaceFolder) {
    vscode.window.showErrorMessage(
      "config.template.json not found in workspace",
    );
    return;
  }

  const templatePath = path.join(
    mcpWorkspaceFolder.uri.fsPath,
    "config.template.json",
  );
  const configPath = path.join(mcpWorkspaceFolder.uri.fsPath, "config.json");

  try {
    // Read template
    const template = fs.readFileSync(templatePath, "utf8");
    const config = JSON.parse(template);

    // Prompt for GitHub token if needed
    if (config.github && config.github.token === "your-github-token-here") {
      const token = await vscode.window.showInputBox({
        prompt:
          "Enter your GitHub Personal Access Token (optional, for higher rate limits)",
        password: true,
        placeHolder: "ghp_...",
      });

      if (token) {
        config.github.token = token;
      } else {
        // Remove token field if not provided
        delete config.github.token;
      }
    }

    // Write config file
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    vscode.window.showInformationMessage("config.json created successfully");

    // Open the config file for review
    const doc = await vscode.workspace.openTextDocument(configPath);
    await vscode.window.showTextDocument(doc);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to create config.json: ${error}`);
  }
}

export function deactivate() {}
