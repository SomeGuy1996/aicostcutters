import { createSignal, createMemo } from "solid-js"
import { Tabs } from "@kilocode/kilo-ui/tabs"
import type {
  McpMarketplaceItem,
  AgentMarketplaceItem,
  SkillMarketplaceItem,
  MarketplaceInstalledMetadata,
} from "../data/types"
import { MOCK_SKILLS, MOCK_MCPS, MOCK_AGENTS } from "../data/mock"
import { t } from "./utils"
import { MarketplaceListView } from "./MarketplaceListView"

const EMPTY_METADATA: MarketplaceInstalledMetadata = { project: {}, global: {} }

const PARTIAL_INSTALLED: Record<string, MarketplaceInstalledMetadata> = {
  skill: {
    project: { "nextjs-developer": { type: "skill" } },
    global: { "python-data-science": { type: "skill" } },
  },
  mcp: {
    project: { "github-mcp": { type: "mcp" } },
    global: { "postgres-mcp": { type: "mcp" } },
  },
  agent: {
    project: { architect: { type: "agent" } },
    global: { reviewer: { type: "agent" } },
  },
}

export const MarketplaceView = () => {
  const [tab, setTab] = createSignal("agent")
  const [installed, setInstalled] = createSignal(PARTIAL_INSTALLED)

  const metadata = createMemo(() => installed()[tab()] ?? EMPTY_METADATA)

  const skills = createMemo(() => MOCK_SKILLS as SkillMarketplaceItem[])
  const mcps = createMemo(() => MOCK_MCPS as McpMarketplaceItem[])
  const agents = createMemo(() => MOCK_AGENTS as AgentMarketplaceItem[])

  const handleInstall = (_item: unknown) => {
    // browse-only mode — no actual install
  }

  const handleRemove = (_item: unknown, _scope: "project" | "global") => {
    // browse-only mode — no actual remove
  }

  return (
    <div class="marketplace-view">
      <Tabs value={tab()} onChange={setTab} class="marketplace-tabs-root">
        <Tabs.List>
          <Tabs.Trigger value="agent">{t("marketplace.tab.agents")}</Tabs.Trigger>
          <Tabs.Trigger value="mcp">{t("marketplace.tab.mcp")}</Tabs.Trigger>
          <Tabs.Trigger value="skill">{t("marketplace.tab.skills")}</Tabs.Trigger>
        </Tabs.List>

        <div class="marketplace-content">
          <Tabs.Content value="agent">
            <MarketplaceListView
              items={agents()}
              metadata={metadata()}
              fetching={false}
              type="agent"
              searchPlaceholder={t("marketplace.search")}
              emptyMessage={t("marketplace.empty")}
              onInstall={handleInstall}
              onRemove={handleRemove}
            />
          </Tabs.Content>

          <Tabs.Content value="mcp">
            <MarketplaceListView
              items={mcps()}
              metadata={metadata()}
              fetching={false}
              type="mcp"
              searchPlaceholder={t("marketplace.search")}
              emptyMessage={t("marketplace.empty")}
              onInstall={handleInstall}
              onRemove={handleRemove}
            />
          </Tabs.Content>

          <Tabs.Content value="skill">
            <MarketplaceListView
              items={skills()}
              metadata={metadata()}
              fetching={false}
              type="skill"
              searchPlaceholder={t("marketplace.search")}
              emptyMessage={t("marketplace.empty")}
              onInstall={handleInstall}
              onRemove={handleRemove}
            />
          </Tabs.Content>
        </div>
      </Tabs>
    </div>
  )
}
