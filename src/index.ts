import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import openapi from "@elysiajs/openapi";
import { drizzle } from "drizzle-orm/mysql2";
import { eq, and, like, or, desc, asc, ConsoleLogWriter } from "drizzle-orm";
import mysql from "mysql2/promise";
import * as schema from "db/schema";
import { auth } from "lib/auth";

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

import { UserController } from "user/user.controller";
import { jwtVerify, importJWK, decodeJwt } from "jose";

import { checkDbConnection } from "./db";
// Database connection
const connection = mysql.createPool({
  host: process.env.MYSQL_HOST || "localhost",
  user: process.env.MYSQL_APP_USER || "root",
  password: process.env.MYSQL_APP_PASSWORD || "",
  database: process.env.MYSQL_DB || "marketplace",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

checkDbConnection(connection);

const db = drizzle(connection, { schema, mode: "default" });

// R2 storage
const R2 = new S3Client({
  region: process.env.R2_REGION || "auto", // R2 ใช้ 'auto'
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});
const R2_BUCKET = process.env.R2_BUCKET!;

// อ่าน public key ล่าสุดจากตาราง jwks (เก็บเป็น JSON string ของ JWK)
// async function getVerifyKey() {
//   const row = await db
//     .select({ publicKey: schema.jwks.publicKey })
//     .from(schema.jwks)
//     .orderBy(desc(schema.jwks.createdAt))
//     .limit(1);

//   if (!row.length) throw new Error("No JWKS public key");
//   const jwk = JSON.parse(row[0].publicKey); // {"kty":"OKP","crv":"Ed25519","x":"...","kid":"..."}
//   return importJWK(jwk, "EdDSA");
// }

const ISSUER = process.env.JWT_ISSUER; // ให้ตรงกับฝั่งออก JWT
const AUDIENCE = process.env.JWT_AUDIENCE;

const extractBearer = (authHeader?: string) => {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Authorization header with Bearer token required");
  }
  return authHeader.slice(7);
};

/**
 * Hybrid verify:
 * 1) Verify JWT (EdDSA) ด้วย JWKS → ดึง userId จาก sub
 * 2) อ่าน session จาก better-auth ด้วย cookie
 * 3) ต้องตรงกัน และ session ยัง valid
 * คืน userId
 */
// export const authMiddleware = async (headers: Record<string, any>) => {
//   // 1) JWT ใน Authorization: Bearer <jwt>
//   const jwt = extractBearer(headers.authorization);
//   const key = await getVerifyKey();

//   const { payload } = await jwtVerify(jwt, key, {
//     algorithms: ["EdDSA"],
//     ...(ISSUER ? { issuer: ISSUER } : {}),
//     ...(AUDIENCE ? { audience: AUDIENCE } : {}),
//   });

//   const jwtUserId = (payload.sub as string) || (payload.userId as string);
//   if (!jwtUserId) throw new Error("Invalid token payload");

//   // 2) session จาก better-auth (cookie)
//   const sess = await auth.api.getSession({ headers, asResponse: false } as any);
//   if (!sess?.user?.id) throw new Error("Not signed in");

//   // 3) ต้องเป็นคนเดียวกัน
//   if (sess.user.id !== jwtUserId) throw new Error("Token/user mismatch");

//   return jwtUserId;
// };

// Extract Bearer token helper
const extractToken = (authHeader: string | undefined) => {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Authorization header with Bearer token required");
  }
  return authHeader.substring(7);
};

export const getUserIdFromJWT = (headers: Record<string, any>) => {
  const token = extractBearer(headers.authorization);
  const payload = decodeJwt(token); // ไม่ตรวจลายเซ็น
  const userId =
    (payload.sub as string) ||
    (payload.userId as string) ||
    (payload.uid as string);

  if (!userId) throw new Error("Invalid token payload: missing user id");
  return userId;
};

const app = new Elysia();

app.use(openapi());
app.mount(auth.handler);
app.use(UserController);
app.get("/", () => "Hello Elysia");

