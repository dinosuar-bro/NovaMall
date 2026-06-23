import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.js";
import type { AuthRepository } from "../auth/auth.repository.js";

export function createOverviewRouter(repository: AuthRepository): Router {
  const router = Router();

  router.get("/member/overview", requireAuth(repository), requireRole("MEMBER"), (_request, response) => {
    response.json({ success: true, data: { role: "MEMBER", stage: "阶段 1 会员壳已就绪" } });
  });
  router.get("/owner/overview", requireAuth(repository), requireRole("OWNER"), (_request, response) => {
    response.json({ success: true, data: { role: "OWNER", stage: "阶段 1 店主壳已就绪" } });
  });
  router.get("/admin/overview", requireAuth(repository), requireRole("ADMIN"), (_request, response) => {
    response.json({ success: true, data: { role: "ADMIN", stage: "阶段 1 管理员壳已就绪" } });
  });

  return router;
}
