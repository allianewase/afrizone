# Afrizone server — production image. Always targets Postgres (see
# prisma/use-postgres.js); SQLite is the local zero-install dev default only.

FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Bake the schema's active datasource to postgresql for the image build —
# generating the client against the wrong provider would break at runtime.
RUN node prisma/use-postgres.js
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 4000
# Applies any pending migrations before starting. Safe to run on every
# container start / across multiple replicas — `migrate deploy` only applies
# unapplied migrations and takes an advisory lock while doing so.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
