import { dbClient } from "@db/client";
import { withdrawRequest, wallet, walletTx, actionType, user } from "@db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

export abstract class WithdrawService {
  /**
   * สร้างคำขอถอนเงิน
   */
  static async createWithdrawRequest({
    userId,
    amount,
    bank,
    accountNo,
    accountHolder,
  }: {
    userId: string;
    amount: number;
    bank: string;
    accountNo: string;
    accountHolder: string;
  }) {
    // 1. เช็คว่ามี wallet และยอดเงินพอ
    const userWallet = await dbClient
      .select()
      .from(wallet)
      .where(eq(wallet.userId, userId))
      .limit(1);

    if (!userWallet.length) {
      throw new Error("Wallet not found");
    }

    const balance = Number(userWallet[0].balance);
    const held = Number(userWallet[0].held);
    
    if (balance < amount) {
      throw new Error("Insufficient balance");
    }

    if (amount <= 0) {
      throw new Error("Amount must be greater than 0");
    }

    // 2. Hold เงิน (ย้ายจาก balance ไป held)
    await dbClient
      .update(wallet)
      .set({
        balance: (balance - amount).toFixed(2),
        held: (held + amount).toFixed(2),
        updatedAt: new Date(),
      })
      .where(eq(wallet.userId, userId));

    // 3. สร้างคำขอถอนเงิน
    const withdrawId = uuidv4();
    await dbClient.insert(withdrawRequest).values({
      id: withdrawId,
      userId,
      amount: amount.toString(),
      currency: "THB",
      method: "BANK",
      accountInfo: {
        bank,
        accountNo,
        accountHolder,
      },
      status: "PENDING",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return withdrawId;
  }

  /**
   * ดึงคำขอถอนเงินของ user
   */
  static async getMyWithdrawRequests({ userId }: { userId: string }) {
    const results = await dbClient
      .select()
      .from(withdrawRequest)
      .where(eq(withdrawRequest.userId, userId))
      .orderBy(desc(withdrawRequest.createdAt));

    // ดึงชื่อ admin ที่ process แยกต่างหาก
    const processedByIds = results
      .map((r) => r.processedBy)
      .filter((id): id is string => id !== null && id !== undefined);

    const adminUsers =
      processedByIds.length > 0
        ? await dbClient
            .select({ id: user.id, name: user.name })
            .from(user)
            .where(
              sql`${user.id} IN (${sql.join(
                processedByIds.map((id) => sql`${id}`),
                sql`, `
              )})`
            )
        : [];

    const adminMap = new Map(adminUsers.map((u) => [u.id, u.name]));

    // รวมข้อมูล
    return results.map((r) => ({
      ...r,
      processedByName: r.processedBy ? adminMap.get(r.processedBy) || null : null,
    }));
  }

  /**
   * ดึงคำขอถอนเงินทั้งหมด (สำหรับ admin)
   */
  static async getAllWithdrawRequests() {
    const results = await dbClient
      .select({
        id: withdrawRequest.id,
        userId: withdrawRequest.userId,
        userName: user.name,
        userEmail: user.email,
        amount: withdrawRequest.amount,
        currency: withdrawRequest.currency,
        method: withdrawRequest.method,
        accountInfo: withdrawRequest.accountInfo,
        status: withdrawRequest.status,
        failureReason: withdrawRequest.failureReason,
        processedBy: withdrawRequest.processedBy,
        processedAt: withdrawRequest.processedAt,
        createdAt: withdrawRequest.createdAt,
        updatedAt: withdrawRequest.updatedAt,
      })
      .from(withdrawRequest)
      .leftJoin(user, eq(withdrawRequest.userId, user.id))
      .orderBy(desc(withdrawRequest.createdAt));

    // ดึงชื่อ admin ที่ process แยกต่างหาก
    const processedByIds = results
      .map((r) => r.processedBy)
      .filter((id): id is string => id !== null && id !== undefined);

    const adminUsers =
      processedByIds.length > 0
        ? await dbClient
            .select({ id: user.id, name: user.name })
            .from(user)
            .where(
              sql`${user.id} IN (${sql.join(
                processedByIds.map((id) => sql`${id}`),
                sql`, `
              )})`
            )
        : [];

    const adminMap = new Map(adminUsers.map((u) => [u.id, u.name]));

    // รวมข้อมูล
    return results.map((r) => ({
      ...r,
      processedByName: r.processedBy ? adminMap.get(r.processedBy) || null : null,
    }));
  }

  /**
   * อนุมัติคำขอถอนเงิน
   */
  static async approveWithdraw({
    withdrawId,
    adminId,
  }: {
    withdrawId: string;
    adminId: string;
  }) {
    // 1. ดึงข้อมูลคำขอ
    const requests = await dbClient
      .select()
      .from(withdrawRequest)
      .where(eq(withdrawRequest.id, withdrawId))
      .limit(1);

    if (!requests.length) {
      throw new Error("Withdraw request not found");
    }

    const request = requests[0];

    if (request.status !== "PENDING") {
      throw new Error("This request has already been processed");
    }

    const userId = request.userId;
    const amount = Number(request.amount);

    // 2. เช็ค wallet
    const userWallet = await dbClient
      .select()
      .from(wallet)
      .where(eq(wallet.userId, userId))
      .limit(1);

    if (!userWallet.length) {
      throw new Error("Wallet not found");
    }

    const held = Number(userWallet[0].held);
    
    // เช็คว่ามีเงิน held พอหรือไม่
    if (held < amount) {
      throw new Error("Insufficient held balance");
    }

    // 3. หัก held (เงินถูก hold ไว้แล้วตอนส่ง request)
    await dbClient
      .update(wallet)
      .set({
        held: (held - amount).toFixed(2),
        updatedAt: new Date(),
      })
      .where(eq(wallet.userId, userId));

    // 4. อัพเดทสถานะคำขอ
    await dbClient
      .update(withdrawRequest)
      .set({
        status: "APPROVED",
        processedBy: adminId,
        processedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(withdrawRequest.id, withdrawId));

    // 5. บันทึก transaction (ถ้ามี action_type สำหรับ withdraw)
    // TODO: เพิ่ม action type "WITHDRAW" ใน database ก่อน
    // const txId = uuidv4();
    // await dbClient.insert(walletTx).values({
    //   id: txId,
    //   userId,
    //   orderId: null,
    //   action: "WITHDRAW",
    //   amount: (-amount).toFixed(2),
    //   createdAt: new Date(),
    // });

    return true;
  }

  /**
   * ปฏิเสธคำขอถอนเงิน
   */
  static async rejectWithdraw({
    withdrawId,
    adminId,
    reason,
  }: {
    withdrawId: string;
    adminId: string;
    reason?: string;
  }) {
    // 1. ดึงข้อมูลคำขอ
    const requests = await dbClient
      .select()
      .from(withdrawRequest)
      .where(eq(withdrawRequest.id, withdrawId))
      .limit(1);

    if (!requests.length) {
      throw new Error("Withdraw request not found");
    }

    const request = requests[0];

    if (request.status !== "PENDING") {
      throw new Error("This request has already been processed");
    }

    const userId = request.userId;
    const amount = Number(request.amount);

    // 2. เช็ค wallet
    const userWallet = await dbClient
      .select()
      .from(wallet)
      .where(eq(wallet.userId, userId))
      .limit(1);

    if (!userWallet.length) {
      throw new Error("Wallet not found");
    }

    const balance = Number(userWallet[0].balance);
    const held = Number(userWallet[0].held);

    // 3. คืนเงิน (ย้ายจาก held กลับไป balance)
    await dbClient
      .update(wallet)
      .set({
        balance: (balance + amount).toFixed(2),
        held: (held - amount).toFixed(2),
        updatedAt: new Date(),
      })
      .where(eq(wallet.userId, userId));

    // 4. อัพเดทสถานะคำขอ
    await dbClient
      .update(withdrawRequest)
      .set({
        status: "REJECTED",
        processedBy: adminId,
        processedAt: new Date(),
        failureReason: reason || "Rejected by admin",
        updatedAt: new Date(),
      })
      .where(eq(withdrawRequest.id, withdrawId));

    return true;
  }
}
