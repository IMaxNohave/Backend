import { Elysia, t } from 'elysia'
import { eq } from 'drizzle-orm'
import { dbClient } from '@db/client'
import * as schema from '../db/schema'
import { authMiddleware, extractToken } from '../middleware/auth'

export const profileRoutes = new Elysia({ prefix: '/v1/profile' })
  // 8. Edit Profile
  .patch('/edit', async ({ body, headers, set }) => {
    try {
      const token = extractToken(headers.authorization)
      const userId = await authMiddleware(token)

      const updateData: any = { updatedAt: new Date() }
      if (body.name) updateData.name = body.name
      if (body.image !== undefined) updateData.image = body.image

      await dbClient
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
  .get('/', async ({ headers, set }) => {
    try {
      const token = extractToken(headers.authorization)
      const userId = await authMiddleware(token)

      const user = await dbClient
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