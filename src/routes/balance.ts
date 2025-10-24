import { Elysia, t } from "elysia";
import { eq } from "drizzle-orm";
import { dbClient } from "@db/client";
import { betterAuth } from "lib/auth-macro";
import * as schema from "../db/schema";

export const balanceRoutes = new Elysia()
  // 7. Get balance (wildcard route)
  .use(betterAuth)
  .get(
    "/v1/*",
    async ({ headers, payload, set }) => {
      try {
        const userId = payload.id;

        const wallet = await dbClient
          .select({ balance: schema.wallet.balance })
          .from(schema.wallet)
          .where(eq(schema.wallet.userId, userId))
          .limit(1);

        const balance = wallet.length ? parseFloat(wallet[0].balance) : 0;

        return {
          success: true,
          data: { balance },
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        set.status = errorMessage.includes("Token") ? 401 : 500;
        return { success: false, error: errorMessage, data: null };
      }
    },
    {
      auth: true,
      headers: t.Object({ authorization: t.String() }),
    }
  );
