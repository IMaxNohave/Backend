# RO-TRADE (Backend)

## 🧾 Project Description

แพลตฟอร์มเว็บไซต์สำหรับการซื้อ–ขาย และแลกเปลี่ยนสิ่งของในเกม Roblox ที่เปิดโอกาสให้ผู้ใช้งานแต่ละคนสามารถทำหน้าที่ได้ทั้งผู้ซื้อและผู้ขาย ภายใต้การดูแลของผู้ดูแลระบบ (Admin) เพื่อให้การแลกเปลี่ยนเป็นไปอย่างราบรื่นและยุติธรรม

## 👨‍👩‍👧‍👦 Member

| Student ID | Name                        |
|------------|-----------------------------|
| 660610770  | บูรณิน บุณโยประการ         |
| 660610768  | บัวชมพู ฤกษ์สุทธิรัตน์     |
| 660610761  | ธนกร เสาคำ                 |
| 660612156  | วชิรวิทย์ ไชยมาตย์         |

## 🖥️ Technology Stack

### Backend

- **Runtime:** [Bun](https://bun.sh/)
- **Language:** [TypeScript](https://www.typescriptlang.org/)
- **Framework:** [Elysia](https://elysiajs.com/)
- **Database:** [MySQL](https://www.mysql.com/) + [Drizzle ORM](https://orm.drizzle.team/)
- **Containerization:** [Docker](https://www.docker.com/)

## 🚀 Getting Started

```bash
bun create elysia ./elysia-example
cd elysia-example
bun install
```

## 🗄️ Database Initialization

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
