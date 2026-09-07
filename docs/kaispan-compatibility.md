# KaiSpan 兼容边界

## 用途

本仓库可以独立选择免费数据库、简化登录和托管平台，但下面的代码边界必须从第一版开始保留。它们只覆盖以后最难重做的数据和权限结构，不要求当前复制 KaiSpan 平台。

## 当前用户上下文

后端通过一个集中入口取得当前用户上下文：

```ts
type CurrentContext = {
  userId: string;
  organizationId: string;
  unitId: string;
  role: "employee" | "store_manager";
};
```

POC 可以使用固定账号或简化登录，但 controller 和 service 不应各自解析用户、组织和门店。前端传来的 `userId`、`organizationId`、`unitId` 或 `role` 不能直接成为可信身份；后端从已验证的当前用户上下文中取得这些值。

允许的最小做法是：用户通过演示账号登录，后端用服务端 session 或后端签名的 token 识别账号，再从后端保存的账号信息生成 `CurrentContext`。后续业务请求只携带登录凭证，不在请求体中声明自己是什么角色或属于哪个组织和门店。

## 数据归属

`organizationId` 表示使用 KaiSpan 的客户公司或租户，`unitId` 表示该公司下面的一家具体餐馆门店。

- 每个属于客户组织的 HACCP 业务模型都包含 `organizationId`。
- 属于具体门店的表单、任务和记录同时包含 `unitId`。
- 创建或提交的记录保存执行人的用户标识以及创建、更新时间。
- 列表、详情、修改和状态变化都在当前 `organizationId` 内查询；门店资源同时限制 `unitId`。
- 不能只凭一个全局记录 ID 读取或修改租户数据。

第一版可以固定使用一个 organization 和一个 unit。这个简化只影响运行方式，不删除数据归属字段。

## 两个角色与权限入口

第一版只实现两个典型角色：

- `employee`：填写和提交允许访问的 HACCP 表单。
- `store_manager`：查看和处理当前门店的 HACCP 记录。

填写和店长管理都经过同一个权限模块。该模块可以公开两个直接方法：`canFillHaccp()` 和 `canManageHaccp()`。KaiSpan 已有门店范围权限 `operations.haccp.fill`，`canFillHaccp()` 沿用这个标识。

店长管理 HACCP 的正式 permission 尚未决定。POC 暂时由 `canManageHaccp()` 完成判断，不向 KaiSpan permission catalog 发明新标识。业务页面、controller 和 service 不散落 `role === "employee"` 或 `role === "store_manager"` 判断。

前端可以根据权限调整页面，但每个受保护的 NestJS API 都再次执行后端权限检查。

## API 与数据库

业务访问路径固定为：

```text
Next.js 页面 → NestJS API → Prisma → PostgreSQL
```

- 前端不连接 PostgreSQL，也不直接执行 Prisma 查询。
- 后端负责输入校验、权限检查、租户范围和状态变化。
- API 使用明确的输入、输出 DTO；业务错误至少返回稳定的 `code` 和可读的 `message`。
- Prisma schema 变化通过可重复执行的 migration 保存。

## 已提交记录

草稿是否允许删除由产品范围决定。已经提交或经店长处理的记录不做无痕物理删除。

第一版至少保留：

- 创建或提交人。
- 提交时间。
- 当前状态。
- 店长处理人和处理时间（如果发生过）。

完整 KaiSpan AuditLog 留到正式接入阶段。

## 文件与照片

只有产品范围明确要求照片或附件时才实现文件能力。实现时：

- 上传和下载经过后端。
- 业务记录保存相对文件 key，不保存开发者电脑路径或永久公开 URL。
- 文件记录包含 `organizationId` 和 `unitId`。

第一版不需要复制 KaiSpan 的 R2 `pending → uploaded` 完整流程。

## 最低隔离验证

产品 UI 可以只展示一个公司和一家门店。自动化隔离测试需要在测试数据库中额外创建第二个 organization 和 unit，用来证明第一个 organization/unit 的用户无法读取或修改另一边的数据；这些测试数据不需要出现在演示页面。

## 当前不接入

- Supabase Auth 与 KaiSpan membership。
- 完整 permission catalog、access grant 和动态委派。
- KaiSpan tenant-scoped Prisma client。
- OpenAPI generated client。
- 正式 AuditLog、Action Center、通知和部署流水线。

这些能力在正式吸收进 KaiSpan 时接线；当前代码只需保留上面的集中入口和数据归属。
