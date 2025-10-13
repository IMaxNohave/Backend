// src/modules/orders/orders.service.ts
import { dbClient } from "@db/client";
import * as schema from "../db/schema";
import { and, eq, or, desc, sql, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core"; // <<< สำคัญ!
import { v4 as uuidv4 } from "uuid";
import {
  scheduleTradeExpire,
  cancelAllExpireJobs, // หรือมีฟังก์ชันแยก cancelHoldExpire()
} from "../jobs/order-expire.queue";
import { TRADE_WINDOW_MS, DISPUTE_EXTENSION_MS } from "./constants";

// ทำ alias ให้ตาราง user สองบทบาท
const sellerUser = alias(schema.user, "seller");
const buyerUser = alias(schema.user, "buyer");

function mapOrderRow(r: any) {
  return {
    id: r.order_id,
    status: r.order_status,
    createdAt: r.order_created_at,
    deadlineAt: r.order_deadline_at,
    tradeDeadlineAt: r.trade_deadline_at,
    sellerAcceptAt: r.seller_accepted_at,
    sellerConfirmedAt: r.seller_confirmed_at,
    buyerConfirmedAt: r.buyer_confirmed_at,
    cancelledBy: r.cancelled_by ?? null,
    cancelledAt: r.cancelled_at ?? null,
    disputedAt: r.disputed_at ?? null,

    quantity: r.order_quantity,
    price: Number(r.price_at_purchase),
    total: Number(r.total),

    item: {
      id: r.item_id,
      name: r.item_name,
      image: r.item_image,
    },
    seller: {
      id: r.seller_id,
      name: r.seller_name,
    },
    buyer: {
      id: r.buyer_id,
      name: r.buyer_name,
    },
    hasNewMessages: false,
  };
}

export abstract class ordersService {
  static async listOrdersForBuyer({
    buyerId,
    limit,
  }: {
    buyerId: string;
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
      })
      .from(schema.orders)
      .leftJoin(schema.item, eq(schema.orders.itemId, schema.item.id))
      .leftJoin(sellerUser, eq(schema.orders.sellerId, sellerUser.id))
      .leftJoin(buyerUser, eq(schema.orders.buyerId, buyerUser.id))
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
      })
      .from(schema.orders)
      .leftJoin(schema.item, eq(schema.orders.itemId, schema.item.id))
      .leftJoin(sellerUser, eq(schema.orders.sellerId, sellerUser.id))
      .leftJoin(buyerUser, eq(schema.orders.buyerId, buyerUser.id))
      .where(eq(schema.orders.sellerId, sellerId))
      .orderBy(desc(schema.orders.createdAt))
      .limit(limit);

    return rows;
  }

  static async getOrderDetail({
    orderId,
    userId,
  }: {
    orderId: string;
    userId: string;
  }) {
    // 1) เช็คบทบาทจากตาราง user
    const u = await dbClient
      .select({ userType: schema.user.user_type }) // <-- ต้องมีคอลัมน์นี้ใน schema
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .limit(1);

    const isAdmin = u.length > 0 && u[0].userType === 2;

    // 2) ฟิลด์ที่ select เหมือนเดิม
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
    };

    // 3) ถ้าเป็นแอดมิน → ข้ามการบังคับเป็น buyer/seller
    const base = dbClient
      .select(fields)
      .from(schema.orders)
      .leftJoin(schema.item, eq(schema.orders.itemId, schema.item.id))
      .leftJoin(sellerUser, eq(schema.orders.sellerId, sellerUser.id))
      .leftJoin(buyerUser, eq(schema.orders.buyerId, buyerUser.id));

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
    return rows[0]; // หรือ mapOrderRow(rows[0]) ถ้า FE ใช้รูปแบบนั้น
  }

  static async sellerAccept({
    orderId,
    sellerId,
  }: {
    orderId: string;
    sellerId: string;
  }) {
    const TRADE_WINDOW_MIN = 120;
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

      // ภายใน sellerAccept หลัง update db สำเร็จ
      await cancelAllExpireJobs(orderId); // กัน double-fire
      await scheduleTradeExpire(orderId, tradeDeadline); // ตั้ง trade window ใหม่

      // ✅ ส่ง buyerId กลับไปด้วย เพื่อให้ layer ข้างบน publish ได้
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
  static async raiseDispute(params: {
    orderId: string;
    actorId: string;
    reasonCode?: string;
  }): Promise<
    | { ok: true; buyerId: string; sellerId: string }
    | { ok: false; error: string; status: number }
  > {
    const { orderId, actorId, reasonCode } = params;

    // 1) Load order
    const order = await dbClient.query.orders.findFirst({
      where: eq(schema.orders.id, orderId),
      columns: { id: true, status: true, buyerId: true, sellerId: true },
    });

    if (!order) {
      return { ok: false, error: "Order not found", status: 404 };
    }

    // 2) Check actor is participant
    if (actorId !== order.buyerId && actorId !== order.sellerId) {
      return { ok: false, error: "Not authorized", status: 403 };
    }

    // 3) Check status allows dispute (IN_TRADE or AWAIT_CONFIRM)
    if (!["IN_TRADE", "AWAIT_CONFIRM"].includes(order.status)) {
      return {
        ok: false,
        error: `Cannot dispute from status ${order.status}`,
        status: 400,
      };
    }

    // 4) Update order to DISPUTED
    const now = new Date();
    await dbClient
      .update(schema.orders)
      .set({
        status: "DISPUTED",
        disputedAt: now,
        updatedAt: now,
      })
      .where(eq(schema.orders.id, orderId));

    // 5) Create order event
    await dbClient.insert(schema.orderEvent).values({
      id: uuidv4(),
      orderId,
      actorId,
      type: "DISPUTED",
      message: reasonCode ? `Disputed: ${reasonCode}` : "Disputed by user",
      createdAt: now,
    });

    return { ok: true, buyerId: order.buyerId, sellerId: order.sellerId };
  }

  static async expireIfDue({
    orderId,
    reason, // "SELLER_TIMEOUT" | "TRADE_TIMEOUT"
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

      // ถ้าไปสถานะปลายทางแล้ว ก็ไม่ทำอะไร
      if (
        ["COMPLETED", "CANCELLED", "EXPIRED", "DISPUTED"].includes(o.status)
      ) {
        return { changed: false, buyerId: o.buyerId, sellerId: o.sellerId };
      }

      // ตรวจจริง ๆ ว่าหมดเวลาหรือยัง (กัน job มาก่อนเวลา/เลื่อนเวลา)
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

      // --- คืนเงิน (idempotent): ถ้าเคย RELEASE(5) หรือ REFUND(6) แล้ว ไม่ทำซ้ำ ---
      // ถ้าเคยปล่อยไปขายแล้ว (release 5) แปลว่า deal จบแล้ว — ไม่ควรมา expire ได้
      const existedRelease = await tx.query.walletTx.findFirst({
        where: and(
          eq(schema.walletTx.orderId, o.id),
          eq(schema.walletTx.action, "5") // RELEASE to seller
        ),
        columns: { id: true },
      });
      if (existedRelease) {
        // ป้องกันกรณี race แปลก ๆ: ถือว่าเปลี่ยนสถานะเป็น COMPLETED ไปแล้ว
        await tx
          .update(schema.orders)
          .set({ status: "COMPLETED", updatedAt: now })
          .where(eq(schema.orders.id, o.id));
        return { changed: true, buyerId: o.buyerId, sellerId: o.sellerId };
      }

      const existedRefund = await tx.query.walletTx.findFirst({
        where: and(
          eq(schema.walletTx.orderId, o.id),
          eq(schema.walletTx.action, "6") // REFUND back to buyer
        ),
        columns: { id: true },
      });

      // ถ้ายังไม่เคยคืน → โยกเงิน held -> balance ให้ buyer
      if (!existedRefund) {
        const amountStr =
          typeof o.total === "string" ? o.total : Number(o.total).toFixed(2);

        await tx
          .update(schema.wallet)
          .set({
            // held - total, balance + total
            held: sql`held - ${amountStr}`,
            balance: sql`balance + ${amountStr}`,
            updatedAt: now,
          })
          .where(eq(schema.wallet.userId, o.buyerId));

        await tx.insert(schema.walletTx).values({
          id: uuidv4(),
          userId: o.buyerId,
          orderId: o.id,
          action: "6", // REFUND (นิยามรหัสไว้ให้ชัด)
          amount: amountStr,
          createdAt: now,
        });
      }

      // อัปเดตสถานะออเดอร์ → EXPIRED
      await tx
        .update(schema.orders)
        .set({
          status: "EXPIRED",
          updatedAt: now,
          // cancelledAt: now, // ถ้าต้องการบันทึกเวลาหยุดงานร่วมด้วย
        })
        .where(eq(schema.orders.id, o.id));

      // เปิดขายสินค้าอีกครั้ง (แล้วแต่นโยบาย: ใช้ status=1 "พร้อมขาย" + isActive=1)
      await tx
        .update(schema.item)
        .set({ status: 1, isActive: true, updatedAt: now })
        .where(eq(schema.item.id, o.itemId));

      // Events
      await tx.insert(schema.orderEvent).values({
        id: uuidv4(),
        orderId: o.id,
        actorId: null,
        type: "EXPIRED",
        message:
          reason === "SELLER_TIMEOUT"
            ? "Expired: seller did not accept in time"
            : "Expired: trade deadline passed",
        createdAt: now,
      });

      // กันซ้ำ job อื่น
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

      // ตรวจสิทธิ์: ต้องเป็น buyer หรือ seller
      if (o.buyerId !== actorId && o.sellerId !== actorId) {
        return { ok: false, status: 403, error: "Forbidden" };
      }

      // สถานะปลายทางแล้ว ยกเลิกไม่ได้
      if (["COMPLETED", "EXPIRED"].includes(o.status)) {
        return { ok: false, status: 409, error: "Order already finalized" };
      }

      // ยกเลิกซ้ำ (idempotent) — ถือว่าสำเร็จ
      if (o.status === "CANCELLED") {
        return { ok: true, buyerId: o.buyerId, sellerId: o.sellerId };
      }

      // ถ้าปล่อยเงินไปแล้ว (RELEASE=5) ห้ามยกเลิก
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

        // held - total, balance + total
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

      // เปลี่ยนสถานะออเดอร์ -> CANCELLED
      await tx
        .update(schema.orders)
        .set({
          status: "CANCELLED",
          cancelledBy: actorId,
          cancelledAt: now,
          updatedAt: now,
        })
        .where(eq(schema.orders.id, o.id));

      // เปิดขายสินค้าอีกครั้ง (แล้วแต่นโยบายของคุณ)
      await tx
        .update(schema.item)
        .set({ status: 1, isActive: true, updatedAt: now })
        .where(eq(schema.item.id, o.itemId));

      // เพิ่ม event
      await tx.insert(schema.orderEvent).values({
        id: uuidv4(),
        orderId: o.id,
        actorId: actorId,
        type: "CANCELLED",
        message: "Order cancelled",
        createdAt: now,
      });

      // กัน double fire จากคิว
      await cancelAllExpireJobs(o.id);

      return { ok: true, buyerId: o.buyerId, sellerId: o.sellerId };
    });
  }

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
        tradeDeadlineAt: string;
      }
    | { ok: false; status?: number; error: string }
  > {
    const now = new Date();

    return dbClient.transaction(async (tx) => {
      const o = await tx.query.orders.findFirst({
        where: eq(schema.orders.id, orderId),
      });
      if (!o) return { ok: false, status: 404, error: "Order not found" };

      // ต้องเป็น buyer หรือ seller เท่านั้น (admin ไปยิงผ่าน admin tool แยกได้)
      if (o.buyerId !== actorId && o.sellerId !== actorId) {
        return { ok: false, status: 403, error: "Forbidden" };
      }

      // อนุญาตให้ Dispute เฉพาะตอนกำลังเทรด/รอยืนยัน
      if (!["IN_TRADE", "AWAIT_CONFIRM", "DISPUTED"].includes(o.status)) {
        return { ok: false, status: 409, error: "Invalid state" };
      }

      // ถ้า DISPUTED แล้ว → idempotent: คืนข้อมูลเดิม
      if (o.status === "DISPUTED") {
        const baseDeadline = o.tradeDeadlineAt
          ? new Date(o.tradeDeadlineAt).toISOString()
          : now.toISOString();
        return {
          ok: true,
          buyerId: o.buyerId,
          sellerId: o.sellerId,
          tradeDeadlineAt: baseDeadline,
        };
      }

      // มี dispute เปิดอยู่แล้วหรือยัง
      const existed = await tx.query.dispute.findFirst({
        where: and(
          eq(schema.dispute.orderId, orderId),
          eq(schema.dispute.status, "OPEN")
        ),
      });
      if (!existed) {
        await tx.insert(schema.dispute).values({
          id: uuidv4(),
          orderId,
          openedBy: actorId,
          reasonCode,
          bondAmount: "0",
          status: "OPEN",
          createdAt: now,
          updatedAt: now,
        });
      }

      // ขยาย deadline (จาก max(now, tradeDeadlineAtเดิม) + extension)
      const base = Math.max(
        now.getTime(),
        o.tradeDeadlineAt ? new Date(o.tradeDeadlineAt).getTime() : 0
      );
      const newTradeDeadline = new Date(base + DISPUTE_EXTENSION_MS);

      await tx
        .update(schema.orders)
        .set({
          status: "DISPUTED",
          disputedAt: now,
          tradeDeadlineAt: newTradeDeadline,
          updatedAt: now,
        })
        .where(eq(schema.orders.id, orderId));

      await tx.insert(schema.orderEvent).values({
        id: uuidv4(),
        orderId,
        actorId,
        type: "DISPUTED",
        message: `Dispute opened: ${reasonCode}`,
        createdAt: now,
      });

      // ยกเลิก job เดิม แล้วตั้งใหม่ตาม deadline ที่ขยาย
      await cancelAllExpireJobs(orderId);
      await scheduleTradeExpire(orderId, newTradeDeadline);

      return {
        ok: true,
        buyerId: o.buyerId,
        sellerId: o.sellerId,
        tradeDeadlineAt: newTradeDeadline.toISOString(),
      };
    });
  }
}

