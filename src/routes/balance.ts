import { Elysia, t } from 'elysia'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import * as schema from '../db/schema'
import { authMiddleware, extractToken } from '../middleware/auth'

export const balanceRoutes = new Elysia()
  // 7. Get balance (wildcard route)
  .get('/v1/*', async ({ headers, set }) => {
    try {
      const token = extractToken(headers.authorization)
      const userId = await authMiddleware(token)

      const wallet = await db
        .select({ balance: schema.wallet.balance })
        .from(schema.wallet)
        .where(eq(schema.wallet.userId, userId))
        .limit(1)

      const balance = wallet.length ? parseFloat(wallet[0].balance) : 0

      return { 
        success: true, 
        data: { balance } 
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      set.status = errorMessage.includes('Token') ? 401 : 500
      return { success: false, error: errorMessage, data: null }
    }
  }, {
    headers: t.Object({ authorization: t.String() })
  })