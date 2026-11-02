.PHONY: dev backend frontend build smoke

# 同时启动后端（:8080）与前端开发服务器（:5173，/api 代理到后端）
dev:
	@trap 'kill 0' INT TERM; $(MAKE) -s backend & $(MAKE) -s frontend & wait

backend:
	cd backend && cargo run

frontend:
	cd frontend && bun install && bun dev

# 生产构建：后端托管 frontend/dist，单进程即可对外服务
build:
	cd frontend && bun install && bun run build
	cd backend && cargo build --release

smoke:
	./scripts/smoke.sh
