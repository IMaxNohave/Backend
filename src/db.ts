import { drizzle } from 'drizzle-orm/mysql2'
import mysql from 'mysql2/promise'
import dotenv from 'dotenv'

dotenv.config()

const connection = await mysql.createConnection({
  host: process.env.MYSQL_HOST || 'localhost',
  port: parseInt(process.env.MYSQL_PORT || '3306'),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'test'
})

export const db = drizzle(connection)
