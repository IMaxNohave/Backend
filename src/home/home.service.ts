import { dbClient } from "@db/client";
import * as schema from "../db/schema";
import { and, eq, like, sql, asc } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import {
  scheduleHoldExpire,
  scheduleTradeExpire,
  cancelAllExpireJobs,
} from "../jobs/order-expire.queue";
import { HOLD_WINDOW_MS } from "../order/constants";
import { notify } from "../lib/notify";

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

  if (filters.name) where.push(like(schema.item.name, `%${filters.name}%`));
  if (filters.detail)
    where.push(like(schema.item.detail, `%${filters.detail}%`));
  if (filters.category)
    where.push(like(schema.category.name, `%${filters.category}%`));
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
  sellerId: string | null;
  category_id: string | null;
  category_name: string | null;
  category_detail: string | null;
  expires_at: Date | string | null; // ⬅️ เพิ่มบรรทัดนี้ (บาง DB/driver อาจเป็น string)
}) {
  return {
    id: r.id,
    name: r.name,
    seller_name: r.seller_name,
    sellerId: r.sellerId,
    detail: r.detail,
    category: {
      id: r.category_id,
      name: r.category_name,
      detail: r.category_detail,
    },
    image: r.image,
    price: r.price,
    status: r.status,
    // ⬅️ แปลงเป็น ISO string ให้ FE ใช้ง่ายเสมอ
    expiresAt:
      r.expires_at == null
        ? null
        : typeof r.expires_at === "string"
        ? new Date(r.expires_at).toISOString()
        : r.expires_at.toISOString(),
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
        sellerId: schema.item.sellerId,
        category_id: schema.item.categoryId,
        category_name: schema.category.name,
        category_detail: schema.category.detail,
        expires_at: schema.item.expiresAt,
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
      .where(
        and(eq(schema.item.id, itemId), eq(schema.item.sellerId, sellerId))
      )
      .limit(1);

    if (!exist.length) return false;

    const updateData: any = { updatedAt: new Date() };
    if (patch.image !== undefined) updateData.image = patch.image;
    if (patch.name) updateData.name = patch.name;
    if (patch.description !== undefined) updateData.detail = patch.description;
    if (patch.price !== undefined) updateData.price = patch.price.toString();
    if (patch.category) updateData.categoryId = patch.category;

    await dbClient
      .update(schema.item)
      .set(updateData)
      .where(eq(schema.item.id, itemId));
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
  }): Promise<{
    ok: boolean;
    orderId?: string;
    deadline?: Date;
    error?: string;
    status?: number;
  }> {
    return dbClient.transaction(async (tx) => {
      try {
        // 1) ตรวจ item ยังขายได้
        const [it] = await tx
          .select({
            id: schema.item.id,
            sellerId: schema.item.sellerId,
            price: schema.item.price,
            isActive: schema.item.isActive,
            status: schema.item.status,
          })
          .from(schema.item)
          .where(
            and(
              eq(schema.item.id, itemId),
              eq(schema.item.isActive, true),
              eq(schema.item.status, 1) // พร้อมขาย
            )
          )
          .limit(1);

        if (!it) return { ok: false, error: "Item not available", status: 400 };
        if (it.sellerId === buyerId)
          return { ok: false, error: "Cannot buy your own item", status: 400 };

        const orderId = uuidv4();
        const quantity = 1;
        const total = Number(it.price) * quantity;

        // 2) ล็อคกระเป๋าเงินผู้ซื้อ + ตรวจยอด (ใช้ SELECT ... FOR UPDATE หรือ update arithmetic)
        // วิธี A: ดึงค่ามาเช็คก่อน
        const wallet = await tx.query.wallet.findFirst({
          where: eq(schema.wallet.userId, buyerId),
          columns: { balance: true, held: true },
          // ถ้าต้องการล็อค FOR UPDATE: ใช้ raw SQL ใน Drizzle เวอร์ชันที่รองรับ
        });
        if (!wallet)
          return { ok: false, error: "Wallet not found", status: 400 };
        if (Number(wallet.balance) < total)
          return { ok: false, error: "Insufficient balance", status: 402 };

        // 4) สร้างคำสั่งซื้อ (ตั้งเป็น ESCROW_HELD)
        const deadline = new Date(Date.now() + HOLD_WINDOW_MS);

        await tx.insert(schema.orders).values({
          id: orderId,
          itemId: itemId,
          sellerId: it.sellerId!,
          buyerId,
          quantity,
          priceAtPurchase: it.price,
          total: total.toFixed(2),
          status: "ESCROW_HELD", // ← ชำระสำเร็จและถือเงินแล้ว
          deadlineAt: deadline,
        });

        // 3) โยกยอดเข้า held (atomic)
        await tx
          .update(schema.wallet)
          .set({
            // ใช้ arithmetic ใน DB ป้องกัน race
            balance: sql`balance - ${total}`,
            held: sql`held + ${total}`,
            updatedAt: new Date(),
          })
          .where(eq(schema.wallet.userId, buyerId));

        //   // 3.1) wallet_hold.status = 0 (incomplete)
        // await tx.insert(schema.walletHold).values({
        //   id: uuidv4(),
        //   userId: buyerId,
        //   orderId: orderId,
        //   status: 0, // HOLD
        //   amount: total.toFixed(2),
        // });

        // // 3.2) wallet_tx = HOLD
        await tx.insert(schema.walletTx).values({
          id: uuidv4(),
          userId: buyerId,
          orderId,
          action: "3", // HOLD
          amount: total.toFixed(2),
        });

        // 5) ยิง events: ORDER_CREATED, DEADLINE_SET, ESCROW_HELD
        await tx.insert(schema.orderEvent).values([
          {
            id: uuidv4(),
            orderId,
            actorId: buyerId,
            type: "ORDER_CREATED",
            message: "Order created by buyer",
          },
          {
            id: uuidv4(),
            orderId,
            actorId: null,
            type: "DEADLINE_SET",
            message: "Deadline set to 7 days",
            // meta: { deadlineAt: deadline.toISOString() },
          },
          {
            id: uuidv4(),
            orderId,
            actorId: buyerId,
            type: "ESCROW_HELD",
            message: "Escrow funded",
            // meta: { amount: total.toFixed(2) },
          },
        ]);

        // 6) อัปเดตสถานะสินค้า (กำลังดำเนินการ)
        await tx
          .update(schema.item)
          .set({ status: 2, updatedAt: new Date() })
          .where(eq(schema.item.id, itemId));

        // await notify({
        //   toUserId: buyerId,
        //   type: "ORDER",
        //   title: "Order updated",
        //   body: "Seller accepted and trade started",
        //   orderId: orderId,
        //   data: { status: "IN_TRADE" },
        // });
        if (it.sellerId)
          await notify({
            toUserId: it.sellerId,
            type: "ORDER",
            title: "Order updated",
            body: "Trade started",
            orderId: orderId,
            data: { status: "IN_TRADE" },
          });

        return { ok: true, orderId, deadline };
      } catch (e) {
        console.error("Transaction error:", e);
        return { ok: false, error: "Transaction error", status: 500 };
      }
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

  // เพิ่ม method นี้ใน class homeService (ไฟล์เดียวกับ listItems)
  static async listItemsBySeller({
    sellerId,
    limit,
  }: {
    sellerId: string;
    limit: number;
  }) {
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
        sellerId: schema.item.sellerId,
        category_id: schema.item.categoryId,
        category_name: schema.category.name,
        category_detail: schema.category.detail,
        expires_at: schema.item.expiresAt,
      })
      .from(schema.item)
      .leftJoin(schema.user, eq(schema.item.sellerId, schema.user.id))
      .leftJoin(schema.category, eq(schema.item.categoryId, schema.category.id))
      .where(
        and(
          eq(schema.item.sellerId, sellerId),
          eq(schema.item.isActive, true) // เอาเฉพาะที่ active; เอาออกได้หากต้องการเห็นทั้งหมด
        )
      )
      .limit(limit);

    return rows.map(mapItemRow); // ใช้ mapItemRow เดิมของไฟล์คุณ
  }
}
