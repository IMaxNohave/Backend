// src/modules/orders/orders.service.ts
import { dbClient } from "@db/client";
import * as schema from "../db/schema";
import { and, eq, or, desc, sql, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { v4 as uuidv4 } from "uuid";
import {
  scheduleTradeExpire,
  cancelAllExpireJobs,
} from "../jobs/order-expire.queue";
import { TRADE_WINDOW_MS, DISPUTE_EXTENSION_MS } from "./constants";

// ทำ alias ให้ตาราง user หลายบทบาท
const sellerUser = alias(schema.user, "seller");
const buyerUser = alias(schema.user, "buyer");
const adminUser = alias(schema.user, "admin");

// ---- helpers ----
const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));

export abstract class ordersService {
  /* ------------------------ LISTS ------------------------ */

  static async listOrdersForBuyer({
    buyerId,
    limit,
  }: {
    buyerId: string;
    limit: number;
  }) {
    const rows = await dbClient
      .select({
        // order core
        order_id: schema.orders.id,
        order_status: schema.orders.status,
        order_created_at: schema.orders.createdAt,
        order_deadline_at: schema.orders.deadlineAt,
        trade_deadline_at: schema.orders.tradeDeadlineAt,
        seller_accepted_at: schema.orders.sellerAcceptAt,
        seller_confirmed_at: schema.orders.sellerConfirmedAt,
        buyer_confirmed_at: schema.orders.buyerConfirmedAt,
        cancelled_by: schema.orders.cancelledBy,
        cancelled_at: schema.orders.cancelledAt,
        disputed_at: schema.orders.disputedAt,

        // amounts
        order_quantity: schema.orders.quantity,
        price_at_purchase: schema.orders.priceAtPurchase,
        total: schema.orders.total,

        // item
        item_id: schema.item.id,
        item_name: schema.item.name,
        item_image: schema.item.image,

        // parties
        seller_id: sellerUser.id,
        seller_name: sellerUser.name,
        buyer_id: buyerUser.id,
        buyer_name: buyerUser.name,

        // latest settlement (ถ้ามี)
        settle_seller_pct: schema.disputeSettlement.sellerPct,
        settle_seller_amount: schema.disputeSettlement.sellerAmount,
        settle_buyer_amount: schema.disputeSettlement.buyerAmount,
        settle_fee_amount: schema.disputeSettlement.feeAmount,
        settle_note: schema.disputeSettlement.note,
        settle_resolved_at: schema.dispute.resolvedAt,
        settle_resolved_by: adminUser.name,
      })
      .from(schema.orders)
      .leftJoin(schema.item, eq(schema.orders.itemId, schema.item.id))
      .leftJoin(sellerUser, eq(schema.orders.sellerId, sellerUser.id))
      .leftJoin(buyerUser, eq(schema.orders.buyerId, buyerUser.id))
      .leftJoin(schema.dispute, eq(schema.dispute.orderId, schema.orders.id))
      .leftJoin(
        schema.disputeSettlement,
        eq(schema.disputeSettlement.orderId, schema.orders.id)
      )
      .leftJoin(adminUser, eq(adminUser.id, schema.dispute.resolvedBy))
      .where(eq(schema.orders.buyerId, buyerId))
      .orderBy(desc(schema.orders.createdAt))
      .limit(limit);

    return rows;
  }

  static async listOrdersForSeller({
    sellerId,
    limit,
  }: {
    sellerId: string;
    limit: number;
  }) {
    const rows = await dbClient
      .select({
        order_id: schema.orders.id,
        order_status: schema.orders.status,
        order_created_at: schema.orders.createdAt,
        order_deadline_at: schema.orders.deadlineAt,
        trade_deadline_at: schema.orders.tradeDeadlineAt,
        seller_accepted_at: schema.orders.sellerAcceptAt,
        seller_confirmed_at: schema.orders.sellerConfirmedAt,
        buyer_confirmed_at: schema.orders.buyerConfirmedAt,
        cancelled_by: schema.orders.cancelledBy,
        cancelled_at: schema.orders.cancelledAt,
        disputed_at: schema.orders.disputedAt,

        order_quantity: schema.orders.quantity,
        price_at_purchase: schema.orders.priceAtPurchase,
        total: schema.orders.total,

        item_id: schema.item.id,
        item_name: schema.item.name,
        item_image: schema.item.image,

        seller_id: sellerUser.id,
        seller_name: sellerUser.name,
        buyer_id: buyerUser.id,
        buyer_name: buyerUser.name,

        settle_seller_pct: schema.disputeSettlement.sellerPct,
        settle_seller_amount: schema.disputeSettlement.sellerAmount,
        settle_buyer_amount: schema.disputeSettlement.buyerAmount,
        settle_fee_amount: schema.disputeSettlement.feeAmount,
        settle_note: schema.disputeSettlement.note,
        settle_resolved_at: schema.dispute.resolvedAt,
        settle_resolved_by: adminUser.name,
      })
      .from(schema.orders)
      .leftJoin(schema.item, eq(schema.orders.itemId, schema.item.id))
      .leftJoin(sellerUser, eq(schema.orders.sellerId, sellerUser.id))
      .leftJoin(buyerUser, eq(schema.orders.buyerId, buyerUser.id))
      .leftJoin(schema.dispute, eq(schema.dispute.orderId, schema.orders.id))
      .leftJoin(
        schema.disputeSettlement,
        eq(schema.disputeSettlement.orderId, schema.orders.id)
      )
      .leftJoin(adminUser, eq(adminUser.id, schema.dispute.resolvedBy))
      .where(eq(schema.orders.sellerId, sellerId))
      .orderBy(desc(schema.orders.createdAt))
      .limit(limit);

    return rows;
  }

