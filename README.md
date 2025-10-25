# Elysia with Bun runtime

## Getting Started

To get started with this template, simply paste this command into your terminal:

```bash
bun install
```

## Database Initialization

If you're using `init.sh` inside `_entrypoint/`, make sure the file uses **LF line endings**, not **CRLF**.

> 💡 **Tip (VS Code):** Click `CRLF` at the bottom-right corner and change it to `LF`.

```bash
bun run db:generate
bun run db:migrate
bun run db:push
```

## 🧪 API Documentation

- **API Backend:** [Elysia](https://elysiajs.com/)
- **Docs:** [OpenAPI](https://www.openapis.org/) via [`@elysiajs/openapi`](https://github.com/elysiajs/openapi)

## 🐳 Docker Deployment

```bash
docker compose up -d --force-recreate
docker compose down -v
```
