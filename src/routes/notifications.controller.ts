// src/routes/notifications.controller.ts
import Elysia, { t } from "elysia";
import { dbClient } from "../db/client";
import * as schema from "../db/schema";
import { betterAuth } from "../lib/auth-macro";
import { and, desc, eq, sql, lt } from "drizzle-orm";

export const NotificationsController = new Elysia({
  name: "notifications",
  prefix: "/v1/notifications",
})
  .use(betterAuth)

  // นับยังไม่อ่าน
  .get(
    "/count",
    async ({ payload }) => {
      const userId = payload.id;
      const rows = await dbClient
        .select({ c: sql<number>`COUNT(*)`.mapWith(Number) })
        .from(schema.notification)
        .where(
          and(
            eq(schema.notification.userId, userId),
            eq(schema.notification.isRead, false)
          )
        );
      return { success: true, data: { unread: rows[0]?.c ?? 0 } };
    },
    { auth: true }
  )

  // ลิสต์ (cursor by created_at,id)
  .get(
    "/",
    async ({ payload, query }) => {
      const userId = payload.id;
      const limit = Math.min(Number(query.limit ?? 20), 100);
      const before = query.before ? new Date(String(query.before)) : null;

      const whereClause = before
        ? and(
            eq(schema.notification.userId, userId),
            lt(schema.notification.createdAt, before)
          )
        : eq(schema.notification.userId, userId);

      const rows = await dbClient
        .select()
        .from(schema.notification)
        .where(whereClause)
        .orderBy(desc(schema.notification.createdAt))
        .limit(limit);

      const nextCursor = rows.length ? rows[rows.length - 1].createdAt : null;
      return { success: true, data: { items: rows, next_cursor: nextCursor } };
    },
    {
      auth: true,
      query: t.Object({
        limit: t.Optional(t.Union([t.String(), t.Number()])),
        before: t.Optional(t.String()), // ISO
      }),
    }
  )

  // ติ๊กอ่านเป็นชุด
  .post(
    "/read",
    async ({ payload, body }) => {
      const userId = payload.id;
      const ids = body.ids as string[];
      if (!Array.isArray(ids) || !ids.length) return { success: true };

      await dbClient
        .update(schema.notification)
        .set({ isRead: true, readAt: new Date(), updatedAt: new Date() })
        .where(
          and(eq(schema.notification.userId, userId), sql`id IN (${ids})`)
        );

      return { success: true };
    },
    {
      auth: true,
      body: t.Object({ ids: t.Array(t.String()) }),
    }
  )

  .post(
    "/read-all",
    async ({ payload }) => {
      const userId = payload.id;
      const now = new Date();
      await dbClient
        .update(schema.notification)
        .set({ isRead: true, readAt: now, updatedAt: now })
        .where(
          and(
            eq(schema.notification.userId, userId),
            eq(schema.notification.isRead, false)
          )
        );
      return { success: true };
    },
    { auth: true }
  );
