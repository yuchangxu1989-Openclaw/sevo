#!/usr/bin/env bash
set -euo pipefail

VERSION="1.0.0"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
WORKDIR="/tmp/sevo-clean-install-${TIMESTAMP}"
CLEANUP=true
PACKAGE_SPEC=""
CLI_BIN="sevo"
COMMANDS=()
TOTAL=0
PASSED=0
FAILED=0
REPORT_LINES=()

usage() {
  cat <<'USAGE'
Usage:
  verify-l1.sh --package <pkg@ver|path> --bin <name> --commands "cmd1" "cmd2" ...

Options:
  --package <spec>    npm package specifier (for example: sevo@1.2.3 or /path/to/pkg.tgz)
  --bin <name>        CLI binary name. Default: sevo
  --commands <cmds>   Commands to verify. Each command runs in the installed package's clean project.
  --no-cleanup        Keep temp directory after run
  --help              Show this help
  --version           Show version
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --package) PACKAGE_SPEC="$2"; shift 2 ;;
    --bin) CLI_BIN="$2"; shift 2 ;;
    --commands) shift; while [[ $# -gt 0 && ! "$1" =~ ^-- ]]; do COMMANDS+=("$1"); shift; done ;;
    --no-cleanup) CLEANUP=false; shift ;;
    --help) usage; exit 0 ;;
    --version) echo "sevo verify-l1 v${VERSION}"; exit 0 ;;
    *) echo "Unknown option: $1"; usage; exit 2 ;;
  esac
done

if [[ -z "$PACKAGE_SPEC" ]]; then
  echo "Error: --package is required"
  usage
  exit 2
fi
if [[ -z "$CLI_BIN" ]]; then
  echo "Error: --bin is required"
  exit 2
fi
if ! command -v node >/dev/null 2>&1; then
  echo "Error: node not found"
  exit 2
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm not found"
  exit 2
fi

report() { REPORT_LINES+=("$1"); }

run_check() {
  local description="$1"
  local cmd="$2"
  TOTAL=$((TOTAL + 1))

  local output exit_code
  output=$(cd "$WORKDIR" && HOME="$WORKDIR" PATH="$WORKDIR/node_modules/.bin:$PATH" bash -lc "$cmd" 2>&1) && exit_code=0 || exit_code=$?

  if [[ "$exit_code" -eq 0 ]]; then
    PASSED=$((PASSED + 1))
    report "- [x] ${description} — exit 0"
    if [[ -n "${output//[[:space:]]/}" ]]; then
      report "  Output: $(printf '%s' "$output" | head -5 | tr '\n' ' ' | cut -c1-500)"
    fi
  else
    FAILED=$((FAILED + 1))
    report "- [ ] ${description} — exit ${exit_code}"
    report "  Output: $(printf '%s' "$output" | tail -20 | tr '\n' ' ' | cut -c1-1000)"
  fi
}

mkdir -p "$WORKDIR"
trap 'if [[ "$CLEANUP" == "true" ]]; then rm -rf "$WORKDIR"; fi' EXIT

report "# SEVO L1 Clean Install Verification"
report ""
report "Date: $(date -Iseconds)"
report "Work dir: ${WORKDIR}"
report "Package: ${PACKAGE_SPEC}"
report "Binary: ${CLI_BIN}"
report ""

TOTAL=$((TOTAL + 1))
install_output=$(cd "$WORKDIR" && HOME="$WORKDIR" npm init -y --silent >/dev/null 2>&1 && HOME="$WORKDIR" npm install "$PACKAGE_SPEC" --no-audit --no-fund 2>&1) && install_exit=0 || install_exit=$?
if [[ "$install_exit" -eq 0 ]]; then
  PASSED=$((PASSED + 1))
  report "- [x] npm install ${PACKAGE_SPEC} — exit 0"
else
  FAILED=$((FAILED + 1))
  report "- [ ] npm install ${PACKAGE_SPEC} — exit ${install_exit}"
  report "  Output: $(printf '%s' "$install_output" | tail -30 | tr '\n' ' ' | cut -c1-1500)"
fi

if [[ "$install_exit" -eq 0 ]]; then
  run_check "${CLI_BIN} binary is linked" "command -v ${CLI_BIN} >/dev/null && ${CLI_BIN} --help >/tmp/sevo-help.log && test -s /tmp/sevo-help.log"
  if [[ ${#COMMANDS[@]} -gt 0 ]]; then
    for cmd in "${COMMANDS[@]}"; do
      run_check "${cmd}" "${cmd}"
    done
  fi
fi

report ""
report "## Summary"
report ""
report "Total: ${TOTAL}"
report "Passed: ${PASSED}"
report "Failed: ${FAILED}"
if [[ "$FAILED" -eq 0 ]]; then
  report "Result: ALL PASSED"
else
  report "Result: ${FAILED} FAILED"
fi

printf '%s\n' "${REPORT_LINES[@]}"

if [[ "$FAILED" -gt 0 ]]; then
  exit 1
fi
exit 0
