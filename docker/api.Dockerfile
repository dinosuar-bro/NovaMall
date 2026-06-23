FROM node:24-alpine

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json eslint.config.mjs ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile

COPY apps/api apps/api
COPY packages/shared packages/shared
COPY database database

EXPOSE 3000
CMD ["pnpm", "--filter", "@novamall/api", "start"]
