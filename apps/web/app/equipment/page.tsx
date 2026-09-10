import Link from "next/link";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/top-bar";
import { apiGet, type Me } from "@/lib/api";

type Equipment = {
  id: string;
  name: string;
  location: string | null;
  status: "ok" | "needs_repair" | "out_of_service";
  workOrders: { id: string }[];
};

const STATUS: Record<string, string> = { ok: "正常", needs_repair: "待修", out_of_service: "停用" };

export default async function EquipmentPage() {
  const me = await apiGet<Me>("/auth/me");
  if (!me) redirect("/login");
  const list = await apiGet<Equipment[]>("/equipment");

  return (
    <main>
      <TopBar me={me} />
      <h1>设备台账</h1>
      <p className="lead">把「冷藏柜 2」从表里的一列变成一台机器。温度趋势和维修单都挂在它下面。</p>
      {!list || list.length === 0 ? (
        <div className="card">
          <p className="empty">还没有登记设备。</p>
        </div>
      ) : (
        list.map((item) => (
          <div className="card tight" key={item.id}>
            <div className="row">
              <div className="grow">
                <span className="name">{item.name}</span>{" "}
                <span className="sub">{item.location ?? "没写位置"}</span>{" "}
                <span className={`pill ${item.status === "ok" ? "ok" : "due"}`}>{STATUS[item.status]}</span>
                {item.workOrders.length > 0 ? (
                  <span className="sub"> · {item.workOrders.length} 张维修单没完成</span>
                ) : null}
              </div>
              <Link className="button" href={`/equipment/${item.id}`}>
                打开
              </Link>
            </div>
          </div>
        ))
      )}
    </main>
  );
}
