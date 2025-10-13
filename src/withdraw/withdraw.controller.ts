import Elysia, { t } from "elysia";
import { betterAuth } from "lib/auth-macro";
import { WithdrawService } from "./withdraw.service";

export const WithdrawController = new Elysia({
  name: "withdraw.controller",
  prefix: "/v1/withdraw",
})
  .use(betterAuth)
  
  /**
   * POST /v1/withdraw/request - สร้างคำขอถอนเงิน (User)
   */
  .post(
    "/request",
    async ({ payload, body, set }) => {
      try {
        const withdrawId = await WithdrawService.createWithdrawRequest({
          userId: payload.id,
          amount: body.amount,
          bank: body.bank,
          accountNo: body.accountNo,
          accountHolder: body.accountHolder,
        });

        return {
          success: true,
          message: "Withdraw request created successfully",
          data: { withdrawId },
        };
      } catch (e: any) {
        set.status = 400;
        return {
          success: false,
          error: e?.message || "Failed to create withdraw request",
          data: null,
        };
      }
    },
    {
      auth: true,
      body: t.Object({
        amount: t.Number({ minimum: 1 }),
        bank: t.String({ minLength: 1 }),
        accountNo: t.String({ minLength: 1 }),
        accountHolder: t.String({ minLength: 1 }),
      }),
    }
  )

  /**
   * GET /v1/withdraw/my-requests - ดูคำขอของตัวเอง (User)
   */
  .get(
    "/my-requests",
    async ({ payload, set }) => {
      try {
        const requests = await WithdrawService.getMyWithdrawRequests({
          userId: payload.id,
        });

        return {
          success: true,
          data: requests,
        };
      } catch (e: any) {
        set.status = 400;
        return {
          success: false,
          error: e?.message || "Failed to fetch withdraw requests",
          data: null,
        };
      }
    },
    { auth: true }
  )

  /**
   * GET /v1/withdraw/all-requests - ดูคำขอทั้งหมด (Admin only)
   */
  .get(
    "/all-requests",
    async ({ payload, set }) => {
      try {
        // เช็คว่าเป็น admin (user_type = 2)
        if (payload.user_type !== 2) {
          set.status = 403;
          return {
            success: false,
            error: "Access denied. Admin only.",
            data: null,
          };
        }

        const requests = await WithdrawService.getAllWithdrawRequests();

        return {
          success: true,
          data: requests,
        };
      } catch (e: any) {
        set.status = 400;
        return {
          success: false,
          error: e?.message || "Failed to fetch all withdraw requests",
          data: null,
        };
      }
    },
    { auth: true }
  )

  /**
   * PATCH /v1/withdraw/:id/approve - อนุมัติคำขอ (Admin only)
   */
  .patch(
    "/:id/approve",
    async ({ payload, params, set }) => {
      try {
        // เช็คว่าเป็น admin
        if (payload.user_type !== 2) {
          set.status = 403;
          return {
            success: false,
            error: "Access denied. Admin only.",
            data: null,
          };
        }

        await WithdrawService.approveWithdraw({
          withdrawId: params.id,
          adminId: payload.id,
        });

        return {
          success: true,
          message: "Withdraw request approved successfully",
        };
      } catch (e: any) {
        set.status = 400;
        return {
          success: false,
          error: e?.message || "Failed to approve withdraw request",
          data: null,
        };
      }
    },
    {
      auth: true,
      params: t.Object({
        id: t.String(),
      }),
    }
  )

  /**
   * PATCH /v1/withdraw/:id/reject - ปฏิเสธคำขอ (Admin only)
   */
  .patch(
    "/:id/reject",
    async ({ payload, params, body, set }) => {
      try {
        // เช็คว่าเป็น admin
        if (payload.user_type !== 2) {
          set.status = 403;
          return {
            success: false,
            error: "Access denied. Admin only.",
            data: null,
          };
        }

        await WithdrawService.rejectWithdraw({
          withdrawId: params.id,
          adminId: payload.id,
          reason: body.reason,
        });

        return {
          success: true,
          message: "Withdraw request rejected successfully",
        };
      } catch (e: any) {
        set.status = 400;
        return {
          success: false,
          error: e?.message || "Failed to reject withdraw request",
          data: null,
        };
      }
    },
    {
      auth: true,
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        reason: t.Optional(t.String()),
      }),
    }
  );
