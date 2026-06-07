// ============================================================================
// AICostCutters Local Proxy Server
//
// Exposes an OpenAI-compatible endpoint at http://localhost:8787/v1
// that intercepts prompts, runs preflight checks, and routes to paid providers.
//
// Flow:
//   Kilo Code → Local Proxy (port 8787) → Ollama Preflight → Paid Provider
// ============================================================================

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import {
  runPreflight,
  initializePreflight,
} from "./preflight.js";
import {
  isOllamaAvailable,
  setOllamaHost,
} from "./ollama.js";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  PreflightAction,
  PreflightResult,
} from "./types.js";

// ============================================================================
// Config
// ============================================================================

const PORT = parseInt(process.env.AICC_PROXY_PORT || "8787", 10);
const UPSTREAM_URL = process.env.AICC_UPSTREAM_URL || "https://api.openrouter.ai/api/v1";
const UPSTREAM_API_KEY = process.env.AICC_UPSTREAM_KEY || process.env.OPENROUTER_API_KEY || "";
const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
const REQUIRE_APPROVAL = process.env.AICC_REQUIRE_APPROVAL === "true";

// Stats for monitoring
let stats = {
  total_requests: 0,
  approved: 0,
  clarified: 0,
  rewritten: 0,
  warned: 0,
  blocked: 0,
  local_answered: 0,
  compressed: 0,
  estimated_tokens_saved: 0,
  estimated_cost_saved_usd: 0,
};

// ============================================================================
// HTTP Helpers
// ============================================================================

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function jsonResponse(
  res: ServerResponse,
  data: unknown,
  status = 200
) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-AICC-Client-ID, X-AICC-Worker-ID",
    "X-AICC-Proxy": "true",
    "X-AICC-Version": "0.1.0",
  });
  res.end(body);
}

function jsonError(
  res: ServerResponse,
  message: string,
  status = 400
) {
  jsonResponse(res, { error: { message, type: "aicc_proxy_error" } }, status);
}

