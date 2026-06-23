import type { RequestHandler } from "express";

import { generateCsrfToken } from "../../middleware/csrf.js";
import { destroySession, regenerateSession, saveSession } from "./session.js";
import type { AuthService } from "./auth.service.js";

export class AuthController {
  constructor(private readonly service: AuthService) {}

  csrf: RequestHandler = async (request, response, next) => {
    try {
      const csrfToken = generateCsrfToken();
      request.session.csrfToken = csrfToken;
      await saveSession(request);
      response.json({ success: true, data: { csrfToken } });
    } catch (error) {
      next(error);
    }
  };

  register: RequestHandler = async (request, response, next) => {
    try {
      const user = await this.service.register(request.body);
      const csrfToken = generateCsrfToken();
      await regenerateSession(request);
      request.session.userId = user.id;
      request.session.csrfToken = csrfToken;
      await saveSession(request);
      response.status(201).json({ success: true, data: this.service.sessionData(user, csrfToken) });
    } catch (error) {
      next(error);
    }
  };

  login: RequestHandler = async (request, response, next) => {
    try {
      const user = await this.service.login(request.body);
      const csrfToken = generateCsrfToken();
      await regenerateSession(request);
      request.session.userId = user.id;
      request.session.csrfToken = csrfToken;
      await saveSession(request);
      response.json({ success: true, data: this.service.sessionData(user, csrfToken) });
    } catch (error) {
      next(error);
    }
  };

  currentSession: RequestHandler = (request, response) => {
    const user = request.currentUser;
    const csrfToken = request.session.csrfToken;
    if (user === undefined || csrfToken === undefined) {
      response.status(401).json({
        success: false,
        error: { code: "AUTH_REQUIRED", message: "请先登录", requestId: request.requestId }
      });
      return;
    }
    response.json({ success: true, data: this.service.sessionData(user, csrfToken) });
  };

  logout: RequestHandler = async (request, response, next) => {
    try {
      await destroySession(request);
      response.json({ success: true, data: { status: "loggedOut" } });
    } catch (error) {
      next(error);
    }
  };
}
