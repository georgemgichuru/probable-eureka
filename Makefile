# Convenience wrappers around docker compose. Run `make help` for the list.
.DEFAULT_GOAL := help
COMPOSE := docker compose
COMPOSE_PROD := docker compose -f docker-compose.prod.yml

.PHONY: help up down build logs migrate makemigrations superuser shell test lint fmt prod-up prod-down

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

up: ## Start the dev stack (build if needed)
	$(COMPOSE) up --build

down: ## Stop the dev stack
	$(COMPOSE) down

build: ## Build all images
	$(COMPOSE) build

logs: ## Tail logs
	$(COMPOSE) logs -f

migrate: ## Apply DB migrations
	$(COMPOSE) exec backend python manage.py migrate

makemigrations: ## Create new migrations
	$(COMPOSE) exec backend python manage.py makemigrations

superuser: ## Create a Django superuser
	$(COMPOSE) exec backend python manage.py createsuperuser

shell: ## Open a Django shell
	$(COMPOSE) exec backend python manage.py shell

test: ## Run backend tests
	$(COMPOSE) exec backend pytest

lint: ## Run backend linters
	$(COMPOSE) exec backend sh -c "ruff check . && black --check ."

fmt: ## Auto-format backend code
	$(COMPOSE) exec backend sh -c "ruff check --fix . && black ."

prod-up: ## Start the production-like stack (detached)
	$(COMPOSE_PROD) up --build -d

prod-down: ## Stop the production-like stack
	$(COMPOSE_PROD) down
