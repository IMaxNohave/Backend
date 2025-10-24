# Elysia with Bun runtime

## Getting Started

To get started with this template, simply paste this command into your terminal:

```bash
bun create elysia ./elysia-example
bun install
```

## Database Initialization

If you use `init.sh` inside `_entrypoint/`, make sure the file uses **LF line endings**, not CRLF.

- On VS Code: Change `CRLF` to `LF` in the bottom-right corner.

```bash
bun run db:generate
bun run db:migrate
bun run db:push
```

## Development

To start the development server run:

```bash
bun run dev
```

## Run with Docker

```bash
docker compose up -d --build
docker compose --env-file ./.env.docker up -d --force-recreate --build
docker compose down -v
```
