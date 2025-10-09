// // scripts/seed.ts
// import "dotenv/config";
// import { createPool } from "mysql2/promise";
// import { drizzle } from "drizzle-orm/mysql2";
// import { sql } from "drizzle-orm";
// import { actionType } from "../src/db/schema"; // แก้ path ให้ตรงโปรเจกต์ของคุณ

// async function main() {
//   // 1) connect DB
//   const pool = createPool({
//     uri: process.env.DATABASE_URL, // เช่น mysql://user:pass@host:3306/mydb
//     // หรือใช้ host/user/password/database ก็ได้
//   });
//   const db = drizzle(pool);

//   console.log("Seeding: action_type ...");

//   // 2) seed แบบ idempotent (ถ้ามี id ซ้ำจะ IGNORE)
//   // หมายเหตุ: ใช้ raw SQL ง่ายสุดสำหรับ multi-row insert + IGNORE
//   await db.execute(sql`
//     INSERT IGNORE INTO action_type (id, action_name) VALUES
//       ('1', 'DEPOSIT'),
//       ('2', 'WITHDRAW'),
//       ('3', 'HOLD'),
//       ('4', 'CAPTURE'),
//       ('5', 'RELEASE'),
//       ('6', 'REFUND'),
//       ('7', 'TRANSFER'),
//       ('8', 'ADJUST')
//   `);

//   console.log("✔ done!");
//   await pool.end();
// }

// main().catch((err) => {
//   console.error("Seed failed:", err);
//   process.exit(1);
// });
