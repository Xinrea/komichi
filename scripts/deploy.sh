#!/usr/bin/env bash
# Publish the static site to the nginx docroot on jwebsite.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
dest=${DEPLOY_DEST:-jwebsite:/var/www/html/komichi/}
# Always keep at least one flag so macOS Bash 3.2 + set -u does not reject an empty array.
rsync_opts=(-avz --delete --human-readable --progress)

usage() {
  echo "Usage: $0 [--dry-run]"
  echo "Rsync the site to ${dest}"
  echo "Override the destination with DEPLOY_DEST."
}

for arg in "$@"; do
  case "$arg" in
    --dry-run|-n) rsync_opts+=(--dry-run) ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; usage >&2; exit 1 ;;
  esac
done

command -v rsync >/dev/null || { echo "rsync is required" >&2; exit 1; }

# Trailing slashes copy the contents of the site root into the remote docroot.
rsync "${rsync_opts[@]}" \
  --exclude '.git/' \
  --exclude '.gitignore' \
  --exclude '.DS_Store' \
  --exclude '.cursor/' \
  --exclude 'scripts/' \
  --exclude 'deploy/' \
  --exclude 'node_modules/' \
  --exclude 'test-results/' \
  --exclude '__pycache__/' \
  --exclude '*.py[cod]' \
  --exclude 'build/' \
  --exclude 'README.md' \
  --exclude '*.source.md' \
  "$root/" "$dest"
