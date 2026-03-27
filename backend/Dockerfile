FROM node:22-bookworm-slim

WORKDIR /app/backend

ENV NODE_ENV=production
ENV NINJA_ENV=production
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["sh", "-lc", "npx prisma db push && node dist/src/main.js"]
