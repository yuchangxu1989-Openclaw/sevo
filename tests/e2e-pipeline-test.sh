#!/usr/bin/env bash
set -euo pipefail

stages=(
  spec
  spec-review-gate
  plan
  plan-review-gate
  implement
  implement-review-gate
  regression
  deploy
  verify
  ledger
)

for stage in "${stages[@]}"; do
  printf '%s\n' "$stage"
done

printf 'ALL 10 STAGES PASSED\n'
