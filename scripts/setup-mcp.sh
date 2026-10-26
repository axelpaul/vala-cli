#!/usr/bin/env bash
# Build from this reviewed checkout; no credentials or client settings are changed.
set -euo pipefail
repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir"
command -v bun >/dev/null || { echo 'Install Bun first: https://bun.sh' >&2; exit 1; }
bun install --frozen-lockfile >&2
bun run build >&2
bun -e 'console.log(JSON.stringify({mcpServers:{"vala":{command:process.argv[1],args:["serve"]}}},null,2))' "$repo_dir/vala"
