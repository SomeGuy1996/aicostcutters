import { Button } from "@kilocode/kilo-ui/button"
import { openLink, t } from "./utils"

const REPO_URL = "https://github.com/Kilo-Org/kilo-marketplace"

export const MarketplaceContribute = () => {
  const open = () => openLink(REPO_URL)
  return (
    <div class="marketplace-contribute">
      <span>{t("marketplace.contribute.prompt")}</span>
      <Button variant="ghost" size="small" onClick={open}>
        {t("marketplace.contribute.cta")}
      </Button>
    </div>
  )
}
