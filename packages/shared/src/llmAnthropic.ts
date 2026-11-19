import Anthropic from '@anthropic-ai/sdk';
import type { LlmClient } from './llm';

/**
 * Anthropic の Messages API で LlmClient を作る（F-117）。
 * 呼び出し側で isLlmAvailable（有効・予算 > 0・モデル・API キー）を確認してから作る。
 */
export function createAnthropicLlmClient({ apiKey, model, client }: { apiKey: string; model: string; client?: Anthropic }): LlmClient {
  const anthropic = client ?? new Anthropic({ apiKey });
  return {
    async complete(req) {
      const response = await anthropic.messages.create({
        model,
        max_tokens: req.maxTokens,
        system: req.system,
        messages: [{ role: 'user', content: req.user }],
      });
      const tokensIn = response.usage.input_tokens + (response.usage.cache_creation_input_tokens ?? 0) + (response.usage.cache_read_input_tokens ?? 0);
      const tokensOut = response.usage.output_tokens;
      // 拒否・途中で打ち切られた応答は使わない（使用量は記録する）
      if (response.stop_reason !== 'end_turn') return { text: null, tokensIn, tokensOut };
      const text = response.content
        .flatMap((block) => (block.type === 'text' ? [block.text] : []))
        .join('')
        .trim();
      return { text: text || null, tokensIn, tokensOut };
    },
  };
}
