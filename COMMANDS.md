# AICostCutters — Build & Deploy Commands

## Prerequisites

- Node.js + Bun (`bun --version` ≥ 1.3.13)
- VS Code (`code --version`)
- Azure DevOps PAT for publishing (see [Publishing](#publishing))

## VSIX Location

```
packages\kilo-vscode\aicostcutters-7.3.22.vsix
```

## Rebuild the VSIX

```powershell
cd packages\kilo-vscode
npx @vscode/vsce package --no-dependencies -o aicostcutters-7.3.22.vsix
file will be exported to packages\kilo-vscode\aicostcutters-7.3.22.vsix
for me C:\Users\michaelsurpin\tokensave\savetokens\packages\kilo-vscode> 
```

This repackages the existing compiled extension + CLI binary. No source rebuild needed unless you change source files.

## Full Rebuild (source changes)

If you modify extension source (`src/`) or CLI source (`packages/opencode/src/`):

```powershell
# 1. Move .env out of the way (Bun auto-loads it and breaks builds)
Move-Item .env .env.bak

# 2. Build CLI binary
cd packages\opencode
bun run script\build.ts --single --skip-install

# 3. Compile extension
cd ..\kilo-vscode
node esbuild.js

# 4. Package VSIX
npx @vscode/vsce package --no-dependencies -o aicostcutters-7.3.22.vsix

# 5. Restore .env
Move-Item ..\..\.env.bak ..\..\.env
```

## Test Locally (Windows)

```powershell
code --install-extension packages\kilo-vscode\aicostcutters-7.3.22.vsix
```

Then:
1. Open VS Code
2. Press **Ctrl+Shift+R** (or **Ctrl+Shift+A**) to open AICostCutters chat
3. Or click the AICostCutters icon in the activity bar (left sidebar)
4. Type a message and press Enter
5. **Sobriety Check dialog appears** — click "Confirm" to proceed (you're sober) or "Yes" to cancel (you're drunk)
6. To configure AI provider keys: click the gear ⚙ icon → Settings tab

## Publishing to VS Code Marketplace

### 1. Get a PAT (Personal Access Token)

1. Go to https://dev.azure.com/alexymarketplace
2. User settings → Personal Access Tokens → New Token
3. Scope: **Marketplace → Publish** (Read, create, update, delete extensions)
4. Copy the token

### 2. Publish

```powershell
$env:VSCE_PAT="<your-pat-token>"
cd packages\kilo-vscode
npx vsce publish --packagePath aicostcutters-7.3.22.vsix
```

Or publish directly (rebuilds and publishes):

```powershell
$env:VSCE_PAT="<your-pat-token>"
cd packages\kilo-vscode
npx vsce publish
```

### 3. Verify

After publishing, the extension appears at:
https://marketplace.visualstudio.com/manage/publishers/alexymarketplace

It may take a few minutes to become searchable in the VS Code Extensions panel.

## Key Bindings

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+R` / `Cmd+Shift+R` | Open AICostCutters chat and focus input |
| `Ctrl+Shift+A` / `Cmd+Shift+A` | Open AICostCutters chat and focus input (alternate) |
| `Ctrl+Shift+M` / `Cmd+Shift+M` | Open Agent Manager |

## Files

| File | Purpose |
|---|---|
| `.env` | Extension config (not committed) |
| `.env.example` | Template for `.env` (committed, safe to share) |
| `packages\kilo-vscode\aicostcutters-7.3.22.vsix` | Built VSIX package |