  /* ------------------------ DETAIL ------------------------ */

  static async getOrderDetail({
    orderId,
    userId,
  }: {
    orderId: string;
    userId: string;
  }) {
    // 1) เช็คบทบาท
    const u = await dbClient
      .select({ userType: schema.user.user_type })
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .limit(1);

    const isAdmin = u.length > 0 && u[0].userType === 2;

    // 2) select fields (รวม settlement)
    const fields = {
      order_id: schema.orders.id,
      order_status: schema.orders.status,
      order_created_at: schema.orders.createdAt,
      order_deadline_at: schema.orders.deadlineAt,
      trade_deadline_at: schema.orders.tradeDeadlineAt,
      seller_accepted_at: schema.orders.sellerAcceptAt,
      seller_confirmed_at: schema.orders.sellerConfirmedAt,
      buyer_confirmed_at: schema.orders.buyerConfirmedAt,
      cancelled_by: schema.orders.cancelledBy,
      cancelled_at: schema.orders.cancelledAt,
      disputed_at: schema.orders.disputedAt,

      order_quantity: schema.orders.quantity,
      price_at_purchase: schema.orders.priceAtPurchase,
      total: schema.orders.total,

      item_id: schema.item.id,
      item_name: schema.item.name,
      item_image: schema.item.image,

      seller_id: sellerUser.id,
      seller_name: sellerUser.name,
      buyer_id: buyerUser.id,
      buyer_name: buyerUser.name,

      // settlement
      settle_seller_pct: schema.disputeSettlement.sellerPct,
      settle_seller_amount: schema.disputeSettlement.sellerAmount,
      settle_buyer_amount: schema.disputeSettlement.buyerAmount,
      settle_fee_amount: schema.disputeSettlement.feeAmount,
      settle_note: schema.disputeSettlement.note,
      settle_resolved_at: schema.dispute.resolvedAt,
      settle_resolved_by: adminUser.name,
    };

    const base = dbClient
      .select(fields)
      .from(schema.orders)
      .leftJoin(schema.item, eq(schema.orders.itemId, schema.item.id))
      .leftJoin(sellerUser, eq(schema.orders.sellerId, sellerUser.id))
      .leftJoin(buyerUser, eq(schema.orders.buyerId, buyerUser.id))
      .leftJoin(schema.dispute, eq(schema.dispute.orderId, schema.orders.id))
      .leftJoin(
        schema.disputeSettlement,
        eq(schema.disputeSettlement.orderId, schema.orders.id)
      )
      .leftJoin(adminUser, eq(adminUser.id, schema.dispute.resolvedBy));

    const rows = await (isAdmin
      ? base.where(eq(schema.orders.id, orderId)).limit(1)
      : base
          .where(
            and(
              eq(schema.orders.id, orderId),
              or(
                eq(schema.orders.buyerId, userId),
                eq(schema.orders.sellerId, userId)
              )
            )
          )
          .limit(1));

    if (!rows.length) return null;
    return rows[0];
  }

  /* ------------------------ STATE CHANGES ------------------------ */

  static async sellerAccept({
    orderId,
    sellerId,
  }: {
    orderId: string;
    sellerId: string;
  }) {
    const now = new Date();
    const tradeDeadline = new Date(Date.now() + TRADE_WINDOW_MS);

    return dbClient.transaction(async (tx) => {
      const order = await tx.query.orders.findFirst({
        where: eq(schema.orders.id, orderId),
      });
      if (!order) return { ok: false, error: "Order not found", status: 404 };
      if (order.sellerId !== sellerId)
        return { ok: false, error: "Forbidden", status: 403 };
      if (order.status !== "ESCROW_HELD")
        return { ok: false, error: "Invalid state", status: 409 };

      await tx
        .update(schema.orders)
        .set({
          status: "IN_TRADE",
          sellerAcceptAt: now,
          tradeDeadlineAt: tradeDeadline,
          updatedAt: now,
        })
        .where(eq(schema.orders.id, orderId));

      await tx.insert(schema.orderEvent).values([
        {
          id: uuidv4(),
          orderId,
          actorId: sellerId,
          type: "SELLER_ACCEPTED",
          message: "Seller accepted",
          createdAt: now,
        },
        {
          id: uuidv4(),
          orderId,
          actorId: null,
          type: "DEADLINE_SET",
          message: "Trade deadline set",
          createdAt: now,
        },
      ]);

      await cancelAllExpireJobs(orderId);
      await scheduleTradeExpire(orderId, tradeDeadline);

      return {
        ok: true,
        buyerId: order.buyerId,
        sellerId: order.sellerId,
        tradeDeadlineAt: tradeDeadline.toISOString(),
      };
    });
  }

