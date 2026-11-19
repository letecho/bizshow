import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import { createAnthropicLlmClient } from './llmAnthropic';

function fakeClient(response: unknown) {
  const create = vi.fn().mockResolvedValue(response);
  return { client: { messages: { create } } as unknown as Anthropic, create };
}

const usage = { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 2, cache_read_input_tokens: 3 };

describe('createAnthropicLlmClient (F-117)', () => {
  it('sends the system prompt and data separately and returns text with token counts', async () => {
    const { client, create } = fakeClient({ stop_reason: 'end_turn', usage, content: [{ type: 'text', text: ' {"a":1} ' }] });
    const llm = createAnthropicLlmClient({ apiKey: 'dummy', model: 'test-model', client });
    const res = await llm.complete({ purpose: 'extract', system: 'SYS', user: '<page>x</page>', maxTokens: 100 });
    expect(res).toEqual({ text: '{"a":1}', tokensIn: 15, tokensOut: 5 });
    expect(create).toHaveBeenCalledWith({
      model: 'test-model',
      max_tokens: 100,
      system: 'SYS',
      messages: [{ role: 'user', content: '<page>x</page>' }],
    });
  });

  it('returns no text for refusals and truncated responses but keeps the usage', async () => {
    for (const stop_reason of ['refusal', 'max_tokens']) {
      const { client } = fakeClient({ stop_reason, usage, content: [{ type: 'text', text: '{}' }] });
      const res = await createAnthropicLlmClient({ apiKey: 'dummy', model: 'm', client }).complete({ purpose: 'extract', system: '', user: '', maxTokens: 1 });
      expect(res).toEqual({ text: null, tokensIn: 15, tokensOut: 5 });
    }
  });
});
