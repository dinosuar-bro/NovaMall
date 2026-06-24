import { useEffect, useState } from "react";
import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import type { AuthSessionData, RoleCode } from "@novamall/shared";

import { getCurrentSession } from "../api/client.js";
import { LoginPage } from "../pages/login-page.js";
import { RegisterPage } from "../pages/register-page.js";
import { RolePage } from "../pages/role-page.js";

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
      <Route path="/member" element={<ProtectedRoleRoute role="MEMBER" />} />
      <Route path="/owner" element={<ProtectedRoleRoute role="OWNER" />} />
      <Route path="/admin" element={<ProtectedRoleRoute role="ADMIN" />} />
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

function ProtectedRoleRoute({ role }: { role: RoleCode }) {
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
  return <RolePage role={role} />;
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
    return "/admin";
  }
  if (roles.includes("OWNER")) {
    return "/owner";
  }
  return "/member";
}

export function RoleNav({ role }: { role: RoleCode }) {
  return (
    <nav aria-label="角色导航">
      {role === "MEMBER" ? <NavLink to="/member">会员首页</NavLink> : null}
      {role === "OWNER" ? <NavLink to="/owner">店主后台</NavLink> : null}
      {role === "ADMIN" ? <NavLink to="/admin">管理员后台</NavLink> : null}
    </nav>
  );
}
