# 当前状态

更新于 2026-09-10。这一页只记「实际做完并实际验证过的」，人工演示、单元测试、真实 PostgreSQL
验证和 KaiSpan 正式接入是不同层次，不互相替代。

## 做完的

**骨架检查点**（`onboarding.md` 要求在大量功能开发前展示的那一次）：

- 目录结构：`apps/api`（NestJS 11 + Prisma 7）、`apps/web`（Next.js 16 + React 19）、
  `tools`、`docs`、`references`。pnpm workspace，strict TypeScript。
- Prisma schema：13 个模型。属于公司的都带 `organizationId`，属于门店的同时带 `unitId`；
  已提交记录只作废不物理删除；模板按版本存，记录锁自己那一版。
- 当前用户上下文：`src/context/`。`ContextService.resolve()` 是全后端唯一一处「你是谁」的判定，
  从服务端会话推出 `CurrentContext`。请求身上只带登录凭证，不带角色、组织、门店。
- 权限入口：`src/access/`。`canFillHaccp()`（沿用 KaiSpan 的 `operations.haccp.fill`）和
  `canManageHaccp()`（店长的正式 permission 未定，暂由这里判断，没有发明新标识）。
  接口用 `@RequireHaccpFill()` / `@RequireHaccpManage()` 声明，业务代码里没有散落的角色判断。
- 租户范围：`unitScope(ctx)` / `orgScope(ctx)` 拼进 where，跨租户的 id 直接查不到，
  而不是查到之后靠一句 if 拦住。
- 一条真链路：登录 → 服务端会话 → `/auth/me` → 前端 SSR 渲染。
- 两个读接口：`GET /haccp/entries`（员工只读本店历史，别人的草稿不出现）、
  `GET /haccp/manage/issues`（店长的待处理）。
- 演示数据：一家公司一家门店、四个账号、七张表（列定义和临界值从原型代码抠出来，不是手抄）、
  两周班表、五台设备。

## 验证过的

命令都在 README 里，实际跑过：

| 命令 | 结果 |
| --- | --- |
| `pnpm typecheck` | 通过 |
| `pnpm test` | 5 条单元测试通过 |
| `pnpm test:integration` | 13 条集成测试通过，跑在真实 PostgreSQL 17 上 |
| `pnpm build` | API 与前端都编译通过 |

集成测试覆盖到的：没登录被拒；员工调店长接口 403；店长看得到本店待处理；另一个
organization 的店长看不到；同公司另一家门店的店长看不到；带 `templateId` 查询也逃不出本店范围；
员工只读看得到同事填的记录；别人的草稿不出现；记录确实在 PostgreSQL 里；手写的 migration SQL
与 `schema.prisma` 逐字段对得上；作废是标记不是删除；唯一约束真的建上了；`_prisma_migrations`
里有 init 那条。

人工跑过：`olivia` 登录拿到 cookie，`/auth/me` 返回正确的门店和权限，同一个 cookie 调
`/haccp/manage/issues` 得到 403，前端首页渲染出 Olivia / Martin Biergarten / 员工。

## 还没做

第一批剩下的业务功能，全部是写接口和对应页面：

- 派单（表 → 班次）与最小班表的维护界面
- 填表：草稿、提交、临界值判定、纠正措施必填、异常照片
- 补填（标「补填」+ 必填原因）
- 作废重填
- 店长异常处理：温度类挂设备开维修单，其余写处理结果
- 设备台账、维修单、温度趋势图
- 月度表与检查模式（打印）

第二批：表单编辑器、CSV 导出、主页行内快填。

`docs/acceptance.md` 的最低自动化检查里还差两条：员工提交表单、店长执行管理动作。这两条要等
对应的写接口做出来。

## 已知的环境限制

- `binaries.prisma.sh` 在这套开发环境里连不上，所以 migration 走 `tools/migrate.mjs`
  而不是 `prisma migrate`。理由和影响写在 README「关于 migration」。
- 代码只在 Linux 上跑过。`embedded-postgres` 的 macOS 二进制已经列进
  `pnpm-workspace.yaml` 的 `onlyBuiltDependencies`，但没有在 macOS 上实际验证。

## 这一版不能代表

不能说已接入 KaiSpan、已通过 KaiSpan 完整 RBAC 或 tenant isolation gate、已通过浏览器 E2E、
已达到生产发布条件。
