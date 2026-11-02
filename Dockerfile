# syntax=docker/dockerfile:1
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# The workspace tsconfigs extend it, and Vite reads the client's tsconfig while transforming.
COPY tsconfig.base.json ./
COPY packages ./packages
RUN npm ci
RUN npm run build -w @bng/client

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY package.json package-lock.json ./
# Every workspace manifest must be present for `npm ci` to accept the lockfile; only the server's
# production dependencies are installed (plus the @bng/shared workspace link it depends on).
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/
COPY packages/client/package.json ./packages/client/
RUN npm ci --omit=dev -w @bng/server && npm cache clean --force
COPY packages/shared/src ./packages/shared/src
COPY packages/server/src ./packages/server/src
COPY --from=build /app/packages/client/dist ./packages/client/dist
USER node
EXPOSE 3000
CMD ["node", "packages/server/src/index.ts"]
