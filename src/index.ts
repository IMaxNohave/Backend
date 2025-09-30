import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { swagger } from '@elysiajs/swagger'
import openapi from "@elysiajs/openapi";

// Import routes
import { homeRoutes } from './routes/home'
import { salesRoutes } from './routes/sales'
import { creditsRoutes } from './routes/credits'
import { profileRoutes } from './routes/profile'
import { loginRoutes } from './routes/login'
import { ordersRoutes } from './routes/orders'
import { balanceRoutes } from './routes/balance'

const app = new Elysia()
  .use(cors() as any)
  .use(swagger({
    documentation: {
      info: {
        title: 'Marketplace API',
        version: '1.0.0',
        description: 'Complete E-commerce marketplace API'
      }
    }
  }) as any)
  .use(openapi());

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

// Register all routes
app.use(homeRoutes)
app.use(salesRoutes)
app.use(creditsRoutes)
app.use(profileRoutes)
app.use(loginRoutes)
app.use(ordersRoutes)
app.use(balanceRoutes)

console.log('🦊 Complete Marketplace API is running at http://localhost:3000')
console.log('📚 API Documentation available at http://localhost:3000/swagger')
console.log('')
console.log('📁 Routes loaded:')
console.log('  - /v1/home (GET, PATCH)')
console.log('  - /v1/home/edit/:itemid (PATCH)')
console.log('  - /v1/sales (POST)')
console.log('  - /v1/credits/depose (POST)')
console.log('  - /v1/credits/withdraw (POST)')
console.log('  - /v1/profile (GET)')
console.log('  - /v1/profile/edit (PATCH)')
console.log('  - /v1/login (POST)')
console.log('  - /v1/orders (GET)')
console.log('  - /v1/orders/:order_id (GET, POST)')
console.log('  - /v1/* (GET - Balance)')

app.listen(6969);

export default app;
