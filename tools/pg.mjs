// 本地开发和集成测试用的 PostgreSQL。
//
//   node tools/pg.mjs ensure   没在跑就在后台起一个（幂等，脚本里用这个）
//   node tools/pg.mjs serve    前台跑，Ctrl-C 停（想看日志时用）
//   node tools/pg.mjs stop     停掉后台那个
//
// 用 embedded-postgres 是因为不假设机器上装了 Docker 或 PostgreSQL，而 acceptance.md
// 要求隔离和持久化必须用真实 PostgreSQL 验证。它跑的就是官方 postgres 17 二进制，不是 mock。
// 接外部数据库（Neon、Supabase、自建）只要改 .env 里的 DATABASE_URL，本文件就不参与了。
import EmbeddedPostgres from "embedded-postgres";
import net from "node:net";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(ROOT, ".pgdata");
const PID_FILE = join(DATA_DIR, "serve.pid");
const LOG_FILE = join(DATA_DIR, "serve.log");
const PORT = 55432;
const DATABASES = ["haccp", "haccp_test"];

function makeInstance() {
  return new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: "kaispan",
    password: "kaispan",
    port: PORT,
    persistent: true,
    onLog: () => {},
    onError: () => {},
  });
}

function reachable(timeoutMs = 700) {
  return new Promise((resolve) => {
    const socket = net.connect({ port: PORT, host: "127.0.0.1" });
    socket.setTimeout(timeoutMs);
    socket.on("connect", () => { socket.destroy(); resolve(true); });
    socket.on("error", () => resolve(false));
    socket.on("timeout", () => { socket.destroy(); resolve(false); });
  });
}

async function waitUntilReachable(seconds = 40) {
  for (let i = 0; i < seconds * 2; i += 1) {
    if (await reachable(400)) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

async function ensureDatabases(instance) {
  const client = instance.getPgClient();
  await client.connect();
  for (const name of DATABASES) {
    const found = await client.query("select 1 from pg_database where datname = $1", [name]);
    if (found.rowCount === 0) await client.query(`create database "${name}"`);
  }
  await client.end();
}

/** 前台：起来之后一直挂着，postgres 是这个进程的子进程 */
async function serve() {
  mkdirSync(DATA_DIR, { recursive: true });
  const instance = makeInstance();
  if (!existsSync(join(DATA_DIR, "PG_VERSION"))) await instance.initialise();
  await instance.start();
  await ensureDatabases(instance);
  writeFileSync(PID_FILE, String(process.pid));
  console.log(`postgres 已在 127.0.0.1:${PORT}，库：${DATABASES.join(", ")}`);

  const shutdown = async () => {
    try { await instance.stop(); } catch { /* 已经没了就算了 */ }
    rmSync(PID_FILE, { force: true });
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  setInterval(() => {}, 1 << 30);
}

/** 后台：脚本里用这个，已经在跑就直接返回 */
async function ensure() {
  if (await reachable()) {
    console.log(`postgres 已经在跑（127.0.0.1:${PORT}）`);
    return;
  }
  mkdirSync(DATA_DIR, { recursive: true });
  // 上一次进程被强杀时留下的 pid 文件会让人以为还在跑，起之前先清掉
  rmSync(PID_FILE, { force: true });
  // 日志写进文件而不是丢掉：起不来的时候要看得见原因
  const log = openSync(LOG_FILE, "a");
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "serve"], {
    detached: true,
    stdio: ["ignore", log, log],
    cwd: ROOT,
  });
  child.unref();
  if (!(await waitUntilReachable())) {
    const tail = existsSync(LOG_FILE) ? readFileSync(LOG_FILE, "utf8").split("\n").slice(-15).join("\n") : "";
    throw new Error(`postgres 起不来。${LOG_FILE} 最后几行：\n${tail}`);
  }
  console.log(`postgres 已在 127.0.0.1:${PORT}，库：${DATABASES.join(", ")}`);
}

function stop() {
  if (!existsSync(PID_FILE)) {
    console.log("没有在跑的后台 postgres");
    return;
  }
  const pid = Number(readFileSync(PID_FILE, "utf8").trim());
  try { process.kill(pid, "SIGTERM"); } catch { /* 进程早没了 */ }
  rmSync(PID_FILE, { force: true });
  console.log("postgres 已停止");
}

const command = process.argv[2] ?? "ensure";
if (command === "serve") await serve();
else if (command === "stop") stop();
else { await ensure(); process.exit(0); }