  static async sellerConfirm({
    orderId,
    sellerId,
  }: {
    orderId: string;
    sellerId: string;
  }) {
    const now = new Date();
    return dbClient.transaction(async (tx) => {
      const o = await tx.query.orders.findFirst({
        where: eq(schema.orders.id, orderId),
      });
      if (!o) return { ok: false, error: "Not found", status: 404 };
      if (o.sellerId !== sellerId)
        return { ok: false, error: "Forbidden", status: 403 };
      if (!["IN_TRADE", "AWAIT_CONFIRM"].includes(o.status))
        return { ok: false, error: "Invalid state", status: 409 };

      await tx
        .update(schema.orders)
        .set({
          sellerConfirmedAt: now,
          status: o.buyerConfirmedAt ? "COMPLETED" : "AWAIT_CONFIRM",
          updatedAt: now,
        })
        .where(
          and(
            eq(schema.orders.id, orderId),
            isNull(schema.orders.sellerConfirmedAt)
          )
        );

      await tx.insert(schema.orderEvent).values({
        id: uuidv4(),
        orderId,
        actorId: sellerId,
        type: "SELLER_CONFIRMED",
        message: "Seller confirmed",
        createdAt: now,
      });

      if (o.buyerConfirmedAt) {
        await releaseAndPayout(tx, {
          id: o.id,
          itemId: o.itemId,
          buyerId: o.buyerId,
          sellerId: o.sellerId,
          total: o.total,
        });
        await cancelAllExpireJobs(orderId);
      }

      return { ok: true };
    });
  }

  static async buyerConfirm({
    orderId,
    buyerId,
  }: {
    orderId: string;
    buyerId: string;
  }) {
    const now = new Date();
    return dbClient.transaction(async (tx) => {
      const o = await tx.query.orders.findFirst({
        where: eq(schema.orders.id, orderId),
      });
      if (!o) return { ok: false, error: "Not found", status: 404 };
      if (o.buyerId !== buyerId)
        return { ok: false, error: "Forbidden", status: 403 };
      if (!["IN_TRADE", "AWAIT_CONFIRM"].includes(o.status))
        return { ok: false, error: "Invalid state", status: 409 };

      await tx
        .update(schema.orders)
        .set({
          buyerConfirmedAt: now,
          status: o.sellerConfirmedAt ? "COMPLETED" : "AWAIT_CONFIRM",
          updatedAt: now,
        })
        .where(
          and(
            eq(schema.orders.id, orderId),
            isNull(schema.orders.buyerConfirmedAt)
          )
        );

      await tx.insert(schema.orderEvent).values({
        id: uuidv4(),
        orderId,
        actorId: buyerId,
        type: "BUYER_CONFIRMED",
        message: "Buyer confirmed",
        createdAt: now,
      });

      if (o.sellerConfirmedAt) {
        await releaseAndPayout(tx, {
          id: o.id,
          itemId: o.itemId,
          buyerId: o.buyerId,
          sellerId: o.sellerId,
          total: o.total,
        });
        await cancelAllExpireJobs(orderId);
      }

      return { ok: true };
    });
  }

  /**
   * raiseDispute: Manual dispute from buyer/seller
   */
  // static async raiseDispute(params: {
  //   orderId: string;
  //   actorId: string;
  //   reasonCode?: string;
  // }): Promise<
  //   | { ok: true; buyerId: string; sellerId: string }
  //   | { ok: false; error: string; status: number }
  // > {
  //   const { orderId, actorId, reasonCode } = params;

  //   // 1) Load order
  //   const order = await dbClient.query.orders.findFirst({
  //     where: eq(schema.orders.id, orderId),
  //     columns: { id: true, status: true, buyerId: true, sellerId: true },
  //   });

  //   if (!order) {
  //     return { ok: false, error: "Order not found", status: 404 };
  //   }

  //   // 2) Check actor is participant
  //   if (actorId !== order.buyerId && actorId !== order.sellerId) {
  //     return { ok: false, error: "Not authorized", status: 403 };
  //   }

  //   // 3) Check status allows dispute (IN_TRADE or AWAIT_CONFIRM)
  //   if (!["IN_TRADE", "AWAIT_CONFIRM"].includes(order.status)) {
  //     return {
  //       ok: false,
  //       error: `Cannot dispute from status ${order.status}`,
  //       status: 400,
  //     };
  //   }

  //   // 4) Update order to DISPUTED
  //   const now = new Date();
  //   await dbClient
  //     .update(schema.orders)
  //     .set({
  //       status: "DISPUTED",
  //       disputedAt: now,
  //       updatedAt: now,
  //     })
  //     .where(eq(schema.orders.id, orderId));

  //   // 5) Create order event
  //   await dbClient.insert(schema.orderEvent).values({
  //     id: uuidv4(),
  //     orderId,
  //     actorId,
  //     type: "DISPUTED",
  //     message: reasonCode ? `Disputed: ${reasonCode}` : "Disputed by user",
  //     createdAt: now,
  //   });

  //   return { ok: true, buyerId: order.buyerId, sellerId: order.sellerId };
  // }

