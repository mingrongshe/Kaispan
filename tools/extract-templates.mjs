// 从 KaiSpan 原型的 haccp.js 里把 7 张表的模板定义原样抠出来，写成 JSON 给种子数据用。
// 手抄一遍列名和临界值必然抄错，所以宁可在 node 里装一套最小的浏览器壳把它跑一遍。
//
//   node tools/extract-templates.mjs <kaispan-ui>/haccp.js apps/api/prisma/prototype-templates.json
//
import { readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";
const src = readFileSync(process.argv[2], "utf8");
const store = new Map();
const noop = () => {};
const el = new Proxy({}, { get: (t, k) => (k === "style" ? {} : k === "classList" ? { add: noop, remove: noop, contains: () => false } : typeof k === "string" && k.startsWith("on") ? null : noop), set: () => true });
const sandbox = {
  console, Date, Math, JSON, Intl,
  localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
  document: new Proxy({}, { get: (t, k) => (k === "documentElement" || k === "body" ? el : k === "querySelectorAll" ? () => [] : k === "querySelector" || k === "getElementById" ? () => null : k === "createElement" ? () => el : k === "addEventListener" ? noop : noop) }),
  location: { hash: "", href: "" },
  setTimeout, clearTimeout, setInterval, clearInterval,
  navigator: { language: "zh-CN" },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: "haccp.js" });
const templates = vm.runInContext("haccpTemplates()", sandbox);
writeFileSync(process.argv[3], JSON.stringify(templates, null, 2));
console.log("模板数:", templates.length, "→", process.argv[3]);
console.log(templates.map(t => `${t.id} v?  ${t.columns.length} 列  ${t.layout}`).join("\n"));
