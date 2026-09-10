// 集成测试跑在真实 PostgreSQL 上（acceptance.md：mock 不能替代这一项）。
// 这里只做一件事：把 DATABASE_URL 指到测试库，免得手滑清掉开发数据。
import { existsSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..", "..");
process.loadEnvFile(existsSync(join(root, ".env")) ? join(root, ".env") : join(root, ".env.example"));

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) throw new Error("缺 TEST_DATABASE_URL，看 .env.example");
process.env.DATABASE_URL = testUrl;
