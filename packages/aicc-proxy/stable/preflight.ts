// ============================================================================
// AICostCutters — Preflight Prompt Check
//
// Runs prompts through a local Ollama model to evaluate quality before
// forwarding to paid providers. Checks for:
//   - Clarity: is the prompt clear and actionable?
//   - Conflicts: are there internal contradictions?
//   - Simplicity: can this be answered locally?
//   - Compression: can context be reduced?
// ============================================================================

import { generate, chat, hasModel, isOllamaAvailable, pullModel } from "./ollama.js";
import type {
  ChatCompletionRequest,
  ChatMessage,
  PreflightAction,
  PreflightResult,
} from "./types.js";

const PREFLIGHT_SYSTEM_PROMPT = `You evaluate coding prompts for a paid AI assistant.

YOUR JOB: Output ONE JSON object. No markdown. No code fences.

Format: {"action":"approve","reasoning":"reason"}

Actions (use APPROVE as default):
- approve: Prompt is fine, send to paid model (DEFAULT — use unless there's a real problem)
- clarify: Missing critical info (ask a specific question)
- warn: Has issues but send anyway (list concerns in warnings array)
- block: ONLY for contradictory/impossible requests (e.g. "remove auth but keep login")
- local_only: Trivial question a small model can answer
- rewrite: Improve clarity, then approve

CRITICAL RULES:
1. Coding requests (functions, code, debugging, algorithms) → APPROVE. Don't overthink.
2. Vague prompts like "make it better" → CLARIFY, not block
3. Only BLOCK when request is IMPOSSIBLE or SELF-CONTRADICTORY
4. Context like "in Python" or "for React" makes a prompt specific enough → APPROVE

Examples:
Clear coding: {"action":"approve","reasoning":"Clear coding request with specific requirements."}
Vague: {"action":"clarify","reasoning":"Prompt is vague","clarification_question":"What specifically needs to be improved?"}
Conflict: {"action":"block","reasoning":"Request contradicts itself — cannot remove auth but keep login."}
Simple Q: {"action":"local_only","reasoning":"Basic question","local_answer":"git status shows current state of working directory and staging area.","estimated_tokens_saved":200}

OUTPUT ONLY THE JSON.`;

const DEFAULT_PREFLIGHT_MODEL = "qwen2.5-coder:3b";

// Fallback models to try if primary isn't available
const FALLBACK_MODELS = [
  "qwen2.5-coder:3b",
  "qwen2.5-coder:1.5b",
  "phi3:mini",
  "gemma3:4b",
  "llama3.2:3b",
  "deepseek-coder:6.7b",
];

let preflightModel = process.env.AICC_PREFLIGHT_MODEL || DEFAULT_PREFLIGHT_MODEL;

export function setPreflightModel(model: string) {
  preflightModel = model;
}

/**
 * Extract the user's actual prompt from the chat messages.
 * Focuses on the last user message (the one triggering the agent).
 */
function extractUserPrompt(messages: ChatMessage[]): string {
  // Get the last user message
  const userMessages = messages.filter((m) => m.role === "user");
  const lastUser = userMessages[userMessages.length - 1];
  if (!lastUser) return "";

  if (typeof lastUser.content === "string") return lastUser.content;

  // It's an array of content parts — extract text parts
  return lastUser.content
    .filter((c) => c.type === "text")
    .map((c) => (c as { text: string }).text)
    .join("\n");
}

/**
 * Estimate token count in message array
 */
function estimateTokens(messages: ChatMessage[]): number {
  let count = 0;
  for (const msg of messages) {
    const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
    count += Math.ceil(content.length / 4); // rough: ~4 chars per token
  }
  return count;
}

/**
 * Score a prompt for urgency/importance indicators
 */
function scorePromptUrgency(prompt: string): number {
  const urgentWords = [
    "urgent", "asap", "critical", "broken", "down", "crash", "bug",
    "fix", "error", "failing", "production", "deploy", "security",
  ];
  const lower = prompt.toLowerCase();
  return urgentWords.filter((w) => lower.includes(w)).length;
}

/**
 * Build the preflight evaluation prompt
 */
