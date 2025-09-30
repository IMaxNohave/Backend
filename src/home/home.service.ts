import { dbClient } from "@db/client";
import * as schema from "../db/schema";
import { and, eq, like, sql, asc } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

/** --------- Helpers --------- **/
type Filters = {
  name?: string;
  detail?: string;
  category?: string;
  status?: string;
};

function buildWhere(filters: Filters) {
  // เงื่อนไขพื้นฐาน: ต้อง active
  const where = [eq(schema.item.isActive, true)] as any[];

  if (filters.name)     where.push(like(schema.item.name, `%${filters.name}%`));
  if (filters.detail)   where.push(like(schema.item.detail, `%${filters.detail}%`));
  if (filters.category) where.push(like(schema.category.name, `%${filters.category}%`));
  if (filters.status && !isNaN(+filters.status)) {
    where.push(eq(schema.item.status, +filters.status));
  }
  return where;
}

// แปลงแถวจาก DB -> รูปแบบที่ FE ใช้
function mapItemRow(r: {
  id: string;
  name: string;
  detail: string | null;
  image: string | null;
  price: number;
  status: number;
  seller_name: string | null;
  category_id: string | null;
  category_name: string | null;
  category_detail: string | null;
}) {
  return {
    id: r.id,
    name: r.name,
    seller_name: r.seller_name,
    detail: r.detail,
    category: {
      id: r.category_id,
      name: r.category_name,
      detail: r.category_detail,
    },
    image: r.image,
    price: r.price, // number แล้ว
    status: r.status,
  };
}

/** --------- Service --------- **/
export abstract class homeService {
  /**
   * List items with optional filters
   */
  static async listItems({
    limit,
    filters,
  }: {
    limit: number;
    filters: Filters;
  }) {
    // แคสต์ DECIMAL -> number ตั้งแต่ชั้น select
    const priceNumber = sql<number>`CAST(${schema.item.price} AS DECIMAL(12,2))`;

    const rows = await dbClient
      .select({
        id: schema.item.id,
        name: schema.item.name,
        detail: schema.item.detail,
        image: schema.item.image,
        price: priceNumber,
        status: schema.item.status,
        seller_name: schema.user.name,
        category_id: schema.item.categoryId,
        category_name: schema.category.name,
        category_detail: schema.category.detail,
      })
      .from(schema.item)
      .leftJoin(schema.user, eq(schema.item.sellerId, schema.user.id))
      .leftJoin(schema.category, eq(schema.item.categoryId, schema.category.id))
      .where(and(...buildWhere(filters)))
      .limit(limit);

    return rows.map(mapItemRow);
  }

  /**
   * Update item (only owner can edit)
   * @returns boolean updated?
   */
  static async updateItemBySeller({
    itemId,
    sellerId,
    patch,
  }: {
    itemId: string;
    sellerId: string;
    patch: {
      image?: string;
      name?: string;
      description?: string;
      price?: number;
      category?: string;
    };
  }): Promise<boolean> {
    const exist = await dbClient
      .select({ id: schema.item.id })
      .from(schema.item)
      .where(and(eq(schema.item.id, itemId), eq(schema.item.sellerId, sellerId)))
      .limit(1);

    if (!exist.length) return false;

    const updateData: any = { updatedAt: new Date() };
    if (patch.image !== undefined)       updateData.image = patch.image;
    if (patch.name)                      updateData.name = patch.name;
    if (patch.description !== undefined) updateData.detail = patch.description;
    if (patch.price !== undefined)       updateData.price = patch.price.toString();
    if (patch.category)                  updateData.categoryId = patch.category;

    await dbClient.update(schema.item).set(updateData).where(eq(schema.item.id, itemId));
    return true;
  }

  /**
   * Buy item -> create order and mark item status
   * ใช้ transaction ป้องกัน race
   */
  static async buyItem({
    buyerId,
    itemId,
  }: {
    buyerId: string;
    itemId: string;
  }): Promise<{ ok: boolean; orderId?: string; error?: string; status?: number }> {
    return dbClient.transaction(async (tx) => {
      // ต้องเป็นสินค้า active + status = 1 (พร้อมขาย)
      const itemRows = await tx
        .select({
          id: schema.item.id,
          sellerId: schema.item.sellerId,
          price: schema.item.price,
        })
        .from(schema.item)
        .where(
          and(eq(schema.item.id, itemId), eq(schema.item.isActive, true), eq(schema.item.status, 1))
        )
        .limit(1);

      if (!itemRows.length) {
        return { ok: false, error: "Item not available", status: 400 };
      }

      const it = itemRows[0];
      if (it.sellerId === buyerId) {
        return { ok: false, error: "Cannot buy your own item", status: 400 };
      }

      const orderId = uuidv4();
      const quantity = 1;
      const total = parseFloat(it.price) * quantity;

      const deadline = new Date();
      deadline.setDate(deadline.getDate() + 7);

      // สร้างคำสั่งซื้อ
      await tx.insert(schema.orders).values({
        id: orderId,
        itemId: itemId,
        sellerId: it.sellerId!,
        buyerId,
        quantity,
        priceAtPurchase: it.price,
        total: total.toString(),
        status: "PENDING",
        deadlineAt: deadline,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // อัปเดตสถานะ item → 2 (กำลังดำเนินการ)
      await tx.update(schema.item).set({ status: 2 }).where(eq(schema.item.id, itemId));

      return { ok: true, orderId };
    });
  }
  /**
   * ดึงรายการหมวดหมู่ที่ active ทั้งหมด เรียงตามชื่อ
   */
  static async listCategories() {
    const rows = await dbClient
      .select({
        id: schema.category.id,
        name: schema.category.name,
        detail: schema.category.detail,
      })
      .from(schema.category)
      .where(eq(schema.category.isActive, true))
      .orderBy(asc(schema.category.name));

    // ถ้าต้องการ map/แปลงรูปแบบเพิ่มเติม ทำตรงนี้ได้
    return rows;
  }
}
