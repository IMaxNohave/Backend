// src/modules/wallet/wallet.controller.ts
import Elysia, { t } from "elysia";
import { betterAuth } from "lib/auth-macro";
import { walletService } from "./wallet.service";

export const WalletController = new Elysia({
  name: "wallet.controller",
  prefix: "/v1/wallet",
})
  .use(betterAuth)
  .get(
    "/deposits",
    async ({ payload, query }) => {
      const limit = Math.min(Number(query.limit ?? 50), 200);
      const status = (query.status as string | undefined) ?? undefined;
      const data = await walletService.listDepositsForUser({
        userId: payload.id,
        limit,
        status,
      });
      return { success: true, data };
    },
    {
      auth: true,
      query: t.Object({
        limit: t.Optional(t.Union([t.Number(), t.String()])),
        status: t.Optional(t.String()),
      }),
    }
  )
  .get(
    "/withdrawals",
    async ({ payload, query }) => {
      const limit = Math.min(Number(query.limit ?? 50), 200);
      const status = (query.status as string | undefined) ?? undefined;
      const data = await walletService.listWithdrawalsForUser({
        userId: payload.id,
        limit,
        status,
      });
      return { success: true, data };
    },
    {
      auth: true,
      query: t.Object({
        limit: t.Optional(t.Union([t.Number(), t.String()])),
        status: t.Optional(t.String()),
      }),
    }
  );
