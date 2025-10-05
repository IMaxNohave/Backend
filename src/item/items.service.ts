import { dbClient } from "@db/client";
import * as schema from "../db/schema";
import { eq, and, sql } from "drizzle-orm";

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
      description: r.detail,      // map detail -> description
      rarity: null,               // ถ้ายังไม่มีคอลัมน์ สามารถคำนวณ/ใส่ null
      condition: null,
      status: r.status,
    };

    return item;
  }
}