import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// NestJS 靠 emitDecoratorMetadata 做依赖注入，esbuild 不支持，所以走 swc。
const plugins = [swc.vite({ module: { type: "commonjs" } })];

export default defineConfig({
  test: {
    projects: [
      {
        plugins,
        test: {
          name: "unit",
          root: __dirname,
          include: ["src/**/*.spec.ts"],
          environment: "node",
        },
      },
      {
        plugins,
        test: {
          name: "integration",
          root: __dirname,
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
