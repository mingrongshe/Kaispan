import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,

  // API_BASE_URL 以前写在 env 里。那个 env 块是 build 时把值写死进产物的，
  // 换一次后端地址就得重新构建一次前端；而且这个值只在服务端用得到
  // （浏览器从头到尾只跟 Next 说话，业务数据由 lib/api.ts 在服务端转发给 NestJS，
  // 见 docs/kaispan-compatibility.md），写进产物等于白白多暴露一次内网地址。
  // 现在直接在服务端读 process.env.API_BASE_URL，运行时改，重启即可生效。

  // README 里让人开 http://127.0.0.1:3000，而 next dev 自认的源是 localhost:3000，
  // Next 16 默认把这种跨源的 dev 资源请求拦掉，结果是 HMR 静默失效：
  // 改了代码页面不刷新，只有终端里一行警告。把这个地址加进白名单。
  // 只影响开发态，构建产物里没有这一项。
  allowedDevOrigins: ["127.0.0.1"],

  // 进容器时才需要 standalone 产物；Vercel 上不设这个变量，走它自己的打包。
  ...(process.env.NEXT_OUTPUT === "standalone" ? { output: "standalone" as const } : {}),
};

export default config;
