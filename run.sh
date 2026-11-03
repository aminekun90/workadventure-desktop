#!/usr/bin/env bash
# Builds and launches the WorkAdventure desktop client from source (macOS, Linux, Windows via Git Bash).
set -euo pipefail

readonly ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly MIN_NODE="22.21.1"

main() {
  local skip_build=false
  local electron_args=()
  for arg in "$@"; do
    case "$arg" in
      --prod | --beta) electron_args+=("--instance=${arg#--}") ;;
      --skip-build) skip_build=true ;;
      -h | --help) usage && exit 0 ;;
      *) electron_args+=("$arg") ;;
    esac
  done

  banner
  check_node
  check_yarn
  install_dependencies
  ensure_electron_binary
  check_linux_sandbox
  if [[ "$skip_build" == false ]]; then
    step "Compilation"
    yarn --cwd "$ROOT" --silent build
  fi

  step "Lancement"
  # Bash 3.2 (macOS) treats an empty array as unbound under `set -u`: hence the ${a[@]+...} form.
  exec "$ROOT/node_modules/.bin/electron" "$ROOT" ${electron_args[@]+"${electron_args[@]}"}
}

usage() {
  cat <<EOF
Usage : ./run.sh [options]

  (sans option)      ouvre le launcher
  --prod, --beta     rejoint directement l'instance
  --url=<url>        rejoint une URL (ex. http://play.workadventure.localhost/)
  --launcher         affiche le launcher même si « rejoindre directement » est actif
  --skip-build       relance sans recompiler
  -h, --help         affiche cette aide

Logs détaillés : LOG_LEVEL=debug ./run.sh
EOF
}

check_node() {
  command -v node >/dev/null || fail "Node.js >= $MIN_NODE requis : https://nodejs.org"
  node -e '
    const [required, current] = process.argv.slice(1).map((v) => v.replace(/^v/, "").split(".").map(Number));
    const delta = required.map((part, i) => (current[i] ?? 0) - part).find((d) => d !== 0) ?? 0;
    process.exit(delta < 0 ? 1 : 0);
  ' "$MIN_NODE" "$(node --version)" || fail "Node.js >= $MIN_NODE requis (actuel : $(node --version))"
}

check_yarn() {
  command -v yarn >/dev/null || fail "yarn requis : corepack enable (ou npm install --global yarn)"
}

install_dependencies() {
  local marker="$ROOT/node_modules/.yarn-integrity"
  if [[ -f "$marker" && "$marker" -nt "$ROOT/yarn.lock" && "$marker" -nt "$ROOT/package.json" ]]; then return; fi
  step "Installation des dépendances"
  yarn --cwd "$ROOT" install --frozen-lockfile --silent
  # yarn leaves the marker untouched when nothing changed: refresh it so the next run skips this step.
  touch "$marker"
}

# Electron downloads its binary lazily on first use: fetch it before the sandbox check needs it.
ensure_electron_binary() {
  node -e 'require(process.argv[1])' "$ROOT/node_modules/electron" >/dev/null
}

# Ubuntu 23.10+ blocks unprivileged user namespaces, which Chromium's sandbox needs.
check_linux_sandbox() {
  [[ "$(uname -s)" == "Linux" ]] || return 0
  local sandbox="$ROOT/node_modules/electron/dist/chrome-sandbox"
  local restricted
  restricted="$(sysctl -n kernel.apparmor_restrict_unprivileged_userns 2>/dev/null || echo 0)"
  if [[ "$restricted" == "1" && ! -u "$sandbox" ]]; then
    fail "Sandbox Chromium bloquée par AppArmor. À faire une fois :
    sudo chown root:root $sandbox && sudo chmod 4755 $sandbox"
  fi
}

banner() {
  printf '\n\033[1;35m  ▟▙  WorkAdventure\033[0m \033[2mdesktop\033[0m\n\n'
}

step() {
  printf '\033[35m  ▸\033[0m %s\n' "$1"
}

fail() {
  printf '\033[31m  ✗ %s\033[0m\n' "$1" >&2
  exit 1
}

main "$@"
