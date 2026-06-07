# AICostCutters — Component Status

## ✅ Stable — Proven Working

| Component | Tests | Verified |
|---|---|---|
| **Proxy Server** (port 8787) | 15 integration + 11 E2E | ✅ |
| **Preflight Engine** (Ollama) | 30 unit tests | ✅ all 7 actions |
| **DeepSeek Forwarding** | E2E curl tests | ✅ with valid key |
| **Approval Gate** (AICC_REQUIRE_APPROVAL) | integration tests | ✅ |
| **Config System** (~/.kilocode/opencode.json) | manual + test | ✅ |
| **Build Pipeline** (bun → cjs) | release script | ✅ |
| **VS Code .vsix Packaging** | release.cjs | ✅ |
| **Windows Auto-Start** (start-aicc.bat) | manual | ✅ |
| **Custom Preflight Panel** (HTML) | manual load | ✅ panel renders |
| **Health Endpoint** | 3 integration tests | ✅ |
| **CORS Headers** | integration test | ✅ |
| **Error Handling** | integration tests | ✅ |

## ⚠️ Ejecting — Needs Verification in VS Code

| Component | Risk | What's Missing |
|---|---|---|
| **Chat Send Interception** (KiloProvider.ts) | Medium | Hook added but not tested in running VS Code |
| **Panel Auto-Trigger on Send** | Medium | Depends on chat interception |
| **Model Dropdown "DeepSeek via AICC"** | Low | Config present, needs manual select |
| **ARM64 Binary on x86_64** | Low | Works via emulation, ~30% slower |
| **AiccStatusService** (status bar) | Low | Registered in extension.ts, polls proxy |
| **AiccPreflightIndicator** (chat icon) | Low | In webview bundle, needs reload test |

## ❌ Known Issues

| Issue | Impact | Workaround |
|---|---|---|
| Bun 1.3.14 segfault on install | Cannot `bun install` | `bun install --no-cache --ignore-scripts` |
| Node ESM stdin bug | Background processes fail | CJS format + pty=true |
| npx hangs | vsce packaging stuck | Global vsce with shell:true |
| Ollama not auto-starting | Preflight degrades to approve-all | start-aicc.bat handles it |

## 📂 Directory Layout

```
aicc-proxy/
├── src/              # Source (all working)
│   ├── index.ts      # Proxy server
│   ├── preflight.ts  # Ollama preflight engine
│   ├── ollama.ts     # Ollama client
│   ├── types.ts      # Type definitions
│   └── health.ts     # VS Code integration hook
├── dist/
│   └── index.cjs     # Compiled CJS (only this — stale .js/.mjs removed)
├── test/
│   ├── unit.test.cjs        # 30 tests — pure functions
│   ├── integration.test.cjs # 15+2 tests — proxy endpoints
│   ├── e2e.test.cjs         # 11 tests — full pipeline
│   └── run-all.cjs          # Test runner
├── stable/           # Snapshot of proven-working core
├── vscode-integration/ # Extension hooks (ejecting)
├── .env              # DeepSeek key + approval mode
├── opencode.json     # Provider config for VS Code
└── package.json
```

## Quick Commands

```bash
# Build proxy
bun build src/index.ts --outfile dist/index.cjs --target node --format cjs

# Run proxy (approval mode)
AICC_REQUIRE_APPROVAL=true node dist/index.cjs

# Run all tests
node test/run-all.cjs

# Build + release extension
cd ../.. && node scripts/release.cjs
```