function streamResponse(
  res: ServerResponse,
  onData: (write: (chunk: string) => void) => Promise<void>
) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "X-AICC-Proxy": "true",
  });

  const write = (chunk: string) => {
    if (!res.writableEnded) res.write(chunk);
  };

  onData(write)
    .then(() => {
      if (!res.writableEnded) res.end();
    })
    .catch((err) => {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ error: String(err) })}\n\n`);
        res.end();
      }
    });
}

// ============================================================================
// Preflight → Response mapper
// ============================================================================

function preflightToResponse(
  result: PreflightResult,
  request: ChatCompletionRequest
): { status: number; body: Record<string, unknown> } {
  switch (result.action) {
    case "clarify":
      return {
        status: 200,
        body: {
          id: `aicc-clarify-${randomUUID()}`,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: request.model,
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: `🔍 **AICostCutters Preflight — Clarification Needed**\n\n${result.clarification_question || "Please clarify your request before sending to the paid model."}\n\n_Estimated savings: ${result.estimated_savings?.tokens_saved || "N/A"} tokens ($${result.estimated_savings?.cost_saved_usd?.toFixed(4) || "0.00"})_\n\nReply with more details or type **/send-anyway** to bypass preflight.`,
              },
              finish_reason: "stop",
            },
          ],
          aicc_preflight: result,
        },
      };

    case "rewrite":
      return {
        status: 200,
        body: {
          id: `aicc-rewrite-${randomUUID()}`,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: request.model,
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: `✏️ **AICostCutters Preflight — Prompt Rewritten**\n\nI've improved your prompt for clarity:\n\n> ${result.rewritten_prompt || "No rewrite available"}\n\n${result.reasoning}\n\n_Estimated savings: ${result.estimated_savings?.tokens_saved || "N/A"} tokens_\n\nReply **yes** to use the rewritten prompt, or edit and resend.`,
              },
              finish_reason: "stop",
            },
          ],
          aicc_preflight: result,
        },
      };

    case "warn":
      return {
        status: 200,
        body: {
          id: `aicc-warn-${randomUUID()}`,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: request.model,
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: `⚠️ **AICostCutters Preflight — Warning**\n\n${result.warnings?.map((w) => `- ${w}`).join("\n") || "Potential issues detected."}\n\n${result.reasoning}\n\n_Reply to address the warnings, or type **/send-anyway** to proceed._`,
              },
              finish_reason: "stop",
            },
          ],
          aicc_preflight: result,
        },
      };

    case "block":
      return {
        status: 200,
        body: {
          id: `aicc-block-${randomUUID()}`,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: request.model,
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: `🚫 **AICostCutters Preflight — Blocked**\n\n${result.reasoning}\n\nThis request was blocked to prevent wasted tokens on a problematic prompt. Please revise and try again.`,
              },
              finish_reason: "stop",
            },
          ],
          aicc_preflight: result,
        },
      };

    case "local_only":
      return {
        status: 200,
        body: {
          id: `aicc-local-${randomUUID()}`,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: request.model,
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: `💡 **AICostCutters Preflight — Answered Locally**\n\n${result.local_answer || "I can answer this without calling the paid model."}\n\n_Estimated savings: ${result.estimated_savings?.tokens_saved || "N/A"} tokens ($${result.estimated_savings?.cost_saved_usd?.toFixed(4) || "0.00"})_\n\n_Free local answer — no API cost incurred._`,
              },
              finish_reason: "stop",
            },
          ],
          aicc_preflight: result,
        },
      };

    case "approve":
      if (REQUIRE_APPROVAL) {
        return {
          status: 200,
          body: {
            id: `aicc-approval-${randomUUID()}`,
            object: "chat.completion",
            created: Math.floor(Date.now() / 1000),
            model: request.model,
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content: "🛡️ **AICostCutters Preflight — Approved**\n\n" +
                    result.reasoning + "\n\n" +
                    "_Preflight model: " + result.metadata.preflight_model +
                    " (" + result.metadata.latency_ms + "ms)_\n" +
                    "_Estimated tokens: " + (result.estimated_savings?.tokens_saved || "N/A") +
                    " ($" + (result.estimated_savings?.cost_saved_usd?.toFixed(4) || "0.00") + " potential cost)_\n\n" +
                    "✅ Reply **/approve** to send to paid provider, or revise your prompt.",
                },
                finish_reason: "stop",
              },
            ],
            aicc_preflight: result,
            aicc_approval_required: true,
          },
        };
      }
      // Fall through to default (forward) if REQUIRE_APPROVAL is false
    case "compress":
    default:
      // Will forward to upstream — handled in main handler
      return { status: 0, body: {} };
  }
}

// ============================================================================
// Upstream forwarding
// ============================================================================

