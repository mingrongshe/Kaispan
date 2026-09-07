# HACCP 模块开发交接

## 当前任务

请基于已经确认的 HTML 原型，完成一套可以真实运行和试用的 HACCP 表单模块。

第一阶段不是静态演示，也不是只验证一条 CRUD 链路。目标是让员工和店长能够在完整流程中填写、提交、查看并处理 HACCP 记录。代码在本仓库独立开发，当前不接入 KaiSpan 的完整平台底座。

## 现有材料

- HTML 原型：放到 `references/haccp-prototype.html`，作为页面和交互依据。
- [产品范围 Prompt](docs/product-scope-prompt.md)：由你和 Agent 一起使用，产出 `docs/product-scope.md`。
- [KaiSpan 兼容边界](docs/kaispan-compatibility.md)：Agent 在设计数据、权限和 API 前必须阅读。
- [第一版验收标准](docs/acceptance.md)：决定第一版何时可以交付试用。

## 第一步

先把 HTML 原型交给 Agent，再把 `docs/product-scope-prompt.md` 中的 Prompt 发给它。Agent 应当逐个询问原型没有说明的业务问题，最后生成 `docs/product-scope.md`。你负责确认里面的门店角色、填写时间、表单状态、异常处理和第一版范围。

产品范围确认后，再让 Agent 初始化代码并实现模块。

## 你可以自由决定的部分

- 页面布局、交互细节和实际门店工作流程，以确认后的原型和产品范围为准。
- 第一版使用哪个免费 PostgreSQL、登录方式和托管平台。
- Agent 如何拆分页面、组件和后端 service。
- 演示账号、演示数据和日常试用方式。

技术栈固定为 Next.js、React、NestJS、PostgreSQL、Prisma 和 TypeScript。其余实现优先选择最简单、当前能工作的方案。

## 需要遵守的边界

数据归属、权限入口、前后端边界和已提交记录的处理方式统一写在 [KaiSpan 兼容边界](docs/kaispan-compatibility.md)。这里不复制第二遍。

这些边界只保护以后接入 KaiSpan 时最难修改的部分，不要求现在实现 Supabase Auth、完整 RBAC、正式审计、OpenAPI generated client、Action Center 或 KaiSpan 部署流程。

## 两个检查点

### 项目骨架完成后

在大量功能开发前，展示一次目录结构、Prisma schema、当前用户上下文和权限入口。检查技术栈是否一致，以及 organization、unit 和 API 边界是否保留。

### 模块可以完整试用后

按照 `docs/acceptance.md` 走完员工和店长的完整流程，记录实际通过的验证、已知缺口和下一步需要接入 KaiSpan 的部分。

检查点不限制你继续快速开发页面和业务功能，也不要求逐个功能等待审批。

## 遇到问题时

- 原型和真实门店流程不一致：向产品负责人提出具体业务问题。
- 数据、权限和 API 边界不清楚：先读兼容边界，再按参考地图查一个相关 KaiSpan 文件。
- 参考地图要求查看 KaiSpan 主仓库：向项目负责人索取只读路径或固定版本链接。
- 免费服务或实现方案需要选择：优先选择最简单、可替换且不锁定业务数据的方案。
