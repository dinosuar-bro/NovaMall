import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import type { AuthSessionData, RoleCode } from "@novamall/shared";

import { getCurrentSession, logout } from "../api/client.js";
import { LoginPage } from "../pages/login-page.js";
import { RegisterPage } from "../pages/register-page.js";
import { ProfilePage } from "../pages/profile-page.js";
import {
  AdminCategoryPanel,
  AdminDatabaseEvidencePanel,
  AdminMerchantApplicationsPanel,
  MemberCartOrdersPanel,
  MemberCatalogPanel,
  MemberMerchantApplicationPanel,
  OwnerOrdersPanel,
  OwnerProductPanel,
  OwnerShopPanel
} from "../pages/role-page.js";
import { BrandMark } from "../ui/brand-mark.js";

type SessionState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "authenticated"; session: AuthSessionData };

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/member" element={<ProtectedRedirect role="MEMBER" to="/member/catalog" />} />
      <Route path="/member/catalog" element={<ProtectedPage role="MEMBER" title="商品目录"><MemberCatalogPanel /></ProtectedPage>} />
      <Route path="/member/cart" element={<ProtectedPage role="MEMBER" title="购物车"><MemberCartOrdersPanel view="cart" /></ProtectedPage>} />
      <Route path="/member/orders" element={<ProtectedPage role="MEMBER" title="订单列表"><MemberCartOrdersPanel view="orders" /></ProtectedPage>} />
      <Route path="/member/applications" element={<ProtectedPage role="MEMBER" title="开店申请"><MemberMerchantApplicationPanel /></ProtectedPage>} />
      <Route path="/owner" element={<ProtectedRedirect role="OWNER" to="/owner/products" />} />
      <Route path="/owner/shop" element={<ProtectedPage role="OWNER" title="店铺资料"><OwnerShopPanel /></ProtectedPage>} />
      <Route path="/owner/products" element={<ProtectedPage role="OWNER" title="商品管理"><OwnerProductPanel /></ProtectedPage>} />
      <Route path="/owner/orders" element={<ProtectedPage role="OWNER" title="订单履约"><OwnerOrdersPanel /></ProtectedPage>} />
      <Route path="/admin" element={<ProtectedRedirect role="ADMIN" to="/admin/categories" />} />
      <Route path="/admin/categories" element={<ProtectedPage role="ADMIN" title="分类管理"><AdminCategoryPanel /></ProtectedPage>} />
      <Route path="/admin/applications" element={<ProtectedPage role="ADMIN" title="开店审核"><AdminMerchantApplicationsPanel /></ProtectedPage>} />
      <Route path="/admin/database" element={<ProtectedPage role="ADMIN" title="数据库证据"><AdminDatabaseEvidencePanel /></ProtectedPage>} />
      <Route path="/profile" element={<ProtectedProfilePage />} />
    </Routes>
  );
}

function HomeRedirect() {
  const sessionState = useSessionState();
  if (sessionState.status === "loading") {
    return <main className="route-status">正在确认登录状态…</main>;
  }
  if (sessionState.status === "anonymous") {
    return <Navigate to="/login" replace />;
  }
  return <Navigate to={defaultRoute(sessionState.session.user.roles)} replace />;
}

function ProtectedRedirect({ role, to }: { role: RoleCode; to: string }) {
  const sessionState = useSessionState();
  if (sessionState.status === "loading") {
    return <main className="route-status">正在确认登录状态…</main>;
  }
  if (sessionState.status === "anonymous") {
    return <Navigate to="/login" replace />;
  }
  if (!sessionState.session.user.roles.includes(role)) {
    return <Navigate to={defaultRoute(sessionState.session.user.roles)} replace />;
  }
  return <Navigate to={to} replace />;
}

