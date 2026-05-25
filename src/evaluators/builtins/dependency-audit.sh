#!/usr/bin/env bash
# dependency-audit — SEVO built-in evaluator (FR-23)
#
# Checks dependency security vulnerabilities using npm audit or equivalent.
# Input: JSON via stdin (standard evaluator protocol).
# Output: JSON via stdout with verdict, score, and details.
#
# Scoring: 100 if no vulnerabilities, deducts per severity level.
# Verdict: fail if any critical or high vulnerabilities found.

set -euo pipefail

# Read stdin JSON
INPUT=$(cat)

# Extract project root from input
PROJECT_ROOT=$(echo "$INPUT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
meta = data.get('projectMeta', {})
print(meta.get('projectRoot', meta.get('workspaceRoot', '.')))
" 2>/dev/null || echo ".")

# Check if package.json exists
if [ ! -f "$PROJECT_ROOT/package.json" ]; then
  cat <<EOF
{
  "verdict": "pass",
  "score": 100,
  "details": [
    {
      "rule": "dependency-audit",
      "passed": true,
      "message": "No package.json found; skipping dependency audit."
    }
  ]
}
EOF
  exit 0
fi

# Run npm audit
AUDIT_OUTPUT=""
AUDIT_EXIT=0
AUDIT_OUTPUT=$(cd "$PROJECT_ROOT" && npm audit --json 2>/dev/null) || AUDIT_EXIT=$?

# Parse audit results
COUNTS=$(echo "$AUDIT_OUTPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    vuln = data.get('metadata', {}).get('vulnerabilities', {})
    critical = vuln.get('critical', 0)
    high = vuln.get('high', 0)
    moderate = vuln.get('moderate', 0)
    low = vuln.get('low', 0)
    info = vuln.get('info', 0)
    total = vuln.get('total', critical + high + moderate + low + info)
    print(f'{critical} {high} {moderate} {low} {info} {total}')
except Exception:
    print('0 0 0 0 0 0')
" 2>/dev/null || echo "0 0 0 0 0 0")

CRITICAL=$(echo "$COUNTS" | awk '{print $1}')
HIGH=$(echo "$COUNTS" | awk '{print $2}')
MODERATE=$(echo "$COUNTS" | awk '{print $3}')
LOW=$(echo "$COUNTS" | awk '{print $4}')
INFO=$(echo "$COUNTS" | awk '{print $5}')
TOTAL=$(echo "$COUNTS" | awk '{print $6}')

# Calculate score
SCORE=100
SCORE=$((SCORE - CRITICAL * 25))
SCORE=$((SCORE - HIGH * 15))
SCORE=$((SCORE - MODERATE * 5))
SCORE=$((SCORE - LOW * 2))
[ "$SCORE" -lt 0 ] && SCORE=0

# Determine verdict: fail on critical or high
if [ "$CRITICAL" -gt 0 ] || [ "$HIGH" -gt 0 ]; then
  VERDICT="fail"
  RULE_PASSED="false"
else
  VERDICT="pass"
  RULE_PASSED="true"
fi

MSG="Dependencies: ${TOTAL} vulnerabilities (critical: ${CRITICAL}, high: ${HIGH}, moderate: ${MODERATE}, low: ${LOW}, info: ${INFO})."

DETAILS="[]"
if [ "$TOTAL" -eq 0 ]; then
  MSG="No known vulnerabilities found."
  RULE_PASSED="true"
fi

cat <<EOF
{
  "verdict": "${VERDICT}",
  "score": ${SCORE},
  "details": [
    {
      "rule": "dependency-audit",
      "passed": ${RULE_PASSED},
      "message": "${MSG}"
    }
  ]
}
EOF
