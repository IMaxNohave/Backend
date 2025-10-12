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
    console.log("ping");
    const id = randomUUID();

    const stream = new ReadableStream({
      start: (controller) => {
        const encoder = new TextEncoder();

        const send = (chunk: string) =>
          controller.enqueue(encoder.encode(chunk));
        const close = () => controller.close();

        const client: Client = { id, send, close };
        if (!this.channels.has(topic)) this.channels.set(topic, new Set());
        this.channels.get(topic)!.add(client);

        // ส่ง welcome + ping แรก
        send(`event: ready\ndata: ${JSON.stringify({ topic })}\n\n`);

        // heartbeat
        const iv = setInterval(() => {
          console.log("ping");
          send(`event: ping\ndata: "ok"\n\n`);
        }, 2);

        // cleanup เมื่อ stream ปิด
        // Return a cleanup function from start
        return () => {
          clearInterval(iv);
          this.channels.get(topic)?.delete(client);
          if (this.channels.get(topic)?.size === 0) {
            this.channels.delete(topic);
          }
        };
      },
    });

    const headers = {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // กัน proxy บัฟเฟอร์
    };

    return new Response(stream, { headers });
  }

  publish(topic: string, event: string, data: unknown) {
    console.log("publish", topic, event, data);
    const clients = this.channels.get(topic);
    console.log("clients", clients?.size);
    if (!clients || clients.size === 0) return;

    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const c of clients) c.send(payload);
  }
}

export const sseHub = new SSEHub();
