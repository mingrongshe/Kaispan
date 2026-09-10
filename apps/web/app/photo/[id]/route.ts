import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/api";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://127.0.0.1:3001";

/** 照片也走后端读，前端这里只是把会话 cookie 换成 Bearer 转过去 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return new Response("没有登录", { status: 401 });

  const { id } = await context.params;
  const upstream = await fetch(`${API_BASE_URL}/haccp/photos/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!upstream.ok) return new Response("找不到这张照片", { status: upstream.status });

  return new Response(await upstream.arrayBuffer(), {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
