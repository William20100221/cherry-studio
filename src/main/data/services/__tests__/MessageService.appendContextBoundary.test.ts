import { setupTestDatabase, withRoot } from '@test-helpers/db'
import { beforeEach, describe, expect, it } from 'vitest'

import '@data/services/TopicService'
import { messageTable } from '@data/db/schemas/message'
import { topicTable } from '@data/db/schemas/topic'
import { messageService } from '@data/services/MessageService'
import type { MessageData } from '@shared/data/types/message'
import { hasClearContextPart } from '@shared/data/types/uiParts'

const TOPIC = 'topic-ctrl-l'

function row(id: string, parentId: string | null, role: 'user' | 'assistant', createdAt: number) {
  return {
    id,
    parentId,
    topicId: TOPIC,
    role,
    data: { parts: [{ type: 'text', text: id }] } as MessageData,
    status: 'success' as const,
    siblingsGroupId: 0,
    createdAt,
    updatedAt: createdAt
  }
}

describe('appendContextBoundary (Ctrl+L divider mode)', () => {
  const dbh = setupTestDatabase()

  beforeEach(async () => {
    await dbh.db.insert(topicTable).values({ id: TOPIC, activeNodeId: 'a1', orderKey: 'a0' })
    await dbh.db
      .insert(messageTable)
      .values(withRoot(TOPIC, [row('u1', null, 'user', 100), row('a1', 'u1', 'assistant', 200)]))
  })

  it('hangs a divider under the active reply so the next turn starts fresh', () => {
    const boundary = messageService.appendContextBoundary(TOPIC)

    expect(boundary?.parentId).toBe('a1')
    expect(hasClearContextPart(boundary?.data.parts)).toBe(true)
    expect(messageService.getPathToNode(boundary!.id).map((m) => m.id)).toEqual(['u1', 'a1', boundary!.id])
  })

  it('does not stack a second divider on the first', () => {
    messageService.appendContextBoundary(TOPIC)
    expect(messageService.appendContextBoundary(TOPIC)).toBeNull()
  })
})
