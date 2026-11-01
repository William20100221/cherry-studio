/**
 * clear_conversation core, shared by the Chat (AI-SDK) tool, the Agent (cherry-tools MCP) tool and
 * the Ctrl+L IPC route.
 *
 * Divider mode inserts the existing `data-clear` marker, the same one Ctrl+K creates. Chat history
 * is cut at the last divider on every turn; Agent runtimes resume nothing from before it. The live
 * turn already holds the old context, so the tool result tells the model to ignore it.
 *
 * Delete mode never runs from inside a turn: the tool only asks the renderer to confirm, and the
 * confirmed clear comes back through {@link clearConversationNow}, which stops the stream first.
 */

import { application } from '@application'
import { agentSessionMessageService } from '@data/services/AgentSessionMessageService'
import { messageService } from '@data/services/MessageService'
import { loggerService } from '@logger'
import { buildAgentSessionTopicId, extractAgentSessionId, isAgentSessionTopic } from '@main/ai/agentSession/topic'
import { WindowType } from '@main/core/window/types'
import type { ClearConversationOutput } from '@shared/ai/builtinTools'
import type { ClearContextMode } from '@shared/data/preference/preferenceTypes'

const logger = loggerService.withContext('clearConversation')

const CLEARED_INSTRUCTION =
  'Context cleared. Answer the rest of the current message without using anything said before it. Start your reply with one short line such as "Context cleared."'

const NOTHING_TO_CLEAR: ClearConversationOutput = {
  status: 'nothing_to_clear',
  clearedCount: 0,
  instruction: 'There was nothing before this message to clear. Tell the user in one short line, then continue.'
}

export const CLEAR_UNAVAILABLE: ClearConversationOutput = {
  status: 'unavailable',
  instruction: 'This conversation cannot be cleared from here. Tell the user to press Ctrl+K instead, then continue.'
}

export const isModelToolEnabled = (): boolean =>
  application.get('PreferenceService').get('chat.clear_context.model_tool_enabled')

const resolveMode = (mode: ClearContextMode | undefined): ClearContextMode =>
  mode ?? application.get('PreferenceService').get('chat.clear_context.default_mode')

/** Lets the renderer show an Undo toast for dividers the user did not click into place. */
function announceCleared(topicId: string, boundaryMessageId: string): void {
  application.get('IpcApiService').broadcastToType(WindowType.Main, 'ai.conversation.cleared', {
    topicId,
    boundaryMessageId
  })
}

/** Delete mode from the model: hand the decision to the user; the renderer runs the confirmed clear. */
function requestDeleteConfirmation(topicId: string, reason: string): ClearConversationOutput {
  application.get('IpcApiService').broadcastToType(WindowType.Main, 'ai.conversation.clear_requested', {
    topicId,
    reason
  })
  return {
    status: 'confirmation_pending',
    instruction:
      'Deleting needs the user to confirm in Cherry Studio; a confirmation dialog is now waiting. Tell the user in one line, then continue with anything else they asked.'
  }
}

/** Chat topic: insert the divider directly above the user message that owns this assistant reply. */
export function clearTopicContext(
  assistantMessageId: string,
  reason: string,
  mode?: ClearContextMode
): ClearConversationOutput {
  const placeholder = messageService.getById(assistantMessageId)
  if (resolveMode(mode) === 'delete') return requestDeleteConfirmation(placeholder.topicId, reason)
  if (!placeholder.parentId) return NOTHING_TO_CLEAR
  const result = messageService.insertContextBoundaryBefore(placeholder.parentId)
  if (!result) return NOTHING_TO_CLEAR
  announceCleared(placeholder.topicId, result.boundary.id)
  logger.info('Model cleared topic context', {
    userMessageId: placeholder.parentId,
    clearedCount: result.clearedCount,
    reason
  })
  return { status: 'cleared', clearedCount: result.clearedCount, instruction: CLEARED_INSTRUCTION }
}

/** Agent session: append a divider row and start a fresh runtime transcript once the session is idle. */
export function clearAgentSessionContext(
  sessionId: string,
  reason: string,
  mode?: ClearContextMode
): ClearConversationOutput {
  if (resolveMode(mode) === 'delete') return requestDeleteConfirmation(buildAgentSessionTopicId(sessionId), reason)
  const boundary = agentSessionMessageService.insertContextBoundary(sessionId)
  application.get('AgentSessionRuntimeService').scheduleContextReset(sessionId)
  announceCleared(buildAgentSessionTopicId(sessionId), boundary.id)
  logger.info('Model cleared agent session context', { sessionId, reason })
  return { status: 'cleared', instruction: CLEARED_INSTRUCTION }
}

/**
 * Ctrl+L and confirmed deletes: stop whatever is streaming on the topic, then clear. Works for chat
 * topics and agent-session topics (`agent-session:<id>`).
 */
export async function clearConversationNow(topicId: string, mode: ClearContextMode): Promise<{ deletedIds: string[] }> {
  await application.get('AiStreamManager').abortAndDrain(topicId, 'user-requested')
  if (isAgentSessionTopic(topicId)) {
    const sessionId = extractAgentSessionId(topicId)
    const result = mode === 'delete' ? agentSessionMessageService.clearSessionMessages(sessionId) : { deletedIds: [] }
    // Agent dividers are not clickable, so the Undo toast is their only undo.
    if (mode === 'divider') announceCleared(topicId, agentSessionMessageService.insertContextBoundary(sessionId).id)
    application.get('AgentSessionRuntimeService').scheduleContextReset(sessionId)
    return result
  }
  if (mode === 'delete') return messageService.clearTopicMessages(topicId)
  messageService.appendContextBoundary(topicId)
  return { deletedIds: [] }
}

/** Remove a divider a clear inserted. Chat: the message below re-links to the row above (existing toggle). */
export function undoClear(topicId: string, boundaryMessageId: string): void {
  if (isAgentSessionTopic(topicId)) {
    agentSessionMessageService.deleteSessionMessage(extractAgentSessionId(topicId), boundaryMessageId)
    return
  }
  messageService.delete(boundaryMessageId, false)
}
