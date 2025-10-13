// controllers/items.controller.ts
import Elysia, { t } from "elysia";
import { betterAuth } from "lib/auth-macro";
import { itemService } from "../item/items.service";

export const ItemsController = new Elysia({
  name: "items.controller",
  prefix: "/v1/items",
})
  .use(betterAuth)
  .get(
    "/:id",
    async ({ params, set }) => {
      try {
        const data = await itemService.getItemById({ id: params.id });
        if (!data) {
          set.status = 404;
          return { success: false, error: "Item not found", data: null };
        }
        return { success: true, data };
      } catch (e: any) {
        set.status = 500;
        return {
          success: false,
          error: e?.message || "Internal error",
          data: null,
        };
      }
    },
    {
      auth: false, // เปิดเป็น public
      params: t.Object({ id: t.String({ minLength: 36, maxLength: 36 }) }),
    }
  )
  .delete(
    "/:id",
    async ({ params, payload, set }) => {
      const actorId = payload.id;
      const r = await itemService.softDeleteItem({ id: params.id, actorId });
      if (!r.ok) {
        set.status = r.status ?? 400;
        return { success: false, error: r.error };
      }
      return { success: true };
    },
    {
      auth: true,
      params: t.Object({ id: t.String({ minLength: 36, maxLength: 36 }) }),
    }
  );
