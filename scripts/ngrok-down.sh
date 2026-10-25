#!/usr/bin/env bash

set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR" || exit 1

if [[ ! -f .ngrok.pid ]]; then
	printf '\033[32m[SUCESSO] Não há túnel ngrok iniciado pelos scripts para encerrar.\033[0m\n'
	exit 0
fi

NGROK_PID="$(cat .ngrok.pid)"
if ! [[ "$NGROK_PID" =~ ^[0-9]+$ ]]; then
	printf '\033[31m[ERRO] O arquivo .ngrok.pid é inválido.\033[0m\n' >&2
	exit 1
fi

if kill -0 "$NGROK_PID" 2>/dev/null; then
	NGROK_COMMAND="$(ps -p "$NGROK_PID" -o args= 2>/dev/null || true)"
	if [[ "$NGROK_COMMAND" != *ngrok* || "$NGROK_COMMAND" != *"http 3000"* ]]; then
		printf '\033[31m[ERRO] O PID registrado não pertence ao ngrok; não encerrei o processo.\033[0m\n' >&2
		exit 1
	fi
	if ! kill "$NGROK_PID"; then
		printf '\033[31m[ERRO] Não foi possível encerrar o processo ngrok.\033[0m\n' >&2
		exit 1
	fi
fi

rm -f .ngrok.pid
printf '\033[32m[SUCESSO] Túnel ngrok encerrado.\033[0m\n'
