# KaiSpan HACCP 模块

HACCP 表单模块的独立开发仓库。第一阶段在这里做出可以真实试用的业务模块，之后再由 KaiSpan
主项目执行正式接入。

产品行为以 [`references/haccp-prototype.html`](references/haccp-prototype.html)（已确认的原型，
单文件，双击就能开）和 [`docs/product-scope.md`](docs/product-scope.md) 为准。

## 现在做到哪一步

`docs/product-scope.md` 里第一批和第二批的条目全部做完了：派单、填表（草稿 / 临界值判定 /
纠正措施）、补填、作废重填、异常照片、店长异常处理与维修单、设备台账与温度趋势、漏填补救、
最小班表、月度表与检查模式（可直接打印交给卫生局）、表单编辑器（版本化）、CSV 导出、
主页行内快填。详见 [`docs/status.md`](docs/status.md)。

## 需要什么

- Node 22
- pnpm 10.12.1（`corepack enable && corepack prepare pnpm@10.12.1 --activate`）
- PostgreSQL 17。有 Docker 就用 Docker（`pnpm db:up`）；没有的话 `pnpm pg:start`
  会用 `@embedded-postgres/<平台>` 这个 npm 包里自带的官方 postgres 二进制起一个，
  照样是真数据库，不是 mock。两条路都监听 `127.0.0.1:55432`，`.env` 不用改。
- 想接 Supabase、Neon 或自建库，改 `.env` 里的 `DATABASE_URL` 就行。
  `tools/pg.mjs` 认出地址不是本机就会让路，不会再多起一个本地数据库。

## 跑起来

```bash
cp .env.example .env
pnpm install
pnpm db:up     # Docker 起 PostgreSQL 17（没装 Docker 就跳过这步）
pnpm bootstrap # 确保数据库在跑 + 生成 Prisma 客户端 + 打 migration + 灌演示数据
pnpm dev       # API 在 127.0.0.1:3001，前端在 127.0.0.1:3000
```

`pnpm bootstrap` 等价于依次执行（`setup` 这个名字被 pnpm 自己占了，所以叫 bootstrap）：

```bash
pnpm pg:start  # 数据库已经在 55432 上跑着就只补建库，不会重复起
pnpm db:generate
pnpm --filter @kaispan-haccp/api db:migrate
pnpm --filter @kaispan-haccp/api db:seed
```

### 数据库那几个命令

```bash
pnpm db:up    # docker compose up -d db
pnpm db:down  # 停掉容器，数据还在
pnpm db:nuke  # 停掉并删数据卷，下次 bootstrap 从空库重来
pnpm pg:stop  # 停掉 pnpm pg:start 起的那个（跟 Docker 无关）
```

app 和 web 默认跑在宿主机上，不进容器 —— macOS 上容器里跑 Next 的文件监听要过 bind mount，
慢得没必要。想看整套在容器里是什么样（部署前的预演）：

```bash
docker compose --profile full up --build
```

这条用的就是要推到 Railway 的那两个镜像。

## 部署

Supabase 放数据库、Vercel 放前端、Railway 放后端，每一步和每个环境变量写在
[docs/deploy.md](docs/deploy.md)。

## 演示账号

登录页在 <http://127.0.0.1:3000/login>，输入登录码即可。

| 登录码 | 人 | 角色 | 界面语言 |
| --- | --- | --- | --- |
| `martin` | Martin | 店长 | 中文 |
| `olivia` | Olivia | 员工 | 中文 |
| `james` | James | 员工 | Deutsch |
| `noah` | Noah | 员工 | Deutsch |

演示数据是一家公司一家门店（Martin Gastro GmbH / Martin Biergarten），七张表、两周班表、
五台设备。本周六开店班上排了 Olivia 和 James 两个人，用来看「一个班两个人，谁填都算」。

## 检查

```bash
pnpm typecheck
pnpm test              # 单元测试
pnpm test:integration  # 真实 PostgreSQL 上的集成测试
pnpm smoke             # 开发态冒烟：按 pnpm dev 的方式起 API，真登录一次
pnpm build
```

`pnpm test:integration` 会自己确保数据库起着、migration 打到 `TEST_DATABASE_URL` 那个库上。
测试库会被反复清空，所以刻意和开发库分开。

`pnpm smoke` 守的是另一条缝：测试跑在 swc 编译出来的代码上，开发态是另一条编译链，
一旦装饰器元数据丢了，Nest 的构造函数注入就是 undefined，接口全 500，而测试照样全绿。
它要求演示数据在（先跑过 `pnpm bootstrap`），并且 `pnpm dev` 没占着 3001。

## 目录

```
apps/api          NestJS 11 + Prisma 7，业务逻辑、权限、租户范围都在这里
apps/web          Next.js 16 + React 19，只通过 API 拿数据，不连数据库
tools             本地 PostgreSQL、migration 执行器、开发态冒烟、原型模板抽取脚本
docs              产品范围、兼容边界、验收标准、参考地图、部署、当前状态
docker            docker-compose 里数据库容器的初始化 SQL
references        已确认的 HTML 原型（单文件）与它的打包脚本

docker-compose.yml        本地数据库；--profile full 连 api/web 一起进容器
apps/api/Dockerfile       后端生产镜像，Railway 用的就是它
apps/web/Dockerfile       前端生产镜像，上 Vercel 的话用不到
railway.json              Railway 的构建和 pre-deploy 配置
```

## 关于 migration

`apps/api/prisma/migrations/` 下的 SQL 目前是手写的，不是 `prisma migrate dev` 生成的。

原因是这套开发环境的出口有白名单，`binaries.prisma.sh` 连不上，而 `prisma migrate` 需要从那里
下载 schema-engine 二进制。客户端不受影响：Prisma 7 用 driver adapter（`@prisma/adapter-pg`），
运行时不依赖 Rust 引擎。

处理办法是 `tools/migrate.mjs`：读的是同一批 migration 文件，写的是同一张 `_prisma_migrations`
表（列和 Prisma 一致，checksum 也按 Prisma 的算法），可重复执行、幂等。等那个域名通了，
`prisma migrate deploy` 可以接着用同一批文件往下走，不用重来。

手写的 SQL 和 `schema.prisma` 是否一致，由 `apps/api/test/schema-conformance.int.spec.ts`
逐模型逐字段写进去再读回来验证，不是靠肉眼比对。

如果你的机器也拿不到 `binaries.prisma.sh`，`prisma generate` 会因为要确保那个二进制存在而失败。
`.env.example` 里有一行注释掉的 `PRISMA_SCHEMA_ENGINE_BINARY`，取消注释即可跳过下载
（这个二进制不会被执行，migration 走 `tools/migrate.mjs`）。

## 文档

- [产品范围](docs/product-scope.md)：第一版做什么、不做什么，以及哪些是代定的
- [KaiSpan 兼容边界](docs/kaispan-compatibility.md)：当前代码必须保留的最小接入条件
- [第一版验收标准](docs/acceptance.md)：判断模块是否达到可试用状态
- [当前状态](docs/status.md)：做到哪一步、验证了什么、还差什么
- [KaiSpan 参考地图](docs/kaispan-reference-map.md)：只有遇到指定问题时才查阅的主仓库入口
- [开发规则](AGENTS.md)
