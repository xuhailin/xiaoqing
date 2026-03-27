FROM node:22-bookworm-slim AS builder

WORKDIR /app/frontend

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.d/40-xiaoqing-config.sh /docker-entrypoint.d/40-xiaoqing-config.sh
RUN chmod +x /docker-entrypoint.d/40-xiaoqing-config.sh
COPY --from=builder /app/frontend/dist/frontend/browser/ /usr/share/nginx/html/

EXPOSE 80
