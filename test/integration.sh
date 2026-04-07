#!/bin/bash
# ============================================================
# CI-ONLY integration test — DO NOT run locally.
# This script modifies ~/.claude.json and shell rc files.
# It is designed for disposable CI environments (GitHub Actions).
# ============================================================

set -e

# Safety check: refuse to run if real claude.json exists
if [ -f "$HOME/.claude.json" ] && grep -q "oauthAccount" "$HOME/.claude.json" 2>/dev/null; then
  echo "ERROR: Real ~/.claude.json detected with oauthAccount."
  echo "This test is for CI environments only. Aborting."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BIN="$PROJECT_DIR/bin/buddy-roll.mjs"
MOCK_DIR="$SCRIPT_DIR/mock"
TMP_DIR=$(mktemp -d)

PASS=0
FAIL=0

cleanup_all() {
  rm -rf "$TMP_DIR"
  # Clean up any files we created in HOME
  rm -f "$HOME/.claude.json" "$HOME/.claude.json.buddy-roll-backup" "$HOME/.buddy-roll-state.json"
  rm -f "$HOME/.zshrc" "$HOME/.bashrc" "$HOME/.bash_profile"
}
trap cleanup_all EXIT

# Build Bun mock binary
echo "Building Bun mock binary..."
bun build --compile "$MOCK_DIR/mock-claude.ts" --outfile "$TMP_DIR/mock-claude-binary" 2>/dev/null
chmod +x "$TMP_DIR/mock-claude-binary"
cp "$MOCK_DIR/mock-claude-npm.mjs" "$TMP_DIR/mock-claude-npm"
chmod +x "$TMP_DIR/mock-claude-npm"

# Verify mock types
echo "Binary mock: $(file "$TMP_DIR/mock-claude-binary")"
echo "Script mock: $(file "$TMP_DIR/mock-claude-npm")"

assert_contains() {
  local label="$1" needle="$2" haystack="$3"
  if echo "$haystack" | grep -qF -- "$needle"; then
    echo "  PASS: $label"
    PASS=$((PASS+1))
  else
    echo "  FAIL: $label"
    echo "    expected to contain: $needle"
    echo "    actual: $(echo "$haystack" | head -3)"
    FAIL=$((FAIL+1))
  fi
}

assert_not_contains() {
  local label="$1" needle="$2" haystack="$3"
  if echo "$haystack" | grep -qF -- "$needle"; then
    echo "  FAIL: $label (should not contain: $needle)"
    FAIL=$((FAIL+1))
  else
    echo "  PASS: $label"
    PASS=$((PASS+1))
  fi
}

assert_file_not_exists() {
  local label="$1" path="$2"
  if [ ! -f "$path" ]; then
    echo "  PASS: $label"
    PASS=$((PASS+1))
  else
    echo "  FAIL: $label (file still exists: $path)"
    FAIL=$((FAIL+1))
  fi
}

# Write fake claude.json to real HOME
setup_config() {
  cat > "$HOME/.claude.json" << 'JSON'
{
  "userID": "test-user-id-for-integration",
  "oauthAccount": {
    "accountUuid": "fake-uuid-to-be-stripped",
    "emailAddress": "test@test.com"
  },
  "companion": {
    "name": "TestBuddy",
    "personality": "test personality"
  },
  "otherField": "should-not-be-touched"
}
JSON
  chmod 600 "$HOME/.claude.json"
}

# Clean between combos
clean_combo() {
  rm -f "$HOME/.claude.json" "$HOME/.claude.json.buddy-roll-backup" "$HOME/.buddy-roll-state.json"
  rm -f "$HOME/.zshrc" "$HOME/.bashrc" "$HOME/.bash_profile"
}

