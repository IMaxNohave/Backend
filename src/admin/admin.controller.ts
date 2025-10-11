// src/modules/admin/admin.controller.ts

import Elysia, { t } from "elysia";
import { betterAuth } from "lib/auth-macro";
import { adminService } from "./admin.service";

export const AdminController = new Elysia({
  name: "admin.controller",
  prefix: "/v1/admin",
})
  .use(betterAuth)

  // Middleware สำหรับตรวจสอบสิทธิ์ Admin ทุก Route ใน Controller นี้
//   .onBeforeHandle(({ payload, set }) => {
//     // ‼️ สำคัญ: ตรวจสอบสิทธิ์ Admin ก่อนเสมอ
//     // user_type: 1=user, 2=admin
//     if (Number(payload.user_type) !== 2) {
//       set.status = 403; // Forbidden
//       return {
//         success: false,
//         error: "Forbidden: Administrator access required.",
//         data: null,
//       };
//     }
//   })

  /**
   * GET /v1/admin/orders
   * ดึงรายการ Orders ทั้งหมดสำหรับ Admin Dashboard
   * รองรับการค้นหา, filter, และ pagination
   */
  .get(
    "/orders",
    async ({ query }) => {
      const limit = Math.min(parseInt(query.limit ?? "20", 10), 100);
      const page = Math.max(parseInt(query.page ?? "1", 10), 1);
      const offset = (page - 1) * limit;

      const data = await adminService.listAllOrders({
        limit,
        offset,
        searchTerm: query.q,
        statusFilter: query.status,
      });
      return { success: true, data };
    },
    {
      auth: true, // ใช้งาน Macro `betterAuth`
      query: t.Object({
        q: t.Optional(t.String()), // Search term
        status: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        page: t.Optional(t.String()),
      }),
    }
  )

  /**
   * GET /v1/admin/stats
   * (ทางเลือก) Endpoint สำหรับดึงข้อมูล Stats โดยเฉพาะ
   */
  .get(
    "/stats",
    async () => {
        const stats = await adminService.getOrderStats();
        return { success: true, data: stats };
    },
    { auth: true }
  );