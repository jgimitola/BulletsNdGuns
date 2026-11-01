# syntax=docker/dockerfile:1
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages ./packages
RUN npm ci
RUN npm run build -w @bng/client

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/
COPY packages/client/package.json ./packages/client/
RUN npm ci --omit=dev
COPY packages/shared/src ./packages/shared/src
COPY packages/server/src ./packages/server/src
COPY --from=build /app/packages/client/dist ./packages/client/dist
EXPOSE 3000
CMD ["node", "packages/server/src/index.ts"]