  static async expireIfDue({
    orderId,
    reason,
  }: {
    orderId: string;
    reason: "SELLER_TIMEOUT" | "TRADE_TIMEOUT";
  }): Promise<{ changed: boolean; buyerId?: string; sellerId?: string }> {
    const now = new Date();

    return dbClient.transaction(async (tx) => {
      const o = await tx.query.orders.findFirst({
        where: eq(schema.orders.id, orderId),
      });
      if (!o) return { changed: false };

      // --- NEW: ถ้าอยู่สถานะ DISPUTED ให้ใช้ fallback เมื่อถึง tradeDeadlineAt ---
      if (o.status === "DISPUTED") {
        const due =
          o.tradeDeadlineAt &&
          new Date(o.tradeDeadlineAt).getTime() <= now.getTime();

        if (!due) {
          // ยังไม่ถึงเวลา → ยังไม่ทำอะไร
          return { changed: false, buyerId: o.buyerId, sellerId: o.sellerId };
        }

        // ถึงเวลาแล้ว → auto-resolve (idempotent)
        const r = await autoResolveDisputeOnTimeout(tx, o, now);
        await cancelAllExpireJobs(o.id);
        return r;
      }

      // --- ไปสถานะปลายทางแล้ว ไม่ต้องทำอะไร (ยกเว้น DISPUTED จัดการด้านบน) ---
      if (["COMPLETED", "CANCELLED", "EXPIRED"].includes(o.status)) {
        return { changed: false, buyerId: o.buyerId, sellerId: o.sellerId };
      }

      const holdDue =
        o.status === "ESCROW_HELD" &&
        o.deadlineAt &&
        new Date(o.deadlineAt).getTime() <= now.getTime();

      const tradeDue =
        (o.status === "IN_TRADE" || o.status === "AWAIT_CONFIRM") &&
        o.tradeDeadlineAt &&
        new Date(o.tradeDeadlineAt).getTime() <= now.getTime();

      if (!holdDue && !tradeDue) {
        return { changed: false, buyerId: o.buyerId, sellerId: o.sellerId };
      }

      // ✅ กรณีหมดเวลา trade และ "มีแต่ผู้ขายกดยืนยัน" → ปล่อยเงินให้ผู้ขาย
      if (tradeDue && o.sellerConfirmedAt && !o.buyerConfirmedAt) {
        await releaseAndPayout(tx, {
          id: o.id,
          itemId: o.itemId,
          buyerId: o.buyerId,
          sellerId: o.sellerId,
          total: o.total,
        });

        await tx.insert(schema.orderEvent).values({
          id: uuidv4(),
          orderId: o.id,
          actorId: null,
          type: "EXPIRED_AUTO_PAYOUT",
          message:
            "Trade deadline passed with only seller confirmation: released to seller",
          createdAt: now,
        });

        await cancelAllExpireJobs(o.id);
        return { changed: true, buyerId: o.buyerId, sellerId: o.sellerId };
      }

      // Idempotency guard: เคย RELEASE แล้วถือว่าเสร็จสิ้นไปแล้ว
      const existedRelease = await tx.query.walletTx.findFirst({
        where: and(
          eq(schema.walletTx.orderId, o.id),
          eq(schema.walletTx.action, "5")
        ),
        columns: { id: true },
      });
      if (existedRelease) {
        await tx
          .update(schema.orders)
          .set({ status: "COMPLETED", updatedAt: now })
          .where(eq(schema.orders.id, o.id));
        return { changed: true, buyerId: o.buyerId, sellerId: o.sellerId };
      }

      // ✅ DEFAULT: ไม่มีใครยืนยัน หรือ buyer ฝ่ายเดียว → คืนเงินให้ buyer
      const existedRefund = await tx.query.walletTx.findFirst({
        where: and(
          eq(schema.walletTx.orderId, o.id),
          eq(schema.walletTx.action, "6")
        ),
        columns: { id: true },
      });

      if (!existedRefund) {
        const amountStr =
          typeof o.total === "string" ? o.total : Number(o.total).toFixed(2);

        await tx
          .update(schema.wallet)
          .set({
            held: sql`held - ${amountStr}`,
            balance: sql`balance + ${amountStr}`,
            updatedAt: now,
          })
          .where(eq(schema.wallet.userId, o.buyerId));

        await tx.insert(schema.walletTx).values({
          id: uuidv4(),
          userId: o.buyerId,
          orderId: o.id,
          action: "6", // REFUND
          amount: amountStr,
          createdAt: now,
        });
      }

      await tx
        .update(schema.orders)
        .set({
          status: "EXPIRED",
          updatedAt: now,
        })
        .where(eq(schema.orders.id, o.id));

      await tx
        .update(schema.item)
        .set({ status: 1, isActive: true, updatedAt: now })
        .where(eq(schema.item.id, o.itemId));

      await tx.insert(schema.orderEvent).values({
        id: uuidv4(),
        orderId: o.id,
        actorId: null,
        type: "EXPIRED",
        message:
          reason === "SELLER_TIMEOUT"
            ? "Expired: seller did not accept in time (refunded to buyer)"
            : "Expired: trade deadline passed (refunded to buyer)",
        createdAt: now,
      });

      await cancelAllExpireJobs(o.id);

      return { changed: true, buyerId: o.buyerId, sellerId: o.sellerId };
    });
  }

