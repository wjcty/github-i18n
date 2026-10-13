/**
 * 从 .env 的 GITHUB_APP_PRIVATE_KEY 写入 private-key.pem（不打印密钥内容）
 */
import fs from "fs";
import path from "path";

const root = process.cwd();
const envPath = path.join(root, ".env");
const outPath = path.join(root, "private-key.pem");

if (!fs.existsSync(envPath)) {
  console.error(".env not found");
  process.exit(1);
}

const raw = fs.readFileSync(envPath, "utf8");
const line = raw
  .split(/\r?\n/)
  .find((l) => l.startsWith("GITHUB_APP_PRIVATE_KEY="));

if (!line) {
  console.error("GITHUB_APP_PRIVATE_KEY not found in .env");
  process.exit(1);
}

let value = line.slice("GITHUB_APP_PRIVATE_KEY=".length).trim();
if (
  (value.startsWith('"') && value.endsWith('"')) ||
  (value.startsWith("'") && value.endsWith("'"))
) {
  value = value.slice(1, -1);
}
value = value.replace(/\\n/g, "\n").trim();

if (!value.includes("BEGIN") || !value.includes("PRIVATE KEY")) {
  console.error("GITHUB_APP_PRIVATE_KEY does not look like a PEM; skip writing file");
  process.exit(1);
}

fs.writeFileSync(outPath, value + "\n", { mode: 0o600 });
console.log(`Wrote ${outPath} (from .env). You may remove GITHUB_APP_PRIVATE_KEY from .env.`);
