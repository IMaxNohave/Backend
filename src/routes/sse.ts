// Backend/src/routes/sse.ts
import { Elysia } from "elysia";
import { sseHub } from "../lib/sse";

export const sseRoutes = new Elysia({ prefix: "/v1" }).get(
  "/sse",
  ({ query }) => {
    const topic = (query?.topic as string) || "public";
    return sseHub.subscribe(topic);
  }
);