async function forwardToUpstream(
  request: ChatCompletionRequest,
  apiKey: string,
  preflightResult?: PreflightResult
): Promise<Response> {
  const upstreamKey = apiKey || UPSTREAM_API_KEY;
  if (!upstreamKey) {
    throw new Error("No upstream API key configured. Set AICC_UPSTREAM_KEY or include Authorization header.");
  }

  // Use rewritten prompt if preflight provided it
  const messages = preflightResult?.action === "rewrite" && preflightResult.rewritten_prompt
    ? [
        ...request.messages.slice(0, -1),
        { role: "user" as const, content: preflightResult.rewritten_prompt },
      ]
    : request.messages;

  // Compress messages if preflight says so
  const finalMessages = preflightResult?.action === "compress" && preflightResult.compressed_messages
    ? preflightResult.compressed_messages
    : messages;

  const body: Record<string, unknown> = {
    model: request.model,
    messages: finalMessages,
    stream: request.stream ?? false,
  };
  if (request.temperature !== undefined) body.temperature = request.temperature;
  if (request.max_tokens !== undefined) body.max_tokens = request.max_tokens;
  if (request.top_p !== undefined) body.top_p = request.top_p;

  // Add AICostCutters headers for tracking
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${upstreamKey}`,
  };
  if (request.aicc_client_id) headers["X-AICC-Client-ID"] = request.aicc_client_id;
  if (request.aicc_worker_id) headers["X-AICC-Worker-ID"] = request.aicc_worker_id;
  if (request.aicc_project_id) headers["X-AICC-Project-ID"] = request.aicc_project_id;
  if (request.aicc_session_id) headers["X-AICC-Session-ID"] = request.aicc_session_id;

  // Forward preflight result metadata
  if (preflightResult) {
    headers["X-AICC-Preflight-Action"] = preflightResult.action;
    headers["X-AICC-Preflight-Savings"] = String(preflightResult.estimated_savings?.tokens_saved || 0);
  }

  return fetch(`${UPSTREAM_URL}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

// ============================================================================
// Route handler
// ============================================================================

async function handleChatCompletions(
  req: IncomingMessage,
  res: ServerResponse
) {
  try {
    const rawBody = await readBody(req);
    const request: ChatCompletionRequest = JSON.parse(rawBody);

    // Extract client/worker/project IDs from headers
    request.aicc_client_id = req.headers["x-aicc-client-id"] as string | undefined;
    request.aicc_worker_id = req.headers["x-aicc-worker-id"] as string | undefined;
    request.aicc_project_id = req.headers["x-aicc-project-id"] as string | undefined;
    request.aicc_session_id = req.headers["x-aicc-session-id"] as string | undefined;

    // Extract API key from Authorization header
    const authHeader = req.headers["authorization"];
    const apiKey = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";

    stats.total_requests++;
    console.log(`[proxy] Request #${stats.total_requests} — model: ${request.model}`);

    // Run preflight
    const preflightResult = await runPreflight(request);

    // Update stats
    updateStats(preflightResult);
    console.log(`[proxy] Preflight: ${preflightResult.action} — ${preflightResult.reasoning.slice(0, 120)}`);

    // If preflight says to stop (clarify, rewrite, warn, block, local_only), return that
    const mapped = preflightToResponse(preflightResult, request);
    if (mapped.status > 0) {
      jsonResponse(res, mapped.body, mapped.status);
      return;
    }

    // Otherwise, forward to upstream
    const upstreamResponse = await forwardToUpstream(request, apiKey, preflightResult);

    if (request.stream && upstreamResponse.body) {
      // Stream the upstream response
      streamResponse(res, async (write) => {
        write(
          `data: ${JSON.stringify({
            id: `aicc-proxy-${randomUUID()}`,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: request.model,
            choices: [{ index: 0, delta: { content: "" }, finish_reason: null }],
            aicc_preflight: preflightResult,
          })}\n\n`
        );

        const reader = upstreamResponse.body!.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          write(decoder.decode(value, { stream: true }));
        }
        write("data: [DONE]\n\n");
      });
    } else {
      // Non-streaming response
      const upstreamBody = await upstreamResponse.json();
      // Attach preflight metadata
      (upstreamBody as any).aicc_preflight = preflightResult;
      jsonResponse(res, upstreamBody, upstreamResponse.status);
    }
  } catch (err: any) {
    console.error("[proxy] Error handling chat completions:", err);
    jsonError(res, err.message || "Internal proxy error", 500);
  }
}

function updateStats(result: PreflightResult) {
  switch (result.action) {
    case "approve": stats.approved++; break;
    case "clarify": stats.clarified++; break;
    case "rewrite": stats.rewritten++; break;
    case "warn": stats.warned++; break;
    case "block": stats.blocked++; break;
    case "local_only": stats.local_answered++; break;
    case "compress": stats.compressed++; break;
  }
  if (result.estimated_savings) {
    stats.estimated_tokens_saved += result.estimated_savings.tokens_saved;
    stats.estimated_cost_saved_usd += result.estimated_savings.cost_saved_usd;
  }
}

// ============================================================================
// Health / Stats / Models endpoints
// ============================================================================

async function handleHealth(res: ServerResponse) {
  const ollamaAvailable = await isOllamaAvailable();
  jsonResponse(res, {
    status: "ok",
    version: "0.1.0",
    ollama: ollamaAvailable ? "connected" : "unavailable",
    upstream: UPSTREAM_URL,
    stats: {
      ...stats,
      estimated_cost_saved_usd: Math.round(stats.estimated_cost_saved_usd * 10000) / 10000,
    },
  });
}

function handleModels(res: ServerResponse) {
  // Return an OpenAI-compatible models list
  // In production, this would come from the upstream provider
  jsonResponse(res, {
    object: "list",
    data: [
      {
        id: "aicc-proxy",
        object: "model",
        created: Math.floor(Date.now() / 1000),
        owned_by: "aicostcutters",
      },
    ],
  });
}

