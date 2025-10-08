import { Elysia, t } from "elysia";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { dbClient } from "@db/client";
import * as schema from "../db/schema";
import { authMiddleware, extractToken } from "../middleware/auth";
import axios from "axios";
import { betterAuth } from "lib/auth-macro";

const SLIP2GO_SECRET = process.env.SLIP2GO_SECRET;
const SLIP2GO_API = (process.env.SLIP2GO_API || "").trim();
if (!SLIP2GO_API) {
  throw new Error("Missing SLIP2GO_API");
}

export const creditsRoutes = new Elysia({ prefix: "/v1/credits" })

  .use(betterAuth)

  // 5. Add slip (Deposit)
  .post(
    "/depose",
    async ({ body, headers, set }) => {
      try {
        const userId = body.id;

        const slipResp = await axios.post(
          SLIP2GO_API,
          {
            payload: {
              imageUrl: body.imageUrl,
              checkDuplicate: true,
              checkReceiver: [
                {
                  accountType: "01014", // SCB
                  accountNameTH: "บูรณิน บุณโยประการ",
                  accountNameEN: "Buranin Bunyoprakan",
                  accountNumber: "6202308713", // อย่าให้มีช่องว่าง/ขีด
                },
              ],
            },
          },
          {
            headers: {
              Authorization: `Bearer ${SLIP2GO_SECRET}`,
              "Content-Type": "application/json",
            },
            // timeout: 10000,
          }
        );

        const result = slipResp.data;
        console.log("Slip2Go response:", result);

        // 3️⃣ ตรวจสอบผลลัพธ์จาก Slip2Go
        if (result?.message !== "Slip found.") {
          set.status = 400;
          return { success: false, message: "Invalid or duplicate slip" };
        }

        const slipRef = result.data.transRef;
        const exists = await dbClient.query.depositRequest.findFirst({
          where: (r, { eq }) => eq(r.slipRef, slipRef),
        });
        if (exists) {
          set.status = 409;
          return { success: false, message: "Slip already used" };
        }

        // 4️⃣ บันทึกข้อมูลการฝาก
        const depositId = uuidv4();
        await dbClient.insert(schema.depositRequest).values({
          id: depositId,
          userId,
          amount: result.data.amount.toString(),
          currency: "THB",
          provider: "SLIP2GO",
          slipUrl: body.imageUrl,
          slipRef,
          status: "VERIFIED",
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const current_wallet = await dbClient
          .select()
          .from(schema.wallet)
          .where(eq(schema.wallet.userId, userId))
          .limit(1);

        const current_balance = parseFloat(current_wallet[0].balance);

        const depositing = parseFloat(result.data.amount.toString());

        const new_amount = current_balance + depositing;

        console.log(
          `User ${userId} depositing ${depositing}, balance: ${current_balance} -> ${new_amount}`
        );

        // 5️⃣ เพิ่มเครดิตเข้ากระเป๋า
        await dbClient
          .update(schema.wallet)
          .set({
            balance: new_amount.toString(),
            updatedAt: new Date(),
          })
          .where(eq(schema.wallet.userId, userId));

        return {
          success: true,
          data: {
            depositId,
            slipRef,
            message: "Deposit successful",
          },
        };
      } catch (error) {
        console.error(error);
        set.status = 500;
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
    {
      headers: t.Object({ authorization: t.String() }),
      body: t.Object({
        imageUrl: t.String({ description: "Slip image URL" }),
      }),
    }
  )

  // 6. Withdraw
  .post(
    "/withdraw",
    async ({ body, headers, set }) => {
      try {
        const token = extractToken(headers.authorization);
        const userId = await authMiddleware(token);

        const wallet = await dbClient
          .select()
          .from(schema.wallet)
          .where(eq(schema.wallet.userId, userId))
          .limit(1);

        if (!wallet.length) {
          set.status = 400;
          return { success: false, error: "Wallet not found", data: null };
        }

        const availableBalance =
          parseFloat(wallet[0].balance) - parseFloat(wallet[0].held);
        if (body.amount > availableBalance) {
          set.status = 400;
          return { success: false, error: "Insufficient balance", data: null };
        }

        const withdrawId = uuidv4();

        await dbClient.insert(schema.withdrawRequest).values({
          id: withdrawId,
          userId: userId,
          amount: body.amount.toString(),
          currency: "THB",
          method: body.method || "BANK",
          accountInfo: body.accountInfo,
          status: "PENDING",
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        return {
          success: true,
          data: { withdrawId, message: "Withdraw request submitted" },
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        set.status = errorMessage.includes("Token") ? 401 : 500;
        return { success: false, error: errorMessage, data: null };
      }
    },
    {
      headers: t.Object({ authorization: t.String() }),
      body: t.Object({
        amount: t.Number({ minimum: 1 }),
        method: t.Optional(t.String()),
        accountInfo: t.Object({}, { additionalProperties: true }),
      }),
    }
  );
