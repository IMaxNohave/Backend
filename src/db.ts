// src/db.ts (หรือใส่ไว้ใต้ที่ประกาศ connection)
import mysql from "mysql2/promise";

export async function checkDbConnection(pool: mysql.Pool) {
  try {
    const conn = await pool.getConnection();
    await conn.ping(); // ทดสอบ ping
    const [ver] = await conn.query("SELECT VERSION() AS version");
    const [db] = await conn.query("SELECT DATABASE() AS db");
    conn.release();

    console.log("✅ MySQL connected");
    console.log("   DB:", (db as any)[0]?.db);
    console.log("   Version:", (ver as any)[0]?.version);
  } catch (err) {
    console.error("❌ MySQL connect failed:", err);
    // ถ้าต้องการหยุดแอปเมื่อเชื่อมไม่ได้:
    // process.exit(1)
  }
}
