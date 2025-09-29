import { Elysia, t } from 'elysia'
import { cors } from '@elysiajs/cors'
import { swagger } from '@elysiajs/swagger'
import { drizzle } from 'drizzle-orm/mysql2'
import { eq, and, like, or, desc, asc } from 'drizzle-orm'
import mysql from 'mysql2/promise'
import { v4 as uuidv4 } from 'uuid'
import * as schema from 'db/schema'

// Database connection
const connection = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'marketplace',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
})

const db = drizzle(connection, { schema, mode: 'default' })

// Auth middleware
const authMiddleware = async (token: string) => {
  if (!token) {
    throw new Error('Token required')
  }

  const session = await db
    .select({
      userId: schema.session.userId,
      expiresAt: schema.session.expiresAt,
    })
    .from(schema.session)
    .where(eq(schema.session.token, token))
    .limit(1)

  if (!session.length) {
    throw new Error('Invalid token')
  }

  const sessionData = session[0]

  if (new Date() > sessionData.expiresAt) {
    throw new Error('Token expired')
  }

  return sessionData.userId
}

// Extract Bearer token helper
const extractToken = (authHeader: string | undefined) => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Authorization header with Bearer token required')
  }
  return authHeader.substring(7)
}

const app = new Elysia()

app.use(cors() as any)
app.use(swagger({
  documentation: {
    info: {
      title: 'Marketplace API',
      version: '1.0.0',
      description: 'Complete E-commerce marketplace API'
    }
  }
}) as any)

// Global error handler
app.onError(({ code, error, set }) => {
  console.error('API Error:', error)
  
  const errorMessage = error instanceof Error ? error.message : 'Unknown error'
  
  if (errorMessage.includes('Token') || errorMessage.includes('Authorization')) {
    set.status = 401
    return { success: false, error: errorMessage, data: null }
  }
  
  switch (code) {
    case 'NOT_FOUND':
      set.status = 404
      return { success: false, error: 'Resource not found', data: null }
    case 'VALIDATION':
      set.status = 400
      return { success: false, error: 'Validation failed', details: errorMessage, data: null }
    default:
      set.status = 500
      return { success: false, error: 'Internal server error', data: null }
  }
})

// ========== ITEM ENDPOINTS ==========

// 1. Query list item (Home)
app.get('/v1/home', async ({ query, headers, set }) => {
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

// 2. Add item (Seller)
app.post('/v1/sales', async ({ body, headers, set }) => {
  try {
    const token = extractToken(headers.authorization)
    const userId = await authMiddleware(token)

    const itemId = uuidv4()
    
    await db.insert(schema.item).values({
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

// 3. Edit item (Seller)
app.patch('/v1/home/edit/:itemid', async ({ params, body, headers, set }) => {
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
app.patch('/v1/home', async ({ body, headers, set }) => {
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

// ========== CREDIT/WALLET ENDPOINTS ==========

// 5. Add slip (Deposit)
app.post('/v1/credits/depose', async ({ body, headers, set }) => {
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
app.post('/v1/credits/withdraw', async ({ body, headers, set }) => {
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

// 7. Get balance
app.get('/v1/*', async ({ headers, set }) => {
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

// ========== PROFILE ENDPOINTS ==========

// 8. Edit Profile
app.patch('/v1/profile/edit', async ({ body, headers, set }) => {
  try {
    const token = extractToken(headers.authorization)
    const userId = await authMiddleware(token)

    const updateData: any = { updatedAt: new Date() }
    if (body.name) updateData.name = body.name
    if (body.image !== undefined) updateData.image = body.image

    await db
      .update(schema.user)
      .set(updateData)
      .where(eq(schema.user.id, userId))

    return { 
      success: true, 
      data: { message: 'Profile updated successfully' } 
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    set.status = errorMessage.includes('Token') ? 401 : 500
    return { success: false, error: errorMessage, data: null }
  }
}, {
  headers: t.Object({ authorization: t.String() }),
  body: t.Object({
    name: t.Optional(t.String({ minLength: 1 })),
    image: t.Optional(t.String()),
    phone: t.Optional(t.String())
  })
})

// 9. Get Profile
app.get('/v1/profile', async ({ headers, set }) => {
  try {
    const token = extractToken(headers.authorization)
    const userId = await authMiddleware(token)

    const user = await db
      .select({
        id: schema.user.id,
        name: schema.user.name,
        email: schema.user.email,
        emailVerified: schema.user.emailVerified,
        image: schema.user.image
      })
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .limit(1)

    if (!user.length) {
      set.status = 404
      return { success: false, error: 'User not found', data: null }
    }

    return { 
      success: true, 
      data: user[0] 
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    set.status = errorMessage.includes('Token') ? 401 : 500
    return { success: false, error: errorMessage, data: null }
  }
}, {
  headers: t.Object({ authorization: t.String() })
})

// 10. Login (OAuth-style)
app.post('/v1/login', async ({ body, set }) => {
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

// ========== CHAT ENDPOINTS ==========

// 11. Chat Get
app.get('/v1/orders/:order_id', async ({ params, headers, set }) => {
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
app.post('/v1/orders/:order_id', async ({ params, body, headers, set }) => {
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

// ========== ORDERS ENDPOINTS ==========

// 13. Query for history (Purchase & Sale)
app.get('/v1/orders', async ({ query, headers, set }) => {
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

console.log('🦊 Complete Marketplace API is running at http://localhost:3000')
console.log('📚 API Documentation available at http://localhost:3000/swagger')

app.listen(3000)

export default app