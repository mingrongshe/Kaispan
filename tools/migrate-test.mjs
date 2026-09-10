// 把 migration 打到测试库上。测试库会被反复清空，所以刻意和开发库分开。
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadEnv } from "./env.mjs";

loadEnv();
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) {
  console.error("缺 TEST_DATABASE_URL，看 .env.example");
  process.exit(1);
}

const apiDir = join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "api");
execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
  cwd: apiDir,
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: testUrl },
});
