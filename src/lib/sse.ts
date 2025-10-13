// Backend/src/lib/sse.ts
import { randomUUID } from "crypto";

type Client = {
  id: string;
  send: (chunk: string) => void;
  close: () => void;
};

class SSEHub {
  private channels = new Map<string, Set<Client>>();

  subscribe(topic: string) {
    const id = randomUUID();
    // console.log("[SSE] subscribe:", topic, "client:", id);

    let iv: any;
    let client: Client | null = null;

    const stream = new ReadableStream({
      start: (controller) => {
        const encoder = new TextEncoder();
        const send = (chunk: string) =>
          controller.enqueue(encoder.encode(chunk));
        const close = () => controller.close();

        client = { id, send, close };
        if (!this.channels.has(topic)) this.channels.set(topic, new Set());
        this.channels.get(topic)!.add(client);

        // welcome
        send(`event: ready\r\ndata: ${JSON.stringify({ topic })}\r\n\r\n`);

        // heartbeat
        iv = setInterval(() => {
          // ให้เห็นใน BE log ว่ามี client เปิดจริง
          console.log(
            "[SSE] heartbeat to",
            topic,
            "clients:",
            this.channels.get(topic)?.size ?? 0
          );
          send(`event: ping\r\ndata: "ok"\r\n\r\n`);
        }, 30000);
      },
      cancel: () => {
        // console.log("[SSE] cancel:", topic, "client:", id);
        if (iv) clearInterval(iv);
        if (client) {
          this.channels.get(topic)?.delete(client);
          if ((this.channels.get(topic)?.size ?? 0) === 0) {
            this.channels.delete(topic);
          }
        }
      },
    });

    const headers = {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    };

    return new Response(stream, { headers });
  }

  publish(topic: string, event: string, data: unknown) {
    const clients = this.channels.get(topic);
    console.log("[SSE] publish:", topic, event, data);
    console.log("[SSE] clients:", clients?.size ?? 0);
    if (!clients || clients.size === 0) return;

    const payload = `event: ${event}\r\ndata: ${JSON.stringify(data)}\r\n\r\n`;
    for (const c of clients) c.send(payload);
  }
}

export const sseHub = new SSEHub();
