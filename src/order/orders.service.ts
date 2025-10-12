// src/modules/orders/orders.service.ts
import { dbClient } from "@db/client";
import * as schema from "../db/schema";
import { and, eq, or, desc, sql, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core"; // <<< สำคัญ!
import { v4 as uuidv4 } from "uuid";

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
      .where(
        and(
          eq(schema.orders.id, orderId),
          or(
            eq(schema.orders.buyerId, userId),
            eq(schema.orders.sellerId, userId)
          )
        )
      )
      .limit(1);

    if (!rows.length) return null;
    const row = rows[0];
    const canView = row.order_status === "ESCROW_HELD" ? false : true; // pending = ESCROW_HELD → ยังห้ามดูรายละเอียด
    if (canView) return row;
    return null;
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
    const tradeDeadline = new Date(
      now.getTime() + TRADE_WINDOW_MIN * 60 * 1000
    );

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
      }

      return { ok: true };
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
