// 把 apps/api/prisma/migrations 下的 migration 按顺序打到数据库上，可重复执行。
//
//   node tools/migrate.mjs            打到 DATABASE_URL
//   node tools/migrate.mjs --test     打到 TEST_DATABASE_URL
//
// 为什么不是直接 `prisma migrate deploy`：见 README「关于 migration」。
// 本环境下不去 binaries.prisma.sh，Prisma 的 schema-engine 二进制拿不到。
// 这个脚本读的是同一批文件、写的是同一张 _prisma_migrations 表（列和 Prisma 一致），
// 那个域名一通，`prisma migrate deploy` 能接着往下走，不用重来。
import { createHash, randomUUID } from "node:crypto";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";
import { loadEnv } from "./env.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = join(ROOT, "apps", "api", "prisma", "migrations");

loadEnv();
const useTest = process.argv.includes("--test");

// 打 migration 要走直连，不能走连接池。
// Supabase 的 transaction pooler（6543 端口）一条语句一个事务、不保证会话粘性，
// DDL 和 advisory lock 在上面都不可靠。Supabase 控制台里的 "Direct connection"
// 就是给这种活准备的，填进 DIRECT_DATABASE_URL。本地开发没有池，可以不填。
const url = useTest
  ? process.env.TEST_DATABASE_URL
  : (process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL);
if (!url) {
  console.error(`缺 ${useTest ? "TEST_DATABASE_URL" : "DATABASE_URL"}，看 .env.example`);
  process.exit(1);
}

const HISTORY_TABLE = `
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id" VARCHAR(36) PRIMARY KEY NOT NULL,
  "checksum" VARCHAR(64) NOT NULL,
  "finished_at" TIMESTAMPTZ,
  "migration_name" VARCHAR(255) NOT NULL,
  "logs" TEXT,
  "rolled_back_at" TIMESTAMPTZ,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0
)`;

const client = new pg.Client({ connectionString: url });
await client.connect();
await client.query(HISTORY_TABLE);

const applied = new Set(
  (await client.query('select migration_name from "_prisma_migrations" where finished_at is not null')).rows.map(
    (row) => row.migration_name,
  ),
);

const names = existsSync(MIGRATIONS_DIR)
  ? readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
  : [];

let count = 0;
for (const name of names) {
  if (applied.has(name)) continue;
  const sql = readFileSync(join(MIGRATIONS_DIR, name, "migration.sql"), "utf8");
  const checksum = createHash("sha256").update(sql).digest("hex");

  await client.query("begin");
  try {
    await client.query(sql);
    await client.query(
      `insert into "_prisma_migrations"
         (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
       values ($1, $2, now(), $3, now(), 1)`,
      [randomUUID(), checksum, name],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
  console.log(`已应用 ${name}`);
  count += 1;
}

console.log(count === 0 ? "没有待应用的 migration" : `应用了 ${count} 个 migration`);
await client.end();