function buildPreflightPrompt(
  userPrompt: string,
  roleMessages: ChatMessage[],
  tokenCount: number
): string {
  const roleSummary = roleMessages.map((m) => `[${m.role}]: ${typeof m.content === "string" ? m.content.slice(0, 100) : "..."} `).join("\n");

  return `EVALUATE THIS PROMPT FOR PAID AI MODEL USAGE:

CONTEXT:
- Total messages in conversation: ${roleMessages.length + 1}
- Estimated tokens in full context: ${tokenCount}
- Number of system/role messages: ${roleMessages.length}
- Urgency indicators: ${scorePromptUrgency(userPrompt)}

USER'S PROMPT TO EVALUATE:
"""
${userPrompt}
"""

ROLE/CONTEXT MESSAGES (summarized):
${roleSummary.slice(0, 2000)}

EVALUATE the prompt and return your JSON decision. Remember: you are NOT answering the prompt — you are only evaluating its quality for paid model usage.`;
}

/**
 * Parse the preflight response from Ollama into a structured result
 */
function parsePreflightResponse(raw: string, latencyMs: number): PreflightResult | null {
  // Try to extract JSON from the response
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    // If no JSON found, default to approve
    return {
      action: "approve",
      reasoning: "Preflight model returned non-JSON response — defaulting to approve",
      metadata: {
        preflight_model: preflightModel,
        latency_ms: latencyMs,
        timestamp: Date.now(),
      },
    };
  }

  try {
    let parsed = JSON.parse(jsonMatch[0]);
    
    // Handle nested responses (some models nest the result)
    // Try common nested keys
    for (const key of ["evaluation", "result", "analysis", "response"]) {
      if (parsed[key] && typeof parsed[key] === "object") {
        parsed = parsed[key];
      }
    }
    
    // Extract action from various possible fields
    let action = validateAction(parsed.action);
    if (!action && parsed.decision) action = validateAction(parsed.decision);
    if (!action) {
      // No valid action found — default to approve
      return {
        action: "approve",
        reasoning: `Preflight model returned unrecognized format — defaulting to approve. Raw: ${raw.slice(0, 150)}`,
        metadata: { preflight_model: preflightModel, latency_ms: latencyMs, timestamp: Date.now() },
      };
    }

    return {
      action,
      reasoning: parsed.reasoning || "No reasoning provided",
      clarification_question: parsed.clarification_question,
      rewritten_prompt: parsed.rewritten_prompt,
      local_answer: parsed.local_answer,
      warnings: parsed.warnings,
      estimated_savings: parsed.estimated_tokens_saved
        ? {
            tokens_saved: parsed.estimated_tokens_saved,
            cost_saved_usd: estimateCostUsd(parsed.estimated_tokens_saved),
          }
        : undefined,
      metadata: {
        preflight_model: preflightModel,
        latency_ms: latencyMs,
        timestamp: Date.now(),
      },
    };
  } catch (err) {
    console.warn("Failed to parse preflight response:", err);
    return {
      action: "approve",
      reasoning: `Failed to parse preflight response: ${err}. Raw: ${raw.slice(0, 200)}`,
      metadata: {
        preflight_model: preflightModel,
        latency_ms: latencyMs,
        timestamp: Date.now(),
      },
    };
  }
}

function validateAction(a: unknown): PreflightAction | null {
  const validActions: PreflightAction[] = [
    "approve", "clarify", "rewrite", "warn", "block", "local_only", "compress",
  ];
  return validActions.includes(a as PreflightAction) ? (a as PreflightAction) : null;
}

function estimateCostUsd(tokens: number): number {
  // Rough estimate: $2 per million tokens (Claude Sonnet pricing)
  return Math.round((tokens / 1_000_000) * 2 * 1000) / 1000;
}

/**
 * Ensure a preflight model is available. Tries primary, then fallbacks.
 * Returns the model name actually available, or null if none is.
 */
async function ensureModel(): Promise<string | null> {
  // Try the configured model first
  if (await hasModel(preflightModel)) {
    return preflightModel;
  }

  // Try fallbacks
  for (const fallback of FALLBACK_MODELS) {
    if (fallback === preflightModel) continue; // skip if same
    if (await hasModel(fallback)) {
      console.log(`[preflight] Primary model ${preflightModel} not found, using fallback: ${fallback}`);
      return fallback;
    }
  }

  return null;
}

