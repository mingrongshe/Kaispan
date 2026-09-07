# KaiSpan HACCP 模块

这是 HACCP 表单模块的独立开发仓库。第一阶段在这里完成可实际试用的业务模块，后续再由 KaiSpan 主项目执行正式接入。

## 开始

1. 阅读 [onboarding.md](onboarding.md)。
2. 将已经确认的 HTML 原型放到 `references/haccp-prototype.html`。
3. 使用 [产品范围 Prompt](docs/product-scope-prompt.md)，由产品负责人和 Agent 共同生成 `docs/product-scope.md`。
4. Agent 按 [AGENTS.md](AGENTS.md) 开始开发。

代码尚未初始化。技术方案和环境变量确定后，再补充安装、迁移、启动、测试和演示账号说明。

## 文档

- [产品范围 Prompt](docs/product-scope-prompt.md)：帮助产品负责人把原型和实际门店流程讲清楚。
- [KaiSpan 兼容边界](docs/kaispan-compatibility.md)：当前代码必须保留的最小接入条件。
- [第一版验收标准](docs/acceptance.md)：判断模块是否达到可试用状态。
- [KaiSpan 参考地图](docs/kaispan-reference-map.md)：只有遇到指定问题时才查阅的主仓库入口。