  static async cancel({
    orderId,
    actorId,
  }: {
    orderId: string;
    actorId: string;
  }): Promise<
    | { ok: true; buyerId: string; sellerId: string }
    | { ok: false; status?: number; error: string }
  > {
    const now = new Date();

    return dbClient.transaction(async (tx) => {
      const o = await tx.query.orders.findFirst({
        where: eq(schema.orders.id, orderId),
      });
      if (!o) return { ok: false, status: 404, error: "Order not found" };

      // ต้องเป็น buyer หรือ seller เท่านั้น
      if (o.buyerId !== actorId && o.sellerId !== actorId) {
        return { ok: false, status: 403, error: "Forbidden" };
      }

      // สถานะปลายทางแล้ว
      if (["COMPLETED", "EXPIRED"].includes(o.status)) {
        return { ok: false, status: 409, error: "Order already finalized" };
      }

      // ยกเลิกซ้ำ (idempotent)
      if (o.status === "CANCELLED") {
        return { ok: true, buyerId: o.buyerId, sellerId: o.sellerId };
      }

      // ❗️สำคัญ: ยกเลิกได้เฉพาะก่อนเริ่มเทรดเท่านั้น
      if (o.status !== "ESCROW_HELD") {
        return {
          ok: false,
          status: 409,
          error: "Order is already in trade; cancel is not allowed",
        };
      }

      // ป้องกันกรณีปล่อยเงินไปแล้ว (เผื่อ race)
      const existedRelease = await tx.query.walletTx.findFirst({
        where: and(
          eq(schema.walletTx.orderId, o.id),
          eq(schema.walletTx.action, "5")
        ),
        columns: { id: true },
      });
      if (existedRelease) {
        return { ok: false, status: 409, error: "Order already released" };
      }

      // คืนเงินให้ buyer ถ้ายังไม่เคย REFUND
      const existedRefund = await tx.query.walletTx.findFirst({
        where: and(
          eq(schema.walletTx.orderId, o.id),
          eq(schema.walletTx.action, "6")
        ),
        columns: { id: true },
      });

      if (!existedRefund) {
        const amountStr =
          typeof o.total === "string" ? o.total : Number(o.total).toFixed(2);

        await tx
          .update(schema.wallet)
          .set({
            held: sql`held - ${amountStr}`,
            balance: sql`balance + ${amountStr}`,
            updatedAt: now,
          })
          .where(eq(schema.wallet.userId, o.buyerId));

        await tx.insert(schema.walletTx).values({
          id: uuidv4(),
          userId: o.buyerId,
          orderId: o.id,
          action: "6", // REFUND
          amount: amountStr,
          createdAt: now,
        });
      }

      // เปลี่ยนสถานะ -> CANCELLED และเปิดขาย item กลับ
      await tx
        .update(schema.orders)
        .set({
          status: "CANCELLED",
          cancelledBy: actorId,
          cancelledAt: now,
          updatedAt: now,
        })
        .where(eq(schema.orders.id, o.id));

      await tx
        .update(schema.item)
        .set({ status: 1, isActive: true, updatedAt: now })
        .where(eq(schema.item.id, o.itemId));

      await tx.insert(schema.orderEvent).values({
        id: uuidv4(),
        orderId: o.id,
        actorId: actorId,
        type: "CANCELLED",
        message: "Order cancelled",
        createdAt: now,
      });

      await cancelAllExpireJobs(o.id);

      return { ok: true, buyerId: o.buyerId, sellerId: o.sellerId };
    });
  }

  /* ------------------------ DISPUTE ------------------------ */

  static async raiseDispute({
    orderId,
    actorId,
    reasonCode,
  }: {
    orderId: string;
    actorId: string;
    reasonCode: string;
  }): Promise<
    | {
        ok: true;
        buyerId: string;
        sellerId: string;
        tradeDeadlineAt: string | null;
      }
    | { ok: false; status?: number; error: string }
  > {
    const now = new Date();

    return dbClient.transaction(async (tx) => {
      const o = await tx.query.orders.findFirst({
        where: eq(schema.orders.id, orderId),
      });
      if (!o) return { ok: false, status: 404, error: "Order not found" };

      if (o.buyerId !== actorId && o.sellerId !== actorId) {
        return { ok: false, status: 403, error: "Forbidden" };
      }

      const upper = String(o.status || "").toUpperCase();
      if (!["IN_TRADE", "AWAIT_CONFIRM"].includes(upper)) {
        if (upper === "DISPUTED") {
          return {
            ok: true,
            buyerId: o.buyerId,
            sellerId: o.sellerId,
            tradeDeadlineAt: o.tradeDeadlineAt
              ? new Date(o.tradeDeadlineAt).toISOString()
              : null,
          };
        }
        return { ok: false, status: 409, error: "Invalid state to dispute" };
      }

      const tdl = new Date(Date.now() + DISPUTE_EXTENSION_MS);

      await tx
        .update(schema.orders)
        .set({
          status: "DISPUTED",
          disputedAt: now,
          tradeDeadlineAt: tdl,
          updatedAt: now,
        })
        .where(eq(schema.orders.id, o.id));

      await tx.insert(schema.dispute).values({
        id: uuidv4(),
        orderId: o.id,
        openedBy: actorId,
        reasonCode,
        status: "OPEN",
        createdAt: now,
        updatedAt: now,
      });

      await tx.insert(schema.orderEvent).values({
        id: uuidv4(),
        orderId: o.id,
        actorId,
        type: "DISPUTED",
        message: `Dispute opened (reason=${reasonCode})`,
        createdAt: now,
      });

      return {
        ok: true,
        buyerId: o.buyerId,
        sellerId: o.sellerId,
        tradeDeadlineAt: tdl.toISOString(),
      };
    });
  }

