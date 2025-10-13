// src/modules/orders/orders.chat.controller.ts
import Elysia, { t } from "elysia";
import { and, asc, desc, eq, gt, lt } from "drizzle-orm";
import { dbClient } from "../db/client"; // ปรับ path ให้ตรงโปรเจ็กต์
import * as schema from "../db/schema"; // มี orders, order_message, order_chat_state, user
import { sseHub } from "../lib/sse"; // hub ที่คุณทำไว้
import { betterAuth } from "../lib/auth-macro"; // macro auth เดิม
import { randomUUID as uuidv4 } from "crypto";
import { alias } from "drizzle-orm/mysql-core";
import { notify } from "../lib/notify"; // ฟังก์ชันแจ้งเตือน

const senderUser = alias(schema.user, "sender");

function computeRole(
  senderId: string | null,
  senderType: number | null | undefined,
  buyerId: string,
  sellerId: string
): "buyer" | "seller" | "admin" {
  if (!senderId) return "admin";
  if (senderType === 2) return "admin";
  if (senderId === buyerId) return "buyer";
  if (senderId === sellerId) return "seller";
  return "admin";
}

/** ————— Helpers ————— **/

// ตรวจสิทธิ์: ต้องเป็น buyer/seller ของออเดอร์นี้ หรือเป็น admin
async function ensureCanAccessOrder(opts: {
  orderId: string;
  userId: string;
  isAdmin: boolean;
}) {
  const row = await dbClient.query.orders.findFirst({
    where: eq(schema.orders.id, opts.orderId),
    columns: { buyerId: true, sellerId: true, id: true },
  });
  if (!row) throw new Error("NOT_FOUND");
  if (
    !opts.isAdmin &&
    row.buyerId !== opts.userId &&
    row.sellerId !== opts.userId
  ) {
    throw new Error("FORBIDDEN");
  }
  return { buyerId: row.buyerId, sellerId: row.sellerId };
}

// ดึง createdAt ของ message id เพื่อทำ cursor-based pagination
async function getMessageById(id: string) {
  return dbClient.query.orderMessage.findFirst({
    where: eq(schema.orderMessage.id, id),
    columns: { id: true, createdAt: true, orderId: true },
  });
}

/** ————— Controller ————— **/

