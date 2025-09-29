import "dotenv/config";

const dbUser = process.env.MYSQL_USER;
const dbPassword = process.env.MYSQL_PASSWORD;
const dbHost = process.env.MYSQL_HOST;
const dbPort = process.env.MYSQL_PORT;
const dbName = process.env.MYSQL_DATABASE;

if (!dbUser || !dbPassword || !dbHost || !dbPort || !dbName) {
  throw new Error("Invalid DB env.");
}

export const connectionString = `mysql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}`;

console.log('show logs connectionString =', connectionString);