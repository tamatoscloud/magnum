FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends qpdf openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.34.7 --activate

COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm exec prisma generate && pnpm build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["pnpm", "start"]
