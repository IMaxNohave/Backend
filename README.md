# RO-TRADE (Backend)

## 🧾 Project Description

แพลตฟอร์มเว็บไซต์สำหรับการซื้อ–ขาย และแลกเปลี่ยนสิ่งของในเกม Roblox ที่เปิดโอกาสให้ผู้ใช้งานแต่ละคนสามารถทำหน้าที่ได้ทั้งผู้ซื้อและผู้ขาย ภายใต้การดูแลของผู้ดูแลระบบ (Admin) เพื่อให้การแลกเปลี่ยนเป็นไปอย่างราบรื่นและยุติธรรม

## 👨‍👩‍👧‍👦 Member

| Student ID | Name                   |
| ---------- | ---------------------- |
| 660610770  | บูรณิน บุณโยประการ     |
| 660610768  | บัวชมพู ฤกษ์สุทธิรัตน์ |
| 660610761  | ธนกร เสาคำ             |
| 660612156  | วชิรวิทย์ ไชยมาตย์     |

## 🖥️ Technology Stack
<<<<<<< HEAD

<p align="left">
  <a href="https://bun.sh/" target="_blank">
    <img src="https://img.shields.io/badge/Runtime-Bun-%23000000?logo=bun&logoColor=white" alt="Bun" />
  </a>
  <a href="https://www.typescriptlang.org/" target="_blank">
    <img src="https://img.shields.io/badge/Language-TypeScript-%233178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  </a>
  <a href="https://elysiajs.com/" target="_blank">
    <img src="https://img.shields.io/badge/Framework-Elysia-%2300A8E8?logo=bun&logoColor=white" alt="Elysia" />
  </a>
  <a href="https://www.mysql.com/" target="_blank">
    <img src="https://img.shields.io/badge/Database-MySQL-%234479A1?logo=mysql&logoColor=white" alt="MySQL" />
  </a>
  <a href="https://orm.drizzle.team/" target="_blank">
    <img src="https://img.shields.io/badge/ORM-Drizzle%20ORM-%23F15B2A?logo=drizzle&logoColor=white" alt="Drizzle ORM" />
  </a>
  <a href="https://www.docker.com/" target="_blank">
    <img src="https://img.shields.io/badge/Container-Docker-%232496ED?logo=docker&logoColor=white" alt="Docker" />
  </a>
</p>

### Backend

=======
>>>>>>> c53dc00 (Restore Backend section in README)
<p align="left">
  <a href="https://bun.sh/" target="_blank">
    <img src="https://img.shields.io/badge/Runtime-Bun-%23000000?logo=bun&logoColor=white" alt="Bun" />
  </a>
  <a href="https://www.typescriptlang.org/" target="_blank">
    <img src="https://img.shields.io/badge/Language-TypeScript-%233178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  </a>
  <a href="https://elysiajs.com/" target="_blank">
    <img src="https://img.shields.io/badge/Framework-Elysia-%2300A8E8?logo=bun&logoColor=white" alt="Elysia" />
  </a>
  <a href="https://www.mysql.com/" target="_blank">
    <img src="https://img.shields.io/badge/Database-MySQL-%234479A1?logo=mysql&logoColor=white" alt="MySQL" />
  </a>
  <a href="https://orm.drizzle.team/" target="_blank">
    <img src="https://img.shields.io/badge/ORM-Drizzle%20ORM-%23F15B2A?logo=drizzle&logoColor=white" alt="Drizzle ORM" />
  </a>
  <a href="https://www.docker.com/" target="_blank">
    <img src="https://img.shields.io/badge/Container-Docker-%232496ED?logo=docker&logoColor=white" alt="Docker" />
  </a>
</p>

### Backend



- **Runtime:** [Bun](https://bun.sh/)
- **Language:** [TypeScript](https://www.typescriptlang.org/)
- **Framework:** [Elysia](https://elysiajs.com/)
- **Database:** [MySQL](https://www.mysql.com/) + [Drizzle ORM](https://orm.drizzle.team/)
- **Containerization:** [Docker](https://www.docker.com/)

## 🚀 Getting Started

Install dependencies:

```bash
bun install
```

Start the development server:

```bash
bun run dev
```

Start the development server:

```bash
bun run dev
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