// Global error handler
app.onError(({ code, error, set }) => {
  console.error("API Error:", error);

  const errorMessage = error instanceof Error ? error.message : "Unknown error";

  if (
    errorMessage.includes("Token") ||
    errorMessage.includes("Authorization")
  ) {
    set.status = 401;
    return { success: false, error: errorMessage, data: null };
  }

  switch (code) {
    case "NOT_FOUND":
      set.status = 404;
      return { success: false, error: "Resource not found", data: null };
    case "VALIDATION":
      set.status = 400;
      return {
        success: false,
        error: "Validation failed",
        details: errorMessage,
        data: null,
      };
    default:
      set.status = 500;
      return { success: false, error: "Internal server error", data: null };
  }
});

// ========== R2 ENDPOINTS ==========
app.post(
  "/v1/r2/upload-url",
  async ({ body, headers, set }) => {
    try {
      const token = extractToken(headers.authorization);
      // await authMiddleware(headers);

      const b: any = body ?? {};
      const contentType = b.contentType || "image/jpeg";
      const fileName = b.fileName || `${randomUUID()}.jpg`;
      const key = `images/${fileName}`;

      const cmd = new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        ContentType: contentType,
      });

      const url = await getSignedUrl(R2, cmd, { expiresIn: 60 }); // 60 วิ
      // ถ้า bucket เปิด public และตั้งโดเมนไว้ ให้คืน URL สำหรับใช้งานทันที
      const imageUrl = process.env.R2_PUBLIC_BASE
        ? `${process.env.R2_PUBLIC_BASE}/${key}`
        : null;

      return { success: true, data: { uploadUrl: url, key, imageUrl } };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      set.status = msg.includes("Token") ? 401 : 500;
      return { success: false, error: msg, data: null };
    }
  },
  {
    headers: t.Object({ authorization: t.String() }),
    body: t.Object({
      contentType: t.Optional(t.String()),
      fileName: t.Optional(t.String()),
    }),
  }
);

// ========== ITEM ENDPOINTS ==========