function handleStats(res: ServerResponse) {
  const total = stats.total_requests || 1; // avoid div by zero
  jsonResponse(res, {
    ...stats,
    approval_rate: Math.round((stats.approved / total) * 100),
    interception_rate: Math.round(((total - stats.approved) / total) * 100),
    estimated_cost_saved_usd: Math.round(stats.estimated_cost_saved_usd * 10000) / 10000,
  });
}

function handleSetupInfo(res: ServerResponse) {
  jsonResponse(res, {
    proxy_version: "0.1.0",
    port: PORT,
    ollama_host: OLLAMA_HOST,
    upstream_url: UPSTREAM_URL,
    setup_instructions: {
      install_ollama: "https://ollama.com",
      pull_model: "ollama pull qwen2.5-coder:3b",
      configure_provider: "Set API base URL to http://localhost:8787/v1 in your coding agent",
      environment_variables: [
        "AICC_PROXY_PORT (default: 8787)",
        "AICC_UPSTREAM_URL (default: https://api.openrouter.ai/api/v1)",
        "AICC_UPSTREAM_KEY (or set OPENROUTER_API_KEY)",
        "OLLAMA_HOST (default: http://127.0.0.1:11434)",
        "AICC_PREFLIGHT_MODEL (default: qwen2.5-coder:3b)",
      ],
    },
  });
}

// ============================================================================
// CORS preflight
// ============================================================================

function handleCors(res: ServerResponse) {
  res.writeHead(204, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-AICC-Client-ID, X-AICC-Worker-ID",
  });
  res.end();
}

// ============================================================================
// Server
// ============================================================================

async function main() {
  console.log("=".repeat(56));
  console.log("  AICostCutters Local Proxy v0.1.0");
  console.log("=".repeat(56));
  console.log(`  Port:        ${PORT}`);
  console.log(`  Ollama:      ${OLLAMA_HOST}`);
  console.log(`  Upstream:    ${UPSTREAM_URL}`);
  console.log(`  Approval:    ${REQUIRE_APPROVAL ? "REQUIRED (user must /approve)" : "auto-forward"}`);
  console.log("=".repeat(56));

  // Initialize preflight
  setOllamaHost(OLLAMA_HOST);
  const initResult = await initializePreflight();
  console.log(`  Preflight:   ${initResult.message}`);
  console.log("=".repeat(56));

  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://localhost:${PORT}`);
    const path = url.pathname;
    const method = req.method || "GET";

    // CORS
    if (method === "OPTIONS") {
      return handleCors(res);
    }

    // Routes
    switch (true) {
      case path === "/v1/chat/completions" && method === "POST":
        return handleChatCompletions(req, res);

      case path === "/health" || path === "/v1/health":
        return handleHealth(res);

      case path === "/v1/models" && method === "GET":
        return handleModels(res);

      case path === "/aicc/stats":
        return handleStats(res);

      case path === "/aicc/setup":
        return handleSetupInfo(res);

      case path === "/" || path === "":
        return jsonResponse(res, {
          service: "AICostCutters Local Proxy",
          version: "0.1.0",
          endpoints: {
            chat: "POST /v1/chat/completions",
            models: "GET /v1/models",
            health: "GET /health",
            stats: "GET /aicc/stats",
            setup: "GET /aicc/setup",
          },
        });

      default:
        return jsonError(res, `Not found: ${method} ${path}`, 404);
    }
  });

  server.listen(PORT, () => {
    console.log(`\n  ✅ Proxy listening on http://localhost:${PORT}`);
    console.log(`  📡 Chat endpoint: POST http://localhost:${PORT}/v1/chat/completions`);
    console.log(`  ❤️  Health check:  GET  http://localhost:${PORT}/health`);
    console.log(`\n  Configure your coding agent to use:`);
    console.log(`    API Base URL: http://localhost:${PORT}/v1`);
    console.log(`    API Key:      (any value — preflight is free)`);
    console.log();
  });
}

main().catch((err) => {
  console.error("Failed to start proxy:", err);
  process.exit(1);
});
