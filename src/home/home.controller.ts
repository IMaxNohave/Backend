import Elysia, { t } from "elysia";
import { betterAuth } from "lib/auth-macro";
import { homeService } from "./home.service";

export const HomeController = new Elysia({
  name: "home.controller",
  prefix: "/v1/home",
})
.use(betterAuth)

/**
 * 1) List items (Home)
 * GET /v1/home?limit=&filter[name]=...&filter[status]=...
 */
.get(
"/",
    async ({ query, /* payload */ }) => {
        // ถ้าต้องใช้ userId จาก JWT ในอนาคต: const userId = payload.id
        const limit = Math.min(parseInt(query.limit ?? "10", 10), 100);
        const filters = query.filter ?? {};
        const data = await homeService.listItems({ limit, filters });
        return { success: true, data };
    },
    {
        auth: false, // ✅ ปิดตรวจ JWT ด้วย macro ไปก่อน อาจจะยังไม่รู้
        query: t.Object({
            filter: t.Optional(
                t.Object({
                name: t.Optional(t.String()),
                detail: t.Optional(t.String()),
                category: t.Optional(t.String()),
                status: t.Optional(t.String()),
                })
            ),
        limit: t.Optional(t.String()),
        }),
    }
)

/**
 * 2) Edit item by seller
 * PATCH /v1/home/edit/:itemid
 */
.patch(
"/edit/:itemid",
    async ({ params, body, payload, set }) => {
        const userId = payload.id;
        const ok = await homeService.updateItemBySeller({
            itemId: params.itemid,
            sellerId: userId,
            patch: {
                image: body.image,
                name: body.name,
                description: body.description,
                price: body.price,
                category: body.category,
            },
        });

        if (!ok) {
            set.status = 404;
            return { success: false, error: "Item not found or unauthorized", data: null };
        }
        return { success: true, data: { message: "Item updated successfully" } };
    },
    {
        auth: true,
        params: t.Object({ 
            itemid: t.String() 
        }),
        body: t.Object({
            image: t.Optional(t.String()),
            name: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
            description: t.Optional(t.String()),
            price: t.Optional(t.Number({ minimum: 0 })),
            category: t.Optional(t.String({ minLength: 36, maxLength: 36 })),
            tag: t.Optional(t.String()),
        }),
    }
)

/**
 * 3) Buy item (create order)
 * POST /v1/home/buy
 */
.post(
"/buy",
    async ({ body, payload, set }) => {
        const buyerId = payload.id;
        const result = await homeService.buyItem({
        buyerId,
        itemId: body.item_id,
        });

        if (!result.ok) {
            set.status = result.status ?? 400;
            return { success: false, error: result.error ?? "Cannot buy", data: null };
        }
        return {
            success: true,
            data: { orderId: result.orderId, message: "Order created successfully" },
        };
    },
    {
        auth: true,
        body: t.Object({
            item_id: t.String({ minLength: 36, maxLength: 36 }),
        }),
    }
)
.get(
"/categories",
    async ({ set /*, payload*/ }) => {
        try {
        const data = await homeService.listCategories();
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
        auth: false // ✅ ปิดตรวจ JWT ด้วย macro ไปก่อน อาจจะยังไม่รู้ ตรงนี้ก็เหมือนกัน ยังไม่รุ้ ฝากด้วยน้องบอล
    }
)