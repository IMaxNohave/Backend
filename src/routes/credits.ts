import { Elysia, t } from 'elysia'
import { eq } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import { db } from '../db'
import * as schema from '../db/schema'
import { authMiddleware, extractToken } from '../middleware/auth'

export const creditsRoutes = new Elysia({ prefix: '/v1/credits' })
  // 5. Add slip (Deposit)
  .post('/depose', async ({ body, headers, set }) => {
    try {
      const token = extractToken(headers.authorization)
      const userId = await authMiddleware(token)

      const depositId = uuidv4()
      const slipRef = `SLIP_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`

      await db.insert(schema.depositRequest).values({
        id: depositId,
        userId: userId,
        amount: body.amount.toString(),
        currency: 'THB',
        provider: 'SLIP2GO',
        slipUrl: body.image,
        slipRef: slipRef,
        status: 'PENDING',
        createdAt: new Date(),
        updatedAt: new Date()
      })

      return { 
        success: true, 
        data: { depositId, slipRef, message: 'Deposit request submitted' } 
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      set.status = errorMessage.includes('Token') ? 401 : 500
      return { success: false, error: errorMessage, data: null }
    }
  }, {
    headers: t.Object({ authorization: t.String() }),
    body: t.Object({
      image: t.String({ description: 'Slip image URL' }),
      amount: t.Number({ minimum: 1 })
    })
  })

  // 6. Withdraw
  .post('/withdraw', async ({ body, headers, set }) => {
    try {
      const token = extractToken(headers.authorization)
      const userId = await authMiddleware(token)

      const wallet = await db
        .select()
        .from(schema.wallet)
        .where(eq(schema.wallet.userId, userId))
        .limit(1)

      if (!wallet.length) {
        set.status = 400
        return { success: false, error: 'Wallet not found', data: null }
      }

      const availableBalance = parseFloat(wallet[0].balance) - parseFloat(wallet[0].held)
      if (body.amount > availableBalance) {
        set.status = 400
        return { success: false, error: 'Insufficient balance', data: null }
      }

      const withdrawId = uuidv4()

      await db.insert(schema.withdrawRequest).values({
        id: withdrawId,
        userId: userId,
        amount: body.amount.toString(),
        currency: 'THB',
        method: body.method || 'BANK',
        accountInfo: body.accountInfo,
        status: 'PENDING',
        createdAt: new Date(),
        updatedAt: new Date()
      })

      return { 
        success: true, 
        data: { withdrawId, message: 'Withdraw request submitted' } 
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      set.status = errorMessage.includes('Token') ? 401 : 500
      return { success: false, error: errorMessage, data: null }
    }
  }, {
    headers: t.Object({ authorization: t.String() }),
    body: t.Object({
      amount: t.Number({ minimum: 1 }),
      method: t.Optional(t.String()),
      accountInfo: t.Object({}, { additionalProperties: true })
    })
  })