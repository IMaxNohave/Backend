// src/modules/orders/orders.service.ts
import { dbClient } from "@db/client";
import * as schema from "../db/schema";
import { and, eq, or, desc, sql } from "drizzle-orm";
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
    quantity: r.order_quantity,
    // Drizzle(MySQL) คืน decimal เป็น string → แปลงเป็น number ฝั่ง service
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
        order_quantity: schema.orders.quantity,
        price_at_purchase: schema.orders.priceAtPurchase, // string (DECIMAL)
        total: schema.orders.total, // string (DECIMAL)

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

    return rows.map(mapOrderRow);
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

    return rows.map(mapOrderRow);
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
    return rows[0] ? mapOrderRow(rows[0]) : null;
  }

  static async sellerAccept({
    orderId,
    sellerId,
  }: {
    orderId: string;
    sellerId: string;
  }) {
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
        .set({ status: "READY_TO_TRADE", updatedAt: new Date() })
        .where(eq(schema.orders.id, orderId));

      await tx.insert(schema.orderEvent).values([
        {
          id: uuidv4(),
          orderId,
          actorId: sellerId,
          type: "SELLER_ACCEPTED",
          message: "Seller accepted",
          createdAt: new Date(),
        },
        {
          id: uuidv4(),
          orderId,
          actorId: sellerId,
          type: "SELLER_READY",
          message: "Seller is ready to trade",
          createdAt: new Date(),
        },
      ]);

      return { ok: true };
    });
  }

  static async cancelAndRefund({
    orderId,
    byUserId,
    reason,
    isSystem = false,
  }: {
    orderId: string;
    byUserId: string;
    reason: string;
    isSystem: boolean;
  }) {
    return dbClient.transaction(async (tx) => {
      const order = await tx.query.orders.findFirst({
        where: eq(schema.orders.id, orderId),
      });
      if (!order) return { ok: false, error: "Order not found", status: 404 };

      // คืนเงินได้เมื่อมีเงินค้างใน held
      if (
        order.status === "ESCROW_HELD" ||
        order.status === "READY_TO_TRADE" ||
        order.status === "AWAIT_DELIVERY" ||
        order.status === "AWAIT_CONFIRM"
      ) {
        // คืน held → balance
        await tx
          .update(schema.wallet)
          .set({
            balance: sql`balance + ${order.total}`,
            held: sql`held - ${order.total}`,
            updatedAt: new Date(),
          })
          .where(eq(schema.wallet.userId, order.buyerId));

        await tx.insert(schema.walletTx).values({
          id: uuidv4(),
          userId: order.buyerId,
          orderId: order.id,
          action: "REFUND", // หรือ RELEASE แล้วแต่ convention
          amount: order.total,
          createdAt: new Date(),
        });
      }

      await tx
        .update(schema.orders)
        .set({ status: "CANCELLED", updatedAt: new Date() })
        .where(eq(schema.orders.id, orderId));

      await tx.insert(schema.orderEvent).values([
        {
          id: uuidv4(),
          orderId,
          actorId: isSystem ? null : byUserId,
          type: reason === "EXPIRED" ? "ORDER_EXPIRED" : "ORDER_CANCELLED",
          message: reason || "Cancelled",
          createdAt: new Date(),
        },
        {
          id: uuidv4(),
          orderId,
          actorId: null,
          type: "ESCROW_REFUNDED",
          message: "Escrow refunded to buyer",
          createdAt: new Date(),
        },
      ]);

      // ปรับ item.status กลับเป็นพร้อมขาย (กรณีไม่ได้ขาย/ส่งสำเร็จ)
      await tx
        .update(schema.item)
        .set({ status: 1, updatedAt: new Date() })
        .where(eq(schema.item.id, order.itemId));

      return { ok: true };
    });
  }
}
