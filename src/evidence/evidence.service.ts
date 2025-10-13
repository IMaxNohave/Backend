import { dbClient as db } from "../db/client";
import { evidence, orders } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";

export class EvidenceService {
  /**
   * สร้าง evidence record ใหม่
   */
  static async createEvidence(data: {
    orderId: string;
    byUserId: string;
    url: string;
    isVideo: boolean;
    note?: string | null;
  }) {
    const id = randomUUID();

    await db.insert(evidence).values({
      id,
      orderId: data.orderId,
      byUserId: data.byUserId,
      url: data.url,
      isVideo: data.isVideo,
      note: data.note || null,
    });

    // เปลี่ยนสถานะ order เป็น DISPUTED
    // await db
    //   .update(orders)
    //   .set({
    //     status: "DISPUTED",
    //     disputedAt: new Date(),
    //   })
    //   .where(eq(orders.id, data.orderId));

    return { id, ...data };
  }

  /**
   * ดึง evidence ทั้งหมดของ order
   */
  static async getEvidencesByOrderId(orderId: string) {
    const result = await db
      .select()
      .from(evidence)
      .where(eq(evidence.orderId, orderId));

    return result;
  }

  /**
   * ดึง evidence ของ user คนหนึ่งใน order
   */
  static async getEvidenceByUserAndOrder(orderId: string, userId: string) {
    const result = await db
      .select()
      .from(evidence)
      .where(and(eq(evidence.orderId, orderId), eq(evidence.byUserId, userId)))
      .limit(1);

    return result[0] || null;
  }

  /**
   * ลบ evidence (ถ้าต้องการให้ลบได้)
   */
  static async deleteEvidence(evidenceId: string, userId: string) {
    // ตรวจสอบว่าเป็นของ user คนนี้
    const ev = await db
      .select()
      .from(evidence)
      .where(eq(evidence.id, evidenceId))
      .limit(1);

    if (!ev[0] || ev[0].byUserId !== userId) {
      throw new Error("Unauthorized to delete this evidence");
    }

    await db.delete(evidence).where(eq(evidence.id, evidenceId));
    return { success: true };
  }

  /**
   * ตรวจสอบว่า user สามารถ upload evidence ได้หรือไม่
   */
  static async canUploadEvidence(orderId: string, userId: string) {
    // 1. ตรวจสอบว่า order มีอยู่และ user เป็น buyer หรือ seller
    const orderResult = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!orderResult[0]) {
      return { canUpload: false, reason: "Order not found" };
    }

    const order = orderResult[0];

    // ต้องเป็น buyer หรือ seller
    const isParticipant = order.buyerId === userId || order.sellerId === userId;
    if (!isParticipant) {
      return { canUpload: false, reason: "Not a participant of this order" };
    }

    // 2. ตรวจสอบสถานะ order ต้องเป็น IN_TRADE, AWAIT_CONFIRM หรือ DISPUTED
    if (
      order.status !== "IN_TRADE" &&
      order.status !== "AWAIT_CONFIRM" &&
      order.status !== "DISPUTED"
    ) {
      return {
        canUpload: false,
        reason:
          "Order must be in trading, awaiting confirmation, or disputed state",
      };
    }

    // 3. ตรวจสอบว่า user คนนี้ upload แล้วหรือยัง
    const existing = await this.getEvidenceByUserAndOrder(orderId, userId);
    if (existing) {
      return { canUpload: false, reason: "Already uploaded evidence" };
    }

    return { canUpload: true, reason: null };
  }
}
