import { BrandMark } from "../ui/brand-mark.js";
import { RoleNav } from "../app/app.js";

type RoleCode = "MEMBER" | "OWNER" | "ADMIN";

const roleCopy: Record<RoleCode, { title: string; body: string }> = {
  MEMBER: { title: "会员首页壳已就绪", body: "商品浏览、购物车和订单将在后续阶段接入。当前页面用于验证会员登录与权限边界。" },
  OWNER: { title: "店主后台壳已就绪", body: "店铺、商品、库存和履约功能将在 Stage 2 后开放。当前页面用于验证 OWNER 权限。" },
  ADMIN: { title: "管理员后台壳已就绪", body: "分类、审核、账号和审计管理将在后续阶段开放。当前页面用于验证 ADMIN 权限。" }
};

interface RolePageProps {
  role: RoleCode;
}

export function RolePage({ role }: RolePageProps) {
  return (
    <main className="app-frame">
      <aside className="side-nav">
        <BrandMark />
        <RoleNav />
      </aside>
      <section className="workspace" aria-labelledby="role-title">
        <div className="empty-state">
          <p>{role}</p>
          <h1 id="role-title">{roleCopy[role].title}</h1>
          <p>{roleCopy[role].body}</p>
        </div>
      </section>
    </main>
  );
}
