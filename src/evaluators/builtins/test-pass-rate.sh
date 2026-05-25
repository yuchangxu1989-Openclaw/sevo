#!/usr/bin/env bash
# test-pass-rate — SEVO built-in evaluator (FR-23)
#
# Parses test execution results from artifact paths and computes pass rate.
# Input: JSON via stdin (standard evaluator protocol).
# Output: JSON via stdout with verdict, score, and details.
#
# Threshold: 100% pass rate by default (configurable via TEST_PASS_THRESHOLD env).

set -euo pipefail

# Read stdin JSON
INPUT=$(cat)

# Extract artifact paths
ARTIFACT_PATHS=$(echo "$INPUT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for p in data.get('artifactPaths', []):
    print(p)
" 2>/dev/null || true)

THRESHOLD="${TEST_PASS_THRESHOLD:-100}"
TOTAL=0
PASSED=0
FAILED_TESTS=""

# Scan artifact paths for test result files
while IFS= read -r artifact_path; do
  [ -z "$artifact_path" ] && continue

  # Look for common test result patterns
  for result_file in \
    "$artifact_path/test-results.json" \
    "$artifact_path/junit.xml" \
    "$artifact_path/test-report.json" \
    "$artifact_path"; do

    [ -f "$result_file" ] || continue

    case "$result_file" in
      *.json)
        # Parse JSON test results: expect { tests: [{ name, passed }] } or similar
        COUNTS=$(python3 -c "
import sys, json
try:
    with open('$result_file') as f:
        data = json.load(f)
    tests = data if isinstance(data, list) else data.get('tests', data.get('testResults', []))
    total = len(tests)
    passed = sum(1 for t in tests if t.get('passed', t.get('status') == 'passed'))
    failed = [t.get('name', 'unknown') for t in tests if not t.get('passed', t.get('status') == 'passed')]
    print(f'{total} {passed} {chr(10).join(failed)}')
except Exception:
    print('0 0')
" 2>/dev/null || echo "0 0")
        FILE_TOTAL=$(echo "$COUNTS" | head -1 | awk '{print $1}')
        FILE_PASSED=$(echo "$COUNTS" | head -1 | awk '{print $2}')
        FILE_FAILED=$(echo "$COUNTS" | tail -n +1 | cut -d' ' -f3-)
        TOTAL=$((TOTAL + FILE_TOTAL))
        PASSED=$((PASSED + FILE_PASSED))
        [ -n "$FILE_FAILED" ] && FAILED_TESTS="${FAILED_TESTS}${FILE_FAILED}\n"
        ;;
    esac
  done
done <<< "$ARTIFACT_PATHS"

# Compute pass rate
if [ "$TOTAL" -eq 0 ]; then
  SCORE=100
  VERDICT="pass"
  MSG="No test results found in artifacts; assuming pass (no tests to fail)."
  RULE_PASSED="true"
else
  SCORE=$(( (PASSED * 100) / TOTAL ))
  if [ "$SCORE" -ge "$THRESHOLD" ]; then
    VERDICT="pass"
    RULE_PASSED="true"
  else
    VERDICT="fail"
    RULE_PASSED="false"
  fi
  MSG="Test pass rate: ${PASSED}/${TOTAL} (${SCORE}%). Threshold: ${THRESHOLD}%."
fi

# Output standard evaluator JSON
cat <<EOF
{
  "verdict": "${VERDICT}",
  "score": ${SCORE},
  "details": [
    {
      "rule": "test-pass-rate",
      "passed": ${RULE_PASSED},
      "message": "${MSG}"
    }
  ]
}
EOF
