import { Navigate, NavLink, Route, Routes } from "react-router-dom";

import { LoginPage } from "../pages/login-page.js";
import { RegisterPage } from "../pages/register-page.js";
import { RolePage } from "../pages/role-page.js";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/member" element={<RolePage role="MEMBER" />} />
      <Route path="/owner" element={<RolePage role="OWNER" />} />
      <Route path="/admin" element={<RolePage role="ADMIN" />} />
    </Routes>
  );
}

export function RoleNav() {
  return (
    <nav aria-label="角色导航">
      <NavLink to="/member">会员首页</NavLink>
      <NavLink to="/owner">店主后台</NavLink>
      <NavLink to="/admin">管理员后台</NavLink>
    </nav>
  );
}
