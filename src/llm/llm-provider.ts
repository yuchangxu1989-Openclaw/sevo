/**
 * Lightweight LLM provider using OpenAI-compatible chat completions API.
 *
 * Configuration priority:
 *   1. Environment variables: OPENAI_API_KEY + OPENAI_BASE_URL
 *   2. Explicit config passed to constructor
 *
 * Uses Node 22 native fetch — no external dependencies.
 */

export interface LLMProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionResponse {
  choices: Array<{
    message: { content: string };
  }>;
}

export class LLMProvider {
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(config?: LLMProviderConfig) {
    this.apiKey = config?.apiKey ?? process.env.OPENAI_API_KEY ?? '';
    this.baseUrl = (config?.baseUrl ?? process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1')
      .replace(/\/+$/, '');
    this.model = config?.model ?? process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
  }

  /**
   * Send a chat completion request and return the assistant's text response.
   */
  async chat(messages: ChatMessage[]): Promise<string> {
    const url = `${this.baseUrl}/chat/completions`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: 0,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`LLM request failed (${response.status}): ${body}`);
    }

    const data = (await response.json()) as ChatCompletionResponse;
    return data.choices[0]?.message?.content ?? '';
  }
}
