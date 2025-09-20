import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "@db/schema";
import mysql from "mysql2/promise";
import { connectionString } from "@db/utils";

export const dbConn = await mysql.createConnection(connectionString);

export const dbClient = drizzle(dbConn, { schema, mode: "default" });
