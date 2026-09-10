import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// NestJS 靠 emitDecoratorMetadata 做依赖注入，esbuild 不支持，所以走 swc。
// 输出保持 ESM：vitest 4 自己跑在 ESM 下，转成 CommonJS 会直接加载不起来。
const plugins = [
  swc.vite({
    jsc: {
      target: "es2022",
      parser: { syntax: "typescript", decorators: true },
      transform: { legacyDecorator: true, decoratorMetadata: true },
    },
    module: { type: "es6" },
  }),
];

export default defineConfig({
  // unplugin-swc 会关掉 esbuild；vite 8 的默认转换器换成了 oxc，一并关掉，否则装饰器元数据会被吃掉。
  oxc: false,
  test: {
    projects: [
      {
        plugins,
        oxc: false,
        test: {
          name: "unit",
          root: import.meta.dirname,
          include: ["src/**/*.spec.ts"],
          environment: "node",
        },
      },
      {
        plugins,
        oxc: false,
        test: {
          name: "integration",
          root: import.meta.dirname,
          include: ["test/**/*.int.spec.ts"],
          environment: "node",
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
          setupFiles: ["test/setup-integration.ts"],
        },
      },
    ],
  },
});
