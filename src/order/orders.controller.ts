// src/modules/orders/orders.controller.ts
import Elysia, { t } from "elysia";
import { ordersService } from "./orders.service";
import { betterAuth } from "lib/auth-macro";
import { sseHub } from "../lib/sse"; // path ตามจริงของคุณ

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

  // Backend/src/routes/orders.ts (ใน handler .post("/:id/accept", ...))
  .post(
    "/:id/accept",
    async ({ params, payload, set }) => {
      const sellerId = payload.id;
      const orderId = params.id;

      const ok = await ordersService.sellerAccept({ orderId, sellerId });
      if (!ok.ok) {
        set.status = ok.status ?? 400;
        return { success: false, error: ok.error };
      }

      const { buyerId } = ok;

      // ✅ ใส่ side แยกตาม channel ที่ส่ง
      sseHub.publish(`user:${buyerId}`, "order.update", {
        orderId,
        action: "accept",
        side: "buyer", // <- ฝั่งผู้ซื้อ
      });
      sseHub.publish(`user:${sellerId}`, "order.update", {
        orderId,
        action: "accept",
        side: "seller", // <- ฝั่งผู้ขาย
      });
      sseHub.publish(`order:${orderId}`, "order.update", {
        orderId,
        action: "accept",
        // side: ไม่จำเป็นใน channel per-order (ทั้งสองฝั่งอาจฟังร่วม)
      });

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

      const ok = await ordersService.sellerConfirm({ orderId, sellerId });
      if (!ok.ok) {
        set.status = ok.status ?? 400;
        return { success: false, error: ok.error };
      }

      // ให้ service ส่ง buyerId/sellerId และบอกว่าจบงานหรือยัง
      const { buyerId, completed } = ok as unknown as {
        buyerId: string;
        completed?: boolean;
      };

      sseHub.publish(`user:${buyerId}`, "order.update", {
        orderId,
        action: "confirm_seller",
        side: "buyer",
      });
      sseHub.publish(`user:${sellerId}`, "order.update", {
        orderId,
        action: "confirm_seller",
        side: "seller",
      });
      sseHub.publish(`order:${orderId}`, "order.update", {
        orderId,
        action: "confirm_seller",
      });

      if (completed) {
        // ถ้าครบสองฝั่งแล้วและ service เซ็ตเป็น COMPLETED แล้ว
        sseHub.publish(`user:${buyerId}`, "order.update", {
          orderId,
          action: "completed",
          side: "buyer",
        });
        sseHub.publish(`user:${sellerId}`, "order.update", {
          orderId,
          action: "completed",
          side: "seller",
        });
        sseHub.publish(`order:${orderId}`, "order.update", {
          orderId,
          action: "completed",
        });
      }

      return { success: true };
    },
    { auth: true }
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

      // ok is guaranteed to have sellerId and completed here
      const { sellerId, completed } = ok as unknown as {
        sellerId: string;
        completed?: boolean;
      };

      sseHub.publish(`user:${buyerId}`, "order.update", {
        orderId,
        action: "confirm_buyer",
        side: "buyer",
      });
      sseHub.publish(`user:${sellerId}`, "order.update", {
        orderId,
        action: "confirm_buyer",
        side: "seller",
      });
      sseHub.publish(`order:${orderId}`, "order.update", {
        orderId,
        action: "confirm_buyer",
      });

      if (completed) {
        sseHub.publish(`user:${buyerId}`, "order.update", {
          orderId,
          action: "completed",
          side: "buyer",
        });
        sseHub.publish(`user:${sellerId}`, "order.update", {
          orderId,
          action: "completed",
          side: "seller",
        });
        sseHub.publish(`order:${orderId}`, "order.update", {
          orderId,
          action: "completed",
        });
      }

      return { success: true };
    },
    { auth: true }
  )
  // ⬇️ เพิ่ม Cancel
  .post(
    "/:id/cancel",
    async ({ params, payload, set }) => {
      const actorId = payload.id;
      const orderId = params.id;

      // ให้ service ตรวจสิทธิ์ + ตัดสินใจเรื่องคืนเงิน/คืน item/อัปเดตสถานะ + ยกเลิกคิว BullMQ
      const ok = await ordersService.cancel({ orderId, actorId });
      if (!ok.ok) {
        set.status = ok.status ?? 400;
        return { success: false, error: ok.error };
      }

      // service ควรคืน buyerId/sellerId กลับมา เพื่อยิง SSE ให้ครบสองฝั่ง
      const { buyerId, sellerId } = ok as unknown as {
        buyerId: string;
        sellerId: string;
      };

      // แจ้งทั้ง per-user และ per-order channel
      sseHub.publish(`user:${buyerId}`, "order.update", {
        orderId,
        action: "cancelled",
        side: "buyer",
      });
      sseHub.publish(`user:${sellerId}`, "order.update", {
        orderId,
        action: "cancelled",
        side: "seller",
      });
      sseHub.publish(`order:${orderId}`, "order.update", {
        orderId,
        action: "cancelled",
      });

      return { success: true };
    },
    {
      auth: true,
      params: t.Object({ id: t.String({ minLength: 36, maxLength: 36 }) }),
    }
  )

  // Dispute (เปิดใช้งาน)
  .post(
    "/:id/dispute",
    async ({ params, payload, body, set }) => {
      const actorId = payload.id;
      const orderId = params.id;
      const reasonCode = (body?.reason_code as string) || "OTHER";

      const ok = await ordersService.raiseDispute({
        orderId,
        actorId,
        reasonCode,
      });
      if (!ok.ok) {
        set.status = ok.status ?? 400;
        return { success: false, error: ok.error };
      }

      const { buyerId, sellerId } = ok as unknown as {
        buyerId: string;
        sellerId: string;
      };

      sseHub.publish(`user:${buyerId}`, "order.update", {
        orderId,
        action: "disputed",
        side: "buyer",
      });
      sseHub.publish(`user:${sellerId}`, "order.update", {
        orderId,
        action: "disputed",
        side: "seller",
      });
      sseHub.publish(`order:${orderId}`, "order.update", {
        orderId,
        action: "disputed",
      });

      return { success: true };
    },
    {
      auth: true,
      params: t.Object({ id: t.String({ minLength: 36, maxLength: 36 }) }),
      body: t.Object({ reason_code: t.Optional(t.String()) }),
    }
  );
