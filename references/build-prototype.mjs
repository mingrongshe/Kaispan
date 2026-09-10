// 把 KaiSpan 原型（多文件）打包成单文件 haccp-prototype.html。
//
//   node references/build-prototype.mjs <kaispan-ui 目录> [输出路径]
//
// 打包规则：
// - index.html 里引用的全部 CSS 与 JS 按原顺序内联，不做压缩、不改一个字符
//   （除了把 </script> </style> 在字符串里转义掉，否则会提前闭合标签）。
// - 侧边栏图标和 Kai 头像内联成 data URI，靠一个 MutationObserver 在渲染后替换 src。
//   原型引用到的图片全部内联，打开不会去找外部资源。
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";

const src = process.argv[2];
const out = process.argv[3] ?? join(process.cwd(), "references/haccp-prototype.html");
if (!src) { console.error("用法: node references/build-prototype.mjs <kaispan-ui 目录> [输出路径]"); process.exit(1); }

const read = (p) => readFileSync(join(src, p), "utf8");
const index = read("index.html");
const safe = (s) => s.replace(/<\/(script|style)\b/gi, "<\\/$1");

const css = [...index.matchAll(/<link rel="stylesheet" href="([^"?]+)/g)].map((m) => m[1]);
const js = [...index.matchAll(/<script defer src="([^"?]+)/g)].map((m) => m[1]);

const assetList = [
  "assets/ai 女秘书形象，形象要全部统一.png",
  "assets/kaispan-logo-transparent.png",
  "assets/kai-dashboard-cutout-flipped.png",
  "assets/business-cost-profit-report.png",
];
// 侧边栏图标是用变量拼出来的（assets/menu-icons/${id}.png），整个目录都收进来。
for (const f of readdirSync(join(src, "assets/menu-icons"))) {
  if (f.endsWith(".png")) assetList.push("assets/menu-icons/" + f);
}
// assets/tax-advisor-people-clean.png 有 1.3 MB，只用在税务师页，故意不收；
// 下面的 shim 会把没收进来的 assets/ 图片直接去掉 src，不会去磁盘上找。
const assets = {};
for (const p of assetList) {
  if (!existsSync(join(src, p))) { console.warn("缺图，跳过:", p); continue; }
  assets[p] = "data:image/png;base64," + readFileSync(join(src, p)).toString("base64");
}

// CSS 里的 url("assets/...") 也换成 data URI，否则浏览器仍会去磁盘上找。
const inlineCssUrls = (text) =>
  text.replace(/url\((['"]?)(assets\/[^'")]+)\1\)/g, (m, q, path) =>
    assets[path] ? `url("${assets[path]}")` : m);
const head = css.map((p) => `<style data-from="${basename(p)}">\n${safe(inlineCssUrls(read(p)))}\n</style>`).join("\n");
const body = js.map((p) => `<script data-from="${basename(p)}">\n${safe(read(p))}\n</script>`).join("\n");

const shim = `<script>
// 原型里的图片原本是相对路径；单文件版本用 data URI 顶上。
(function () {
  var MAP = ${safe(JSON.stringify(assets))};
  function fix(root) {
    var imgs = root.querySelectorAll ? root.querySelectorAll('img[src^="assets/"]') : [];
    for (var i = 0; i < imgs.length; i++) {
      var raw = imgs[i].getAttribute("src");
      var hit = MAP[raw] || MAP[decodeURIComponent(raw)];
      if (hit) imgs[i].src = hit; else imgs[i].removeAttribute("src");
    }
  }
  function start() {
    fix(document);
    new MutationObserver(function () { fix(document); }).observe(document.body, { childList: true, subtree: true });
  }
  start(); // <div id="app"> 已经在上面，body 存在，立刻接管，不等 DOMContentLoaded
})();
</script>`;

const stamp = new Date().toISOString().slice(0, 10);
writeFileSync(out, `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>KaiSpan HACCP 原型（单文件）</title>
    <!--
      由 references/build-prototype.mjs 从 KaiSpan UI 原型打包而成，${stamp}。
      内容与原型逐字节一致，只是合并成一个文件、图片换成 data URI。
      要改产品行为请改原型再重新打包，不要直接编辑这个文件。
    -->
${head}
  </head>
  <body>
    <div id="app"></div>
${shim}
${body}
  </body>
</html>
`);
console.log("写出:", out);
