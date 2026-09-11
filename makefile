start:
	pnpm install
	pnpm run build
	pm2 start pnpm --name hub-community-front -- run start

update:
	git pull
	rm -rf .next
	pnpm install
	pnpm run build
	pm2 restart hub-community-front

dev:
	docker compose -f docker-compose.hub.yml up --build

# Backend + BFF + MySQL only (no frontend) — for API work and deploys of the API layer.
dev-api:
	docker compose -f docker-compose.hub.yml up --build -d hub-db hub-backend eventando-backend hub-bff

dev-logs:
	docker compose -f docker-compose.hub.yml logs -f hub-backend eventando-backend hub-bff

dev-down:
	docker compose -f docker-compose.hub.yml down
