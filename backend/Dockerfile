FROM node:22-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

FROM base AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci
COPY prisma.config.ts tsconfig*.json nest-cli.json ./
COPY prisma ./prisma
RUN npx prisma generate
COPY src ./src
RUN npm run build

FROM builder AS migration
CMD ["npx", "prisma", "migrate", "deploy"]

FROM base AS production-dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --omit=optional --omit=peer && npm cache clean --force

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
USER node
COPY --chown=node:node --from=production-dependencies /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/generated ./generated
COPY --chown=node:node package.json ./package.json
EXPOSE 3000
CMD ["node", "dist/src/main.js"]
