import { cookies } from "next/headers";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://127.0.0.1:3001";
export const SESSION_COOKIE = "haccp_session";

export type Me = {
  userId: string;
  name: string;
  role: "employee" | "store_manager";
  locale: "zh" | "de";
  organizationId: string;
  organizationName: string;
  unitId: string;
  unitName: string;
  canFillHaccp: boolean;
  canManageHaccp: boolean;
};

export type ApiError = { code: string; message: string };

async function token(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

/**
 * 前端只往后端转发登录凭证，从不声明自己是谁、属于哪家店。
 * 业务数据一律走 NestJS API，这里不碰数据库。
 */
export async function apiGet<T>(path: string): Promise<T | null> {
  const value = await token();
  if (!value) return null;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${value}` },
    cache: "no-store",
  });
  if (!response.ok) return null;
  return (await response.json()) as T;
}

export async function apiSend<T>(
  path: string,
  body: unknown,
  method: "POST" | "PUT" | "DELETE" = "POST",
): Promise<{ ok: true; data: T } | { ok: false; error: ApiError }> {
  const value = await token();
  if (!value) return { ok: false, error: { code: "NOT_AUTHENTICATED", message: "登录已经过期，重新登录一下" } };

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${value}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = payload as Partial<ApiError>;
    return { ok: false, error: { code: error.code ?? "UNKNOWN", message: error.message ?? "出错了" } };
  }
  return { ok: true, data: payload as T };
}

export async function login(loginCode: string): Promise<string | null> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ loginCode }),
    cache: "no-store",
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { token: string };
  return body.token;
}

/** 上传照片：把浏览器传上来的 File 原样转发给后端 */
export async function apiUpload(
  path: string,
  file: File,
): Promise<{ ok: true; data: unknown } | { ok: false; error: ApiError }> {
  const value = await token();
  if (!value) return { ok: false, error: { code: "NOT_AUTHENTICATED", message: "登录已经过期" } };

  const body = new FormData();
  body.append("file", file, file.name);
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${value}` },
    body,
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = payload as Partial<ApiError>;
    return { ok: false, error: { code: error.code ?? "UNKNOWN", message: error.message ?? "上传失败" } };
  }
  return { ok: true, data: payload };
}
