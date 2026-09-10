import { existsSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "prisma/config";

// Prisma 7 把连接串从 schema.prisma 挪到了这里。
const root = join(__dirname, "..", "..");
process.loadEnvFile(existsSync(join(root, ".env")) ? join(root, ".env") : join(root, ".env.example"));

export default defineConfig({
  schema: join(__dirname, "prisma", "schema.prisma"),
  migrations: { path: join(__dirname, "prisma", "migrations"), seed: "tsx prisma/seed.ts" },
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
