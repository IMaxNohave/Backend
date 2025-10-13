import IORedis from "ioredis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

// ปรับ options ตามต้องการ (maxRetriesPerRequest=null เผื่อ BullMQ)
export const redis = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

// BullMQ จะรับ option connection เป็น IORedis instance ได้
export const bullConnection = redis;
