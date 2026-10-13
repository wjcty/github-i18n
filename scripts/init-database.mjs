import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
const envText = fs.readFileSync(envPath, "utf8");
const line = envText.split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));
if (!line) {
  console.error("DATABASE_URL missing in .env");
  process.exit(1);
}

const url = new URL(line.slice("DATABASE_URL=".length).trim());
const dbName = url.pathname.replace(/^\//, "") || "github_i18n";
const config = {
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
};

let conn;
try {
  conn = await mysql.createConnection({ ...config, database: undefined });
  await conn.query(
    `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  console.log(`Database "${dbName}" ready.`);
} catch (e) {
  console.error(
    "MySQL connection failed. Update DATABASE_URL in .env (user/password):",
    e instanceof Error ? e.message : e,
  );
  process.exit(1);
} finally {
  await conn?.end();
}

execSync("npx prisma db push", { stdio: "inherit", cwd: root, env: process.env });
