/**
 * clear_conversation core, shared by the Chat (AI-SDK) tool and the Agent (cherry-tools MCP) tool.
 *
 * Both insert the existing `data-clear` divider, the same marker Ctrl+K creates. Chat history is
 * cut at the last divider on every turn; Agent runtimes resume nothing from before it. The live
 * turn already holds the old context, so the tool result tells the model to ignore it.
 */

import { application } from '@application'
import { agentSessionMessageService } from '@data/services/AgentSessionMessageService'
import { messageService } from '@data/services/MessageService'
import { loggerService } from '@logger'
import type { ClearConversationOutput } from '@shared/ai/builtinTools'

const logger = loggerService.withContext('clearConversation')

const CLEARED_INSTRUCTION =
  'Context cleared. Answer the rest of the current message without using anything said before it. Start your reply with one short line such as "Context cleared."'

const NOTHING_TO_CLEAR: ClearConversationOutput = {
  status: 'nothing_to_clear',
  clearedCount: 0,
  instruction: 'There was nothing before this message to clear. Tell the user in one short line, then continue.'
}

/** Chat topic: insert the divider directly above the user message that owns this assistant reply. */
export function clearTopicContext(assistantMessageId: string, reason: string): ClearConversationOutput {
  const userMessageId = messageService.getById(assistantMessageId).parentId
  if (!userMessageId) return NOTHING_TO_CLEAR
  const result = messageService.insertContextBoundaryBefore(userMessageId)
  if (!result) return NOTHING_TO_CLEAR
  logger.info('Model cleared topic context', { userMessageId, clearedCount: result.clearedCount, reason })
  return { status: 'cleared', clearedCount: result.clearedCount, instruction: CLEARED_INSTRUCTION }
}

/** Agent session: append a divider row and start a fresh runtime transcript once the session is idle. */
export function clearAgentSessionContext(sessionId: string, reason: string): ClearConversationOutput {
  agentSessionMessageService.insertContextBoundary(sessionId)
  application.get('AgentSessionRuntimeService').scheduleContextReset(sessionId)
  logger.info('Model cleared agent session context', { sessionId, reason })
  return { status: 'cleared', instruction: CLEARED_INSTRUCTION }
}

export const CLEAR_UNAVAILABLE: ClearConversationOutput = {
  status: 'unavailable',
  instruction: 'This conversation cannot be cleared from here. Tell the user to press Ctrl+K instead, then continue.'
}
