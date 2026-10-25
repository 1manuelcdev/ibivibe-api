#!/usr/bin/env bash

set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR" || exit 1

if ! command -v docker >/dev/null 2>&1; then
	printf '\033[31m[ERRO] Docker não foi encontrado. Instale e inicie o Docker.\033[0m\n' >&2
	exit 1
fi

if [[ ! -f .env ]]; then
	printf '\033[31m[ERRO] Arquivo .env não encontrado. Configure as variáveis da API antes de subir o container.\033[0m\n' >&2
	exit 1
fi

if ! docker compose up -d --build; then
	printf '\033[31m[ERRO] Não foi possível subir a API com Docker Compose.\033[0m\n' >&2
	exit 1
fi

if ! docker compose ps --status running --services | grep -qx api; then
	printf '\033[31m[ERRO] O container da API não permaneceu em execução. Consulte os logs com: docker compose logs api\033[0m\n' >&2
	exit 1
fi

printf '\033[32m[SUCESSO] API executando em http://localhost:3000\033[0m\n'

if bash scripts/ngrok-up.sh; then
	exit 0
else
	printf '\033[31m[ERRO] A API está ativa, mas o ngrok não iniciou.\033[0m\n' >&2
	exit 1
fi