async function releaseAndPayout(
  tx: any,
  order: {
    id: string;
    itemId: string;
    buyerId: string;
    sellerId: string;
    total: string | number; // drizzle decimal -> string
  }
) {
  const now = new Date();
  const amountStr =
    typeof order.total === "string" ? order.total : order.total.toFixed(2);

  // 1) Idempotency guard: เคย RELEASE แล้วหรือยัง?
  const existingRelease = await tx.query.walletTx.findFirst({
    where: and(
      eq(schema.walletTx.orderId, order.id),
      eq(schema.walletTx.action, "5")
    ),
    columns: { id: true },
  });
  if (existingRelease) return; // ปล่อยไปเลย กันยิงซ้ำ

  // (ถ้าอยากล็อก order เพิ่ม เติม SELECT ... FOR UPDATE ตรงจุด Caller)

  // 2) โยกเงิน: buyer.held -= total
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

  // 3) จ่ายเข้า wallet ผู้ขาย: seller.balance += total
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
    action: "7", // TRABSFER (PAYOUT)
    amount: amountStr,
    createdAt: now,
  });

  // 4) ใส่ event
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
      type: "PAYOUT_CREDITED", // หรือ 'PAYOUT_QUEUED' หากไปจ่ายออก batch ทีหลัง
      message: `Credited ${amountStr} to seller wallet`,
      createdAt: now,
    },
  ]);

  // 5) อัปเดตสถานะ (กันกรณี caller ยังไม่ได้เซ็ต)
  await tx
    .update(schema.orders)
    .set({
      status: "COMPLETED",
      updatedAt: now,
      // escrowReleasedAt: now, // ถ้าเพิ่มคอลัมน์นี้
    })
    .where(eq(schema.orders.id, order.id));

  // (ตัวเลือก) ปิดสินค้าขายแล้ว
  await tx
    .update(schema.item)
    .set({ status: 2, isActive: 0, updatedAt: now }) // แล้วแต่โมเดลของคุณ
    .where(eq(schema.item.id, order.itemId)); // ถ้าจะต้องใช้ itemId ให้ query มาก่อน (หรือส่งเข้ามาใน order)
}