// 1. Query list item (Home)
app.get(
  "/v1/home",
  async ({ query, headers, set }) => {
    try {
      const userId = getUserIdFromJWT(headers);

      const limit = Math.min(parseInt(query.limit || "10"), 100);
      const filters = query.filter || {};

      let whereConditions = [eq(schema.item.isActive, true)];

      if (filters.name) {
        whereConditions.push(like(schema.item.name, `%${filters.name}%`));
      }
      if (filters.detail) {
        whereConditions.push(like(schema.item.detail, `%${filters.detail}%`));
      }
      if (filters.category) {
        whereConditions.push(
          like(schema.category.name, `%${filters.category}%`)
        );
      }
      if (filters.status && !isNaN(parseInt(filters.status))) {
        whereConditions.push(eq(schema.item.status, parseInt(filters.status)));
      }

      const items = await db
        .select({
          id: schema.item.id,
          name: schema.item.name,
          detail: schema.item.detail,
          image: schema.item.image,
          price: schema.item.price,
          status: schema.item.status,
          sellerName: schema.user.name,
          categoryId: schema.item.categoryId,
          categoryName: schema.category.name,
          categoryDetail: schema.category.detail,
        })
        .from(schema.item)
        .leftJoin(schema.user, eq(schema.item.sellerId, schema.user.id))
        .leftJoin(
          schema.category,
          eq(schema.item.categoryId, schema.category.id)
        )
        .where(and(...whereConditions))
        .limit(limit);

      const formattedItems = items.map((item) => ({
        id: item.id,
        name: item.name,
        seller_name: item.sellerName,
        detail: item.detail,
        category: {
          id: item.categoryId,
          name: item.categoryName,
          detail: item.categoryDetail,
        },
        image: item.image,
        price: parseFloat(item.price || "0"),
        status: item.status,
      }));

      return { success: true, data: formattedItems };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      set.status = errorMessage.includes("Token") ? 401 : 500;
      return { success: false, error: errorMessage, data: null };
    }
  },
  {
    headers: t.Object({ authorization: t.String() }),
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
);

// 1.5 Query item detail (Item Detail)
// GET /v1/items/:id
app.get(
  "/v1/items/:id",
  async ({ params, headers, set }) => {
    try {
      // ถ้ามี auth ก็ใช้: const userId = await authMiddleware(headers)
      const [row] = await db
        .select({
          id: schema.item.id,
          name: schema.item.name,
          detail: schema.item.detail,
          image: schema.item.image,
          price: schema.item.price,
          status: schema.item.status,
          category: schema.category.name,
          sellerName: schema.user.name,
          sellerEmail: schema.user.email,
          sellerId: schema.user.id,
        })
        .from(schema.item)
        .leftJoin(schema.user, eq(schema.item.sellerId, schema.user.id))
        .leftJoin(
          schema.category,
          eq(schema.item.categoryId, schema.category.id)
        )
        .where(eq(schema.item.id, params.id))
        .limit(1);

      if (!row) {
        set.status = 404;
        return { success: false, error: "Item not found", data: null };
      }

      return {
        success: true,
        data: {
          id: row.id,
          name: row.name,
          description: row.detail,
          image: row.image,
          price: Number(row.price || 0),
          status: row.status,
          category: row.category,
          seller: row.sellerName,
          sellerEmail: row.sellerEmail,
          sellerId: row.sellerId,
          // ใส่ field เสริมถ้าต้องการ เช่น rarity/condition
        },
      };
    } catch (e: any) {
      set.status = 500;
      return {
        success: false,
        error: e?.message || "Internal error",
        data: null,
      };
    }
  },
  { params: t.Object({ id: t.String() }) }
);

// GET /v1/categories
app.get("/v1/categories", async ({ headers, set }) => {
  try {
    // ถ้าต้องการบังคับล็อกอินค่อยเปิดใช้:
    // await authMiddleware(headers)

    const rows = await db
      .select({
        id: schema.category.id,
        name: schema.category.name,
        detail: schema.category.detail,
      })
      .from(schema.category)
      .where(eq(schema.category.isActive, true))
      .orderBy(asc(schema.category.name));

    return { success: true, data: rows };
  } catch (e: any) {
    set.status = 500;
    return {
      success: false,
      error: e?.message || "Internal error",
      data: null,
    };
  }
});

// 2. Add item (Seller)
app.post(
  "/v1/sales",
  async ({ body, headers, set }) => {
    try {
      // const token = extractToken(headers.authorization);
      // const userId = await authMiddleware(headers);

      const userId = getUserIdFromJWT(headers);

      const itemId = randomUUID();

      // (1) เช็ค user มีจริง
      // const u = await db
      //   .select({ id: schema.user.id })
      //   .from(schema.user)
      //   .where(eq(schema.user.id, userId))
      //   .limit(1);
      // if (!u.length) {
      //   set.status = 400;
      //   return { success: false, error: "User not found", data: null };
      // }

      // // (2) หา categoryId จาก body.category
      // let categoryId = body.category; // อาจเป็น id หรือชื่อ
      // if (categoryId.length !== 36) {
      //   const cat = await db
      //     .select({ id: schema.category.id })
      //     .from(schema.category)
      //     .where(
      //       and(
      //         eq(schema.category.name, body.category),
      //         eq(schema.category.isActive, true)
      //       )
      //     )
      //     .limit(1);

      //   if (!cat.length) {
      //     set.status = 400;
      //     return { success: false, error: "Category not found", data: null };
      //   }
      //   categoryId = cat[0].id;
      // }

      await db.insert(schema.item).values({
        id: itemId,
        sellerId: userId,
        name: body.name,
        detail: body.description || null,
        categoryId: body.category,
        image: body.image || null,
        price: body.price.toString(),
        quantity: 1,
        isActive: true,
        status: 1,
      });

      return {
        success: true,
        data: { id: itemId, message: "Item created successfully" },
      };
    } catch (e: any) {
      console.error("Insert item error:", {
        code: e?.code,
        errno: e?.errno,
        sqlState: e?.sqlState,
        sqlMessage: e?.sqlMessage,
        sql: e?.sql,
      });
      set.status = 500;
      return { success: false, error: e?.sqlMessage || e?.message, data: null };
    }
  },
  {
    headers: t.Object({ authorization: t.String() }),
    body: t.Object({
      image: t.Optional(t.String()),
      name: t.String({ minLength: 1, maxLength: 255 }),
      description: t.Optional(t.String()),
      price: t.Number({ minimum: 0 }),
      category: t.String({ minLength: 36, maxLength: 36 }),
      tag: t.Optional(t.String()),
    }),
  }
);

// 3. Edit item (Seller)
app.patch(
  "/v1/home/edit/:itemid",
  async ({ params, body, headers, set }) => {
    try {
      const token = extractToken(headers.authorization);
      const userId = await authMiddleware(token);

      const existingItem = await db
        .select()
        .from(schema.item)
        .where(
          and(
            eq(schema.item.id, params.itemid),
            eq(schema.item.sellerId, userId)
          )
        )
        .limit(1);

      if (!existingItem.length) {
        set.status = 404;
        return {
          success: false,
          error: "Item not found or unauthorized",
          data: null,
        };
      }

      const updateData: any = { updatedAt: new Date() };
      if (body.image !== undefined) updateData.image = body.image;
      if (body.name) updateData.name = body.name;
      if (body.description !== undefined) updateData.detail = body.description;
      if (body.price) updateData.price = body.price.toString();
      if (body.category) updateData.categoryId = body.category;

      await db
        .update(schema.item)
        .set(updateData)
        .where(eq(schema.item.id, params.itemid));

      return {
        success: true,
        data: { message: "Item updated successfully" },
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
    params: t.Object({ itemid: t.String() }),
    body: t.Object({
      image: t.Optional(t.String()),
      name: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
      description: t.Optional(t.String()),
      price: t.Optional(t.Number({ minimum: 0 })),
      category: t.Optional(t.String({ minLength: 36, maxLength: 36 })),
      tag: t.Optional(t.String()),
    }),
  }
);

// 4. Buy item (Buyer) - Create Order
app.patch(
  "/v1/home",
  async ({ body, headers, set }) => {
    try {
      const token = extractToken(headers.authorization);
      const userId = getUserIdFromJWT(headers);

      const item = await db
        .select()
        .from(schema.item)
        .where(
          and(
            eq(schema.item.id, body.item_id),
            eq(schema.item.isActive, true),
            eq(schema.item.status, 1)
          )
        )
        .limit(1);

      if (!item.length) {
        set.status = 400;
        return { success: false, error: "Item not available", data: null };
      }

      const itemData = item[0];
      if (itemData.sellerId === userId) {
        set.status = 400;
        return {
          success: false,
          error: "Cannot buy your own item",
          data: null,
        };
      }

      const orderId = randomUUID();
      const quantity = 1;
      const total = parseFloat(itemData.price) * quantity;

      const deadline = new Date();
      deadline.setDate(deadline.getDate() + 7);

      await db.insert(schema.orders).values({
        id: orderId,
        itemId: body.item_id,
        sellerId: itemData.sellerId!,
        buyerId: userId,
        quantity: quantity,
        priceAtPurchase: itemData.price,
        total: total.toString(),
        status: "PENDING",
        deadlineAt: deadline,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await db
        .update(schema.item)
        .set({ status: 2 })
        .where(eq(schema.item.id, body.item_id));

      return {
        success: true,
        data: { orderId, message: "Order created successfully" },
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
      item_id: t.String({ minLength: 36, maxLength: 36 }),
    }),
  }
);

// ========== CREDIT/WALLET ENDPOINTS ==========

// 5. Add slip (Deposit)
app.post(
  "/v1/credits/depose",
  async ({ body, headers, set }) => {
    try {
      const token = extractToken(headers.authorization);
      const userId = getUserIdFromJWT(headers);

      const depositId = randomUUID();
      const slipRef = `SLIP_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 8)}`;

      await db.insert(schema.depositRequest).values({
        id: depositId,
        userId: userId,
        amount: body.amount.toString(),
        currency: "THB",
        provider: "SLIP2GO",
        slipUrl: body.image,
        slipRef: slipRef,
        status: "PENDING",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return {
        success: true,
        data: { depositId, slipRef, message: "Deposit request submitted" },
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
      image: t.String({ description: "Slip image URL" }),
      amount: t.Number({ minimum: 1 }),
    }),
  }
);

// 6. Withdraw
app.post(
  "/v1/credits/withdraw",
  async ({ body, headers, set }) => {
    try {
      const token = extractToken(headers.authorization);
      const userId = getUserIdFromJWT(headers);

      const wallet = await db
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

      const withdrawId = randomUUID();

      await db.insert(schema.withdrawRequest).values({
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

// 7. Get balance
app.get(
  "/v1/*",
  async ({ headers, set }) => {
    try {
      const token = extractToken(headers.authorization);
      const userId = getUserIdFromJWT(headers);

      const wallet = await db
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
    headers: t.Object({ authorization: t.String() }),
  }
);

// ========== PROFILE ENDPOINTS ==========

// 8. Edit Profile
app.patch(
  "/v1/profile/edit",
  async ({ body, headers, set }) => {
    try {
      const token = extractToken(headers.authorization);
      const userId = getUserIdFromJWT(headers);

      const updateData: any = { updatedAt: new Date() };
      if (body.name) updateData.name = body.name;
      if (body.image !== undefined) updateData.image = body.image;

      await db
        .update(schema.user)
        .set(updateData)
        .where(eq(schema.user.id, userId));

      return {
        success: true,
        data: { message: "Profile updated successfully" },
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
      name: t.Optional(t.String({ minLength: 1 })),
      image: t.Optional(t.String()),
      phone: t.Optional(t.String()),
    }),
  }
);

// 9. Get Profile
app.get(
  "/v1/profile",
  async ({ headers, set }) => {
    try {
      const token = extractToken(headers.authorization);
      const userId = getUserIdFromJWT(headers);

      const user = await db
        .select({
          id: schema.user.id,
          name: schema.user.name,
          email: schema.user.email,
          emailVerified: schema.user.emailVerified,
          image: schema.user.image,
        })
        .from(schema.user)
        .where(eq(schema.user.id, userId))
        .limit(1);

      if (!user.length) {
        set.status = 404;
        return { success: false, error: "User not found", data: null };
      }

      return {
        success: true,
        data: user[0],
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
  }
);

// 10. Login (OAuth-style)
app.post(
  "/v1/login",
  async ({ body, set }) => {
    try {
      const sessionId = randomUUID();
      const token = `token_${Date.now()}_${Math.random().toString(36)}`;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      const mockUserId = randomUUID();

      await db.insert(schema.session).values({
        id: sessionId,
        token: token,
        userId: mockUserId,
        expiresAt: expiresAt,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const wallet = await db
        .select({ balance: schema.wallet.balance })
        .from(schema.wallet)
        .where(eq(schema.wallet.userId, mockUserId))
        .limit(1);

      const balance = wallet.length ? parseFloat(wallet[0].balance) : 0;

      return {
        success: true,
        data: {
          token: token,
          expires: expiresAt.toISOString(),
          username: "Mock User",
          balance: balance,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      set.status = 500;
      return { success: false, error: errorMessage, data: null };
    }
  },
  {
    body: t.Object({
      client_id: t.String(),
      client_secret: t.String(),
      code: t.String(),
    }),
  }
);

// ========== CHAT ENDPOINTS ==========

// 11. Chat Get
app.get(
  "/v1/orders/:order_id",
  async ({ params, headers, set }) => {
    try {
      const token = extractToken(headers.authorization);
      const userId = getUserIdFromJWT(headers);

      const order = await db
        .select()
        .from(schema.orders)
        .where(
          and(
            eq(schema.orders.id, params.order_id),
            or(
              eq(schema.orders.buyerId, userId),
              eq(schema.orders.sellerId, userId)
            )
          )
        )
        .limit(1);

      if (!order.length) {
        set.status = 404;
        return {
          success: false,
          error: "Order not found or unauthorized",
          data: null,
        };
      }

      const messages = await db
        .select({
          id: schema.orderMessage.id,
          senderId: schema.orderMessage.senderId,
          senderName: schema.user.name,
          kind: schema.orderMessage.kind,
          body: schema.orderMessage.body,
          createdAt: schema.orderMessage.createdAt,
          isDeleted: schema.orderMessage.isDeleted,
        })
        .from(schema.orderMessage)
        .leftJoin(schema.user, eq(schema.orderMessage.senderId, schema.user.id))
        .where(
          and(
            eq(schema.orderMessage.orderId, params.order_id),
            eq(schema.orderMessage.isDeleted, false),
            eq(schema.orderMessage.isHidden, false)
          )
        )
        .orderBy(asc(schema.orderMessage.createdAt));

      return {
        success: true,
        data: messages,
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
    params: t.Object({ order_id: t.String() }),
  }
);

// 12. Chat Post
app.post(
  "/v1/orders/:order_id",
  async ({ params, body, headers, set }) => {
    try {
      const token = extractToken(headers.authorization);
      const userId = getUserIdFromJWT(headers);

      const order = await db
        .select()
        .from(schema.orders)
        .where(
          and(
            eq(schema.orders.id, params.order_id),
            or(
              eq(schema.orders.buyerId, userId),
              eq(schema.orders.sellerId, userId)
            )
          )
        )
        .limit(1);

      if (!order.length) {
        set.status = 404;
        return {
          success: false,
          error: "Order not found or unauthorized",
          data: null,
        };
      }

      const messageId = randomUUID();

      await db.insert(schema.orderMessage).values({
        id: messageId,
        orderId: params.order_id,
        senderId: userId,
        kind: body.kind || "TEXT",
        body: body.body,
        isDeleted: false,
        isHidden: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return {
        success: true,
        data: { messageId, message: "Message sent successfully" },
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
    params: t.Object({ order_id: t.String() }),
    body: t.Object({
      kind: t.Optional(t.String()),
      body: t.String(),
    }),
  }
);

// ========== ORDERS ENDPOINTS ==========

// 13. Query for history (Purchase & Sale)
app.get(
  "/v1/orders",
  async ({ query, headers, set }) => {
    try {
      const token = extractToken(headers.authorization);
      const userId = getUserIdFromJWT(headers);

      const historyType = query.type || "Purchase";

      let orders;
      if (historyType === "Purchase") {
        orders = await db
          .select({
            id: schema.orders.id,
            name: schema.item.name,
            sellerName: schema.user.name,
            buyerName: schema.user.name,
            timestamp: schema.orders.createdAt,
          })
          .from(schema.orders)
          .leftJoin(schema.item, eq(schema.orders.itemId, schema.item.id))
          .leftJoin(schema.user, eq(schema.orders.sellerId, schema.user.id))
          .where(eq(schema.orders.buyerId, userId))
          .orderBy(desc(schema.orders.createdAt));
      } else {
        orders = await db
          .select({
            id: schema.orders.id,
            name: schema.item.name,
            sellerName: schema.user.name,
            buyerName: schema.user.name,
            timestamp: schema.orders.createdAt,
          })
          .from(schema.orders)
          .leftJoin(schema.item, eq(schema.orders.itemId, schema.item.id))
          .leftJoin(schema.user, eq(schema.orders.buyerId, schema.user.id))
          .where(eq(schema.orders.sellerId, userId))
          .orderBy(desc(schema.orders.createdAt));
      }

      if (historyType === "Sale") {
        const currentUser = await db
          .select({ name: schema.user.name })
          .from(schema.user)
          .where(eq(schema.user.id, userId))
          .limit(1);

        const currentUserName = currentUser[0]?.name || "Unknown";
        orders = orders.map((order) => ({
          ...order,
          sellerName: currentUserName,
        }));
      } else {
        const currentUser = await db
          .select({ name: schema.user.name })
          .from(schema.user)
          .where(eq(schema.user.id, userId))
          .limit(1);

        const currentUserName = currentUser[0]?.name || "Unknown";
        orders = orders.map((order) => ({
          ...order,
          buyerName: currentUserName,
        }));
      }

      return {
        success: true,
        data: orders,
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
    query: t.Object({
      type: t.Optional(t.Union([t.Literal("Purchase"), t.Literal("Sale")])),
    }),
  }
);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);

app.listen(6969);

export default app;