export const OrdersChatController = new Elysia({
  name: "orders.chat",
  prefix: "/v1/orders",
})
  .use(betterAuth)

  // 2.1 โหลดข้อความ (cursor-based)
  .get(
    "/:id/messages",
    async ({ params, query, payload, set }) => {
      const orderId = params.id;
      const userId = payload.id;

      const u = await dbClient
        .select({ userType: schema.user.user_type })
        .from(schema.user)
        .where(eq(schema.user.id, userId))
        .limit(1);
      const isAdmin = u.length > 0 && u[0].userType === 2;

      let buyerId: string, sellerId: string;
      try {
        const p = await ensureCanAccessOrder({ orderId, userId, isAdmin });
        buyerId = p.buyerId!;
        sellerId = p.sellerId!;
      } catch (e: any) {
        set.status = e.message === "NOT_FOUND" ? 404 : 403;
        return { success: false, error: e.message };
      }

      const limit = Math.min(Number(query.limit ?? 50), 100);
      const dir = (query.dir as "next" | "prev" | undefined) ?? "next";
      const cursor = (query.cursor as string | undefined) ?? null;

      // ❗ baseSelect: ไม่มี .where() ที่นี่
      const baseSelect = () =>
        dbClient
          .select({
            id: schema.orderMessage.id,
            orderId: schema.orderMessage.orderId,
            senderId: schema.orderMessage.senderId,
            kind: schema.orderMessage.kind,
            body: schema.orderMessage.body,
            isDeleted: schema.orderMessage.isDeleted,
            isHidden: schema.orderMessage.isHidden,
            createdAt: schema.orderMessage.createdAt,
            senderName: senderUser.name,
            senderType: senderUser.user_type,
          })
          .from(schema.orderMessage)
          .leftJoin(
            senderUser,
            eq(senderUser.id, schema.orderMessage.senderId)
          );

      let rows: any[];

      if (cursor) {
        const pivot = await getMessageById(cursor);
        if (!pivot || pivot.orderId !== orderId) {
          // เริ่มจากปลายตาม dir
          rows = await baseSelect()
            .where(eq(schema.orderMessage.orderId, orderId)) // ← where ครั้งเดียว
            .orderBy(
              dir === "next"
                ? asc(schema.orderMessage.createdAt)
                : desc(schema.orderMessage.createdAt)
            )
            .limit(limit);
        } else {
          const cmp = dir === "next" ? gt : lt;
          rows = await baseSelect()
            .where(
              and(
                eq(schema.orderMessage.orderId, orderId),
                cmp(schema.orderMessage.createdAt, pivot.createdAt)
              )
            ) // ← รวมเงื่อนไขใน where เดียว
            .orderBy(
              dir === "next"
                ? asc(schema.orderMessage.createdAt)
                : desc(schema.orderMessage.createdAt)
            )
            .limit(limit);
        }
      } else {
        rows = await baseSelect()
          .where(eq(schema.orderMessage.orderId, orderId)) // ← where ครั้งเดียว
          .orderBy(
            dir === "next"
              ? asc(schema.orderMessage.createdAt)
              : desc(schema.orderMessage.createdAt)
          )
          .limit(limit);
      }

      if (dir === "prev") rows = rows.reverse();

      const nextCursor = rows.length ? rows[rows.length - 1].id : null;
      const prevCursor = rows.length ? rows[0].id : null;

      return {
        success: true,
        data: {
          messages: rows.map((m: any) => ({
            id: m.id,
            order_id: m.orderId,
            sender_id: m.senderId,
            kind: m.kind,
            body: m.body,
            is_deleted: m.isDeleted,
            is_hidden: m.isHidden,
            created_at: m.createdAt,
            role: computeRole(m.senderId, m.senderType, buyerId!, sellerId!),
            user_name: m.senderName ?? (m.senderId ? "Unknown" : "Admin"),
          })),
          next_cursor: nextCursor,
          prev_cursor: prevCursor,
        },
      };
    },
    {
      auth: true,
      params: t.Object({ id: t.String({ minLength: 36, maxLength: 36 }) }),
      query: t.Object({
        limit: t.Optional(t.Union([t.String(), t.Number()])),
        cursor: t.Optional(t.String()),
        dir: t.Optional(t.Union([t.Literal("next"), t.Literal("prev")])),
      }),
    }
  )

  // 2.2 ส่งข้อความ
  .post(
    "/:id/messages",
    async ({ params, body, payload, set }) => {
      const orderId = params.id;
      const userId = payload.id;

      // isAdmin จาก user_type
      const u = await dbClient
        .select({ userType: schema.user.user_type })
        .from(schema.user)
        .where(eq(schema.user.id, userId))
        .limit(1);
      const isAdmin = u.length > 0 && u[0].userType === 2;

      // ตรวจสิทธิ์และได้ buyerId/sellerId มาคิด role
      let buyerId: string | null = null;
      let sellerId: string | null = null;
      try {
        const p = await ensureCanAccessOrder({ orderId, userId, isAdmin });
        buyerId = p.buyerId;
        sellerId = p.sellerId;
      } catch (e: any) {
        set.status = e.message === "NOT_FOUND" ? 404 : 403;
        return { success: false, error: e.message };
      }

      const now = new Date();
      const id = uuidv4();
      const kind = body.kind ?? "TEXT";
      const content = String(body.body ?? "").slice(0, 500);
      const senderId = kind === "SYSTEM" ? null : userId;

      await dbClient.insert(schema.orderMessage).values({
        id,
        orderId,
        senderId,
        kind,
        body: content,
        isDeleted: false,
        isHidden: false,
        createdAt: now,
        updatedAt: now,
      });

      // 🔎 ดึงชื่อ/ประเภทผู้ส่ง (ถ้ามี senderId)
      let senderName = "Admin";
      let senderType = 2;
      if (senderId) {
        const s = await dbClient
          .select({ name: schema.user.name, userType: schema.user.user_type })
          .from(schema.user)
          .where(eq(schema.user.id, senderId))
          .limit(1);
        senderName = s[0]?.name ?? "Unknown";
        senderType = s[0]?.userType ?? 1;
      }

      const role = computeRole(senderId, senderType, buyerId!, sellerId!);

      const message = {
        id,
        order_id: orderId,
        sender_id: senderId,
        kind,
        body: content,
        is_deleted: false,
        is_hidden: false,
        created_at: now.toISOString(),
        role, // 👈 เพิ่ม
        user_name: senderName, // 👈 เพิ่ม
      };

      sseHub.publish(`order:${orderId}`, "order.message.new", {
        v: 1,
        orderId,
        message,
      });
      //   if (buyerId)
      //     sseHub.publish(`user:${buyerId}`, "order.message.new", { orderId });
      //   if (sellerId)
      //     sseHub.publish(`user:${sellerId}`, "order.message.new", { orderId });

      const recipients: string[] = [];
      if (buyerId && buyerId !== senderId) recipients.push(buyerId);
      if (sellerId && sellerId !== senderId) recipients.push(sellerId);

      // (ถ้าต้องการให้แอดมินได้แจ้งเตือนทุกห้อง ก็ loop ใส่ adminIds ด้วย)

      for (const uid of recipients) {
        console.log("Notify to", uid);
        await notify({
          toUserId: uid,
          type: "CHAT",
          title: "New chat message",
          body: content.slice(0, 120),
          orderId,
          data: { orderId, messageId: id },
        });
      }

      return { success: true, data: message };
    },
    {
      auth: true,
      params: t.Object({ id: t.String({ minLength: 36, maxLength: 36 }) }),
      body: t.Object({
        kind: t.Optional(
          t.Union([
            t.Literal("TEXT"),
            t.Literal("SYSTEM"),
            t.Literal("IMAGE"),
            t.Literal("VIDEO"),
          ])
        ),
        body: t.Optional(t.String()),
      }),
    }
  )

  // 2.3 อัปเดต “อ่านแล้ว” (Read Receipt)
  .post(
    "/:id/read",
    async ({ params, body, payload, set }) => {
      const orderId = params.id;
      const userId = payload.id;
      const u = await dbClient
        .select({ userType: schema.user.user_type }) // <-- ต้องมีคอลัมน์นี้ใน schema
        .from(schema.user)
        .where(eq(schema.user.id, userId))
        .limit(1);

      const isAdmin = u.length > 0 && u[0].userType === 2;

      try {
        await ensureCanAccessOrder({ orderId, userId, isAdmin });
      } catch (e: any) {
        set.status = e.message === "NOT_FOUND" ? 404 : 403;
        return { success: false, error: e.message };
      }

      const lastReadMessageId = String(body.lastReadMessageId);
      const lastMsg = await getMessageById(lastReadMessageId);
      if (!lastMsg || lastMsg.orderId !== orderId) {
        set.status = 400;
        return { success: false, error: "Invalid lastReadMessageId" };
      }

      const now = new Date();

      // upsert: order_chat_state(order_id, user_id) → อัปเดตถ้า “ใหม่กว่าเดิม”
      const state = await dbClient.query.orderChatState.findFirst({
        where: and(
          eq(schema.orderChatState.orderId, orderId),
          eq(schema.orderChatState.userId, userId)
        ),
      });

      if (!state) {
        await dbClient.insert(schema.orderChatState).values({
          id: uuidv4(),
          orderId,
          userId,
          lastReadMessageId,
          lastReadAt: now,
          createdAt: now,
          updatedAt: now,
        });
      } else {
        // อัปเดตเมื่อใหม่กว่าเดิมเท่านั้น
        // (ง่ายสุดเทียบ createdAt ของ message)
        const prev = await getMessageById(state.lastReadMessageId ?? "");
        const isNewer =
          !prev ||
          (prev.createdAt?.getTime() ?? 0) <
            (lastMsg.createdAt?.getTime() ?? 0);

        if (isNewer) {
          await dbClient
            .update(schema.orderChatState)
            .set({ lastReadMessageId, lastReadAt: now, updatedAt: now })
            .where(eq(schema.orderChatState.id, state.id));
        }
      }

      // 🔔 publish SSE: read receipt ในห้องออเดอร์
      sseHub.publish(`order:${orderId}`, "order.message.read", {
        v: 1,
        orderId,
        userId,
        lastReadMessageId,
        lastReadAt: now.toISOString(),
      });

      return { success: true };
    },
    {
      auth: true,
      params: t.Object({ id: t.String({ minLength: 36, maxLength: 36 }) }),
      body: t.Object({
        lastReadMessageId: t.String({ minLength: 36, maxLength: 36 }),
      }),
    }
  )

  // 2.5 Admin join → system message
  .post(
    "/:id/admin/join",
    async ({ params, payload, set }) => {
      const isAdmin =
        (payload as any)?.role === "admin" ||
        (payload as any)?.isAdmin === true;
      if (!isAdmin) {
        set.status = 403;
        return { success: false, error: "FORBIDDEN" };
      }
      const orderId = params.id;
      const now = new Date();
      const id = uuidv4();

      await dbClient.insert(schema.orderMessage).values({
        id,
        orderId,
        senderId: null, // SYSTEM
        kind: "SYSTEM",
        body: `Admin joined the chat`,
        isDeleted: false,
        isHidden: false,
        createdAt: now,
        updatedAt: now,
      });

      const message = {
        id,
        order_id: orderId,
        sender_id: null,
        kind: "SYSTEM",
        body: "Admin joined the chat",
        is_deleted: false,
        is_hidden: false,
        created_at: now.toISOString(),
      };

      sseHub.publish(`order:${orderId}`, "order.message.new", {
        v: 1,
        orderId,
        message,
      });
      return { success: true, data: message };
    },
    {
      auth: true,
      params: t.Object({ id: t.String({ minLength: 36, maxLength: 36 }) }),
    }
  )

  .post(
    "/:id/admin/leave",
    async ({ params, payload, set }) => {
      const isAdmin =
        (payload as any)?.role === "admin" ||
        (payload as any)?.isAdmin === true;
      if (!isAdmin) {
        set.status = 403;
        return { success: false, error: "FORBIDDEN" };
      }
      const orderId = params.id;
      const now = new Date();
      const id = uuidv4();

      await dbClient.insert(schema.orderMessage).values({
        id,
        orderId,
        senderId: null,
        kind: "SYSTEM",
        body: `Admin left the chat`,
        isDeleted: false,
        isHidden: false,
        createdAt: now,
        updatedAt: now,
      });

      const message = {
        id,
        order_id: orderId,
        sender_id: null,
        kind: "SYSTEM",
        body: "Admin left the chat",
        is_deleted: false,
        is_hidden: false,
        created_at: now.toISOString(),
      };

      sseHub.publish(`order:${orderId}`, "order.message.new", {
        v: 1,
        orderId,
        message,
      });
      return { success: true, data: message };
    },
    {
      auth: true,
      params: t.Object({ id: t.String({ minLength: 36, maxLength: 36 }) }),
    }
  );
