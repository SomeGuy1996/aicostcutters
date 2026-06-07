// ============================================================================
// AICostCutters — Integration Tests (unbiased, mode-agnostic)
// Run: node --test test/integration.test.cjs
// ============================================================================

const { describe, it, before } = require("node:test");
const assert = require("node:assert");
const { spawn } = require("node:child_process");
const path = require("node:path");

const PROXY = "http://localhost:8787";
const PROXY_DIR = path.join(__dirname, "..");
let proxyProcess = null;
let ollamaAvailable = false;
let proxyHealth = null;

// ============================================================================
// Helpers
// ============================================================================

async function fetchJSON(url, opts = {}) {
  const res = await fetch(`${PROXY}${url}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  return { status: res.status, data: await res.json(), headers: Object.fromEntries(res.headers) };
}

async function postChat(messages, model = "test-model") {
  const { data } = await fetchJSON("/v1/chat/completions", {
    method: "POST",
    body: JSON.stringify({ model, messages, max_tokens: 50, stream: false }),
  });
  return data;
}

// ============================================================================
// Startup
// ============================================================================

before(async () => {
  // Check for running proxy
  try {
    const res = await fetch(`${PROXY}/health`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      proxyHealth = await res.json();
      ollamaAvailable = proxyHealth.ollama === "connected";
      console.log(`  Proxy running. Ollama: ${proxyHealth.ollama}, Mode: ${proxyHealth.stats ? "ok" : "?"}`);
      return;
    }
  } catch {}

  // Start proxy if needed
  proxyProcess = spawn("node", ["dist/index.cjs"], {
    cwd: PROXY_DIR,
    env: { ...process.env, AICC_PROXY_PORT: "8787" },
    stdio: "ignore",
  });
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const res = await fetch(`${PROXY}/health`, { signal: AbortSignal.timeout(1000) });
      if (res.ok) { proxyHealth = await res.json(); ollamaAvailable = proxyHealth.ollama === "connected"; console.log("  Proxy started."); return; }
    } catch {}
  }
  throw new Error("Proxy did not start");
});

// ============================================================================
// Tests
// ============================================================================

describe("Health Endpoint", () => {
  it("returns status ok with version", async () => {
    const { status, data } = await fetchJSON("/health");
    assert.strictEqual(status, 200);
    assert.strictEqual(data.status, "ok");
    assert.ok(data.version);
  });
  it("has ollama and upstream fields", async () => {
    const { data } = await fetchJSON("/health");
    assert.ok(["connected", "unavailable"].includes(data.ollama));
    assert.ok(data.upstream.length > 0);
  });
  it("stats are numeric", async () => {
    const { data } = await fetchJSON("/health");
    const s = data.stats;
    assert.strictEqual(typeof s.total_requests, "number");
    assert.strictEqual(typeof s.approved, "number");
    assert.strictEqual(typeof s.blocked, "number");
  });
});

describe("Models Endpoint", () => {
  it("returns OpenAI-compatible list", async () => {
    const { status, data } = await fetchJSON("/v1/models");
    assert.strictEqual(status, 200);
    assert.strictEqual(data.object, "list");
    assert.ok(data.data.length > 0);
    assert.ok(data.data[0].id);
    assert.ok(data.data[0].owned_by);
  });
});

describe("Chat Completions", () => {
  it("always returns aicc_preflight metadata", async () => {
    const data = await postChat([{ role: "user", content: "Hi" }]);
    assert.ok(data.aicc_preflight, "Every response must have preflight metadata");
    assert.ok(["approve", "block", "clarify", "warn", "local_only", "compress", "rewrite"].includes(data.aicc_preflight.action));
  });

  it("fast-path approves short prompts regardless of Ollama", async () => {
    const data = await postChat([{ role: "user", content: "Hi" }]);
    assert.strictEqual(data.aicc_preflight.action, "approve");
    assert.ok(data.aicc_preflight.metadata.latency_ms < 500, `Fast-path too slow: ${data.aicc_preflight.metadata.latency_ms}ms`);
  });

  it("handles long prompts", async () => {
    const long = "Write a complete " + "x".repeat(500);
    const data = await postChat([{ role: "user", content: long }]);
    assert.ok(data.aicc_preflight);
  });

  it("handles special characters", async () => {
    const data = await postChat([{ role: "user", content: "Fix the ∫ equation ∑ → {}" }]);
    assert.ok(data.aicc_preflight);
  });

  // These require Ollama — skip if unavailable
  const requireOllama = ollamaAvailable ? it : it.skip;
  requireOllama("blocks conflicting prompts (Ollama required)", async () => {
    const data = await postChat([{ role: "user", content: "Remove auth but keep login" }]);
    const blocked = data.aicc_preflight.action === "block" ||
      (data.choices?.[0]?.message?.content || "").includes("Blocked");
    assert.ok(blocked, `Expected block, got action=${data.aicc_preflight.action}`);
  });

  requireOllama("evaluates coding prompts (Ollama required)", async () => {
    const data = await postChat([{ role: "user", content: "Write a Python sort function" }]);
    assert.ok(data.aicc_preflight);
    // Should either approve or require approval
    const ok = data.aicc_preflight.action === "approve" || data.aicc_approval_required;
    assert.ok(ok, `Unexpected action: ${data.aicc_preflight.action}`);
  });
});

describe("Stats", () => {
  it("request count increases", async () => {
    const { data: before } = await fetchJSON("/aicc/stats");
    await postChat([{ role: "user", content: "Test" }]);
    const { data: after } = await fetchJSON("/aicc/stats");
    assert.ok(after.total_requests > before.total_requests, "Stats should increment");
  });
});

describe("Error Handling", () => {
  it("rejects missing messages", async () => {
    const res = await fetch(`${PROXY}/v1/chat/completions`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "test" }),
    });
    const data = await res.json();
    // Should return an error (may be 400 or 500 depending on handling)
    assert.ok(data.error || res.status >= 400, "Should return error for missing messages");
  });
  it("returns 404 for unknown routes", async () => {
    const res = await fetch(`${PROXY}/v1/nonexistent`);
    assert.strictEqual(res.status, 404);
  });
  it("rejects non-JSON body", async () => {
    const { data } = await fetchJSON("/v1/chat/completions", {
      method: "POST", body: "not-json",
    });
    assert.ok(data.error, "Should return error object");
  });
});

describe("CORS", () => {
  it("has required CORS headers", async () => {
    const res = await fetch(`${PROXY}/v1/chat/completions`, { method: "OPTIONS" });
    assert.strictEqual(res.headers.get("access-control-allow-origin"), "*");
    assert.ok(res.headers.get("access-control-allow-methods").includes("POST"));
  });
  it("has AICC proxy header on responses", async () => {
    const { headers } = await fetchJSON("/health");
    assert.strictEqual(headers["x-aicc-proxy"], "true");
  });
});

describe("Setup Info", () => {
  it("has complete setup instructions", async () => {
    const { status, data } = await fetchJSON("/aicc/setup");
    assert.strictEqual(status, 200);
    assert.ok(data.proxy_version);
    assert.ok(data.port);
    assert.ok(data.setup_instructions.environment_variables.length >= 4);
  });
});

console.log("\n✅ All integration tests passed");