# Determine expected rc file based on platform + shell
get_rc_file() {
  local shell_name="$1"
  if [ "$shell_name" = "bash" ]; then
    if [ "$(uname)" = "Darwin" ]; then
      echo "$HOME/.bash_profile"
    else
      echo "$HOME/.bashrc"
    fi
  else
    echo "$HOME/.zshrc"
  fi
}

# Test one shell x install-type combination
run_combo() {
  local shell_name="$1" shell_path="$2" mock_path="$3" install_label="$4"

  echo ""
  echo "=== $shell_name x $install_label ($(uname)) ==="

  clean_combo
  setup_config

  local rc_file
  rc_file=$(get_rc_file "$shell_name")

  # Put mock claude in PATH (prepend)
  local mock_bin_dir="$TMP_DIR/bin-${shell_name}-${install_label}"
  mkdir -p "$mock_bin_dir"
  cp "$mock_path" "$mock_bin_dir/claude"
  chmod +x "$mock_bin_dir/claude"
  export PATH="$mock_bin_dir:$PATH"

  # Set SHELL so detectShell works
  export SHELL="$shell_path"

  # 1. Verify install type detection
  local detect_out
  detect_out=$(LANG=en node "$BIN" current 2>&1 || true)
  if [ "$install_label" = "native" ]; then
    assert_contains "detects native install" "native binary" "$detect_out"
  else
    assert_contains "detects npm install" "npm" "$detect_out"
  fi

  # 2. Apply (non-interactive, common duck = fast)
  clean_combo
  setup_config
  LANG=en node "$BIN" --species duck --rarity common --max 100000 --yes 2>/dev/null

  # 3. Verify config modified
  local config
  config=$(cat "$HOME/.claude.json")
  assert_not_contains "accountUuid removed" "fake-uuid-to-be-stripped" "$config"
  assert_not_contains "companion removed" "TestBuddy" "$config"
  assert_contains "otherField preserved" "should-not-be-touched" "$config"
  assert_contains "new userID written" "userID" "$config"

  # 4. Verify rc file written
  assert_contains "rc file has alias block" "buddy-roll-alias" "$(cat "$rc_file" 2>/dev/null || echo '')"

  # 5. Verify file permissions
  local state_file="$HOME/.buddy-roll-state.json"
  local backup_file="$HOME/.claude.json.buddy-roll-backup"
  if [ "$(uname)" = "Darwin" ]; then
    local state_perms=$(stat -f '%Lp' "$state_file" 2>/dev/null || echo "missing")
    local backup_perms=$(stat -f '%Lp' "$backup_file" 2>/dev/null || echo "missing")
  else
    local state_perms=$(stat -c '%a' "$state_file" 2>/dev/null || echo "missing")
    local backup_perms=$(stat -c '%a' "$backup_file" 2>/dev/null || echo "missing")
  fi
  assert_contains "state file has 600 perms" "600" "$state_perms"
  assert_contains "backup file has 600 perms" "600" "$backup_perms"

  # 6. New shell loads rc, calls claude — verify function works
  # Reset config with accountUuid (simulating Claude Code writing it back)
  setup_config
  # Re-apply to get rc file back
  LANG=en node "$BIN" --species duck --rarity common --max 100000 --yes 2>/dev/null

  local shell_out
  shell_out=$("$shell_path" -c "source $rc_file; claude --test-arg 2>&1" 2>&1 || true)
  assert_contains "mock claude called" "MOCK_CLAUDE_CALLED" "$shell_out"
  assert_contains "args forwarded" "--test-arg" "$shell_out"

  # 7. Verify function stripped accountUuid
  config=$(cat "$HOME/.claude.json")
  assert_not_contains "function stripped accountUuid" "fake-uuid-to-be-stripped" "$config"

  # 8. Env var forwarding through function
  setup_config
  LANG=en node "$BIN" --species duck --rarity common --max 100000 --yes 2>/dev/null
  shell_out=$("$shell_path" -c "source $rc_file; CLAUDE_CODE_NO_FLICKER=1 claude --skip 2>&1" 2>&1 || true)
  assert_contains "env var forwarded" "CLAUDE_CODE_NO_FLICKER=1" "$shell_out"
  assert_contains "args with env" "--skip" "$shell_out"

  # 9. Restore
  LANG=en node "$BIN" restore 2>/dev/null

  # 10. Verify restore
  config=$(cat "$HOME/.claude.json")
  assert_contains "accountUuid restored" "fake-uuid-to-be-stripped" "$config"
  assert_contains "companion restored" "TestBuddy" "$config"
  assert_contains "otherField still there" "should-not-be-touched" "$config"

  # 11. Verify rc cleaned
  assert_not_contains "alias block removed" "buddy-roll-alias" "$(cat "$rc_file" 2>/dev/null || echo '')"

  # 12. Verify state files deleted
  assert_file_not_exists "state file deleted" "$HOME/.buddy-roll-state.json"
  assert_file_not_exists "backup file deleted" "$HOME/.claude.json.buddy-roll-backup"

  # Restore PATH
  export PATH="${PATH#$mock_bin_dir:}"
}

