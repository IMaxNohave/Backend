// src/modules/orders/orders.controller.ts
import Elysia, { t } from "elysia";
import { ordersService } from "./orders.service";
import { betterAuth } from "lib/auth-macro";

export const OrdersController = new Elysia({
  name: "orders.controller",
  prefix: "/v1/orders",
})
  .use(betterAuth) // using better-auth macro
  // รายการออเดอร์ของ "ผู้ซื้อ" ที่ล็อกอินอยู่
  .get(
    "/my",
    async ({ payload, query }) => {
      const limit = Math.min(parseInt(String(query.limit ?? "20"), 10), 100);
      const data = await ordersService.listOrdersForBuyer({
        buyerId: payload.id,
        limit,
      });
      return { success: true, data };
    },
    {
      auth: true,
      query: t.Object({ limit: t.Optional(t.Union([t.String(), t.Number()])) }),
    }
  )

  // (ออปชัน) รายการออเดอร์ที่เราขายได้ (ฝั่งผู้ขาย)
  .get(
    "/sold",
    async ({ payload, query }) => {
      const limit = Math.min(parseInt(String(query.limit ?? "20"), 10), 100);
      const data = await ordersService.listOrdersForSeller({
        sellerId: payload.id,
        limit,
      });
      return { success: true, data };
    },
    {
      auth: true,
      query: t.Object({ limit: t.Optional(t.Union([t.String(), t.Number()])) }),
    }
  )

  // รายละเอียดออเดอร์ (ทั้งผู้ซื้อ/ผู้ขายที่เกี่ยวข้องต้องเห็นได้)
  .get(
    "/:id",
    async ({ params, payload, set }) => {
      const data = await ordersService.getOrderDetail({
        orderId: params.id,
        userId: payload.id,
      });
      if (!data) {
        set.status = 404;
        return { success: false, error: "Order not found", data: null };
      }
      return { success: true, data };
    },
    {
      auth: true,
      params: t.Object({ id: t.String({ minLength: 36, maxLength: 36 }) }),
    }
  )

  .post(
    "/:id/accept",
    async ({
      params,
      payload,
      set,
    }: {
      params: { id: string };
      payload: any;
      set: any;
    }) => {
      const sellerId = payload.id;
      const orderId = params.id;

      const ok = await ordersService.sellerAccept({ orderId, sellerId });
      if (!ok.ok) {
        set.status = ok.status ?? 400;
        return { success: false, error: ok.error };
      }
      return {
        success: true,
        data: { status: "IN_TRADE", trade_deadline_at: ok.tradeDeadlineAt },
      };
    },
    { auth: true }
  )

  .post(
    "/:id/confirm/seller",
    async ({ params, payload, set }) => {
      const sellerId = payload.id;
      const orderId = params.id;

      const ok = (await ordersService.sellerConfirm({ orderId, sellerId })) as {
        ok: boolean;
        status?: number;
        error?: string;
      };
      if (!ok.ok) {
        set.status = ok.status ?? 400;
        return { success: false, error: ok.error };
      }
      // service จะจัดการปล่อย escrow และอัปเดตสถานะเองเมื่อครบสองฝั่ง
      return { success: true };
    },
    {
      auth: true,
      params: t.Object({ id: t.String({ minLength: 36, maxLength: 36 }) }),
    }
  )

  // ผู้ซื้อยืนยันรับ (ถ้าอีกฝั่งเคยยืนยันแล้ว -> จะจบและปล่อยเอสโครว์ใน service)
  .post(
    "/:id/confirm/buyer",
    async ({ params, payload, set }) => {
      const buyerId = payload.id;
      const orderId = params.id;

      const ok = await ordersService.buyerConfirm({ orderId, buyerId });
      if (!ok.ok) {
        set.status = ok.status ?? 400;
        return { success: false, error: ok.error };
      }
      return { success: true };
    },
    {
      auth: true,
      params: t.Object({ id: t.String({ minLength: 36, maxLength: 36 }) }),
    }
  );
