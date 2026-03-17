#!/usr/bin/env bash
set -euo pipefail

# Sync agent docs/skills across Codex and Claude layouts.
#
# Source of truth:
#   - AGENTS.md
#   - skills/
#
# Synced targets:
#   - CLAUDE.md
#   - .agents/skills/
#   - .claude/skills/
#
# Usage:
#   scripts/sync-agent-assets.sh            # sync/write mode
#   scripts/sync-agent-assets.sh --check    # verify only (non-zero if drift)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

MODE="sync"
if [[ "${1:-}" == "--check" ]]; then
  MODE="check"
elif [[ "${1:-}" == "--sync" || -z "${1:-}" ]]; then
  MODE="sync"
elif [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  cat <<'EOF'
Usage:
  scripts/sync-agent-assets.sh [--sync|--check]

Options:
  --sync   Copy AGENTS.md -> CLAUDE.md and skills/ -> .agents/skills + .claude/skills
  --check  Fail if any synced file/directory differs
EOF
  exit 0
else
  echo "Unknown option: $1" >&2
  exit 2
fi

cd "$ROOT_DIR"

SOURCE_DOC="AGENTS.md"
TARGET_DOC="CLAUDE.md"
SOURCE_SKILLS_DIR="skills"
TARGET_SKILL_DIRS=(".agents/skills" ".claude/skills")

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

require_source_paths() {
  [[ -f "$SOURCE_DOC" ]] || fail "Missing source doc: $SOURCE_DOC"
  [[ -d "$SOURCE_SKILLS_DIR" ]] || fail "Missing source skills directory: $SOURCE_SKILLS_DIR"
}

sync_doc() {
  cp "$SOURCE_DOC" "$TARGET_DOC"
}

sync_skills_dir() {
  local target="$1"
  mkdir -p "$target"
  rsync -a --delete "$SOURCE_SKILLS_DIR"/ "$target"/
}

check_doc() {
  if ! cmp -s "$SOURCE_DOC" "$TARGET_DOC"; then
    echo "Drift detected: $TARGET_DOC differs from $SOURCE_DOC"
    return 1
  fi
}

check_skills_dir() {
  local target="$1"
  if [[ ! -d "$target" ]]; then
    echo "Missing target skills directory: $target"
    return 1
  fi
  if ! diff -qr "$SOURCE_SKILLS_DIR" "$target" >/dev/null; then
    echo "Drift detected: $target differs from $SOURCE_SKILLS_DIR"
    return 1
  fi
}

require_source_paths

if [[ "$MODE" == "sync" ]]; then
  sync_doc
  for target in "${TARGET_SKILL_DIRS[@]}"; do
    sync_skills_dir "$target"
  done
  echo "Synced: $SOURCE_DOC, $SOURCE_SKILLS_DIR -> $TARGET_DOC, ${TARGET_SKILL_DIRS[*]}"
  exit 0
fi

status=0
check_doc || status=1
for target in "${TARGET_SKILL_DIRS[@]}"; do
  check_skills_dir "$target" || status=1
done

if [[ $status -ne 0 ]]; then
  echo "Run scripts/sync-agent-assets.sh to resolve drift."
  exit $status
fi

echo "Agent docs/skills are in sync."
