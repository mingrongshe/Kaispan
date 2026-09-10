import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/api";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://127.0.0.1:3001";

/**
 * CSV 下载的中转。浏览器手里的会话 cookie 是发在前端这个域上的，
 * 直接点到 API 域上会没有身份，所以下载走这里转一手。
 */
export async function GET(request: Request): Promise<Response> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return new Response("没有登录", { status: 401 });

  const url = new URL(request.url);
  const templateId = url.searchParams.get("templateId");
  const month = url.searchParams.get("month");
  if (!templateId) return new Response("缺 templateId", { status: 400 });

  const upstream = await fetch(
    `${API_BASE_URL}/haccp/templates/${templateId}/monthly.csv${month ? `?month=${month}` : ""}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );
  if (!upstream.ok) return new Response("导不出来", { status: upstream.status });

  return new Response(await upstream.arrayBuffer(), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": upstream.headers.get("content-disposition") ?? "attachment; filename=haccp.csv",
    },
  });
}
