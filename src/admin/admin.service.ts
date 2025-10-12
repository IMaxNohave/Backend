// src/admin/admin.service.ts

import { dbClient } from "@db/client";
import * as schema from "@db/schema";
import { and, eq, or, like, sql, desc, count } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";

// ใช้ Alias สำหรับตาราง user เพื่อแยก Buyer และ Seller
const sellerUser = alias(schema.user, "seller");
const buyerUser = alias(schema.user, "buyer");

// แปลงข้อมูลจาก DB ให้เป็นรูปแบบที่ Frontend ใช้งานง่าย
function mapAdminOrderRow(r: any) {
  return {
    id: r.orders.id,
    itemName: r.item.name,
    price: `${Number(r.orders.priceAtPurchase).toFixed(2)}R$`, // แปลง Decimal เป็น String พร้อม Format
    buyer: r.buyer?.name ?? "N/A",
    seller: r.seller?.name ?? "N/A",
    status: r.orders.status.toLowerCase(), // frontend คาดหวังตัวเล็ก
    createdAt: r.orders.createdAt,
    description: r.item.detail ?? "No description provided.", // อาจจะดึงมาจากที่อื่นถ้าต้องการ
  };
}

export abstract class adminService {
  /**
   * ดึงรายการ Orders ทั้งหมดสำหรับ Admin Dashboard
   * พร้อมระบบค้นหา (Search) และกรองตามสถานะ (Filter)
   */
  static async listAllOrders({
    limit,
    offset,
    searchTerm,
    statusFilter,
  }: {
    limit: number;
    offset: number;
    searchTerm?: string;
    statusFilter?: string;
  }) {
    // 1. สร้างเงื่อนไข (WHERE clause) แบบไดนามิก
    const whereConditions = [];

    // Filter ตามสถานะ (ถ้าไม่ใช่ 'all')
    if (statusFilter && statusFilter !== "all") {
      // Drizzle ต้องการค่าที่เป็น case-sensitive ตรงกับใน DB
      // สมมติว่าใน DB เป็นตัวใหญ่ เช่น 'COMPLETED', 'DISPUTED'
      whereConditions.push(eq(schema.orders.status, statusFilter.toUpperCase()));
    }

    // Filter ตามคำค้นหา (Search Term)
    if (searchTerm) {
      const term = `%${searchTerm}%`;
      whereConditions.push(
        or(
          like(schema.orders.id, term),
          like(schema.item.name, term),
          like(buyerUser.name, term),
          like(sellerUser.name, term)
        )
      );
    }

    const finalWhere = whereConditions.length > 0 ? and(...whereConditions) : undefined;

    // 2. Query หลักเพื่อดึงข้อมูล Orders ตามเงื่อนไข
    const rows = await dbClient
      .select({
        orders: schema.orders,
        item: {
          name: schema.item.name,
          detail: schema.item.detail,
        },
        buyer: {
          name: buyerUser.name,
        },
        seller: {
          name: sellerUser.name,
        },
      })
      .from(schema.orders)
      .leftJoin(schema.item, eq(schema.orders.itemId, schema.item.id))
      .leftJoin(buyerUser, eq(schema.orders.buyerId, buyerUser.id))
      .leftJoin(sellerUser, eq(schema.orders.sellerId, sellerUser.id))
      .where(finalWhere)
      .orderBy(desc(schema.orders.createdAt))
      .limit(limit)
      .offset(offset);
    
    // 3. Query เพื่อนับจำนวนผลลัพธ์ทั้งหมด (สำหรับ Pagination)
    const totalResult = await dbClient
      .select({ value: count() })
      .from(schema.orders)
      .leftJoin(schema.item, eq(schema.orders.itemId, schema.item.id))
      .leftJoin(buyerUser, eq(schema.orders.buyerId, buyerUser.id))
      .leftJoin(sellerUser, eq(schema.orders.sellerId, sellerUser.id))
      .where(finalWhere);

    const total = totalResult[0]?.value ?? 0;

    return {
      orders: rows.map(mapAdminOrderRow),
      total, // จำนวนทั้งหมดสำหรับทำ Pagination
    };
  }

  // (ถ้าต้องการ) สร้าง service สำหรับดึงข้อมูล Stats Cards แยก
  static async getOrderStats() {
    const stats = await dbClient
      .select({
        status: schema.orders.status,
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(schema.orders)
      .groupBy(schema.orders.status);
    
    // แปลงผลลัพธ์ให้อยู่ในรูปแบบที่ใช้ง่าย
    const statsMap: { [key: string]: number } = {};
    for (const s of stats) {
        if (s.status) {
            statsMap[s.status.toLowerCase()] = s.count;
        }
    }
    return statsMap;
  }
}