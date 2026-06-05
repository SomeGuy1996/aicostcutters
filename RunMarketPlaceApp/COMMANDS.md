# RunMarketPlaceApp — Local Dev Commands (Windows)

## Prerequisites

- [Bun](https://bun.sh) >= 1.3.13 (`bun --version`)
- Node.js (Bun bundles a compatible runtime, but VS Code tasks may use system Node)

## Quick Start (from repo root)

```powershell
# From the monorepo root: C:\Users\michaelsurpin\tokensave\savetokens
bun install
bun run --cwd RunMarketPlaceApp dev
```

Opens at **http://127.0.0.1:3020** in your default browser.

## Running from RunMarketPlaceApp directory

```powershell
cd RunMarketPlaceApp
bun dev
```

## Commands

| Command | What it runs |
|---|---|
| `bun dev` | Start Vite dev server on http://127.0.0.1:3020 |
| `bun run build` | Production build to `dist/` |
| `bun run preview` | Preview production build on http://127.0.0.1:3021 |

## What it is

Standalone SolidJS web app that renders the marketplace UI (Agents, MCPs, Skills) using mock data. Use this to test marketplace card layouts, search/filter behavior, and tag filtering without running the full VS Code extension.

## Troubleshooting

**"Module not found" errors**: Run `bun install` from the repo root first. The app uses workspace dependencies (`@kilocode/kilo-ui`, `@opencode-ai/ui`). Ensure `RunMarketPlaceApp` is listed in the root `package.json` workspaces.

**Port conflict**: Change the port in `vite.config.ts` (`server.port`) or pass `--port 3030` to the dev command.

**Blank page or PostCSS errors**: A `postcss.config.js` is provided to prevent Vite from searching parent directories for PostCSS config. If you see BOM/JSON parse errors related to PostCSS, ensure `postcss.config.js` exists in the `RunMarketPlaceApp` directory.

**Files changed outside RunMarketPlaceApp**:
- Root `package.json`: `RunMarketPlaceApp` added to workspace `packages` array. Required for `workspace:*` dependency resolution.
