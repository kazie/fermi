# One container: the Node server serves the built client, the websocket and the admin API.
# SQLite (and FerMEANie's voice clips, if on) live on the /data volume.
# uv runs FerMEANie's voice worker; a FROM line, so Dependabot keeps the version current
FROM ghcr.io/astral-sh/uv:0.13.5 AS uv

FROM node:26-slim AS base
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
COPY content/fermeanie content/fermeanie
RUN pnpm --filter @fermi/client build

FROM base AS runtime
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0 FERMI_DB=/data/fermi.db
# FerMEANie's voice (on with FERMI_VOICE=1; see content/VOICE.md): ffmpeg, uv, and the Python worker with exactly the
# packages in its uv.lock and the model voice.json names (checksummed), baked in so it starts offline. Clips go to
# /data/voice.
ENV FERMI_VOICE_MODELS=/opt/voice/models UV_CACHE_DIR=/opt/voice/uv-cache UV_PYTHON_INSTALL_DIR=/opt/voice/python \
  UV_PROJECT_ENVIRONMENT=/opt/voice/venv
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=uv /uv /usr/local/bin/uv
COPY apps/server/voice/pyproject.toml apps/server/voice/uv.lock apps/server/voice/.python-version apps/server/voice/
RUN uv sync --project apps/server/voice --frozen && uv cache clean
COPY apps/server/voice/worker.py apps/server/voice/
COPY content/voice content/voice
RUN uv run --project apps/server/voice --frozen python apps/server/voice/worker.py \
    --config content/voice/voice.json --models "$FERMI_VOICE_MODELS" --warm \
  && chown -R node:node /opt/voice
ENV UV_OFFLINE=1
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