function ProtectedPage({ role, title, children }: { role: RoleCode; title: string; children: ReactNode }) {
  const sessionState = useSessionState();
  if (sessionState.status === "loading") {
    return <main className="route-status">正在确认登录状态…</main>;
  }
  if (sessionState.status === "anonymous") {
    return <Navigate to="/login" replace />;
  }
  if (!sessionState.session.user.roles.includes(role)) {
    return <Navigate to={defaultRoute(sessionState.session.user.roles)} replace />;
  }
  return <AppShell session={sessionState.session} title={title}>{children}</AppShell>;
}

function ProtectedProfilePage() {
  const sessionState = useSessionState();
  if (sessionState.status === "loading") {
    return <main className="route-status">正在确认登录状态…</main>;
  }
  if (sessionState.status === "anonymous") {
    return <Navigate to="/login" replace />;
  }
  return (
    <AppShell session={sessionState.session} title="个人主页">
      <ProfilePage csrfToken={sessionState.session.csrfToken} />
    </AppShell>
  );
}

function useSessionState(): SessionState {
  const [sessionState, setSessionState] = useState<SessionState>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    void getCurrentSession()
      .then((session) => {
        if (alive) {
          setSessionState({ status: "authenticated", session });
        }
      })
      .catch(() => {
        if (alive) {
          setSessionState({ status: "anonymous" });
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  return sessionState;
}

function defaultRoute(roles: RoleCode[]): string {
  if (roles.includes("ADMIN")) {
    return "/admin/categories";
  }
  if (roles.includes("OWNER")) {
    return "/owner/products";
  }
  return "/member/catalog";
}

export function RoleNav({ role }: { role: RoleCode }) {
  return (
    <nav aria-label="角色导航">
      {role === "MEMBER" ? (
        <>
          <NavLink to="/member/catalog">商品目录</NavLink>
          <NavLink to="/member/cart">购物车</NavLink>
          <NavLink to="/member/orders">订单列表</NavLink>
        </>
      ) : null}
      {role === "OWNER" ? (
        <>
          <NavLink to="/owner/products">商品管理</NavLink>
          <NavLink to="/owner/orders">订单履约</NavLink>
        </>
      ) : null}
      {role === "ADMIN" ? (
        <>
          <NavLink to="/admin/categories">分类管理</NavLink>
          <NavLink to="/admin/applications">开店审核</NavLink>
          <NavLink to="/admin/database">数据库证据</NavLink>
        </>
      ) : null}
    </nav>
  );
}

function AppShell({ session, title, children }: { session: AuthSessionData; title: string; children: ReactNode }) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const primaryRole = useMemo(() => primaryRoleFor(session.user.roles), [session.user.roles]);

  async function handleLogout(): Promise<void> {
    await logout(session.csrfToken);
    void navigate("/login", { replace: true });
  }

  return (
    <main className="app-frame">
      <aside className="side-nav">
        <BrandMark />
        <RoleNav role={primaryRole} />
      </aside>
      <section className="workspace" aria-labelledby="workspace-title">
        <header className="top-bar">
          <div>
            <p>{primaryRole}</p>
            <h1 id="workspace-title">{title}</h1>
          </div>
          <div className="profile-menu">
            <button
              className="avatar-button"
              type="button"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              onClick={() => { setMenuOpen((current) => !current); }}
            >
              <img src="/default-avatar.svg" alt="" />
              <span>{session.user.displayName}</span>
            </button>
            {menuOpen ? (
              <div className="profile-menu__panel" role="menu">
                <NavLink role="menuitem" to="/profile">个人主页</NavLink>
                {primaryRole === "MEMBER" ? <NavLink role="menuitem" to="/member/applications">申请开店</NavLink> : null}
                <button role="menuitem" type="button" onClick={() => { void handleLogout(); }}>退出登录</button>
              </div>
            ) : null}
          </div>
        </header>
        {children}
      </section>
    </main>
  );
}

function primaryRoleFor(roles: RoleCode[]): RoleCode {
  if (roles.includes("ADMIN")) {
    return "ADMIN";
  }
  if (roles.includes("OWNER")) {
    return "OWNER";
  }
  return "MEMBER";
}
