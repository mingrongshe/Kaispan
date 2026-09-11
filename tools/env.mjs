// 读根目录的 .env；没有就退回 .env.example，这样 clone 下来直接能跑测试。
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export function loadEnv() {
  const real = join(ROOT, ".env");
  if (existsSync(real)) {
    process.loadEnvFile(real);
    return real;
  }

  // 生产环境（容器、Railway）不该有 .env，变量由平台注入。这时候绝不能退回
  // .env.example —— 那里面的 DATABASE_URL 指向 127.0.0.1，退回去等于把线上
  // 连接串换成本机地址，报错还很难看懂。
  if (process.env.NODE_ENV === "production") return null;

  const example = join(ROOT, ".env.example");
  if (!existsSync(example)) return null;
  process.loadEnvFile(example);
  return example;
}
