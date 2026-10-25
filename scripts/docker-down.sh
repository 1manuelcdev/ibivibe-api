#!/usr/bin/env bash

set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR" || exit 1

if ! command -v docker >/dev/null 2>&1; then
	printf '\033[31m[ERRO] Docker não foi encontrado.\033[0m\n' >&2
	exit 1
fi

NGROK_STATUS=0
if bash scripts/ngrok-down.sh; then
	:
else
	NGROK_STATUS=1
	printf '\033[31m[ERRO] Falha ao encerrar o ngrok.\033[0m\n' >&2
fi

DOCKER_STATUS=0
if docker compose down; then
	printf '\033[32m[SUCESSO] API parada e recursos do Compose removidos.\033[0m\n'
else
	printf '\033[31m[ERRO] Não foi possível parar a API com Docker Compose.\033[0m\n' >&2
	DOCKER_STATUS=1
fi

if (( NGROK_STATUS != 0 || DOCKER_STATUS != 0 )); then
	exit 1
fi
