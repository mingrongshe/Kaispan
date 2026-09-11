import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,

  // API_BASE_URL 以前写在 env 里。那个 env 块是 build 时把值写死进产物的，
  // 换一次后端地址就得重新构建一次前端；而且这个值只在服务端用得到
  // （浏览器从头到尾只跟 Next 说话，业务数据由 lib/api.ts 在服务端转发给 NestJS，
  // 见 docs/kaispan-compatibility.md），写进产物等于白白多暴露一次内网地址。
  // 现在直接在服务端读 process.env.API_BASE_URL，运行时改，重启即可生效。

  // 进容器时才需要 standalone 产物；Vercel 上不设这个变量，走它自己的打包。
  ...(process.env.NEXT_OUTPUT === "standalone" ? { output: "standalone" as const } : {}),
};

export default config;
