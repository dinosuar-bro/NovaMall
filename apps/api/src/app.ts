import express, { type Express } from "express";
import session from "express-session";

import { errorHandler } from "./errors/error-handler.js";
import { requestContext } from "./middleware/request-context.js";
import { createAuthRouter } from "./modules/auth/auth.routes.js";
import type { AuthRepository } from "./modules/auth/auth.repository.js";
import { createCatalogRouter } from "./modules/catalog/catalog.routes.js";
import type { CatalogRepository } from "./modules/catalog/catalog.repository.js";
import { createHealthRouter } from "./modules/health/health.routes.js";
import type { HealthRepository } from "./modules/health/health.repository.js";
import { createMerchantApplicationsRouter } from "./modules/merchant-applications/merchant-applications.routes.js";
import type { MerchantApplicationsRepository } from "./modules/merchant-applications/merchant-applications.repository.js";
import { createOverviewRouter } from "./modules/overview/overview.routes.js";
import type { MysqlSessionStore } from "./db/session-store.js";

export interface AppDependencies {
  healthRepository: HealthRepository;
  authRepository?: AuthRepository;
  merchantApplicationsRepository?: MerchantApplicationsRepository;
  catalogRepository?: CatalogRepository;
  sessionStore?: MysqlSessionStore;
  sessionSecret?: string;
}

export function createApp(dependencies: AppDependencies): Express {
  const app = express();

  app.use(express.json());
  app.use(requestContext);
  if (
    dependencies.authRepository !== undefined
    && dependencies.sessionStore !== undefined
    && dependencies.sessionSecret !== undefined
  ) {
    app.use(session({
      name: "novamall.sid",
      secret: dependencies.sessionSecret,
      store: dependencies.sessionStore,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: false
      }
    }));
    app.use("/api/v1/auth", createAuthRouter(dependencies.authRepository));
    app.use("/api/v1", createOverviewRouter(dependencies.authRepository));
    if (dependencies.merchantApplicationsRepository !== undefined) {
      app.use(
        "/api/v1",
        createMerchantApplicationsRouter(
          dependencies.authRepository,
          dependencies.merchantApplicationsRepository
        )
      );
    }
    if (dependencies.catalogRepository !== undefined) {
      app.use(
        "/api/v1",
        createCatalogRouter(dependencies.authRepository, dependencies.catalogRepository)
      );
    }
  }
  app.use("/uploads", express.static("uploads"));
  app.use("/api/v1/health", createHealthRouter(dependencies.healthRepository));
  app.use(errorHandler);

  return app;
}
