import { Elysia, t } from 'elysia'
import { eq, and, or, desc, asc } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import { db } from '../db'
import * as schema from '../db/schema'
import { authMiddleware, extractToken } from '../middleware/auth'

export const ordersRoutes = new Elysia({ prefix: '/v1/orders' })
  // 11. Chat Get
  .get('/:order_id', async ({ params, headers, set }) => {
    try {
      const token = extractToken(headers.authorization)
      const userId = await authMiddleware(token)

      const order = await db
        .select()
        .from(schema.orders)
        .where(and(
          eq(schema.orders.id, params.order_id),
          or(
            eq(schema.orders.buyerId, userId),
            eq(schema.orders.sellerId, userId)
          )
        ))
        .limit(1)

      if (!order.length) {
        set.status = 404
        return { success: false, error: 'Order not found or unauthorized', data: null }
      }

      const messages = await db
        .select({
          id: schema.orderMessage.id,
          senderId: schema.orderMessage.senderId,
          senderName: schema.user.name,
          kind: schema.orderMessage.kind,
          body: schema.orderMessage.body,
          createdAt: schema.orderMessage.createdAt,
          isDeleted: schema.orderMessage.isDeleted
        })
        .from(schema.orderMessage)
        .leftJoin(schema.user, eq(schema.orderMessage.senderId, schema.user.id))
        .where(and(
          eq(schema.orderMessage.orderId, params.order_id),
          eq(schema.orderMessage.isDeleted, false),
          eq(schema.orderMessage.isHidden, false)
        ))
        .orderBy(asc(schema.orderMessage.createdAt))

      return { 
        success: true, 
        data: messages 
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      set.status = errorMessage.includes('Token') ? 401 : 500
      return { success: false, error: errorMessage, data: null }
    }
  }, {
    headers: t.Object({ authorization: t.String() }),
    params: t.Object({ order_id: t.String() })
  })

  // 12. Chat Post
  .post('/:order_id', async ({ params, body, headers, set }) => {
    try {
      const token = extractToken(headers.authorization)
      const userId = await authMiddleware(token)

      const order = await db
        .select()
        .from(schema.orders)
        .where(and(
          eq(schema.orders.id, params.order_id),
          or(
            eq(schema.orders.buyerId, userId),
            eq(schema.orders.sellerId, userId)
          )
        ))
        .limit(1)

      if (!order.length) {
        set.status = 404
        return { success: false, error: 'Order not found or unauthorized', data: null }
      }

      const messageId = uuidv4()

      await db.insert(schema.orderMessage).values({
        id: messageId,
        orderId: params.order_id,
        senderId: userId,
        kind: body.kind || 'TEXT',
        body: body.body,
        isDeleted: false,
        isHidden: false,
        createdAt: new Date(),
        updatedAt: new Date()
      })

      return { 
        success: true, 
        data: { messageId, message: 'Message sent successfully' } 
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      set.status = errorMessage.includes('Token') ? 401 : 500
      return { success: false, error: errorMessage, data: null }
    }
  }, {
    headers: t.Object({ authorization: t.String() }),
    params: t.Object({ order_id: t.String() }),
    body: t.Object({
      kind: t.Optional(t.String()),
      body: t.String()
    })
  })

  // 13. Query for history (Purchase & Sale)
  .get('/', async ({ query, headers, set }) => {
    try {
      const token = extractToken(headers.authorization)
      const userId = await authMiddleware(token)

      const historyType = query.type || 'Purchase'
      
      let orders
      if (historyType === 'Purchase') {
        orders = await db
          .select({
            id: schema.orders.id,
            name: schema.item.name,
            sellerName: schema.user.name,
            buyerName: schema.user.name,
            timestamp: schema.orders.createdAt
          })
          .from(schema.orders)
          .leftJoin(schema.item, eq(schema.orders.itemId, schema.item.id))
          .leftJoin(schema.user, eq(schema.orders.sellerId, schema.user.id))
          .where(eq(schema.orders.buyerId, userId))
          .orderBy(desc(schema.orders.createdAt))
      } else {
        orders = await db
          .select({
            id: schema.orders.id,
            name: schema.item.name,
            sellerName: schema.user.name,
            buyerName: schema.user.name,
            timestamp: schema.orders.createdAt
          })
          .from(schema.orders)
          .leftJoin(schema.item, eq(schema.orders.itemId, schema.item.id))
          .leftJoin(schema.user, eq(schema.orders.buyerId, schema.user.id))
          .where(eq(schema.orders.sellerId, userId))
          .orderBy(desc(schema.orders.createdAt))
      }

      if (historyType === 'Sale') {
        const currentUser = await db
          .select({ name: schema.user.name })
          .from(schema.user)
          .where(eq(schema.user.id, userId))
          .limit(1)
        
        const currentUserName = currentUser[0]?.name || 'Unknown'
        orders = orders.map(order => ({
          ...order,
          sellerName: currentUserName
        }))
      } else {
        const currentUser = await db
          .select({ name: schema.user.name })
          .from(schema.user)
          .where(eq(schema.user.id, userId))
          .limit(1)
        
        const currentUserName = currentUser[0]?.name || 'Unknown'
        orders = orders.map(order => ({
          ...order,
          buyerName: currentUserName
        }))
      }

      return { 
        success: true, 
        data: orders 
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      set.status = errorMessage.includes('Token') ? 401 : 500
      return { success: false, error: errorMessage, data: null }
    }
  }, {
    headers: t.Object({ authorization: t.String() }),
    query: t.Object({
      type: t.Optional(t.Union([t.Literal('Purchase'), t.Literal('Sale')]))
    })
  })