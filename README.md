<p align="center">
  <img width="250" alt="aicostcutters-logo" src="aicostcutters.png" />
</p>

<p align="center">
  <strong>AICostCutters</strong><br>
  An AI coding agent that generates code from natural language, automates tasks, and supports 500+ AI models.
</p>

<p align="center">
  <strong>Prompt smarter, ship faster.</strong>
</p>

- ✨ Generate code from natural language
- ✅ Checks its own work
- 🧪 Run terminal commands
- 🌐 Automate the browser
- ⚡ Inline autocomplete suggestions
- 🤖 Latest AI models
- 🎁 API keys optional

## Quick Links

- Install CLI: `npm install -g @aicostcutters/cli`
- [GitHub Releases](https://github.com/alexymarketplace/aicostcutters/releases)

## Key Features

- **Code Generation:** AICostCutters can generate code using natural language.
- **Inline Autocomplete:** Get intelligent code completions as you type, powered by AI.
- **Task Automation:** AICostCutters can automate repetitive coding tasks to save time.
- **Automated Refactoring:** AICostCutters can refactor and improve existing code efficiently.
- **MCP Server Marketplace**: Easily find, and use MCP servers to extend the agent capabilities.
- **Multi Mode**: Plan with Architect, Code with Coder, and Debug with Debugger, and make your own custom modes.

## Get Started in Visual Studio Code

1. Install the AICostCutters extension from the VS Code Marketplace.
2. Connect your AI provider API keys to access 500+ cutting-edge AI models including GPT-5.5, Claude Opus 4.7, Claude Sonnet 4.6, and Gemini 3.1 Pro Preview.
3. Start coding with AI that adapts to your workflow.

## Get Started with the CLI

```bash
# npm
npm install -g @aicostcutters/cli

# Or run directly with npx
npx @aicostcutters/cli
```

Then run `aicostcutters` in any project directory to start.

### Install from GitHub Releases (Optional)

Download the latest binary or source code from the [Releases page](https://github.com/alexymarketplace/aicostcutters/releases), use this quick guide:

- `aicostcutters-<os>-<arch>.zip` is the CLI binary for your OS and CPU architecture on Windows and macOS. (`aicostcutters-linux-<arch>.tar.gz` for Linux)
- `darwin` means macOS.
- `x64` is standard 64-bit Intel/AMD CPUs.
- `x64-baseline` is a compatibility build for older x64 CPUs(do not support AVX Instruction).
- `arm64` is ARM-based Linux/MacOS.
- `musl` is statically linked Linux build for Alpine/minimal Docker without glibc. Alpine/minimal Docker users should prefer the matching \*-musl asset.
- `aicostcutters-vscode-*.vsix` is the VS Code extension package and not the CLI binary.
- `Source code` releases are for building from source, not normal installation.

For most users:

- **Windows (most PCs):** `aicostcutters-windows-x64.zip`
- **macOS Apple Silicon:** `aicostcutters-darwin-arm64.zip`
- **macOS Intel:** `aicostcutters-darwin-x64.zip`
- **Linux x64:** `aicostcutters-linux-x64.tar.gz`
- **Linux on ARM:** `aicostcutters-linux-arm64.tar.gz`

### Autonomous Mode (CI/CD)

Use the `--auto` flag with `aicostcutters run` to enable fully autonomous operation without user interaction. This is ideal for CI/CD pipelines and automated workflows:

```bash
aicostcutters run --auto "run tests and fix any failures"
```

**Important:** The `--auto` flag disables all permission prompts and allows the agent to execute any action without confirmation. Only use this in trusted environments like CI/CD pipelines.

## Contributing

We welcome contributions from developers, writers, and enthusiasts!
To get started, please read our [Contributing Guide](/CONTRIBUTING.md). It includes details on setting up your environment, coding standards, types of contribution and how to submit pull requests.

See [RELEASING.md](RELEASING.md) for the VS Code extension and CLI release process.

## Code of Conduct

Our community is built on respect, inclusivity, and collaboration. Please review our [Code of Conduct](/CODE_OF_CONDUCT.md) to understand the expectations for all contributors and community members.

## License

This project is licensed under the MIT License.
You're free to use, modify, and distribute this code, including for commercial purposes as long as you include proper attribution and license notices. See [License](/LICENSE).

## FAQ

<details>
<summary>Where did AICostCutters CLI come from?</summary>

AICostCutters CLI is a fork of [OpenCode](https://github.com/anomalyco/opencode), enhanced with additional features and capabilities.

</details>
