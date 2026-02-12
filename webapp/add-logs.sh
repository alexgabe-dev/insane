#!/usr/bin/env bash
set -euo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:8787}"

usage() {
  cat <<'EOF'
Használat:
  ./add-logs.sh single <viewer_url>
  ./add-logs.sh bulk <file_path>
  ./add-logs.sh state
  ./add-logs.sh clear

Példák:
  ./add-logs.sh single "https://turtlogs.com/viewer/87601/base?history_state=1"
  ./add-logs.sh bulk ./logs.txt
  ./add-logs.sh state
  ./add-logs.sh clear

Megjegyzés:
  - A bulk fájlban soronként 1 URL legyen.
  - API_BASE env változóval átírhatod a cél hostot.
    pl: API_BASE="https://insane.hu" ./add-logs.sh state
EOF
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Hiba: hiányzó parancs: $1" >&2
    exit 1
  }
}

post_json() {
  local endpoint="$1"
  local payload="$2"
  curl -fsS -X POST "${API_BASE}${endpoint}" \
    -H "Content-Type: application/json" \
    -d "${payload}"
  echo
}

delete_call() {
  local endpoint="$1"
  curl -fsS -X DELETE "${API_BASE}${endpoint}"
  echo
}

get_call() {
  local endpoint="$1"
  curl -fsS "${API_BASE}${endpoint}"
  echo
}

single() {
  local url="${1:-}"
  if [[ -z "${url}" ]]; then
    echo "Hiba: add meg a viewer URL-t." >&2
    usage
    exit 1
  fi

  require_cmd jq
  local payload
  payload="$(jq -nc --arg u "${url}" '{url:$u}')"
  post_json "/api/logs" "${payload}"
}

bulk() {
  local file="${1:-}"
  if [[ -z "${file}" ]]; then
    echo "Hiba: add meg a bulk fájl útvonalát." >&2
    usage
    exit 1
  fi
  if [[ ! -f "${file}" ]]; then
    echo "Hiba: a fájl nem található: ${file}" >&2
    exit 1
  fi

  require_cmd jq
  local payload
  payload="$(jq -Rs '{urls: .}' "${file}")"
  post_json "/api/logs/bulk" "${payload}"
}

state() {
  get_call "/api/state"
}

clear_db() {
  delete_call "/api/db"
}

main() {
  local cmd="${1:-}"
  case "${cmd}" in
    single)
      shift
      single "${1:-}"
      ;;
    bulk)
      shift
      bulk "${1:-}"
      ;;
    state)
      state
      ;;
    clear)
      clear_db
      ;;
    -h|--help|help|"")
      usage
      ;;
    *)
      echo "Hiba: ismeretlen parancs: ${cmd}" >&2
      usage
      exit 1
      ;;
  esac
}

main "$@"
