import { Elysia, t } from 'elysia'
import { v4 as uuidv4 } from 'uuid'
import { dbClient } from '@db/client'
import * as schema from '../db/schema'
import { authMiddleware, extractToken } from '../middleware/auth'

export const salesRoutes = new Elysia({ prefix: '/v1/sales' })
  // 2. Add item (Seller)
  .post('/', async ({ body, headers, set }) => {
    try {
      const token = extractToken(headers.authorization)
      const userId = await authMiddleware(token)

      const itemId = uuidv4()
      
      await dbClient.insert(schema.item).values({
        id: itemId,
        sellerId: userId,
        name: body.name,
        detail: body.description || null,
        categoryId: body.category,
        image: body.image || null,
        price: body.price.toString(),
        quantity: 1,
        isActive: true,
        status: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      })

      return { 
        success: true, 
        data: { id: itemId, message: 'Item created successfully' } 
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      set.status = errorMessage.includes('Token') ? 401 : 500
      return { success: false, error: errorMessage, data: null }
    }
  }, {
    headers: t.Object({ authorization: t.String() }),
    body: t.Object({
      image: t.Optional(t.String()),
      name: t.String({ minLength: 1, maxLength: 255 }),
      description: t.Optional(t.String()),
      price: t.Number({ minimum: 0 }),
      category: t.String({ minLength: 36, maxLength: 36 }),
      tag: t.Optional(t.String())
    })
  })