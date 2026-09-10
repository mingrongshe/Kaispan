import Link from "next/link";
import { apiGet, type Me } from "@/lib/api";

export default async function HomePage() {
  const me = await apiGet<Me>("/auth/me");

  if (!me) {
    return (
      <main>
        <h1>KaiSpan HACCP</h1>
        <div className="card">
          <p>还没有登录。</p>
          <Link href="/login">去登录</Link>
        </div>
      </main>
    );
  }

  return (
    <main>
      <h1>KaiSpan HACCP</h1>
      <div className="card">
        <dl>
          <dt>登录的人</dt>
          <dd>{me.name}</dd>
          <dt>角色</dt>
          <dd>{me.role === "store_manager" ? "店长" : "员工"}</dd>
          <dt>门店</dt>
          <dd>{me.unitName}</dd>
          <dt>公司</dt>
          <dd>{me.organizationName}</dd>
          <dt>界面语言</dt>
          <dd>{me.locale === "de" ? "Deutsch" : "中文"}</dd>
        </dl>
      </div>
      <div className="card">
        <p>
          能填表：{me.canFillHaccp ? "是" : "否"}　能处理异常：{me.canManageHaccp ? "是" : "否"}
        </p>
        <p style={{ color: "var(--muted)" }}>
          页面按权限显示，但每个受保护的接口后端都会再查一次。
        </p>
      </div>
    </main>
  );
}
