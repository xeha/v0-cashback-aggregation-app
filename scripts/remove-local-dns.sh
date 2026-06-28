#!/usr/bin/env bash
# Удаляет временные записи cashbackbrain из /etc/hosts.
# Запуск: sudo ./scripts/remove-local-dns.sh
set -euo pipefail

HOSTS_FILE="/etc/hosts"
MARKER="# cashbackbrain-local-dns"

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Запустите с sudo: sudo $0" >&2
  exit 1
fi

if ! grep -q "$MARKER" "$HOSTS_FILE"; then
  echo "Записей $MARKER в $HOSTS_FILE нет."
  exit 0
fi

tmp="$(mktemp)"
awk -v marker="$MARKER" '
  $0 == marker { skip=1; next }
  skip && /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+ .*cashbackbrain\.ru/ { next }
  skip && /^$/ { skip=0; next }
  skip && !/cashbackbrain\.ru/ { skip=0 }
  { print }
' "$HOSTS_FILE" >"$tmp"
mv "$tmp" "$HOSTS_FILE"
echo "Записи cashbackbrain удалены из $HOSTS_FILE."
