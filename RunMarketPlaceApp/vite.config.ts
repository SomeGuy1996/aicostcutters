import { defineConfig } from "vite"
import solidPlugin from "vite-plugin-solid"

export default defineConfig({
  plugins: [solidPlugin()],
  server: {
    host: "127.0.0.1",
    port: 3020,
  },
  resolve: {
    conditions: ["browser", "solid", "module", "import"],
    dedupe: ["solid-js", "solid-js/web", "solid-js/store"],
  },
  build: {
    target: "esnext",
  },
})
