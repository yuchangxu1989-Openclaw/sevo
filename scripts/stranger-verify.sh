#!/usr/bin/env bash
set -u

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
REPORT_DATE="$(date +%F)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPORT_DIR="${PROJECT_ROOT}/reports"
REPORT_PATH="${REPORT_DIR}/stranger-verification-${REPORT_DATE}.md"
WORKDIR="$(mktemp -d "/tmp/sevo-stranger-${TIMESTAMP}.XXXXXX")"
LOG_DIR="${WORKDIR}/logs"
TOTAL=0
PASSED=0
FAILED=0
SKIPPED=0
STEP_ROWS=()
KEEP_TEMP=false

usage() {
  cat <<'USAGE'
Usage: stranger-verify.sh [--keep-temp]

Runs a clean stranger verification from the npm registry:
  npm install -g sevo-pipeline
  sevo --version
  sevo init
  sevo project create stranger-test
  sevo doctor

Writes reports/stranger-verification-<date>.md and removes the temp directory by default.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --keep-temp) KEEP_TEMP=true; shift ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 2 ;;
  esac
done

cleanup() {
  if [[ "${KEEP_TEMP}" != "true" && -n "${WORKDIR:-}" && -d "${WORKDIR}" ]]; then
    rm -rf "${WORKDIR}"
  fi
}
trap cleanup EXIT

mkdir -p "${REPORT_DIR}" "${LOG_DIR}"

summarize_output() {
  local file="$1"
  if [[ ! -s "${file}" ]]; then
    printf 'No output'
    return
  fi
  tr '\n' ' ' < "${file}" | sed -E 's/[[:space:]]+/ /g' | cut -c1-700
}

escape_cell() {
  printf '%s' "$1" | sed 's/|/\\|/g'
}

record_step() {
  local name="$1"
  local exit_code="$2"
  local output_file="$3"
  local status="FAIL"
  local summary

  TOTAL=$((TOTAL + 1))
  if [[ "${exit_code}" == "0" ]]; then
    status="PASS"
    PASSED=$((PASSED + 1))
  elif [[ "${exit_code}" == "SKIP" ]]; then
    status="SKIP"
    SKIPPED=$((SKIPPED + 1))
  else
    FAILED=$((FAILED + 1))
  fi

  summary="$(summarize_output "${output_file}")"
  STEP_ROWS+=("| $(escape_cell "${name}") | ${status} | ${exit_code} | $(escape_cell "${summary}") |")
}

run_step() {
  local name="$1"
  shift
  local output_file="${LOG_DIR}/$(printf '%s' "${name}" | tr '[:upper:] /' '[:lower:]--' | tr -cd 'a-z0-9._-').log"
  local exit_code=0

  (cd "${WORKDIR}" && "$@" > "${output_file}" 2>&1) || exit_code=$?
  record_step "${name}" "${exit_code}" "${output_file}"
  return 0
}

write_report() {
  local temp_state="removed"
  if [[ "${KEEP_TEMP}" == "true" ]]; then
    temp_state="kept"
  fi

  {
    echo "# SEVO Stranger Verification"
    echo ""
    echo "OpenClaw(主会话)"
    echo ""
    echo "Date: $(date -Iseconds)"
    echo "Package: sevo-pipeline"
    echo "Install source: npm registry"
    echo "Temp directory: ${WORKDIR} (${temp_state} after exit)"
    echo "Node: $(node --version 2>/dev/null || echo 'not found')"
    echo "npm: $(npm --version 2>/dev/null || echo 'not found')"
    echo ""
    echo "## Result"
    echo ""
    echo "Total: ${TOTAL}"
    echo "Passed: ${PASSED}"
    echo "Failed: ${FAILED}"
    echo "Skipped: ${SKIPPED}"
    if [[ "${FAILED}" -eq 0 ]]; then
      echo "Status: PASS"
    else
      echo "Status: FAIL"
    fi
    echo ""
    echo "## Steps"
    echo ""
    echo "| Step | Status | Exit Code | Stdout/Stderr Summary |"
    echo "| --- | --- | ---: | --- |"
    printf '%s\n' "${STEP_ROWS[@]}"
    echo ""
    echo "## Notes"
    echo ""
    echo '- The script intentionally installs `sevo-pipeline` globally from the npm registry.'
    echo '- The temp directory is cleaned automatically unless `--keep-temp` is passed.'
    echo '- `sevo init`, `sevo project create stranger-test`, and `sevo doctor` are expected to run without an LLM provider.'
  } > "${REPORT_PATH}"
}

if ! command -v npm >/dev/null 2>&1; then
  missing_npm_log="${LOG_DIR}/npm-missing.log"
  echo "npm not found" > "${missing_npm_log}"
  record_step "npm install -g sevo-pipeline" "SKIP" "${missing_npm_log}"
  write_report
  echo "Report: ${REPORT_PATH}"
  exit 0
fi

run_step "npm install -g sevo-pipeline" npm install -g sevo-pipeline
hash -r
run_step "sevo --version" env HOME="${WORKDIR}/home" sevo --version
run_step "sevo init" env HOME="${WORKDIR}/home" SEVO_WORKSPACE_ROOT="${WORKDIR}" sevo init
run_step "sevo project create stranger-test" env HOME="${WORKDIR}/home" SEVO_WORKSPACE_ROOT="${WORKDIR}" sevo project create stranger-test
run_step "sevo doctor" env HOME="${WORKDIR}/home" SEVO_WORKSPACE_ROOT="${WORKDIR}" sevo doctor

write_report
echo "Report: ${REPORT_PATH}"

if [[ "${FAILED}" -gt 0 ]]; then
  exit 1
fi
exit 0
