import Link from "next/link";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/top-bar";
import { apiGet, type Me } from "@/lib/api";
import { Trend } from "./trend";

type WorkOrder = {
  id: string;
  note: string;
  result: string | null;
  openedAt: string;
  completedAt: string | null;
  openedBy: { name: string };
  completedBy: { name: string } | null;
};

type Equipment = {
  id: string;
  name: string;
  location: string | null;
  brand: string | null;
  model: string | null;
  status: "ok" | "needs_repair" | "out_of_service";
  workOrders: WorkOrder[];
};

type TrendData = {
  points: { date: string; value: number; breach: boolean }[];
  limit: { min?: number; max?: number } | null;
  unit: string | null;
  columnLabel: string | null;
};

const STATUS: Record<string, string> = { ok: "正常", needs_repair: "待修", out_of_service: "停用" };

export default async function EquipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await apiGet<Me>("/auth/me");
  if (!me) redirect("/login");

  const { id } = await params;
  const [equipment, trend] = await Promise.all([
    apiGet<Equipment>(`/equipment/${id}`),
    apiGet<TrendData>(`/equipment/${id}/trend`),
  ]);
  if (!equipment) {
    return (
      <main>
        <TopBar me={me} />
        <h1>找不到这台设备</h1>
      </main>
    );
  }

  return (
    <main>
      <TopBar me={me} />
      <h1>{equipment.name}</h1>
      <p className="lead">
        {equipment.location ?? "没写位置"} · <span className={`pill ${equipment.status === "ok" ? "ok" : "due"}`}>{STATUS[equipment.status]}</span>
      </p>

      {trend && trend.points.length > 0 ? (
        <div className="card">
          <div className="name">最近 30 天的 {trend.columnLabel}</div>
          <p className="sub" style={{ marginTop: 0 }}>
            冰箱不是突然坏的，温度会先缓慢爬几周。纸质表一天一行翻不出这个。
          </p>
          <Trend points={trend.points} limit={trend.limit} unit={trend.unit} />
        </div>
      ) : (
        <div className="card">
          <p className="empty">这台设备还没有关联到某个测量点，或者还没有读数。</p>
        </div>
      )}

      <h2>维修记录</h2>
      {equipment.workOrders.length === 0 ? (
        <div className="card">
          <p className="empty">没有维修单。</p>
        </div>
      ) : (
        equipment.workOrders.map((order) => (
          <div className="card tight" key={order.id}>
            <div className="name">{order.note}</div>
            <div className="sub">
              {new Date(order.openedAt).toLocaleDateString("zh-CN")} · {order.openedBy.name} 开的 ·{" "}
              {order.completedAt
                ? `已完成：${order.result}（${order.completedBy?.name}）`
                : "还没完成"}
            </div>
          </div>
        ))
      )}

      <Link href="/equipment">回设备台账</Link>
    </main>
  );
}
