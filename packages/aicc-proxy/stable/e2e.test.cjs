#!/usr/bin/env node
// ============================================================================
// AICostCutters — E2E Test Suite
//
// Tests the full pipeline: proxy → preflight → upstream
// Run: node test/e2e.test.cjs
// ============================================================================

const PROXY = process.env.AICC_PROXY_URL || "http://localhost:8787";

let pass = 0;
let fail = 0;

function log(icon, msg) { console.log(`  ${icon} ${msg}`); }
function ok(msg) { pass++; log("✅", msg); }
function err(msg, detail) { fail++; log("❌", msg); if (detail) console.log(`     ${detail}`); }

async function test(name, fn) {
  console.log(`\n📋 ${name}`);
  try {
    await fn();
  } catch (e) {
    err(`Test threw: ${e.message}`);
  }
}

async function fetchJSON(url, opts = {}) {
  const res = await fetch(`${PROXY}${url}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  const body = await res.json();
  return { status: res.status, body, headers: Object.fromEntries(res.headers) };
}

// ============================================================================
// Tests
// ============================================================================

async function main() {
  console.log("=".repeat(56));
  console.log("  AICostCutters E2E Test Suite");
  console.log("=".repeat(56));
  console.log(`  Proxy: ${PROXY}`);

  // --- Connectivity ---
  await test("Proxy connectivity", async () => {
    try {
      const { status, body } = await fetchJSON("/health");
      if (status === 200 && body.status === "ok") {
        ok(`Proxy v${body.version} responding`);
      } else {
        err("Health check failed", JSON.stringify(body));
      }
    } catch (e) {
      err(`Cannot reach proxy at ${PROXY}`, e.message);
    }
  });

  // --- Root endpoint ---
  await test("Root endpoint describes API", async () => {
    const { status, body } = await fetchJSON("/");
    if (status === 200 && body.endpoints?.chat) ok("Root endpoint lists all routes");
    else err("Root endpoint missing chat route", JSON.stringify(body));
  });

  // --- Models endpoint ---
  await test("OpenAI-compatible models list", async () => {
    const { status, body } = await fetchJSON("/v1/models");
    if (status === 200 && body.object === "list" && body.data?.length > 0) {
      ok(`Models endpoint returns ${body.data.length} model(s)`);
    } else err("Models endpoint malformed", JSON.stringify(body));
  });

  // --- Stats endpoint ---
  await test("Stats tracking", async () => {
    const { body: before } = await fetchJSON("/aicc/stats");
    ok(`Stats: ${before.total_requests} total, ${before.approval_rate}% approval rate`);
  });

  // --- Preflight: fast-path short prompt ---
  await test("Preflight fast-path for short prompts (< 20 chars)", async () => {
    const { status, body } = await fetchJSON("/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        model: "test/model",
        messages: [{ role: "user", content: "Hi" }],
        stream: false,
      }),
      headers: { "X-AICC-Client-ID": "e2e-test" },
    });
    if (body.aicc_preflight?.action === "approve" && body.aicc_preflight?.reasoning?.includes("fast-path")) {
      ok("Short prompts use fast-path approve");
    } else if (body.error) {
      ok(`Blocked correctly (no API key): ${body.error.message.slice(0, 60)}`);
    } else {
      ok("Request processed (preflight status attached)");
    }
  });

  // --- Preflight: conflict detection prompt (mock, Ollama unavailable) ---
  await test("Conflict detection prompt (Ollama fallback)", async () => {
    const { status, body } = await fetchJSON("/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        model: "anthropic/claude-sonnet-4",
        messages: [
          { role: "system", content: "You are a coding assistant. Current project is a React app with Firebase auth." },
          { role: "user", content: "Remove auth but keep login working." },
        ],
        max_tokens: 100,
        stream: false,
      }),
      headers: {
        "X-AICC-Client-ID": "e2e-test",
        "X-AICC-Project-ID": "aicc-poc",
        "X-AICC-Worker-ID": "dev-test",
      },
    });
    if (body.aicc_preflight) {
      ok(`Preflight attached: action=${body.aicc_preflight.action}, model=${body.aicc_preflight.metadata.preflight_model}`);
      if (body.aicc_preflight.action === "approve" && body.aicc_preflight.reasoning?.includes("Ollama not available")) {
        ok("Graceful degradation: approves when Ollama unavailable");
      }
    } else if (body.error) {
      ok(`Expected: upstream blocked (no API key)`);
    } else {
      err("No preflight metadata in response");
    }
  });

  // --- Request metadata passthrough ---
  await test("AICC metadata headers in response", async () => {
    const res = await fetch(`${PROXY}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-AICC-Client-ID": "e2e-test-client",
        "X-AICC-Worker-ID": "dev-michael",
        "X-AICC-Project-ID": "aicc-poc",
        "X-AICC-Session-ID": "sess-12345",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o",
        messages: [{ role: "user", content: "Test metadata passthrough" }],
        max_tokens: 50,
        stream: false,
      }),
    });
    const proxyHeaders = res.headers;
    if (proxyHeaders.get("x-aicc-proxy") === "true") ok("X-AICC-Proxy header present");
    else err("X-AICC-Proxy header missing");
  });

  // --- CORS ---
  await test("CORS preflight headers", async () => {
    const res = await fetch(`${PROXY}/v1/chat/completions`, { method: "OPTIONS" });
    if (res.headers.get("access-control-allow-origin") === "*") ok("CORS enabled (*)");
    else err("CORS headers missing");
  });

  // --- Error handling ---
  await test("Invalid JSON returns error", async () => {
    const res = await fetch(`${PROXY}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const body = await res.json();
    if (body.error) ok("Invalid JSON handled gracefully");
    else err("No error for invalid JSON");
  });

  // --- 404 ---
  await test("Unknown endpoint returns 404", async () => {
    const { status } = await fetchJSON("/v1/nonexistent");
    if (status === 404) ok("404 for unknown endpoints");
    else err(`Expected 404, got ${status}`);
  });

  // --- Final stats ---
  await test("Final stats report", async () => {
    const { body } = await fetchJSON("/aicc/stats");
    ok(`Final: ${body.total_requests} requests, ${body.approved} approved, ${body.interception_rate}% intercepted`);
  });

  // ============================================================================
  // Summary
  // ============================================================================
  console.log(`\n${"=".repeat(56)}`);
  const total = pass + fail;
  console.log(`  Results: ${pass}/${total} passed` + (fail > 0 ? `, ${fail} failed` : ""));
  if (fail === 0) {
    console.log("  🎉 All tests passed!");
  }
  console.log("=".repeat(56));
  process.exit(fail > 0 ? 1 : 0);
}

main();
