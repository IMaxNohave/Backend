import { eq } from 'drizzle-orm'
import { dbClient } from '@db/client'
import * as schema from '../db/schema'

// Auth middleware
export const authMiddleware = async (token: string) => {
  if (!token) {
    throw new Error('Token required')
  }

  const session = await dbClient
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
export const extractToken = (authHeader: string | undefined) => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Authorization header with Bearer token required')
  }
  return authHeader.substring(7)
}