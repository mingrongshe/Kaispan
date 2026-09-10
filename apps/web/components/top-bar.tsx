import Link from "next/link";
import type { Me } from "@/lib/api";

export function TopBar({ me }: { me: Me }) {
  return (
    <div className="topbar">
      <span className="who">{me.name}</span>
      <span className="where">
        {me.unitName} · {me.role === "store_manager" ? "店长" : "员工"}
      </span>
      <nav>
        <Link href="/">今天</Link>
        <Link href="/records">全部记录</Link>
        <Link href="/monthly">月度表</Link>
        <Link href="/equipment">设备</Link>
        {me.canManageHaccp ? <Link href="/shifts">班表</Link> : null}
        {me.canManageHaccp ? <Link href="/inspection">检查模式</Link> : null}
      </nav>
    </div>
  );
}
