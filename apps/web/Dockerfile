# syntax=docker/dockerfile:1
#
# Next.js 前端的生产镜像。正式部署走 Vercel 的话用不到这个文件，
# 留着是为了两件事：docker-compose 的 full profile 能在本地跑出部署后的样子，
# 以及万一 web 也要放 Railway，直接就能用。
#
# 用 Next 的 standalone 输出：产物自带一份裁剪过的 node_modules，
# 镜像里不需要 pnpm，也不需要整个 workspace。

FROM node:22-bookworm-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@10.12.1 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile --filter @kaispan-haccp/web

COPY tsconfig.base.json ./
COPY apps/web apps/web

# API_BASE_URL 只在运行时读，不参与构建，所以这里不用给
ENV NEXT_OUTPUT=standalone
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @kaispan-haccp/web build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static

USER node
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "apps/web/server.js"]
