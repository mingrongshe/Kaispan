// 读根目录的 .env；没有就退回 .env.example，这样 clone 下来直接能跑测试。
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export function loadEnv() {
  const file = existsSync(join(ROOT, ".env")) ? join(ROOT, ".env") : join(ROOT, ".env.example");
  process.loadEnvFile(file);
  return file;
}