  static async resolveDispute({
    orderId,
    adminId,
    sellerPct,
    sellerAmount, // ระบุจำนวนแทน pct ได้
    note,
  }: {
    orderId: string;
    adminId: string;
    sellerPct?: number;
    sellerAmount?: string | number;
    note?: string;
  }): Promise<
    | {
        ok: true;
        buyerId: string;
        sellerId: string;
        payoutSeller: string;
        refundBuyer: string;
        finalStatus: "COMPLETED";
      }
    | { ok: false; status?: number; error: string }
  > {
    const now = new Date();

    return dbClient.transaction(async (tx) => {
      // admin only
      const admin = await tx
        .select({ userType: schema.user.user_type })
        .from(schema.user)
        .where(eq(schema.user.id, adminId))
        .limit(1);
      if (!(admin.length && admin[0].userType === 2)) {
        return { ok: false, status: 403, error: "Admin only" };
      }

      const o = await tx.query.orders.findFirst({
        where: eq(schema.orders.id, orderId),
      });
      if (!o) return { ok: false, status: 404, error: "Order not found" };

      if (String(o.status).toUpperCase() !== "DISPUTED") {
        return { ok: false, status: 409, error: "Order not in DISPUTED" };
      }

      // ต้องมี dispute ที่ยัง OPEN
      const openDispute = await tx.query.dispute.findFirst({
        where: and(
          eq(schema.dispute.orderId, o.id),
          eq(schema.dispute.status, "OPEN")
        ),
        columns: { id: true },
      });
      if (!openDispute) {
        return { ok: false, status: 409, error: "No open dispute" };
      }

      // ป้องกันยิงซ้ำ: ถ้ามี settlement แล้ว ให้ 409
      const existedSettlement = await tx.query.disputeSettlement.findFirst({
        where: eq(schema.disputeSettlement.orderId, o.id),
        columns: { id: true },
      });
      if (existedSettlement) {
        return { ok: false, status: 409, error: "Already resolved" };
      }

      const totalStr =
        typeof o.total === "string" ? o.total : Number(o.total).toFixed(2);
      const total = Number(totalStr);

      // คำนวณสัดส่วน
      let sellerPart = 0;
      if (typeof sellerAmount !== "undefined") {
        sellerPart = clamp(Number(sellerAmount), 0, total);
        sellerPart = round2(sellerPart);
      } else if (typeof sellerPct !== "undefined") {
        const pct = clamp(Number(sellerPct), 0, 100);
        sellerPart = round2((total * pct) / 100);
      } else {
        return {
          ok: false,
          status: 400,
          error: "sellerPct or sellerAmount is required",
        };
      }
      const buyerPart = round2(total - sellerPart);

      const sellerPartStr = sellerPart.toFixed(2);
      const buyerPartStr = buyerPart.toFixed(2);

      // 1) ลด held ของ buyer รวมทั้งบิล
      await tx
        .update(schema.wallet)
        .set({
          held: sql`held - ${totalStr}`,
          updatedAt: now,
        })
        .where(eq(schema.wallet.userId, o.buyerId));

      // 2) โอน/คืน + บันทึก tx
      if (sellerPart > 0) {
        // release จาก buyer (บันทึกว่าคิดเงินไปเท่าไร)
        await tx.insert(schema.walletTx).values({
          id: uuidv4(),
          userId: o.buyerId,
          orderId: o.id,
          action: "5", // RELEASE
          amount: sellerPartStr,
          createdAt: now,
        });

        // จ่ายเข้า seller.balance
        await tx
          .update(schema.wallet)
          .set({ balance: sql`balance + ${sellerPartStr}`, updatedAt: now })
          .where(eq(schema.wallet.userId, o.sellerId));

        await tx.insert(schema.walletTx).values({
          id: uuidv4(),
          userId: o.sellerId,
          orderId: o.id,
          action: "7", // PAYOUT
          amount: sellerPartStr,
          createdAt: now,
        });
      }

      if (buyerPart > 0) {
        // คืนให้ buyer.balance
        await tx
          .update(schema.wallet)
          .set({ balance: sql`balance + ${buyerPartStr}`, updatedAt: now })
          .where(eq(schema.wallet.userId, o.buyerId));

        await tx.insert(schema.walletTx).values({
          id: uuidv4(),
          userId: o.buyerId,
          orderId: o.id,
          action: "6", // REFUND
          amount: buyerPartStr,
          createdAt: now,
        });
      }

      // 3) ปิด dispute
      await tx
        .update(schema.dispute)
        .set({
          status: "RESOLVED",
          resolvedBy: adminId,
          resolvedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(schema.dispute.orderId, o.id),
            eq(schema.dispute.status, "OPEN")
          )
        );

      // 4) บันทึกผลการชี้ขาด (settlement)
      await tx.insert(schema.disputeSettlement).values({
        id: uuidv4(),
        orderId: o.id,
        disputeId: openDispute.id,
        sellerPct:
          typeof sellerPct === "number"
            ? Math.round(clamp(sellerPct, 0, 100))
            : Math.round((sellerPart / total) * 100),
        sellerAmount: sellerPartStr,
        buyerAmount: buyerPartStr,
        feeAmount: "0",
        note: note ?? null,
        createdBy: adminId,
        createdAt: now,
      });

      // 5) ปรับสถานะออเดอร์ให้จบ
      await tx
        .update(schema.orders)
        .set({ status: "COMPLETED", updatedAt: now })
        .where(eq(schema.orders.id, o.id));

      // (ตัวเลือก) ปิดสินค้า (ขายสำเร็จ)
      await tx
        .update(schema.item)
        .set({ status: 2, isActive: false, updatedAt: now })
        .where(eq(schema.item.id, o.itemId));

      // 6) Event + Notification
      await tx.insert(schema.orderEvent).values({
        id: uuidv4(),
        orderId: o.id,
        actorId: adminId,
        type: "DISPUTE_RESOLVED",
        message: `Resolved by admin. Seller ${sellerPartStr}, Buyer ${buyerPartStr}`,
        createdAt: now,
      });

      await tx.insert(schema.notification).values([
        {
          id: uuidv4(),
          userId: o.buyerId,
          type: "DISPUTE",
          title: "Dispute resolved",
          body: `Refund ${buyerPartStr}, Seller payout ${sellerPartStr}`,
          orderId: o.id,
          data: {
            orderId: o.id,
            payoutSeller: sellerPartStr,
            refundBuyer: buyerPartStr,
          },
          isRead: false,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: uuidv4(),
          userId: o.sellerId,
          type: "DISPUTE",
          title: "Dispute resolved",
          body: `Payout ${sellerPartStr}, Buyer refund ${buyerPartStr}`,
          orderId: o.id,
          data: {
            orderId: o.id,
            payoutSeller: sellerPartStr,
            refundBuyer: buyerPartStr,
          },
          isRead: false,
          createdAt: now,
          updatedAt: now,
        },
      ]);

      await cancelAllExpireJobs(o.id);

      return {
        ok: true,
        buyerId: o.buyerId,
        sellerId: o.sellerId,
        payoutSeller: sellerPartStr,
        refundBuyer: buyerPartStr,
        finalStatus: "COMPLETED",
      };
    });
  }
}