/**
 * Run the preflight check on a prompt
 */
export async function runPreflight(
  request: ChatCompletionRequest
): Promise<PreflightResult> {
  const startTime = Date.now();

  // Check if Ollama is available
  const ollamaAvailable = await isOllamaAvailable();
  if (!ollamaAvailable) {
    return {
      action: "approve",
      reasoning: "Ollama not available — bypassing preflight. Install Ollama for cost savings.",
      warnings: ["Ollama is not running. Install Ollama to enable preflight cost checks."],
      metadata: {
        preflight_model: "none",
        latency_ms: Date.now() - startTime,
        timestamp: Date.now(),
      },
    };
  }

  // Ensure a model is available
  const model = await ensureModel();
  if (!model) {
    return {
      action: "approve",
      reasoning: "No preflight model available. Pull one: qwen2.5-coder:3b, phi3:mini, or gemma3:4b",
      warnings: [`No model found. Run: ollama pull ${preflightModel}`],
      metadata: {
        preflight_model: "none",
        latency_ms: Date.now() - startTime,
        timestamp: Date.now(),
      },
    };
  }

  const userPrompt = extractUserPrompt(request.messages);
  const roleMessages = request.messages.filter((m) => m.role !== "user");
  const tokenCount = estimateTokens(request.messages);

  // If the prompt is very short and simple, fast-path approve
  if (userPrompt.length < 20) {
    return {
      action: "approve",
      reasoning: "Prompt too short for meaningful preflight — fast-path approve",
      metadata: {
        preflight_model: model,
        latency_ms: Date.now() - startTime,
        timestamp: Date.now(),
      },
    };
  }

  const preflightPrompt = buildPreflightPrompt(userPrompt, roleMessages, tokenCount);

  try {
    // Use chat API for better format adherence
    const response = await chat({
      model,
      messages: [
        { role: "system", content: PREFLIGHT_SYSTEM_PROMPT },
        { role: "user", content: preflightPrompt },
      ],
      stream: false,
      options: {
        temperature: 0.1,
        num_predict: 256,
      },
    });

    // Debug: log full raw response for tuning
    console.log("[preflight] Raw model response:", response.message.content.slice(0, 400));

    const result = parsePreflightResponse(
      response.message.content,
      Date.now() - startTime
    );

    if (result) {
      result.metadata.preflight_model = model;
      return result;
    }
  } catch (err) {
    console.error("[preflight] Ollama generation failed:", err);
  }

  // Fallback: approve if preflight fails
  return {
    action: "approve",
    reasoning: "Preflight check failed — approving to avoid blocking user",
    metadata: {
      preflight_model: model,
      latency_ms: Date.now() - startTime,
      timestamp: Date.now(),
    },
  };
}

/**
 * Initialize preflight — optionally pull a model
 */
export async function initializePreflight(): Promise<{
  ready: boolean;
  model: string | null;
  message: string;
}> {
  const available = await isOllamaAvailable();
  if (!available) {
    return {
      ready: false,
      model: null,
      message: "Ollama not available. Install from https://ollama.com for preflight checks.",
    };
  }

  const model = await ensureModel();
  if (model) {
    return {
      ready: true,
      model,
      message: `Preflight ready with model: ${model}`,
    };
  }

  // Try to pull the default model
  console.log(`[preflight] Pulling default model: ${preflightModel}`);
  const pulled = await pullModel(preflightModel, (status) => {
    if (status.includes("pulling") || status.includes("verifying")) {
      console.log(`[preflight] ${status}`);
    }
  });

  if (pulled) {
    return {
      ready: true,
      model: preflightModel,
      message: `Preflight ready with model: ${preflightModel}`,
    };
  }

  return {
    ready: false,
    model: null,
    message: `Could not pull model ${preflightModel}. Run 'ollama pull ${preflightModel}' manually.`,
  };
}

// Export for testing
export { extractUserPrompt, estimateTokens };
