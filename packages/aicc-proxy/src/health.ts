// ============================================================================
// AICostCutters — Kilo Code Integration Module
//
// Hooks for integrating the AICC proxy into the Kilo Code editor.
// Provides: health checks, UI status indicators, startup verification.
// ============================================================================

const PROXY_URL = process.env.AICC_PROXY_URL || "http://localhost:8787";
const OLLAMA_URL = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";

// ============================================================================
// Health Check Types
// ============================================================================

export interface AICCHealthStatus {
  proxy: {
    running: boolean;
    url: string;
    version?: string;
    error?: string;
  };
  ollama: {
    installed: boolean;
    running: boolean;
    models: string[];
    error?: string;
  };
  gateway: {
    configured: boolean;
    url?: string;
    error?: string;
  };
  overall: "ready" | "partial" | "unavailable";
  recommendations: string[];
}

// ============================================================================
// Health Checks
// ============================================================================

/**
 * Check if the AICC proxy is running on the expected port
 */
async function checkProxy(): Promise<AICCHealthStatus["proxy"]> {
  try {
    const res = await fetch(`${PROXY_URL}/health`, {
      signal: AbortSignal.timeout(3_000),
    });
    if (res.ok) {
      const data = await res.json() as Record<string, unknown>;
      return {
        running: true,
        url: PROXY_URL,
        version: data.version as string | undefined,
      };
    }
    return { running: false, url: PROXY_URL, error: `HTTP ${res.status}` };
  } catch (err) {
    return {
      running: false,
      url: PROXY_URL,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Check if Ollama is installed and running
 */
async function checkOllama(): Promise<AICCHealthStatus["ollama"]> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) {
      return {
        installed: false,
        running: false,
        models: [],
        error: `Ollama server returned ${res.status}`,
      };
    }
    const data = (await res.json()) as { models?: Array<{ name: string }> };
    const models = (data.models || []).map((m) => m.name);
    return {
      installed: true,
      running: true,
      models,
    };
  } catch (err) {
    return {
      installed: false,
      running: false,
      models: [],
      error: err instanceof Error ? err.message : "Ollama not reachable",
    };
  }
}

/**
 * Check if the upstream gateway is configured
 */
async function checkGateway(): Promise<AICCHealthStatus["gateway"]> {
  const upstreamUrl = process.env.AICC_UPSTREAM_URL;
  const upstreamKey = process.env.AICC_UPSTREAM_KEY || process.env.OPENROUTER_API_KEY;

  if (!upstreamKey) {
    return {
      configured: false,
      error: "No upstream API key. Set AICC_UPSTREAM_KEY or OPENROUTER_API_KEY.",
    };
  }

  if (upstreamUrl) {
    try {
      const res = await fetch(`${upstreamUrl}/models`, {
        signal: AbortSignal.timeout(5_000),
        headers: { Authorization: `Bearer ${upstreamKey}` },
      });
      if (res.ok) {
        return { configured: true, url: upstreamUrl };
      }
      return {
        configured: false,
        url: upstreamUrl,
        error: `Gateway returned ${res.status}`,
      };
    } catch (err) {
      return {
        configured: false,
        url: upstreamUrl,
        error: err instanceof Error ? err.message : "Gateway unreachable",
      };
    }
  }

  return { configured: true, url: "Using default OpenRouter" };
}

// ============================================================================
// Full Health Check
// ============================================================================

/**
 * Run all health checks and return a comprehensive status report.
 * Use this on editor startup to show the AICC status indicator.
 */
export async function checkHealth(): Promise<AICCHealthStatus> {
  const [proxy, ollama, gateway] = await Promise.all([
    checkProxy(),
    checkOllama(),
    checkGateway(),
  ]);

  const recommendations: string[] = [];

  if (!proxy.running) {
    recommendations.push(
      `Start the AICC proxy: cd packages/aicc-proxy && bun start (or npm start)`
    );
  }

  if (!ollama.running) {
    recommendations.push(
      "Install Ollama from https://ollama.com and run: ollama serve"
    );
  } else if (ollama.models.length === 0) {
    recommendations.push(
      "Pull a preflight model: ollama pull qwen2.5-coder:3b"
    );
  }

  if (!gateway.configured) {
    recommendations.push(
      "Set AICC_UPSTREAM_KEY or OPENROUTER_API_KEY environment variable"
    );
  }

  let overall: AICCHealthStatus["overall"];
  if (proxy.running && ollama.running && ollama.models.length > 0) {
    overall = "ready";
  } else if (proxy.running || ollama.running) {
    overall = "partial";
  } else {
    overall = "unavailable";
  }

  return { proxy, ollama, gateway, overall, recommendations };
}

