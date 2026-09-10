// 本地开发和集成测试用的 PostgreSQL。
//
//   node tools/pg.mjs start    没在跑就起一个（幂等，脚本里用这个）
//   node tools/pg.mjs stop     停掉
//   node tools/pg.mjs status   看在不在跑
//
// 为什么不假设机器上装了 PostgreSQL：这套环境里没有 Docker、没有 apt 权限，
// 而 acceptance.md 要求隔离和持久化必须用真实 PostgreSQL 验证。
// 这里用的是 @embedded-postgres/<平台> 这个 npm 包里自带的官方 postgres 17 二进制，
// 直接驱动 initdb 和 pg_ctl —— 不走 embedded-postgres 那层 JS 包装。
//
// 走 pg_ctl 有两个好处：数据目录上次没干净关闭时它自己会做恢复；起出来的 postgres
// 是 pg_ctl 托管的守护进程，不挂在 node 进程下面，node 退出它照样活着。
//
// 接外部数据库（Neon、Supabase、自建）只要改 .env 里的 DATABASE_URL，本文件就不参与了。
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { chownSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(ROOT, ".pgdata");
const LOG_FILE = join(DATA_DIR, "server.log");
const PORT = 55432;
const USER = "kaispan";
const PASSWORD = "kaispan";
const DATABASES = ["haccp", "haccp_test"];

function binDir() {
  const name = `@embedded-postgres/${process.platform}-${process.arch}`;
  const here = createRequire(import.meta.url);

  // 平台包是 embedded-postgres 的依赖。pnpm 下从仓库根目录直接 resolve 不到它，
  // 而 embedded-postgres 的 exports 又不给 ./package.json，所以先 resolve 它的入口，
  // 再从那个文件的位置往下找平台包。
  const candidates = [here];
  try {
    candidates.push(createRequire(here.resolve("embedded-postgres")));
  } catch {
    // 没装也没关系，下面还有一条路
  }

  for (const resolver of candidates) {
    try {
      return join(dirname(resolver.resolve(`${name}/package.json`)), "native", "bin");
    } catch {
      // 换下一个
    }
  }

  // 最后一招：直接在 pnpm 的仓库目录里找
  const store = join(ROOT, "node_modules", ".pnpm");
  if (existsSync(store)) {
    const prefix = `@embedded-postgres+${process.platform}-${process.arch}@`;
    const match = readdirSync(store).find((entry) => entry.startsWith(prefix));
    if (match) {
      const dir = join(store, match, "node_modules", name, "native", "bin");
      if (existsSync(dir)) return dir;
    }
  }

  throw new Error(
    `找不到 ${name}。先 pnpm install；这个平台没有预编译二进制的话，改用外部 PostgreSQL 并设好 DATABASE_URL。`,
  );
}

/**
 * postgres 拒绝以 root 运行（任何机器上都是这样，不只是容器）。
 * 用 root 跑 pnpm pg:start 时，降到一个普通用户来跑这些二进制。
 */
function unprivileged() {
  if (typeof process.getuid !== "function" || process.getuid() !== 0) return null;
  const passwd = existsSync("/etc/passwd") ? readFileSync("/etc/passwd", "utf8") : "";
  for (const name of ["postgres", "nobody"]) {
    const line = passwd.split("\n").find((row) => row.startsWith(`${name}:`));
    if (!line) continue;
    const parts = line.split(":");
    const uid = Number(parts[2]);
    const gid = Number(parts[3]);
    if (Number.isFinite(uid) && uid > 0) return { uid, gid, name };
  }
  throw new Error("以 root 运行，但机器上找不到可用的普通用户（postgres / nobody）。换个非 root 账号跑。");
}

function run(command, args) {
  const as = unprivileged();
  if (as) chownRecursive(DATA_DIR, as.uid, as.gid);
  const result = spawnSync(join(binDir(), command), args, {
    encoding: "utf8",
    ...(as ? { uid: as.uid, gid: as.gid } : {}),
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    const log = existsSync(LOG_FILE) ? readFileSync(LOG_FILE, "utf8").split("\n").slice(-15).join("\n") : "";
    throw new Error(`${command} 失败（退出码 ${result.status}）：\n${detail}\n${log}`);
  }
  return result.stdout;
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

function chownRecursive(target, uid, gid) {
  if (!existsSync(target)) return;
  chownSync(target, uid, gid);
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    const child = join(target, entry.name);
    if (entry.isDirectory()) chownRecursive(child, uid, gid);
    else chownSync(child, uid, gid);
  }
}

function initialise() {
  mkdirSync(DATA_DIR, { recursive: true });
  // 口令文件不能放数据目录里：initdb 见到目录非空（连点开头的文件也算）就拒绝初始化
  const passwordFile = join(tmpdir(), `kaispan-pg-${process.pid}`);
  writeFileSync(passwordFile, PASSWORD, { mode: 0o600 });
  const as = unprivileged();
  if (as) chownSync(passwordFile, as.uid, as.gid);
  try {
    run("initdb", [`--pgdata=${DATA_DIR}`, "--auth=password", `--username=${USER}`, `--pwfile=${passwordFile}`, "--lc-messages=C"]);
  } finally {
    rmSync(passwordFile, { force: true });
  }
}

async function ensureDatabases() {
  const { default: pg } = await import("pg");
  const client = new pg.Client({
    host: "127.0.0.1",
    port: PORT,
    user: USER,
    password: PASSWORD,
    database: "postgres",
  });
  await client.connect();
  for (const name of DATABASES) {
    const found = await client.query("select 1 from pg_database where datname = $1", [name]);
    if (found.rowCount === 0) await client.query(`create database "${name}"`);
  }
  await client.end();
}

async function start() {
  if (await reachable()) {
    await ensureDatabases();
    console.log(`postgres 已经在跑（127.0.0.1:${PORT}）`);
    return;
  }

  if (!existsSync(join(DATA_DIR, "PG_VERSION"))) initialise();

  // 上次被硬杀（沙箱回收、断电）会留下 postmaster.pid，pg_ctl 看到它就拒绝启动。
  // 只看端口通不通来判断是不是残留：机器重启后 pid 会从头分配，文件里记的进程号
  // 多半真的存在，只是完全不相干。这个脚本独占这个数据目录和这个端口。
  rmSync(join(DATA_DIR, "postmaster.pid"), { force: true });

  // -k 把 unix socket 放进数据目录：默认的 /var/run/postgresql 在很多沙箱里不存在也建不了
  run("pg_ctl", ["-D", DATA_DIR, "-l", LOG_FILE, "-o", `-p ${PORT} -k ${DATA_DIR} -c listen_addresses=127.0.0.1`, "-w", "-t", "60", "start"]);
  await ensureDatabases();
  console.log(`postgres 已在 127.0.0.1:${PORT}，库：${DATABASES.join(", ")}`);
}

function stop() {
  if (!existsSync(join(DATA_DIR, "postmaster.pid"))) {
    console.log("没有在跑的 postgres");
    return;
  }
  run("pg_ctl", ["-D", DATA_DIR, "-m", "fast", "-w", "stop"]);
  console.log("postgres 已停止");
}

const command = process.argv[2] ?? "start";
if (command === "stop") stop();
else if (command === "status") console.log((await reachable()) ? `在跑（127.0.0.1:${PORT}）` : "没在跑");
else await start();
