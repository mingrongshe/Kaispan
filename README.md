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
- PostgreSQL。不用自己装：`pnpm pg:start` 会在 `.pgdata/` 起一个真实的 PostgreSQL 17
  （二进制来自 `@embedded-postgres/<平台>` 这个 npm 包，官方构建，不是 mock；
  `tools/pg.mjs` 直接驱动 `initdb` 和 `pg_ctl`）。想接 Neon、Supabase 或自建库，改 `.env`
  里的 `DATABASE_URL` 就行，那时不需要 `pnpm pg:start`。

## 跑起来

```bash
cp .env.example .env
pnpm install
pnpm bootstrap # 起 PostgreSQL + 生成 Prisma 客户端 + 打 migration + 灌演示数据
pnpm dev       # API 在 127.0.0.1:3001，前端在 127.0.0.1:3000
```

`pnpm bootstrap` 等价于依次执行（`setup` 这个名字被 pnpm 自己占了，所以叫 bootstrap）：

```bash
pnpm pg:start
pnpm db:generate
pnpm --filter @kaispan-haccp/api db:migrate
pnpm --filter @kaispan-haccp/api db:seed
```

停掉本地数据库：`pnpm pg:stop`。

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
pnpm build
```

`pnpm test:integration` 会自己确保数据库起着、migration 打到 `TEST_DATABASE_URL` 那个库上。
测试库会被反复清空，所以刻意和开发库分开。

## 目录

```
apps/api          NestJS 11 + Prisma 7，业务逻辑、权限、租户范围都在这里
apps/web          Next.js 16 + React 19，只通过 API 拿数据，不连数据库
tools             本地 PostgreSQL、migration 执行器、原型模板抽取脚本
docs              产品范围、兼容边界、验收标准、参考地图、当前状态
references        已确认的 HTML 原型（单文件）与它的打包脚本
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
