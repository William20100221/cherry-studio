import { setupTestDatabase, withRoot } from '@test-helpers/db'
import { beforeEach, describe, expect, it } from 'vitest'

import '@data/services/TopicService'
import { messageTable } from '@data/db/schemas/message'
import { topicTable } from '@data/db/schemas/topic'
import { messageService } from '@data/services/MessageService'
import type { MessageData } from '@shared/data/types/message'
import { hasClearContextPart } from '@shared/data/types/uiParts'

const TOPIC = 'topic-b'

function text(content: string): MessageData {
  return { parts: [{ type: 'text', text: content }] }
}

function row(id: string, parentId: string | null, role: 'user' | 'assistant', createdAt: number) {
  return {
    id,
    parentId,
    topicId: TOPIC,
    role,
    data: text(id),
    status: 'success' as const,
    siblingsGroupId: 0,
    createdAt,
    updatedAt: createdAt
  }
}

const pathIds = (leafId: string) => messageService.getPathToNode(leafId).map((m) => m.id)

describe('insertContextBoundaryBefore', () => {
  const dbh = setupTestDatabase()

  beforeEach(async () => {
    // u1 → a1 → u2 → a2, where a2 is the reply streaming while the tool runs.
    await dbh.db.insert(topicTable).values({ id: TOPIC, activeNodeId: 'a2', orderKey: 'a0' })
    await dbh.db
      .insert(messageTable)
      .values(
        withRoot(TOPIC, [
          row('u1', null, 'user', 100),
          row('a1', 'u1', 'assistant', 200),
          row('u2', 'a1', 'user', 300),
          row('a2', 'u2', 'assistant', 400)
        ])
      )
  })

  it('puts a divider between the earlier turns and the asking message', () => {
    const result = messageService.insertContextBoundaryBefore('u2')

    expect(result?.clearedCount).toBe(2)
    expect(hasClearContextPart(result?.boundary.data.parts)).toBe(true)
    expect(pathIds('a2')).toEqual(['u1', 'a1', result!.boundary.id, 'u2', 'a2'])
  })

  it('does nothing on the first turn or right below an existing divider', () => {
    expect(messageService.insertContextBoundaryBefore('u1')).toBeNull()

    messageService.insertContextBoundaryBefore('u2')
    expect(messageService.insertContextBoundaryBefore('u2')).toBeNull()
  })

  it('is undone by the existing divider toggle (delete without cascade)', () => {
    const result = messageService.insertContextBoundaryBefore('u2')

    messageService.delete(result!.boundary.id, false)

    expect(pathIds('a2')).toEqual(['u1', 'a1', 'u2', 'a2'])
  })
})
