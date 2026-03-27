# Docker 服务器部署

这套部署面向单台 Linux 服务器，约定：

- 前端访问地址：`http://服务器IP/`
- 后端 API 地址：`http://服务器IP:3000`
- 数据库由 Docker Compose 内置 PostgreSQL 提供

## 1. 准备环境文件

```bash
cp .env.docker.example .env.docker
```

至少要改这些项：

- `POSTGRES_PASSWORD`
- `CORS_ORIGIN=http://你的服务器IP`
- `LLM_API_KEY`
- `ARK_API_KEY` 或 `SEEDDANCE_API_KEY`（如果要用 Seedance）

`XQ_API_URL` 可以留空。留空时前端会自动请求当前机器的 `3000` 端口。
如果服务器的 `80` 端口已经被占用，把 `FRONTEND_PORT` 改成别的值，比如 `8080`。

## 2. 首次启动

```bash
docker compose --env-file .env.docker up -d --build
```

查看状态：

```bash
docker compose ps
docker compose logs -f backend
docker compose logs -f frontend
```

## 3. 更新代码后重新发布

```bash
git pull
docker compose --env-file .env.docker up -d --build
```

## 4. 常用排障

后端健康检查：

```bash
curl http://127.0.0.1:3000/health
```

前端首页：

```bash
curl http://127.0.0.1/
```

Seedance 配置接口：

```bash
curl http://127.0.0.1:3000/seeddance/config
```

## 5. 停止与重启

停止：

```bash
docker compose down
```

停止但保留数据卷是默认行为；PostgreSQL 数据和后端持久化目录不会因为普通 `down` 丢失。

重启：

```bash
docker compose restart
```

## 6. 备份建议

- PostgreSQL：定期导出数据库或备份 `postgres_data` volume
- 后端卷：按需备份 `backend_dev_runs`、`backend_books`、`backend_checkin_debug`
