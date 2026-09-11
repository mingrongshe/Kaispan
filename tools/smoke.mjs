// 开发态冒烟：按 `pnpm dev` 用的同一条命令把 API 起起来，真发一次登录请求。
//
// 为什么单独要这个：单元测试和集成测试都走 swc 编译，装饰器元数据（design:paramtypes）
// 一定在，所以 Nest 的构造函数注入永远是好的。开发态是另一条编译链，元数据一旦丢了，
// 控制器里的 this.auth 就是 undefined，所有接口 500——96 个测试全绿也照样登录不进去。
// 这个脚本专门守这条缝：它跑的是开发态那条链。
import { spawn } from "node:child_process";
import { once } from "node:events";
import { connect } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "./env.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
loadEnv();

const PORT = Number(process.env.PORT ?? 3001);
const BASE = `http://127.0.0.1:${PORT}`;

function reachable(port) {
  return new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port });
    socket.on("connect", () => (socket.end(), resolve(true)));
    socket.on("error", () => resolve(false));
    socket.setTimeout(500, () => (socket.destroy(), resolve(false)));
  });
}

if (await reachable(PORT)) {
  console.error(`端口 ${PORT} 已经被占了，先把 pnpm dev 停掉再跑冒烟`);
  process.exit(1);
}

const api = spawn(process.execPath, ["--enable-source-maps", "-r", "@swc-node/register", "src/main.ts"], {
  cwd: join(ROOT, "apps", "api"),
  stdio: ["ignore", "pipe", "pipe"],
  env: process.env,
});
let log = "";
api.stdout.on("data", (chunk) => (log += chunk));
api.stderr.on("data", (chunk) => (log += chunk));

const stop = async () => {
  api.kill("SIGTERM");
  await once(api, "exit").catch(() => undefined);
};
const fail = async (message) => {
  await stop();
  console.error(`冒烟失败：${message}`);
  if (log.trim()) console.error(`\n--- API 输出 ---\n${log.trimEnd()}`);
  process.exit(1);
};

const deadline = Date.now() + 60_000;
while (!(await reachable(PORT))) {
  if (api.exitCode !== null) await fail("API 进程自己退了");
  if (Date.now() > deadline) await fail("60 秒内没听到端口");
  await new Promise((resolve) => setTimeout(resolve, 300));
}

async function login(loginCode) {
  const response = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ loginCode }),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

const ok = await login("martin");
if (ok.status === 400 && ok.body.code === "INVALID_LOGIN_CODE") {
  await fail("库里没有 martin，先跑 pnpm bootstrap 灌演示数据");
}
if (ok.status !== 201 || typeof ok.body.token !== "string") {
  await fail(`登录应该拿到 token，实际 ${ok.status} ${JSON.stringify(ok.body)}`);
}

const bad = await login("这个登录码不存在");
if (bad.status !== 400 || bad.body.code !== "INVALID_LOGIN_CODE") {
  await fail(`错的登录码应该 400 INVALID_LOGIN_CODE，实际 ${bad.status} ${JSON.stringify(bad.body)}`);
}

await stop();
console.log("冒烟通过：开发态起得来，登录拿得到 token，错登录码是 400 INVALID_LOGIN_CODE");
