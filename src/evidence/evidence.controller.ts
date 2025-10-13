import { Elysia, t } from "elysia";
import { EvidenceService } from "./evidence.service";
import { betterAuth } from "lib/auth-macro";

export const EvidenceController = new Elysia({
  name: "evidence-controller",
  prefix: "/v1/evidence",
})
  .use(betterAuth)
  
  /**
   * POST /v1/evidence - สร้าง evidence ใหม่
   */
  .post(
    "/",
    async ({ body, payload, set }) => {
      const { orderId, url, isVideo, note } = body;

      // ตรวจสอบว่าสามารถ upload ได้หรือไม่
      const check = await EvidenceService.canUploadEvidence(orderId, payload.id);
      if (!check.canUpload) {
        set.status = 403;
        return { success: false, error: check.reason, data: null };
      }

      try {
        const evidence = await EvidenceService.createEvidence({
          orderId,
          byUserId: payload.id,
          url,
          isVideo: isVideo || false,
          note: note || null,
        });

        return { success: true, data: evidence, error: null };
      } catch (error) {
        console.error("Error creating evidence:", error);
        set.status = 500;
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
          data: null,
        };
      }
    },
    {
      auth: true,
      body: t.Object({
        orderId: t.String(),
        url: t.String(),
        isVideo: t.Optional(t.Boolean()),
        note: t.Optional(t.Nullable(t.String())),
      }),
    }
  )

  /**
   * GET /v1/evidence/order/:orderId - ดึง evidence ทั้งหมดของ order
   */
  .get(
    "/order/:orderId",
    async ({ params, payload, set }) => {
      try {
        const evidences = await EvidenceService.getEvidencesByOrderId(
          params.orderId
        );
        return { success: true, data: evidences, error: null };
      } catch (error) {
        console.error("Error fetching evidences:", error);
        set.status = 500;
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
          data: null,
        };
      }
    },
    {
      auth: true,
    }
  )

  /**
   * DELETE /v1/evidence/:id - ลบ evidence (เฉพาะของตัวเอง)
   */
  .delete(
    "/:id",
    async ({ params, payload, set }) => {
      try {
        await EvidenceService.deleteEvidence(params.id, payload.id);
        return { success: true, data: null, error: null };
      } catch (error) {
        console.error("Error deleting evidence:", error);
        set.status = error instanceof Error && error.message.includes("Unauthorized") ? 403 : 500;
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
          data: null,
        };
      }
    },
    {
      auth: true,
    }
  );
