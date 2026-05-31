# SEVO Stranger Verification

OpenClaw(主会话)

Date: 2026-05-31T02:35:24+08:00
Package: sevo-pipeline
Install source: npm registry
Temp directory: /tmp/sevo-stranger-20260531-023521.lR5can (removed after exit)
Node: v22.22.2
npm: 10.9.7

## Result

Total: 5
Passed: 5
Failed: 0
Skipped: 0
Status: PASS

## Steps

| Step | Status | Exit Code | Stdout/Stderr Summary |
| --- | --- | ---: | --- |
| npm install -g sevo-pipeline | PASS | 0 |  added 1 package, and changed 1 package in 2s  |
| sevo --version | PASS | 0 | 1.13.7  |
| sevo init | PASS | 0 |  ╔══════════════════════════════════════════════╗ ║ Welcome to SEVO ║ ║ Project: sevo-stranger-20260531-023521.l║ ╚══════════════════════════════════════════════╝ Environment check: ✅ node: v22.22.2 Node.js meets SEVO requirement (>= 18) ✅ npm: 10.9.7 npm is available ✅ git: git version 2.43.0 git is available ⚠️ vitest: not found vitest not installed. Stage 9 (regression) will fail until you run: npm install --save-dev vitest Project scan: • Host adapter: standalone • Project type |
| sevo project create stranger-test | PASS | 0 | Project "stranger-test" created. Directory: /tmp/sevo-stranger-20260531-023521.lR5can/projects/stranger-test Subdirs: specs, contracts, artifacts, pipelines, docs, docs/design, docs/architecture, docs/architecture/decisions, src, tests, reports, scripts Pipeline: /tmp/sevo-stranger-20260531-023521.lR5can/.sevo/stranger-test/state.json Next: sevo advance stranger-test { "slug": "stranger-test", "description": "", "parentProject": "sevo-stranger-20260531-023521.lR5can", "createdAt": "2026-05-30T18:35:24.271Z", "stages": [ "spec", "spec-review-gate", "implement", "review", "smoke-test", "ux-acceptance", "pm-commercial-review", "publish-generalization-gate", "deploy", "ledger" ] }  |
| sevo doctor | PASS | 0 |  ✓ config-file: Found sevo.json at /tmp/sevo-stranger-20260531-023521.lR5can/sevo.json ✓ config-valid: Configuration is valid. ✓ dir-specs: specs/ exists ✓ dir-contracts: contracts/ exists ✓ dir-artifacts: artifacts/ exists ✓ dir-pipelines: pipelines/ exists ✓ node-version: Node.js v22.22.2 ⚠ typescript: TypeScript compiler not found in node_modules. ⚠ vitest: vitest not installed. Stage 9 (regression) will fail. Fix with: npm install --save-dev vitest ⚠ role-matching: 角色降级模式：self 模拟缺失角色，trust-level: low。可补齐 roleAssignment.roles，或设置 strictRoleMatching=true 启用严格模式。 Errors: 0 Warnings: 3  |

## Notes

- The script intentionally installs `sevo-pipeline` globally from the npm registry.
- The temp directory is cleaned automatically unless `--keep-temp` is passed.
- `sevo init`, `sevo project create stranger-test`, and `sevo doctor` are expected to run without an LLM provider.
