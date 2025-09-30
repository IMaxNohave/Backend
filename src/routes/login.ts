import { Elysia, t } from 'elysia'
import { eq } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import { db } from '../db'
import * as schema from '../db/schema'

export const loginRoutes = new Elysia({ prefix: '/v1' })
  // 10. Login (OAuth-style)
  .post('/login', async ({ body, set }) => {
    try {
      const sessionId = uuidv4()
      const token = `token_${Date.now()}_${Math.random().toString(36)}`
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 30)

      const mockUserId = uuidv4()
      
      await db.insert(schema.session).values({
        id: sessionId,
        token: token,
        userId: mockUserId,
        expiresAt: expiresAt,
        createdAt: new Date(),
        updatedAt: new Date()
      })

      const wallet = await db
        .select({ balance: schema.wallet.balance })
        .from(schema.wallet)
        .where(eq(schema.wallet.userId, mockUserId))
        .limit(1)

      const balance = wallet.length ? parseFloat(wallet[0].balance) : 0

      return {
        success: true,
        data: {
          token: token,
          expires: expiresAt.toISOString(),
          username: 'Mock User',
          balance: balance
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      set.status = 500
      return { success: false, error: errorMessage, data: null }
    }
  }, {
    body: t.Object({
      client_id: t.String(),
      client_secret: t.String(),
      code: t.String()
    })
  })