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

/**
 * 前端只往后端转发登录凭证，从不声明自己是谁、属于哪家店。
 */
export async function apiGet<T>(path: string): Promise<T | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok) return null;
  return (await response.json()) as T;
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
