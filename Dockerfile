FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_BACKEND_URL=https://api.cashbackbrain.ru
ARG NEXT_PUBLIC_POCKETBASE_URL=https://pb.cashbackbrain.ru
ARG NEXT_PUBLIC_ASSETS_URL=https://1mh89t7nqb.cdn.twcstorage.ru
ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL
ENV NEXT_PUBLIC_POCKETBASE_URL=$NEXT_PUBLIC_POCKETBASE_URL
ENV NEXT_PUBLIC_ASSETS_URL=$NEXT_PUBLIC_ASSETS_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
