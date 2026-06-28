#!/usr/bin/env bash
# Временный обход DNS: подставляет поддомены cashbackbrain.ru на сервер Dockploy.
# Запуск: sudo ./scripts/setup-local-dns.sh
set -euo pipefail

HOSTS_FILE="/etc/hosts"
MARKER="# cashbackbrain-local-dns"
IP="72.56.237.97"

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Запустите с sudo: sudo $0" >&2
  exit 1
fi

if grep -q "$MARKER" "$HOSTS_FILE"; then
  echo "Записи уже есть в $HOSTS_FILE:"
  grep -A4 "$MARKER" "$HOSTS_FILE"
  exit 0
fi

cat >>"$HOSTS_FILE" <<EOF

$MARKER
$IP pb.cashbackbrain.ru
$IP dokploy.cashbackbrain.ru
$IP api.cashbackbrain.ru
EOF

echo "Добавлено в $HOSTS_FILE:"
grep -A4 "$MARKER" "$HOSTS_FILE"
echo
echo "Проверка PocketBase:"
curl -sk --max-time 15 "https://pb.cashbackbrain.ru/api/health" || true
echo
echo "Откройте в браузере: https://pb.cashbackbrain.ru/_/"
echo "Удалить позже: sudo ./scripts/remove-local-dns.sh"
