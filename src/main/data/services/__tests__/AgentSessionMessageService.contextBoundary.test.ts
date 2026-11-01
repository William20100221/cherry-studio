import { setupTestDatabase } from '@test-helpers/db'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { agentSessionTable } from '@data/db/schemas/agentSession'
import { agentSessionMessageTable } from '@data/db/schemas/agentSessionMessage'
import { agentWorkspaceTable } from '@data/db/schemas/agentWorkspace'
import { agentSessionMessageService } from '@data/services/AgentSessionMessageService'

const SESSION = 'session-cb'

describe('agent session context boundary', () => {
  const dbh = setupTestDatabase()

  async function seedRow(id: string, createdAt: number, token: string | null, nativeSessionId?: string) {
    await dbh.db.insert(agentSessionMessageTable).values({
      id,
      sessionId: SESSION,
      role: 'assistant',
      status: 'success',
      data: { parts: [{ type: 'text', text: id }], ...(nativeSessionId ? { nativeSessionId } : {}) },
      runtimeResumeToken: token,
      createdAt,
      updatedAt: createdAt
    })
  }

  beforeEach(async () => {
    await dbh.db
      .insert(agentWorkspaceTable)
      .values({ id: 'ws', name: 'ws', path: '/tmp/ws', type: 'user', orderKey: 'w0' })
    await dbh.db.insert(agentSessionTable).values({
      id: SESSION,
      name: 'S',
      orderKey: 'a0',
      workspaceId: 'ws',
      createdAt: 0,
      lastActivityAt: 0,
      updatedAt: 0
    })
    await seedRow('018f6ed6-73b8-7f40-8d0d-9bb2f8f1e001', 100, 'old-token', 'old-native')
  })

  it('stops the next connection from resuming the transcript before the divider', () => {
    agentSessionMessageService.insertContextBoundary(SESSION)

    expect(agentSessionMessageService.getLastRuntimeResumeToken(SESSION)).toBeNull()
    expect(agentSessionMessageService.getNativeSessionId(SESSION)).toBeUndefined()
  })

  it('resumes the fresh transcript written after the divider', async () => {
    agentSessionMessageService.insertContextBoundary(SESSION)
    await seedRow('018f6ed6-73b8-7f40-8d0d-9bb2f8f1e002', Date.now() + 1000, 'new-token', 'new-native')

    expect(agentSessionMessageService.getLastRuntimeResumeToken(SESSION)).toBe('new-token')
    expect(agentSessionMessageService.getNativeSessionId(SESSION)).toBe('new-native')
  })

  it('does not stack a second divider on the first', () => {
    const first = agentSessionMessageService.insertContextBoundary(SESSION)
    expect(agentSessionMessageService.insertContextBoundary(SESSION).id).toBe(first.id)
  })

  it('restores the old transcript when the divider row is removed', async () => {
    const boundary = agentSessionMessageService.insertContextBoundary(SESSION)
    await dbh.db.delete(agentSessionMessageTable).where(eq(agentSessionMessageTable.id, boundary.id))

    expect(agentSessionMessageService.getLastRuntimeResumeToken(SESSION)).toBe('old-token')
  })
})
