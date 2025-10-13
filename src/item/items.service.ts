import { dbClient } from "@db/client";
import * as schema from "../db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";

export abstract class itemService {
  static async getItemById({ id }: { id: string }) {
    // แคสต์ DECIMAL -> number
    const priceNumber = sql<number>`CAST(${schema.item.price} AS DECIMAL(12,2))`;

    const rows = await dbClient
      .select({
        id: schema.item.id,
        name: schema.item.name,
        detail: schema.item.detail,
        image: schema.item.image,
        price: priceNumber,
        status: schema.item.status,

        // seller
        sellerId: schema.user.id,
        seller: schema.user.name,
        sellerEmail: schema.user.email,

        // category
        categoryName: schema.category.name,
        expires_at: schema.item.expiresAt,
      })
      .from(schema.item)
      .leftJoin(schema.user, eq(schema.item.sellerId, schema.user.id))
      .leftJoin(schema.category, eq(schema.item.categoryId, schema.category.id))
      .where(and(eq(schema.item.id, id), eq(schema.item.isActive, true)))
      .limit(1);

    const r = rows[0];
    if (!r) return null;

    // map → shape ที่ FE ใช้
    const item = {
      id: r.id,
      name: r.name,
      price: r.price,
      category: r.categoryName ?? null,
      image: r.image,
      seller: r.seller,
      sellerEmail: r.sellerEmail,
      sellerId: r.sellerId,
      description: r.detail, // map detail -> description
      rarity: null, // ถ้ายังไม่มีคอลัมน์ สามารถคำนวณ/ใส่ null
      condition: null,
      status: r.status,
      expiresAt: r.expires_at,
    };

    return item;
  }

  static async softDeleteItem({
    id,
    actorId,
  }: {
    id: string;
    actorId: string;
  }) {
    // 1) ดึง item + เจ้าของ
    const item = await dbClient.query.item.findFirst({
      where: eq(schema.item.id, id),
    });
    if (!item) return { ok: false, status: 404, error: "Item not found" };
    if (!item.isActive) return { ok: true, changed: false }; // ลบไปแล้ว ถือว่าสำเร็จแบบ idempotent

    // 2) ตรวจสิทธิ์: actor = owner หรือ admin
    const u = await dbClient
      .select({ userType: schema.user.user_type })
      .from(schema.user)
      .where(eq(schema.user.id, actorId))
      .limit(1);
    const isAdmin = !!(u.length && u[0].userType === 2);
    const isOwner = item.sellerId === actorId;
    if (!isAdmin && !isOwner) {
      return { ok: false, status: 403, error: "Forbidden" };
    }

    // 3) บล็อกถ้ามีออเดอร์ค้างอยู่
    const blockingStatuses = [
      "ESCROW_HELD",
      "IN_TRADE",
      "AWAIT_CONFIRM",
      "DISPUTED",
    ];
    const openOrder = await dbClient.query.orders.findFirst({
      where: and(
        eq(schema.orders.itemId, id),
        inArray(schema.orders.status, blockingStatuses)
      ),
      columns: { id: true, status: true },
    });
    if (openOrder) {
      return { ok: false, status: 409, error: "Item has active orders" };
    }

    // 4) Soft delete: ปิดการใช้งาน
    await dbClient
      .update(schema.item)
      .set({ isActive: false, status: 0, updatedAt: new Date() })
      .where(eq(schema.item.id, id));

    return { ok: true, changed: true };
  }
}
