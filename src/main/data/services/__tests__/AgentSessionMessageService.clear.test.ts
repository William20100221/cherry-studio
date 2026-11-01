import { setupTestDatabase } from '@test-helpers/db'
import { beforeEach, describe, expect, it } from 'vitest'

import { agentSessionTable } from '@data/db/schemas/agentSession'
import { agentSessionMessageTable } from '@data/db/schemas/agentSessionMessage'
import { agentWorkspaceTable } from '@data/db/schemas/agentWorkspace'
import { agentSessionMessageService } from '@data/services/AgentSessionMessageService'

const SESSION = 'session-clear'
const OTHER = 'session-other'

describe('clearSessionMessages (Ctrl+L delete mode)', () => {
  const dbh = setupTestDatabase()

  beforeEach(async () => {
    await dbh.db
      .insert(agentWorkspaceTable)
      .values({ id: 'ws', name: 'ws', path: '/tmp/ws', type: 'user', orderKey: 'w0' })
    for (const [id, orderKey] of [
      [SESSION, 'a0'],
      [OTHER, 'a1']
    ]) {
      await dbh.db
        .insert(agentSessionTable)
        .values({ id, name: id, orderKey, workspaceId: 'ws', createdAt: 0, lastActivityAt: 0, updatedAt: 0 })
    }
    for (const [id, sessionId] of [
      ['018f6ed6-73b8-7f40-8d0d-9bb2f8f1f001', SESSION],
      ['018f6ed6-73b8-7f40-8d0d-9bb2f8f1f002', SESSION],
      ['018f6ed6-73b8-7f40-8d0d-9bb2f8f1f003', OTHER]
    ]) {
      await dbh.db.insert(agentSessionMessageTable).values({
        id,
        sessionId,
        role: 'user',
        status: 'success',
        data: { parts: [{ type: 'text', text: id }] },
        runtimeResumeToken: 'token',
        createdAt: 1,
        updatedAt: 1
      })
    }
  })

  it('removes only the given session, so the next connection resumes nothing', () => {
    const { deletedIds } = agentSessionMessageService.clearSessionMessages(SESSION)

    expect(deletedIds).toHaveLength(2)
    expect(agentSessionMessageService.hasSessionMessages(SESSION)).toBe(false)
    expect(agentSessionMessageService.getLastRuntimeResumeToken(SESSION)).toBeNull()
    expect(agentSessionMessageService.hasSessionMessages(OTHER)).toBe(true)
  })
})
