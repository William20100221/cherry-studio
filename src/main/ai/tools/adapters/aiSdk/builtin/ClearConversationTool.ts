/**
 * clear_conversation — Chat (AI-SDK) wrapper. The divider logic lives in the shared
 * `clearConversation` core so the Agent MCP tool runs the same code.
 */

import { tool } from 'ai'

import { loggerService } from '@logger'
import {
  CLEAR_CONVERSATION_DESCRIPTION,
  CLEAR_CONVERSATION_TOOL_NAME,
  clearConversationInputSchema,
  clearConversationOutputSchema
} from '@shared/ai/builtinTools'

import { CLEAR_UNAVAILABLE, clearTopicContext, isModelToolEnabled } from '../../../clearConversation'
import { getToolCallContext } from '../context'
import type { ToolEntry } from '../types'

const logger = loggerService.withContext('ClearConversationTool')

const clearConversationTool = tool({
  description: CLEAR_CONVERSATION_DESCRIPTION,
  inputSchema: clearConversationInputSchema,
  outputSchema: clearConversationOutputSchema,
  execute: async ({ reason, mode }, options) => {
    const { messageId } = getToolCallContext(options).request
    if (!messageId) return CLEAR_UNAVAILABLE
    try {
      return clearTopicContext(messageId, reason, mode)
    } catch (error) {
      // Temporary chats and synthetic requests have no persisted message tree to divide.
      logger.warn('clear_conversation could not clear this conversation', { messageId, error })
      return CLEAR_UNAVAILABLE
    }
  }
})

export function createClearConversationToolEntry(): ToolEntry {
  return {
    name: CLEAR_CONVERSATION_TOOL_NAME,
    namespace: 'conversation',
    description: 'Reset the conversation context when the user explicitly asks',
    // Deferred tools are invisible until tool_search; a clear request must be callable directly.
    defer: 'never',
    tool: clearConversationTool,
    applies: (scope) => Boolean(scope.assistant) && isModelToolEnabled()
  }
}
