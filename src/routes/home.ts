import { Elysia, t } from 'elysia'
import { eq, and, like } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import { db } from '../db'
import * as schema from '../db/schema'
import { authMiddleware, extractToken } from '../middleware/auth'

export const homeRoutes = new Elysia({ prefix: '/v1/home' })
  // 1. Query list item (Home)
  .get('/', async ({ query, headers, set }) => {
    try {
      const token = extractToken(headers.authorization)
      const userId = await authMiddleware(token)

      const limit = Math.min(parseInt(query.limit || '10'), 100)
      const filters = query.filter || {}

      let whereConditions = [eq(schema.item.isActive, true)]

      if (filters.name) {
        whereConditions.push(like(schema.item.name, `%${filters.name}%`))
      }
      if (filters.detail) {
        whereConditions.push(like(schema.item.detail, `%${filters.detail}%`))
      }
      if (filters.category) {
        whereConditions.push(like(schema.category.name, `%${filters.category}%`))
      }
      if (filters.status && !isNaN(parseInt(filters.status))) {
        whereConditions.push(eq(schema.item.status, parseInt(filters.status)))
      }

      const items = await db
        .select({
          id: schema.item.id,
          name: schema.item.name,
          detail: schema.item.detail,
          image: schema.item.image,
          price: schema.item.price,
          status: schema.item.status,
          sellerName: schema.user.name,
          categoryId: schema.item.categoryId,
          categoryName: schema.category.name,
          categoryDetail: schema.category.detail,
        })
        .from(schema.item)
        .leftJoin(schema.user, eq(schema.item.sellerId, schema.user.id))
        .leftJoin(schema.category, eq(schema.item.categoryId, schema.category.id))
        .where(and(...whereConditions))
        .limit(limit)

      const formattedItems = items.map(item => ({
        id: item.id,
        name: item.name,
        seller_name: item.sellerName,
        detail: item.detail,
        category: {
          id: item.categoryId,
          name: item.categoryName,
          detail: item.categoryDetail
        },
        image: item.image,
        price: parseFloat(item.price || '0'),
        status: item.status
      }))

      return { success: true, data: formattedItems }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      set.status = errorMessage.includes('Token') ? 401 : 500
      return { success: false, error: errorMessage, data: null }
    }
  }, {
    headers: t.Object({ authorization: t.String() }),
    query: t.Object({
      filter: t.Optional(t.Object({
        name: t.Optional(t.String()),
        detail: t.Optional(t.String()),
        category: t.Optional(t.String()),
        status: t.Optional(t.String())
      })),
      limit: t.Optional(t.String())
    })
  })

  // 3. Edit item (Seller)
  .patch('/edit/:itemid', async ({ params, body, headers, set }) => {
    try {
      const token = extractToken(headers.authorization)
      const userId = await authMiddleware(token)

      const existingItem = await db
        .select()
        .from(schema.item)
        .where(and(
          eq(schema.item.id, params.itemid),
          eq(schema.item.sellerId, userId)
        ))
        .limit(1)

      if (!existingItem.length) {
        set.status = 404
        return { success: false, error: 'Item not found or unauthorized', data: null }
      }

      const updateData: any = { updatedAt: new Date() }
      if (body.image !== undefined) updateData.image = body.image
      if (body.name) updateData.name = body.name
      if (body.description !== undefined) updateData.detail = body.description
      if (body.price) updateData.price = body.price.toString()
      if (body.category) updateData.categoryId = body.category

      await db
        .update(schema.item)
        .set(updateData)
        .where(eq(schema.item.id, params.itemid))

      return { 
        success: true, 
        data: { message: 'Item updated successfully' } 
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      set.status = errorMessage.includes('Token') ? 401 : 500
      return { success: false, error: errorMessage, data: null }
    }
  }, {
    headers: t.Object({ authorization: t.String() }),
    params: t.Object({ itemid: t.String() }),
    body: t.Object({
      image: t.Optional(t.String()),
      name: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
      description: t.Optional(t.String()),
      price: t.Optional(t.Number({ minimum: 0 })),
      category: t.Optional(t.String({ minLength: 36, maxLength: 36 })),
      tag: t.Optional(t.String())
    })
  })

  // 4. Buy item (Buyer) - Create Order
  .patch('/', async ({ body, headers, set }) => {
    try {
      const token = extractToken(headers.authorization)
      const userId = await authMiddleware(token)

      const item = await db
        .select()
        .from(schema.item)
        .where(and(
          eq(schema.item.id, body.item_id),
          eq(schema.item.isActive, true),
          eq(schema.item.status, 1)
        ))
        .limit(1)

      if (!item.length) {
        set.status = 400
        return { success: false, error: 'Item not available', data: null }
      }

      const itemData = item[0]
      if (itemData.sellerId === userId) {
        set.status = 400
        return { success: false, error: 'Cannot buy your own item', data: null }
      }

      const orderId = uuidv4()
      const quantity = 1
      const total = parseFloat(itemData.price) * quantity

      const deadline = new Date()
      deadline.setDate(deadline.getDate() + 7)

      await db.insert(schema.orders).values({
        id: orderId,
        itemId: body.item_id,
        sellerId: itemData.sellerId!,
        buyerId: userId,
        quantity: quantity,
        priceAtPurchase: itemData.price,
        total: total.toString(),
        status: 'PENDING',
        deadlineAt: deadline,
        createdAt: new Date(),
        updatedAt: new Date()
      })

      await db
        .update(schema.item)
        .set({ status: 2 })
        .where(eq(schema.item.id, body.item_id))

      return { 
        success: true, 
        data: { orderId, message: 'Order created successfully' } 
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      set.status = errorMessage.includes('Token') ? 401 : 500
      return { success: false, error: errorMessage, data: null }
    }
  }, {
    headers: t.Object({ authorization: t.String() }),
    body: t.Object({
      item_id: t.String({ minLength: 36, maxLength: 36 })
    })
  })