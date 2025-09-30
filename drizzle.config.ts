import { defineConfig } from "drizzle-kit";
import { connectionString } from "./src/db/utils"; // 👈 เปลี่ยนเป็น relative

export default defineConfig({
  dialect: "mysql",
  schema: "./src/db/schema.ts",
  out: "./src/db/migration",
  dbCredentials: {
    url: connectionString,
  },
  verbose: true,
  strict: true,
});
