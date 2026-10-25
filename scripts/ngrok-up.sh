#!/usr/bin/env bash

set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR" || exit 1

if ! command -v ngrok >/dev/null 2>&1; then
	printf '\033[31m[ERRO] ngrok não foi encontrado. Instale-o para abrir o túnel público.\033[0m\n' >&2
	exit 1
fi

if [[ -f .ngrok.pid ]] && kill -0 "$(cat .ngrok.pid)" 2>/dev/null; then
	printf '\033[33m[INFO] O túnel ngrok já está em execução.\033[0m\n'
	exit 0
fi

rm -f .ngrok.pid
nohup ngrok http 3000 --log=stdout >.ngrok.log 2>&1 </dev/null &
NGROK_PID=$!
printf '%s\n' "$NGROK_PID" >.ngrok.pid

for _ in {1..30}; do
	PUBLIC_URL="$(curl --silent --fail http://127.0.0.1:4040/api/tunnels 2>/dev/null | grep -o 'https://[^\"]*' | head -n 1 || true)"
	if [[ -n "$PUBLIC_URL" ]]; then
		printf '\033[32m[SUCESSO] ngrok ativo: %s\033[0m\n' "$PUBLIC_URL"
		exit 0
	fi
	if ! kill -0 "$NGROK_PID" 2>/dev/null; then
		break
	fi
	sleep 1
done

kill "$NGROK_PID" 2>/dev/null || true
wait "$NGROK_PID" 2>/dev/null || true
rm -f .ngrok.pid
printf '\033[31m[ERRO] Não foi possível iniciar o túnel ngrok. Consulte .ngrok.log.\033[0m\n' >&2
exit 1
