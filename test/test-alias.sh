#!/bin/zsh
# Test the buddy-roll shell function mechanism
# Uses a mock claude binary and fake config to verify:
#   - accountUuid is stripped before launch
#   - companion is stripped before launch
#   - environment variables are forwarded
#   - arguments are forwarded
#   - original binary is called (not recursive)

set -e

TESTDIR=$(mktemp -d)
PASS=0
FAIL=0

cleanup() { rm -rf "$TESTDIR"; }
trap cleanup EXIT

# Create mock claude binary
cat > "$TESTDIR/claude" << 'MOCK'
#!/bin/zsh
echo "MOCK_CLAUDE_CALLED"
echo "ARGS: $@"
echo "ENV_FLICKER: ${CLAUDE_CODE_NO_FLICKER:-unset}"
echo "ENV_CUSTOM: ${MY_CUSTOM_VAR:-unset}"
MOCK
chmod +x "$TESTDIR/claude"

# Put mock in PATH (before real claude)
export PATH="$TESTDIR:$PATH"

# Create fake claude.json
FAKE_HOME="$TESTDIR/home"
mkdir -p "$FAKE_HOME"
cat > "$FAKE_HOME/.claude.json" << 'JSON'
{
  "userID": "test-user-id-12345",
  "oauthAccount": {
    "accountUuid": "fake-uuid-to-be-deleted",
    "emailAddress": "test@test.com"
  },
  "companion": {
    "name": "TestBuddy",
    "personality": "test personality"
  },
  "otherField": "should-not-be-touched"
}
JSON

# Define the buddy-roll function (same as what buddy-roll injects, but with fake home)
claude() { node -e "const f=\"$FAKE_HOME/.claude.json\";try{const c=JSON.parse(require(\"fs\").readFileSync(f));if(c.oauthAccount?.accountUuid){delete c.oauthAccount.accountUuid;delete c.companion;require(\"fs\").writeFileSync(f,JSON.stringify(c,null,2))}}catch{}"; command claude "$@"; }

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    echo "  PASS: $label"
    PASS=$((PASS+1))
  else
    echo "  FAIL: $label"
    echo "    expected: $expected"
    echo "    actual:   $actual"
    FAIL=$((FAIL+1))
  fi
}

assert_contains() {
  local label="$1" needle="$2" haystack="$3"
  if [[ "$haystack" == *"$needle"* ]]; then
    echo "  PASS: $label"
    PASS=$((PASS+1))
  else
    echo "  FAIL: $label"
    echo "    expected to contain: $needle"
    echo "    actual: $haystack"
    FAIL=$((FAIL+1))
  fi
}

echo "=== Test 1: Basic call - strips accountUuid and companion ==="
# Reset config
cat > "$FAKE_HOME/.claude.json" << 'JSON'
{
  "userID": "test-user-id-12345",
  "oauthAccount": {
    "accountUuid": "fake-uuid-to-be-deleted",
    "emailAddress": "test@test.com"
  },
  "companion": {
    "name": "TestBuddy",
    "personality": "test personality"
  },
  "otherField": "should-not-be-touched"
}
JSON

OUTPUT=$(claude 2>&1)
CONFIG=$(cat "$FAKE_HOME/.claude.json")

assert_contains "mock claude was called" "MOCK_CLAUDE_CALLED" "$OUTPUT"
assert_contains "accountUuid removed" '"emailAddress"' "$CONFIG"
# accountUuid should NOT be in config
if [[ "$CONFIG" != *"accountUuid"* ]]; then
  echo "  PASS: accountUuid deleted"
  PASS=$((PASS+1))
else
  echo "  FAIL: accountUuid still present"
  FAIL=$((FAIL+1))
fi
# companion should NOT be in config
if [[ "$CONFIG" != *"companion"* ]]; then
  echo "  PASS: companion deleted"
  PASS=$((PASS+1))
else
  echo "  FAIL: companion still present"
  FAIL=$((FAIL+1))
fi
# otherField should still be there
assert_contains "otherField preserved" "should-not-be-touched" "$CONFIG"
# userID should still be there
assert_contains "userID preserved" "test-user-id-12345" "$CONFIG"

echo ""
echo "=== Test 2: Arguments forwarded ==="
# Reset config
cat > "$FAKE_HOME/.claude.json" << 'JSON'
{"oauthAccount":{"accountUuid":"x"},"companion":{"name":"y"}}
JSON

OUTPUT=$(claude --dangerously-skip-permissions --model opus 2>&1)
assert_contains "args forwarded" "ARGS: --dangerously-skip-permissions --model opus" "$OUTPUT"

echo ""
echo "=== Test 3: Environment variables forwarded ==="
cat > "$FAKE_HOME/.claude.json" << 'JSON'
{"oauthAccount":{"accountUuid":"x"},"companion":{"name":"y"}}
JSON

OUTPUT=$(CLAUDE_CODE_NO_FLICKER=1 claude 2>&1)
assert_contains "FLICKER env forwarded" "ENV_FLICKER: 1" "$OUTPUT"

OUTPUT=$(MY_CUSTOM_VAR=hello claude --test 2>&1)
assert_contains "custom env forwarded" "ENV_CUSTOM: hello" "$OUTPUT"
assert_contains "args still work with env" "ARGS: --test" "$OUTPUT"

echo ""
echo "=== Test 4: Combined env + args (ccbypass scenario) ==="
cat > "$FAKE_HOME/.claude.json" << 'JSON'
{"oauthAccount":{"accountUuid":"x"},"companion":{"name":"y"}}
JSON

OUTPUT=$(CLAUDE_CODE_NO_FLICKER=1 claude --dangerously-skip-permissions 2>&1)
assert_contains "env forwarded in combo" "ENV_FLICKER: 1" "$OUTPUT"
assert_contains "args forwarded in combo" "ARGS: --dangerously-skip-permissions" "$OUTPUT"

echo ""
echo "=== Test 5: No accountUuid - skips modification ==="
cat > "$FAKE_HOME/.claude.json" << 'JSON'
{
  "userID": "keep-me",
  "oauthAccount": {
    "emailAddress": "test@test.com"
  }
}
JSON

OUTPUT=$(claude 2>&1)
CONFIG=$(cat "$FAKE_HOME/.claude.json")
assert_contains "still calls claude" "MOCK_CLAUDE_CALLED" "$OUTPUT"
assert_contains "userID untouched" "keep-me" "$CONFIG"

echo ""
echo "=== Test 6: Missing config file - no crash ==="
rm -f "$FAKE_HOME/.claude.json"
OUTPUT=$(claude --help 2>&1)
assert_contains "runs without config" "MOCK_CLAUDE_CALLED" "$OUTPUT"
assert_contains "args passed without config" "ARGS: --help" "$OUTPUT"

echo ""
echo "================================"
echo "Results: $PASS passed, $FAIL failed"
if [[ $FAIL -gt 0 ]]; then
  exit 1
else
  echo "All tests passed!"
fi