# Test apply <id> with --yes (independent of shell × install_type matrix)
test_apply() {
  echo ""
  echo "=== test_apply ==="

  clean_combo
  setup_config

  # Use a deterministic 64-hex ID
  local APPLY_ID="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

  # Need a mock claude in PATH so setupAlias doesn't fail (any of the existing mocks works)
  local mock_bin_dir="$TMP_DIR/bin-apply"
  mkdir -p "$mock_bin_dir"
  cp "$TMP_DIR/mock-claude-binary" "$mock_bin_dir/claude"
  chmod +x "$mock_bin_dir/claude"
  export PATH="$mock_bin_dir:$PATH"
  export SHELL="${ZSH_PATH:-$BASH_PATH}"

  # Apply the ID
  LANG=en node "$BIN" apply "$APPLY_ID" --yes 2>/dev/null

  # Verify userID was written
  local config
  config=$(cat "$HOME/.claude.json")
  assert_contains "apply set userID" "$APPLY_ID" "$config"
  assert_not_contains "apply removed accountUuid" "fake-uuid-to-be-stripped" "$config"

  # Test rejection of invalid ID
  local err_out
  err_out=$(LANG=en node "$BIN" apply not-a-valid-id 2>&1 || true)
  assert_contains "rejects short ID" "Invalid ID format" "$err_out"

  # Test rejection of missing ID
  err_out=$(LANG=en node "$BIN" apply 2>&1 || true)
  assert_contains "rejects missing ID" "apply requires an ID argument" "$err_out"

  # Cleanup
  LANG=en node "$BIN" restore 2>/dev/null
  export PATH="${PATH#$mock_bin_dir:}"
}

echo "========================================"
echo "buddy-roll Integration Tests ($(uname))"
echo "========================================"

# Detect available shells
ZSH_PATH=$(which zsh 2>/dev/null || echo "")
BASH_PATH=$(which bash 2>/dev/null || echo "")

if [ -n "$ZSH_PATH" ]; then
  run_combo "zsh" "$ZSH_PATH" "$TMP_DIR/mock-claude-binary" "native"
  run_combo "zsh" "$ZSH_PATH" "$TMP_DIR/mock-claude-npm" "npm"
else
  echo "SKIP: zsh not available"
fi

if [ -n "$BASH_PATH" ]; then
  run_combo "bash" "$BASH_PATH" "$TMP_DIR/mock-claude-binary" "native"
  run_combo "bash" "$BASH_PATH" "$TMP_DIR/mock-claude-npm" "npm"
else
  echo "SKIP: bash not available"
fi

test_apply

echo ""
echo "========================================"
echo "Results: $PASS passed, $FAIL failed"
echo "========================================"
if [ $FAIL -gt 0 ]; then
  exit 1
else
  echo "All tests passed!"
fi
