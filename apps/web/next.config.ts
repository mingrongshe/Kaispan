import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // 业务数据一律走 NestJS API，前端不连数据库、不跑 Prisma
  // （docs/kaispan-compatibility.md）。
  env: { API_BASE_URL: process.env.API_BASE_URL ?? "http://127.0.0.1:3001" },
};

export default config;
