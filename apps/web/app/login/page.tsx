import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { login, SESSION_COOKIE } from "@/lib/api";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  async function submit(formData: FormData): Promise<void> {
    "use server";
    const loginCode = String(formData.get("loginCode") ?? "").trim();
    const token = await login(loginCode);
    if (!token) redirect("/login?error=1");
    (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/" });
    redirect("/");
  }

  return (
    <main>
      <h1>登录</h1>
      <form className="card" action={submit}>
        <label htmlFor="loginCode">登录码（演示：martin / olivia / james / noah）</label>
        <input id="loginCode" name="loginCode" autoComplete="off" required />
        <button type="submit" style={{ marginLeft: 8 }}>
          进去
        </button>
        {error ? <p className="error">登录码不对</p> : null}
      </form>
    </main>
  );
}
