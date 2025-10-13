// src/modules/wallet/wallet.service.ts
import { dbClient } from "@db/client";
import * as schema from "../db/schema";
import { eq, desc } from "drizzle-orm";

export abstract class walletService {
  static async listDepositsForUser({
    userId,
    limit = 50,
    status,
  }: {
    userId: string;
    limit?: number;
    status?: string | null;
  }) {
    const rows = await dbClient
      .select({
        id: schema.depositRequest.id,
        amount: schema.depositRequest.amount,
        currency: schema.depositRequest.currency,
        provider: schema.depositRequest.provider,
        slip_url: schema.depositRequest.slipUrl,
        slip_ref: schema.depositRequest.slipRef,
        status: schema.depositRequest.status,
        idempotency_key: schema.depositRequest.idempotencyKey,
        created_at: schema.depositRequest.createdAt,
        updated_at: schema.depositRequest.updatedAt,
      })
      .from(schema.depositRequest)
      .where(
        status
          ? (eq(schema.depositRequest.userId, userId) as any).and(
              eq(schema.depositRequest.status, status)
            )
          : eq(schema.depositRequest.userId, userId)
      )
      .orderBy(desc(schema.depositRequest.createdAt))
      .limit(Math.min(limit, 200));

    return rows;
  }

  static async listWithdrawalsForUser({
    userId,
    limit = 50,
    status,
  }: {
    userId: string;
    limit?: number;
    status?: string | null;
  }) {
    const rows = await dbClient
      .select({
        id: schema.withdrawRequest.id,
        amount: schema.withdrawRequest.amount,
        currency: schema.withdrawRequest.currency,
        method: schema.withdrawRequest.method,
        account_info: schema.withdrawRequest.accountInfo,
        status: schema.withdrawRequest.status,
        failure_code: schema.withdrawRequest.failureCode,
        failure_reason: schema.withdrawRequest.failureReason,
        processed_by: schema.withdrawRequest.processedBy,
        processed_at: schema.withdrawRequest.processedAt,
        created_at: schema.withdrawRequest.createdAt,
        updated_at: schema.withdrawRequest.updatedAt,
      })
      .from(schema.withdrawRequest)
      .where(
        status
          ? (eq(schema.withdrawRequest.userId, userId) as any).and(
              eq(schema.withdrawRequest.status, status)
            )
          : eq(schema.withdrawRequest.userId, userId)
      )
      .orderBy(desc(schema.withdrawRequest.createdAt))
      .limit(Math.min(limit, 200));

    return rows;
  }
}
