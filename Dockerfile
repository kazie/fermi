# One container: the Node server serves the built client, the websocket and the admin API.
# SQLite lives on the /data volume.
FROM node:24-slim AS base
RUN npm install -g pnpm@12.8.1 && npm cache clean --force
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/client/package.json apps/client/
RUN pnpm install --frozen-lockfile
COPY packages packages
COPY apps apps
# the name screen's welcome lines are bundled into the client
COPY content/fermeanie-lines.json content/
RUN pnpm --filter @fermi/client build

FROM base AS runtime
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0 FERMI_DB=/data/fermi.db
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/client/package.json apps/client/
RUN pnpm install --frozen-lockfile --prod --filter "@fermi/server..."
COPY packages/shared/src packages/shared/src
COPY apps/server/src apps/server/src
COPY content content
COPY scripts scripts
COPY --from=build /app/apps/client/dist apps/client/dist
RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/server/src/index.ts"]
