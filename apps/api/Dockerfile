# syntax=docker/dockerfile:1
#
# NestJS API 的生产镜像。Railway 认这个文件，docker-compose 的 full profile 也用它。
#
# 刻意保留了 tools/ 和 prisma/migrations：部署时要能在容器里打 migration
#   docker run ... node tools/migrate.mjs
# Railway 上把它设成 release/pre-deploy 命令就行，见 docs/deploy.md。

FROM node:22-bookworm-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@10.12.1 --activate
WORKDIR /app

# 先只拷清单，依赖层就能被缓存住，改业务代码不用重装
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

# prisma.config.ts 启动时要读根目录的 .env 或 .env.example，两个都没有会直接抛
COPY .env.example tsconfig.base.json ./
COPY tools tools
COPY apps/api apps/api

# prebuild 会跑 prisma generate，然后 tsc 出 apps/api/dist
RUN pnpm --filter @kaispan-haccp/api build

# 本地开发用的内嵌 postgres 二进制两百多兆，镜像里一点用没有
RUN rm -rf node_modules/.pnpm/@embedded-postgres* node_modules/.pnpm/embedded-postgres* \
    apps/api/node_modules/embedded-postgres

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app ./

# 容器里必须听 0.0.0.0，不然端口映射进不来
ENV HOST=0.0.0.0

# 照片默认落在这里。Railway 上要挂一块持久卷到这个路径，不然重新部署就没了。
ENV FILE_STORAGE_DIR=/data/storage
RUN mkdir -p /data/storage && chown -R node:node /data/storage
USER node

EXPOSE 3001
CMD ["node", "--enable-source-maps", "apps/api/dist/main.js"]
