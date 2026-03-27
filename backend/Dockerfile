FROM node:22-bookworm-slim

WORKDIR /app/backend

ENV NINJA_ENV=production
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package*.json ./
RUN npm ci --include=dev

COPY . .

RUN npx prisma generate && npm run build

ENV NODE_ENV=production

EXPOSE 3000

CMD ["sh", "-lc", "npx prisma db push && node dist/src/main.js"]
