# HACCP 模块开发规则

本仓库用于独立开发可实际试用的 HACCP 表单模块。当前目标是快速完成业务模块，不是在这里复制 KaiSpan 的完整平台底座。

## 开始工作

1. 第一次进入仓库时，先读 [onboarding.md](onboarding.md)。
2. 如果 `docs/product-scope.md` 尚未完成，使用 [产品范围 Prompt](docs/product-scope-prompt.md) 与产品负责人共同补齐；产品范围确认前，只能整理现有材料，不能自行补写业务规则。
3. 开始数据模型、权限或 API 工作前，完整阅读 [KaiSpan 兼容边界](docs/kaispan-compatibility.md)。
4. 准备宣布第一版完成前，逐项核对 [第一版验收标准](docs/acceptance.md)。
5. 只有遇到 [KaiSpan 参考地图](docs/kaispan-reference-map.md) 中列出的具体问题时，才按其中路径查阅 KaiSpan 主仓库。

## 事实来源

- 产品行为：`references/haccp-prototype.html` 与确认后的 `docs/product-scope.md`。
- 技术兼容要求：`docs/kaispan-compatibility.md`。
- 第一版完成条件：`docs/acceptance.md`。

材料发生冲突时，不要猜测。说明冲突会影响的页面、数据或行为，并向产品负责人提出一个具体问题。

## 技术栈

- Node.js 22、pnpm 10.12.1、strict TypeScript。
- Web：Next.js 16、React 19 App Router。
- API：NestJS 11、Express 5、Swagger DTO。
- 数据：PostgreSQL、Prisma schema 与 migration。
- 测试：Vitest。

保持实现简单。优先使用平台原生能力、标准库和已经安装的依赖；只有当前功能确实需要时才增加依赖或抽象。

## 开发边界

- 在本仓库完成开发。KaiSpan 主仓库只读，按 `docs/kaispan-reference-map.md` 指定的文件查阅。
- 页面、组件、service 和目录可以按当前模块的最简单实现组织。
- 免费数据库、简化登录和免费托管均可用于第一版。
- 前端通过 NestJS API 访问业务数据；权限、数据归属和状态变更由后端处理。
- 当前只需要员工和店长两个典型角色；具体约束以兼容边界文档为准。
- 原型没有要求的通用表单平台、工作流引擎、完整 RBAC、通知系统和报表不在第一版范围内。

## 代码与配置

- TypeScript 使用 2 空格缩进、双引号和分号。
- 环境变量首次出现时同时创建或更新 `.env.example`；只写变量名和安全示例，不写密码、token 或真实连接信息。
- Prisma schema 的每次变化都留下可重复执行的 migration。
- README 中的命令必须能够直接执行，不能依赖未记录的控制台手工操作。
- 非平凡的权限、租户或状态逻辑至少留下一项能在回归时失败的自动化检查。

## 完成与汇报

汇报实际完成和实际验证的内容。人工演示、单元测试、真实 PostgreSQL 验证和 KaiSpan 正式接入是不同层次，不互相替代。
