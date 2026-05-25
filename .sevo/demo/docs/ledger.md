# Ledger — demo

Pipeline: demo
Generated: 2026-05-24T02:02:29.672Z

| Stage | Verdict | Generated At | Artifact |
| --- | --- | --- | --- |
| spec | recorded | 2026-05-24T02:02:27.953Z | docs/product-requirements.json |
| spec-review-gate | pass | 2026-05-24T02:02:27.955Z | docs/spec-review-gate.json |
| contract-review-gate | pass | 2026-05-24T02:02:27.961Z | docs/contract-review-gate.json |
| review | pass | 2026-05-24T02:02:27.966Z | docs/review-report.json |
| review-fix-loop | — | — | — |
| regression | recorded | 2026-05-24T02:02:27.970Z | docs/regression.json |
| publish-generalization-gate | pass | 2026-05-24T02:02:29.466Z | docs/publish-generalization-gate.json |
| deploy | pass | 2026-05-24T02:02:29.470Z | docs/deploy.json |
| verify | pass | 2026-05-24T02:02:29.471Z | docs/verify.json |
| endgame-scan | — | — | — |

## Metrics

### spec-review-gate

```json
{
  "frCount": 1,
  "acCount": 3
}
```

### contract-review-gate

```json
{
  "frCount": 1,
  "contractCount": 1,
  "coveredFrs": [
    "FR-01"
  ],
  "missingForFrs": []
}
```

### review

```json
{
  "frCount": 1,
  "findings": []
}
```

### regression

```json
{
  "passCount": 3,
  "failCount": 0,
  "testFileCount": 1
}
```

### publish-generalization-gate

```json
{
  "matches": [],
  "scannedFiles": 14
}
```

### deploy

```json
{
  "package": {
    "name": "sevo",
    "currentVersion": "1.12.2",
    "proposedVersion": "1.12.3",
    "bumpKind": "patch"
  },
  "publish": {
    "executed": false
  }
}
```
