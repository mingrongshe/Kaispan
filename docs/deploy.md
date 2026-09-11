# 部署：Supabase + Vercel + Railway

三块东西：数据库放 Supabase，前端放 Vercel，后端放 Railway。照片先放 Railway 的持久卷。
全部有免费档，第一版够用（`AGENTS.md`：免费数据库和免费托管可用于第一版）。

先说一件影响整个部署形状的事：**浏览器从头到尾只跟前端说话**。业务数据是前端的服务端
（server component、server action、route handler）转发给 NestJS 的，浏览器里不出现 API 地址，
也不存在跨站 cookie。所以后端不需要对公网开放，CORS 和 `WEB_ORIGIN` 基本是摆设。
这不是部署时凑出来的，是 `docs/kaispan-compatibility.md` 要求的前后端分工顺带带来的。

```
浏览器 ──HTTPS──> Vercel (Next.js)  ──HTTPS──> Railway (NestJS) ──TLS──> Supabase (PostgreSQL)
                  会话 cookie 在这                照片在挂载的卷上
```

## 一、Supabase 建库

1. 新建 project，记住数据库密码。
2. Connect 面板里有两条连接串，两条都要：
   - **Transaction pooler**（`...pooler.supabase.com:6543`）给应用用 → `DATABASE_URL`
   - **Direct connection**（`db.<ref>.supabase.co:5432`）给 migration 和灌数据用 → `DIRECT_DATABASE_URL`

   分开的原因写在 `tools/migrate.mjs` 顶上：transaction pooler 一条语句一个事务、不保证
   会话粘性，DDL 和 advisory lock 在上面不可靠。反过来，应用是无状态短连接，走池子才不会
   把 Supabase 的连接数打满。

3. SSL。`pg` 8.23 把 `sslmode=require` 当成 `verify-full` 处理（会完整校验证书链），
   和 libpq 的习惯不一样。所以：
   - 先按 `?sslmode=verify-full` 连。连得上就用这个，别改。
   - 连不上报 `self-signed certificate in certificate chain`，说明证书链不在 Node 的信任库里。
     两条路：从 Supabase 下载 CA 证书，用 `?sslmode=verify-full&sslrootcert=/app/supabase-ca.crt`；
     或者退到 `?sslmode=no-verify`。后者仍然是加密的，但不验证对面是谁，
     图省事就选它，别假装它等于第一种。

4. 打 migration 和灌演示数据，在本机做，不用等服务部署好：

   ```bash
   DIRECT_DATABASE_URL="<直连串>" node tools/migrate.mjs
   DIRECT_DATABASE_URL="<直连串>" pnpm --filter @kaispan-haccp/api exec tsx prisma/seed.ts
   ```

   `prisma/seed.ts` 会先清空再重建演示数据，**只在空库上跑**。

## 二、Railway 部署 API

1. New Project → Deploy from GitHub repo，选这个仓库。
2. Settings 里 Root Directory 留空（Dockerfile 要从仓库根拿 workspace 清单），
   Build 选 Dockerfile，路径 `apps/api/Dockerfile`。仓库里的 `railway.json` 已经写好了这两条。
3. 环境变量：

   | 变量 | 值 |
   | --- | --- |
   | `DATABASE_URL` | Supabase 的 pooler 串（6543） |
   | `DIRECT_DATABASE_URL` | Supabase 的直连串（5432），给 pre-deploy 打 migration 用 |
   | `NODE_ENV` | `production` |
   | `FILE_STORAGE_DIR` | `/data/storage`（镜像里已经是默认值，写出来是为了明确） |
   | `WEB_ORIGIN` | Vercel 给的前端地址 |

   `PORT` 不用设，Railway 自己注入，`main.ts` 读的就是它。

4. **挂一块卷**，Mount path 填 `/data/storage`。不挂的话每次部署照片全没，
   数据库里还留着 `FileObject` 记录，点开就是 404。
5. Pre-deploy Command 填 `node tools/migrate.mjs`。以后改 schema 只要提交 migration 文件，
   部署时自己就打上去了。
6. Networking 里如果只给 Vercel 用，用 Private Networking 就够，不用生成公网域名；
   想用 Swagger（`/docs`）看接口就生成一个。

## 三、Vercel 部署前端

1. Import 这个仓库，**Root Directory 选 `apps/web`**，其余用默认（Vercel 认得出 pnpm workspace）。
2. 环境变量只有一个：`API_BASE_URL` = Railway 给 API 的地址（末尾不要带 `/`）。
   用 Railway 私网的话填 `http://<service>.railway.internal:<port>`，公网就填 `https://...`。
3. 这个值是**运行时**读的。以前 `next.config.ts` 里有个 `env` 块会在 build 时把它写死进产物，
   已经去掉了 —— 换后端地址不该需要重新构建前端。

## 四、上线后核一遍

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://<vercel 域名>/login        # 200
curl -s -X POST https://<railway 域名>/auth/login \
  -H 'Content-Type: application/json' -d '{"loginCode":"nope"}'             # 400 INVALID_LOGIN_CODE
```

第二条拿到 400 而不是 500，说明数据库连上了、表在、依赖注入是好的。
拿到 500 就去看 Railway 的日志，不要靠登录页上的文字判断 —— 那句话现在会把后端的
真实 code 和 message 带出来，但 500 的详情只在服务端日志里。

然后用 `martin` 登录一次，走到首页看见「今天要填」和「出事了」两块，就算通。

## 还没做的

- **照片存 Railway 的卷是权宜之计**。卷跟着单个服务走，服务迁移或者要扩到多实例时就不行了。
  正经做法是接 Supabase Storage，给 `apps/api/src/files` 加一层 driver（本地磁盘 / 对象存储），
  接口不用动。第一版没做，因为单实例的卷够用，而且不引入新依赖。
- **没有 CI**。目前 typecheck / 测试 / `pnpm smoke` 都靠本机跑。接 GitHub Actions 之前，
  合并前请自己跑一遍 `docs/status.md` 里列的那几条。
- **没有备份策略**。Supabase 免费档的备份策略以它自己的为准，没有额外配置。