/* ------------------------ INTERNAL ------------------------ */

async function releaseAndPayout(
  tx: any,
  order: {
    id: string;
    itemId: string;
    buyerId: string;
    sellerId: string;
    total: string | number;
  }
) {
  const now = new Date();
  const amountStr =
    typeof order.total === "string"
      ? order.total
      : Number(order.total).toFixed(2);

  // ป้องกันซ้ำ
  const existingRelease = await tx.query.walletTx.findFirst({
    where: and(
      eq(schema.walletTx.orderId, order.id),
      eq(schema.walletTx.action, "5")
    ),
    columns: { id: true },
  });
  if (existingRelease) return;

  // ตัด held buyer
  await tx
    .update(schema.wallet)
    .set({
      held: sql`held - ${amountStr}`,
      updatedAt: now,
    })
    .where(eq(schema.wallet.userId, order.buyerId));

  await tx.insert(schema.walletTx).values({
    id: uuidv4(),
    userId: order.buyerId,
    orderId: order.id,
    action: "5", // RELEASE
    amount: amountStr,
    createdAt: now,
  });

  // โอนให้ seller
  await tx
    .update(schema.wallet)
    .set({
      balance: sql`balance + ${amountStr}`,
      updatedAt: now,
    })
    .where(eq(schema.wallet.userId, order.sellerId));

  await tx.insert(schema.walletTx).values({
    id: uuidv4(),
    userId: order.sellerId,
    orderId: order.id,
    action: "7", // PAYOUT
    amount: amountStr,
    createdAt: now,
  });

  // events
  await tx.insert(schema.orderEvent).values([
    {
      id: uuidv4(),
      orderId: order.id,
      actorId: null,
      type: "ESCROW_RELEASED",
      message: `Released ${amountStr} to seller`,
      createdAt: now,
    },
    {
      id: uuidv4(),
      orderId: order.id,
      actorId: null,
      type: "PAYOUT_CREDITED",
      message: `Credited ${amountStr} to seller wallet`,
      createdAt: now,
    },
  ]);

  // อัปเดต order
  await tx
    .update(schema.orders)
    .set({
      status: "COMPLETED",
      updatedAt: now,
    })
    .where(eq(schema.orders.id, order.id));

  // ปิดสินค้าขายแล้ว
  await tx
    .update(schema.item)
    .set({ status: 2, isActive: false, updatedAt: now })
    .where(eq(schema.item.id, order.itemId));
}

