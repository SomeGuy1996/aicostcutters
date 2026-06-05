import "@kilocode/kilo-ui/styles"
import { render } from "solid-js/web"
import App from "./App"
import "./styles/marketplace.css"

const root = document.getElementById("root")
if (!root) throw new Error("Missing root element")

render(() => <App />, root)
