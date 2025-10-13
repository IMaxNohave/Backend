// src/lib/notify.ts
import { dbClient } from "../db/client";
import * as schema from "../db/schema";
import { v4 as uuidv4 } from "uuid";
import { sseHub } from "./sse";

type MakeNotifArgs = {
  toUserId: string;
  type: "CHAT" | "ORDER" | "WALLET" | "DISPUTE" | "SYSTEM";
  title?: string;
  body?: string;
  orderId?: string | null;
  data?: any;
};

export async function notify(args: MakeNotifArgs) {
  const id = uuidv4();
  const now = new Date();

  await dbClient.insert(schema.notification).values({
    id,
    userId: args.toUserId,
    type: args.type,
    title: args.title ?? null,
    body: args.body ?? null,
    orderId: args.orderId ?? null,
    data: args.data ?? null,
    isRead: false,
    createdAt: now,
    updatedAt: now,
  });

  console.log("Notify:", args.toUserId, args.type, args.title);
  // realtime → ช่อง user
  sseHub.publish(`user:${args.toUserId}`, "notification.new", {
    v: 1,
    id,
    type: args.type,
    orderId: args.orderId ?? null,
  });

  return id;
}