async function autoResolveDisputeOnTimeout(
  tx: any,
  o: {
    id: string;
    itemId: string;
    buyerId: string;
    sellerId: string;
    total: string | number;
    sellerConfirmedAt: Date | null;
    buyerConfirmedAt: Date | null;
  },
  now: Date
): Promise<{ changed: boolean; buyerId: string; sellerId: string }> {
  // ถ้ามี RELEASE/REFUND ไปแล้ว ให้สรุปผลและปิด dispute ทันที
  const released = await tx.query.walletTx.findFirst({
    where: and(
      eq(schema.walletTx.orderId, o.id),
      eq(schema.walletTx.action, "5")
    ),
    columns: { id: true, amount: true },
  });
  const refunded = await tx.query.walletTx.findFirst({
    where: and(
      eq(schema.walletTx.orderId, o.id),
      eq(schema.walletTx.action, "6")
    ),
    columns: { id: true, amount: true },
  });

  const totalStr =
    typeof o.total === "string" ? o.total : Number(o.total).toFixed(2);
  const total = Number(totalStr);

  if (released || refunded) {
    // มีธุรกรรมฝั่งใดฝั่งหนึ่งไปแล้ว → ปิด dispute แบบ AUTO
    const sellerPart = released ? total : 0;
    const buyerPart = refunded ? total : 0;

    await tx
      .update(schema.dispute)
      .set({
        status: "RESOLVED",
        resolvedBy: null,
        resolvedAt: now,
        payoutBuyer: buyerPart.toFixed(2),
        payoutSeller: sellerPart.toFixed(2),
        resolutionType: "AUTO",
        autoVerdict: released
          ? "TIMEOUT_SELLER_CONFIRMED"
          : "TIMEOUT_BUYER_REFUND",
        updatedAt: now,
      })
      .where(
        and(eq(schema.dispute.orderId, o.id), eq(schema.dispute.status, "OPEN"))
      );

    await tx
      .update(schema.orders)
      .set({ status: "COMPLETED", updatedAt: now })
      .where(eq(schema.orders.id, o.id));

    // สินค้า: ถ้าคืนเงิน → เปิดขายอีกครั้ง, ถ้าจ่ายผู้ขาย → ปิดขาย
    await tx
      .update(schema.item)
      .set(
        released
          ? { status: 2, isActive: false, updatedAt: now }
          : { status: 1, isActive: true, updatedAt: now }
      )
      .where(eq(schema.item.id, o.itemId));

    await tx.insert(schema.orderEvent).values({
      id: uuidv4(),
      orderId: o.id,
      actorId: null,
      type: "DISPUTE_AUTO_RESOLVED",
      message: released
        ? "Auto-resolved (timeout): payout to seller"
        : "Auto-resolved (timeout): refund to buyer",
      createdAt: now,
    });

    return { changed: true, buyerId: o.buyerId, sellerId: o.sellerId };
  }

  // ไม่มีธุรกรรม → คำนวณตามกติกา fallback
  const giveToSeller = !!o.sellerConfirmedAt && !o.buyerConfirmedAt;
  const sellerPart = giveToSeller ? total : 0;
  const buyerPart = giveToSeller ? 0 : total;

  // หัก held เพียงครั้งเดียว
  await tx
    .update(schema.wallet)
    .set({ held: sql`held - ${totalStr}`, updatedAt: now })
    .where(eq(schema.wallet.userId, o.buyerId));

  if (sellerPart > 0) {
    const sellerStr = sellerPart.toFixed(2);

    // ใส่ RELEASE ฝั่ง buyer
    await tx.insert(schema.walletTx).values({
      id: uuidv4(),
      userId: o.buyerId,
      orderId: o.id,
      action: "5", // RELEASE
      amount: sellerStr,
      createdAt: now,
    });

    // โอนเข้ากระเป๋าผู้ขาย + บันทึก PAYOUT
    await tx
      .update(schema.wallet)
      .set({ balance: sql`balance + ${sellerStr}`, updatedAt: now })
      .where(eq(schema.wallet.userId, o.sellerId));

    await tx.insert(schema.walletTx).values({
      id: uuidv4(),
      userId: o.sellerId,
      orderId: o.id,
      action: "7", // PAYOUT
      amount: sellerStr,
      createdAt: now,
    });
  }

  if (buyerPart > 0) {
    const buyerStr = buyerPart.toFixed(2);

    await tx
      .update(schema.wallet)
      .set({ balance: sql`balance + ${buyerStr}`, updatedAt: now })
      .where(eq(schema.wallet.userId, o.buyerId));

    await tx.insert(schema.walletTx).values({
      id: uuidv4(),
      userId: o.buyerId,
      orderId: o.id,
      action: "6", // REFUND
      amount: buyerStr,
      createdAt: now,
    });
  }

  // ปิด dispute แบบ AUTO
  await tx
    .update(schema.dispute)
    .set({
      status: "RESOLVED",
      resolvedBy: null,
      resolvedAt: now,
      payoutBuyer: buyerPart.toFixed(2),
      payoutSeller: sellerPart.toFixed(2),
      resolutionType: "AUTO",
      autoVerdict: giveToSeller
        ? "TIMEOUT_SELLER_CONFIRMED"
        : "TIMEOUT_BUYER_REFUND",
      updatedAt: now,
    })
    .where(
      and(eq(schema.dispute.orderId, o.id), eq(schema.dispute.status, "OPEN"))
    );

  await tx
    .update(schema.orders)
    .set({ status: "COMPLETED", updatedAt: now })
    .where(eq(schema.orders.id, o.id));

  await tx
    .update(schema.item)
    .set(
      giveToSeller
        ? { status: 2, isActive: false, updatedAt: now } // ขายสำเร็จ
        : { status: 1, isActive: true, updatedAt: now } // กลับไปขายใหม่
    )
    .where(eq(schema.item.id, o.itemId));

  await tx.insert(schema.orderEvent).values({
    id: uuidv4(),
    orderId: o.id,
    actorId: null,
    type: "DISPUTE_AUTO_RESOLVED",
    message: giveToSeller
      ? "Auto-resolved (timeout): payout to seller"
      : "Auto-resolved (timeout): refund to buyer",
    createdAt: now,
  });

  // (ตัวเลือก) ส่ง notification ให้สองฝั่งด้วย

  return { changed: true, buyerId: o.buyerId, sellerId: o.sellerId };
}