// ============================================================================
// UI Status Formatting
// ============================================================================

/**
 * Get a simple status string for UI display (e.g., in Kilo Code status bar)
 */
export async function getStatusString(): Promise<{
  text: string;
  icon: string;
  detail: string;
}> {
  const health = await checkHealth();
  switch (health.overall) {
    case "ready":
      return {
        text: "AICC: Active",
        icon: "🟢",
        detail: `Proxy running | Ollama: ${health.ollama.models[0] || "no model"} | Saving tokens`,
      };
    case "partial":
      return {
        text: "AICC: Partial",
        icon: "🟡",
        detail: health.recommendations.join(" | "),
      };
    case "unavailable":
      return {
        text: "AICC: Off",
        icon: "🔴",
        detail: "Preflight unavailable. All requests go to paid models.",
      };
  }
}

/**
 * Get the recommended opencode.json config to enable the AICC proxy
 */
export function getConfigSnippet(): Record<string, unknown> {
  return {
    provider: {
      aicc: {
        name: "AICostCutters Local Proxy",
        api: "openai-compatible",
        baseUrl: "http://localhost:8787/v1",
        apiKey: "aicc-no-auth-needed",
        options: {
          temperature: 0.7,
        },
      },
    },
    model: {
      "aicc/any": {
        provider: "aicc",
        name: "AICostCutters (All Models)",
        model: "any",
      },
    },
  };
}

// ============================================================================
// Startup Verification
// ============================================================================

/**
 * Called on editor startup to verify the AICC setup.
 * Returns true if everything is ready, false if user should see a warning.
 */
export async function verifyStartup(): Promise<{
  ready: boolean;
  status: AICCHealthStatus;
}> {
  const status = await checkHealth();
  return { ready: status.overall === "ready", status };
}

// ============================================================================
// CLI
// ============================================================================

/**
 * CLI entry point: run `bun run packages/aicc-proxy/src/health.ts` to check status
 */
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  console.log("AICostCutters — Health Check\n");

  checkHealth().then((health) => {
    console.log(`Proxy:   ${health.proxy.running ? "✅ Running" : "❌ Not running"}`);
    if (!health.proxy.running) console.log(`         ${health.proxy.error}`);
    console.log(`         ${health.proxy.url}`);

    console.log(`Ollama:  ${health.ollama.running ? "✅ Running" : "❌ Not running"}`);
    if (health.ollama.running) {
      console.log(`         Models: ${health.ollama.models.join(", ") || "(none)"}`);
    } else {
      console.log(`         ${health.ollama.error || "Install from https://ollama.com"}`);
    }

    console.log(`Gateway: ${health.gateway.configured ? "✅ Configured" : "❌ Not configured"}`);
    if (health.gateway.error) console.log(`         ${health.gateway.error}`);

    console.log(`\nOverall: ${health.overall === "ready" ? "✅ Ready" : health.overall === "partial" ? "⚠️  Partial" : "❌ Unavailable"}`);

    if (health.recommendations.length > 0) {
      console.log("\nRecommendations:");
      health.recommendations.forEach((r) => console.log(`  • ${r}`));
    }

    if (health.overall === "ready") {
      console.log("\n📋 To use AICostCutters in Kilo Code:");
      console.log("  1. Add this to your opencode.json config:");
      console.log(JSON.stringify(getConfigSnippet(), null, 2));
      console.log("\n  2. Select the 'aicc' provider in the model selector");
      console.log("  3. Start coding — preflight checks run automatically!");
    }

    console.log(); // final newline for clean output
  });
}
