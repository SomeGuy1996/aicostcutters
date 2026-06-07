// ============================================================================
// Ollama Chat API (better format adherence than raw generate)
// ============================================================================

export interface OllamaChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OllamaChatRequest {
  model: string;
  messages: OllamaChatMessage[];
  stream: boolean;
  options?: {
    temperature?: number;
    num_predict?: number;
  };
}

export interface OllamaChatResponse {
  model: string;
  message: { role: string; content: string };
  done: boolean;
  total_duration?: number;
}

export async function chat(
  request: OllamaChatRequest
): Promise<OllamaChatResponse> {
  const res = await fetch(`${ollamaHost}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...request, stream: false }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Ollama chat failed: ${res.status}`);
  return res.json() as Promise<OllamaChatResponse>;
}

import type {
  OllamaGenerateRequest,
  OllamaGenerateResponse,
  OllamaTagsResponse,
} from "./types.js";

const DEFAULT_OLLAMA_HOST = "http://127.0.0.1:11434";
const REQUEST_TIMEOUT_MS = 30_000;

let ollamaHost = process.env.OLLAMA_HOST || DEFAULT_OLLAMA_HOST;

export function setOllamaHost(host: string) {
  ollamaHost = host;
}

/**
 * Check if Ollama is running and accessible
 */
export async function isOllamaAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${ollamaHost}/api/tags`, {
      signal: AbortSignal.timeout(5_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * List available models
 */
export async function listModels(): Promise<OllamaTagsResponse> {
  const res = await fetch(`${ollamaHost}/api/tags`);
  if (!res.ok) throw new Error(`Ollama /api/tags failed: ${res.status}`);
  return res.json() as Promise<OllamaTagsResponse>;
}

/**
 * Check if a specific model is available locally
 */
export async function hasModel(modelName: string): Promise<boolean> {
  try {
    const { models } = await listModels();
    return models.some((m) => m.name.startsWith(modelName));
  } catch {
    return false;
  }
}

/**
 * Generate text using Ollama
 */
export async function generate(
  request: OllamaGenerateRequest
): Promise<OllamaGenerateResponse> {
  const res = await fetch(`${ollamaHost}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...request, stream: false }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Ollama generate failed: ${res.status}`);
  return res.json() as Promise<OllamaGenerateResponse>;
}

/**
 * Pull a model from Ollama (async, may take minutes)
 */
export async function pullModel(
  modelName: string,
  onProgress?: (status: string) => void
): Promise<boolean> {
  try {
    const res = await fetch(`${ollamaHost}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: modelName, stream: false }),
    });
    if (res.ok) {
      onProgress?.(`Model ${modelName} pulled successfully`);
      return true;
    }
    // Stream progress
    onProgress?.(`Pulling ${modelName}...`);
    const streamRes = await fetch(`${ollamaHost}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: modelName, stream: true }),
    });
    if (!streamRes.ok || !streamRes.body) return false;

    const reader = streamRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);
          if (data.status) onProgress?.(data.status);
        } catch {}
      }
    }
    return true;
  } catch (err) {
    console.error(`Failed to pull model ${modelName}:`, err);
    return false;
  }
}
