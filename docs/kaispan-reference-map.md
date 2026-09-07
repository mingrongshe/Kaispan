# KaiSpan 参考地图

KaiSpan 主仓库只用于按需确认现有合同和标识，不是本仓库的默认上下文。日常开发以本仓库的原型、产品范围和兼容边界为准。

## 查阅规则

1. 先明确当前缺少的具体事实。
2. 只打开下表对应的文件。
3. 读到足以回答当前问题后停止，不扩展扫描整个主仓库。
4. 主仓库内容与本仓库已确认的产品范围冲突时，向项目负责人报告，不自行改写业务规则。
5. KaiSpan 主仓库保持只读。

需要查阅时，由项目负责人提供 KaiSpan 主仓库的只读本地路径或固定版本链接。下表路径都从该仓库根目录开始解析；没有获得路径时，Agent 应提出具体请求，不自行扫描电脑上的其他目录。

当前参考版本：`60219f9b82f98532b84fc35a0d025f787b4218d5`。以后需要采用新的 KaiSpan 规则时，先更新本文件中的版本和受影响结论。

## 按问题查阅

以下均为 KaiSpan 主仓库内的相对路径。

| 当前问题 | 查阅文件 | 要确认的内容 |
| --- | --- | --- |
| 确认技术版本或前后端边界 | `docs/system-knowledge/architecture/tech-stack.md` | Node、Next.js、NestJS、Prisma、PostgreSQL 与 API 基线 |
| 设计 organization 与 tenant 数据范围 | `docs/platform/saas-foundation/context/architecture.md` | organization scope、普通租户数据访问和后续接入边界 |
| 设计权限检查入口 | `docs/platform/identity-access/hands-on-knowledge/implementation/rbac-integration.md` | controller permission、service scope 与禁止散落角色判断 |
| 确认已有 HACCP 填写权限 | `packages/db/src/rbac-catalog.ts` | `operations.haccp.fill` 及其 unit scope |
| 正式接入前规划验证 | `docs/system-knowledge/engineering/quality-gates.md` | KaiSpan 完整 gate，不是 POC 第一版的完成条件 |

## 未列出的内容

Finance、OCR、税务端、Action Center、完整文件平台、部署和其他业务模块目前不影响 HACCP POC。只有项目负责人明确指出新的接入问题时，才把对应入口加入本表。
