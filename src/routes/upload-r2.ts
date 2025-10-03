import {Elysia, t} from "elysia";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import { extractToken } from '../middleware/auth'

const R2_BUCKET = process.env.R2_BUCKET!;

const R2 = new S3Client({
  region: process.env.R2_REGION || "auto", // R2 ใช้ 'auto'
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

export const uploadR2 = new Elysia({ 
    name: "upload-r2",
    prefix: "/v1/upload"
})
// ========== R2 ENDPOINTS ==========
.post(
  "r2/upload-url",
  async ({ body, headers, set }) => {
    try {
      //const token = extractToken(headers.authorization);
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
        ? `${process.env.R2_PUBLIC_BASE}${key}`
        : null;

      return { success: true, data: { uploadUrl: url, key, imageUrl } };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      set.status = msg.includes("Token") ? 401 : 500;
      return { success: false, error: msg, data: null };
    }
  },
  {
    //headers: t.Object({ authorization: t.String() }),
    body: t.Object({
      contentType: t.Optional(t.String()),
      fileName: t.Optional(t.String()),
    }),
  }
);