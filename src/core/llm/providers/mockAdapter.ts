import type { ReasoningLevel } from '@agent/types'
import type { LlmChatMessage, LlmStreamEvent, LlmStreamRequest } from '../client'
import { assertNotCancelled, sleep } from '../cancellation'
import type { ProviderAdapter } from './types'

export class MockProviderAdapter implements ProviderAdapter {
  async *streamChat(request: LlmStreamRequest): AsyncGenerator<LlmStreamEvent> {
    const userPrompt = getLastUserMessage(request.messages)
    const responseText = buildMockResponse(userPrompt, request.model, request.reasoningLevel)
    const tokens = tokenizeForStreaming(responseText)

    for (const token of tokens) {
      assertNotCancelled(request.signal)
      await sleep(15, request.signal)
      yield { type: 'text-delta', delta: token }
    }

    assertNotCancelled(request.signal)
    yield { type: 'done', finishReason: 'stop' }
  }
}

function getLastUserMessage(messages: LlmChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i]
    if (message?.role === 'user') {
      return message.content
    }
  }
  return ''
}

function buildMockResponse(userPrompt: string, model: string, reasoningLevel: ReasoningLevel): string {
  if (!userPrompt.trim()) {
    return `[mock:${model}|reasoning:${reasoningLevel}] Ready. Please send a prompt.`
  }
  return `[mock:${model}|reasoning:${reasoningLevel}] ${userPrompt}`
}

function tokenizeForStreaming(text: string): string[] {
  const rawTokens = text.split(' ')
  const chunks: string[] = []

  for (let i = 0; i < rawTokens.length; i += 1) {
    const token = rawTokens[i]
    if (token === undefined) {
      continue
    }
    const isLast = i === rawTokens.length - 1
    chunks.push(isLast ? token : `${token} `)
  }

  return chunks
}
