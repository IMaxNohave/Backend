// src/routes/sales.ts
import { Elysia, t } from "elysia";
import { v4 as uuidv4 } from "uuid";
import { dbClient } from "@db/client";
import * as schema from "../db/schema";
import { betterAuth } from "lib/auth-macro";
import { computeItemExpiresAt } from "./config";
import { scheduleItemExpire } from "../jobs/item-expire.queue"; // เหมือน order-expire

export const salesRoutes = new Elysia({ prefix: "/v1/sales" })
  .use(betterAuth)
  .post(
    "/",
    async ({ body, set, payload }) => {
      try {
        const userId = payload.id;
        const itemId = uuidv4();

        // ระบบคำนวณเอง (ไม่อ่านค่าจาก body)
        const expiresAt = computeItemExpiresAt({
          price: body.price,
          categoryId: body.category,
        });

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
          status: 1, // AVAILABLE
          createdAt: new Date(),
          updatedAt: new Date(),
          expiresAt, // << ใส่เวลาหมดอายุ
        });

        // จองงานให้หมดอายุอัตโนมัติ
        await scheduleItemExpire(itemId, expiresAt);

        return {
          success: true,
          data: { id: itemId, message: "Item created successfully" },
        };
      } catch (error: any) {
        set.status = 500;
        return {
          success: false,
          error: error?.message || "Unknown error",
          data: null,
        };
      }
    },
    {
      body: t.Object({
        image: t.Optional(t.String()),
        name: t.String({ minLength: 1, maxLength: 255 }),
        description: t.Optional(t.String()),
        price: t.Number({ minimum: 0 }),
        category: t.String({ minLength: 1, maxLength: 36 }),
        tag: t.Optional(t.String()),
        // ⛔️ ไม่ต้องรับ expiresAt / expiresInSec แล้ว (ลบออก หรือคงไว้แต่ "ไม่ใช้")
      }),
      auth: true,
    }
  );
