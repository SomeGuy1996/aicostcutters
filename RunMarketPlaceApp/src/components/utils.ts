import type { MarketplaceItem, MarketplaceInstalledMetadata } from "../data/types"

export function isInstalled(
  id: string,
  type: string,
  metadata: MarketplaceInstalledMetadata,
): "project" | "global" | false {
  return installedScopes(id, type, metadata)[0] ?? false
}

export function installedScopes(
  id: string,
  type: string,
  metadata: MarketplaceInstalledMetadata,
): ("project" | "global")[] {
  const scopes: ("project" | "global")[] = []
  if (metadata.project[id]?.type === type) scopes.push("project")
  if (metadata.global[id]?.type === type) scopes.push("global")
  return scopes
}

export function openLink(url: string) {
  window.open(url, "_blank")
}

const LABELS: Record<string, string> = {
  "marketplace.tab.agents": "Agents",
  "marketplace.tab.mcp": "MCP",
  "marketplace.tab.skills": "Skills",
  "marketplace.search": "Search...",
  "marketplace.empty": "No items found",
  "marketplace.filter.all": "All",
  "marketplace.filter.installed": "Installed",
  "marketplace.filter.notInstalled": "Not Installed",
  "marketplace.card.install": "Install",
  "marketplace.card.remove": "Remove",
  "marketplace.card.installed": "Installed",
  "marketplace.card.by": "by {author}",
  "marketplace.card.showMore": "Show more",
  "marketplace.card.showLess": "Show less",
  "marketplace.card.removeScope": "Remove ({scope})",
  "marketplace.scope.project": "project",
  "marketplace.scope.global": "global",
  "marketplace.contribute.prompt": "Can't find what you're looking for?",
  "marketplace.contribute.cta": "Contribute on GitHub",
}

export function t(key: string, params?: Record<string, string>) {
  let text = LABELS[key] ?? key
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(`{${k}}`, v)
    }
  }
  return text
}
