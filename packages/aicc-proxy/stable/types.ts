// ============================================================================
// AICostCutters Proxy Types
// ============================================================================

// OpenAI-compatible request/response types
export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | Array<TextContent | ImageContent>;
  name?: string;
}

interface TextContent {
  type: "text";
  text: string;
}

interface ImageContent {
  type: "image_url";
  image_url: { url: string };
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stop?: string[];
  // AICostCutters extension fields
  aicc_client_id?: string;
  aicc_worker_id?: string;
  aicc_project_id?: string;
  aicc_session_id?: string;
}

export interface ChatCompletionChoice {
  index: number;
  message: { role: string; content: string };
  finish_reason: string;
}

export interface ChatCompletionResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage?: Usage;
  // AICostCutters extension
  aicc_preflight?: PreflightResult;
}

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

// Preflight result types
export type PreflightAction =
  | "approve"           // Good to send to paid model
  | "clarify"           // Need clarification from user
  | "rewrite"           // Rewritten clearer prompt
  | "warn"              // Warn about potential issues
  | "block"             // Block — cannot proceed
  | "local_only"        // Answer locally, no paid model needed
  | "compress";         // Compressed context, then send

export interface PreflightResult {
  action: PreflightAction;
  reasoning: string;         // Why this decision
  clarification_question?: string;  // If "clarify"
  rewritten_prompt?: string;        // If "rewrite"
  compressed_messages?: ChatMessage[];  // If "compress"
  local_answer?: string;             // If "local_only"
  warnings?: string[];               // If "warn"
  estimated_savings?: {
    tokens_saved: number;
    cost_saved_usd: number;
  };
  metadata: {
    preflight_model: string;
    latency_ms: number;
    timestamp: number;
  };
}

// Ollama types
export interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  stream: boolean;
  options?: {
    temperature?: number;
    num_predict?: number;
    top_p?: number;
  };
}

export interface OllamaGenerateResponse {
  model: string;
  response: string;
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

export interface OllamaTagsResponse {
  models: Array<{
    name: string;
    modified_at: string;
    size: number;
  }>;
}

// Proxy config
export interface ProxyConfig {
  port: number;
  ollama: {
    host: string;
    preflight_model: string;
    fallback_model: string;
  };
  gateway: {
    url: string;
    api_key_env: string;
  };
  ui: {
    show_preflight_status: boolean;
    show_token_savings: boolean;
    allow_send_anyway: boolean;
  };
}
