#!/usr/bin/env bash
set -u

# ── FR-13 P1: Three-tier environment degradation ──
# Tier 1: No OpenClaw environment → silent exit 0
# Tier 2: Partial environment (config but no CLI) → warning + exit 0
# Tier 3: Full environment → complete registration

OPENCLAW_HOME_INPUT="${OPENCLAW_HOME:-$HOME/.openclaw}"

# Tier 1: No OpenClaw environment at all
if [ -z "${OPENCLAW_HOME:-}" ] && ! command -v openclaw >/dev/null 2>&1; then
  # No OPENCLAW_HOME set and no openclaw command available → not an OpenClaw host
  printf '[sevo-init] OpenClaw CLI not found — skipping OpenClaw plugin registration. Run "sevo init" after installing OpenClaw if you want gateway integration.\n'
  exit 0
fi

# Resolve home path for config check
case "$OPENCLAW_HOME_INPUT" in
  "~") _RESOLVED_HOME="$HOME" ;;
  "~/"*) _RESOLVED_HOME="$HOME/${OPENCLAW_HOME_INPUT#~/}" ;;
  *) _RESOLVED_HOME="$OPENCLAW_HOME_INPUT" ;;
esac

# Tier 1 (extended): OPENCLAW_HOME set but config file doesn't exist
if [ ! -f "$_RESOLVED_HOME/openclaw.json" ]; then
  printf '[sevo-init] OpenClaw config not found — skipping OpenClaw plugin registration. Run "sevo init" inside an OpenClaw workspace when ready.\n'
  exit 0
fi

# Tier 2: Config exists but openclaw CLI is missing → partial environment
if ! command -v openclaw >/dev/null 2>&1; then
  printf '[sevo-init][warn] openclaw CLI not found — partial environment, skipping registration.\n' >&2
  printf '[sevo-init][warn] Run "sevo init" manually after installing OpenClaw CLI.\n' >&2
  exit 0
fi

# Tier 3: Full environment — proceed with complete registration

PLUGIN_ID="sevo-pipeline"
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PLUGIN_DIR="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
PLUGIN_MAIN="$PLUGIN_DIR/index.js"
PLUGIN_MANIFEST="$PLUGIN_DIR/openclaw.plugin.json"
CLI_BIN="$PLUGIN_DIR/bin/sevo.js"

log() {
  printf '[sevo-init] %s\n' "$*"
}

warn() {
  printf '[sevo-init][warn] %s\n' "$*" >&2
}

die() {
  printf '[sevo-init][error] %s\n' "$*" >&2
  exit 1
}

expand_home() {
  case "$1" in
    "~")
      printf '%s\n' "$HOME"
      ;;
    "~/"*)
      printf '%s/%s\n' "$HOME" "${1#~/}"
      ;;
    *)
      printf '%s\n' "$1"
      ;;
  esac
}

OPENCLAW_HOME="$(expand_home "$OPENCLAW_HOME_INPUT")"
CONFIG_PATH="$OPENCLAW_HOME/openclaw.json"
if [ ! -f "$PLUGIN_MANIFEST" ]; then
  warn "Plugin manifest not found: $PLUGIN_MANIFEST (normal for npm global install)"
  printf '[sevo-init] Run "npx sevo init" manually to start first-run setup.\n'
  exit 0
fi
[ -f "$PLUGIN_MAIN" ] || die "Plugin entrypoint not found: $PLUGIN_MAIN"
[ -f "$CLI_BIN" ] || die "CLI entrypoint not found: $CLI_BIN"
command -v node >/dev/null 2>&1 || die "node is required"
# openclaw CLI already verified in tier check above

log "Using OPENCLAW_HOME=$OPENCLAW_HOME"
log "Config: $CONFIG_PATH"

log "Verifying CLI entrypoint and first-run commands"
node "$CLI_BIN" --help >/dev/null 2>&1 || die 'CLI self-check failed: "sevo --help" is unavailable'
node "$CLI_BIN" init --help >/dev/null 2>&1 || die 'CLI self-check failed: "sevo init --help" is unavailable'
node "$CLI_BIN" project create --help >/dev/null 2>&1 || die 'CLI self-check failed: "sevo project create --help" is unavailable'
node "$CLI_BIN" fr add --help >/dev/null 2>&1 || die 'CLI self-check failed: "sevo fr add --help" is unavailable'

# ── FR-D05 AC1: Output version ──
NEW_VERSION="$(OPENCLAW_PLUGIN_MAIN="$PLUGIN_MAIN" node -e "
const fs = require('fs');
const src = fs.readFileSync(process.env.OPENCLAW_PLUGIN_MAIN, 'utf8');
const m = src.match(/const SEVO_VERSION\s*=\s*'([^']+)'/);
process.stdout.write(m ? m[1] : 'unknown');
")"
log "SEVO version: $NEW_VERSION"

# ── FR-D05 AC2: Backup before upgrade ──
EXT_DIR="$(dirname "$PLUGIN_DIR")"
INSTALLED_DIR="$EXT_DIR/sevo"
STATE_FILE="$PLUGIN_DIR/state/active-pipelines.json"

if [ -d "$INSTALLED_DIR" ] && [ "$INSTALLED_DIR" != "$PLUGIN_DIR" ]; then
  BACKUP_TS="$(date +%Y%m%d-%H%M%S)"
  BACKUP_DIR="${INSTALLED_DIR}.bak.${BACKUP_TS}"
  log "Existing installation detected — backing up to $BACKUP_DIR"
  cp -a "$INSTALLED_DIR" "$BACKUP_DIR"
  if [ -f "$STATE_FILE" ]; then
    BACKUP_STATE="${STATE_FILE}.bak.${BACKUP_TS}"
    cp -a "$STATE_FILE" "$BACKUP_STATE"
    log "State file backed up to $BACKUP_STATE"
  fi
fi

# ── FR-D05 AC4: Major version upgrade confirmation ──
INSTALLED_VERSION=""
if [ -f "$INSTALLED_DIR/index.js" ] && [ "$INSTALLED_DIR" != "$PLUGIN_DIR" ]; then
  INSTALLED_VERSION="$(OPENCLAW_INSTALLED_MAIN="$INSTALLED_DIR/index.js" node -e "
const fs = require('fs');
const src = fs.readFileSync(process.env.OPENCLAW_INSTALLED_MAIN, 'utf8');
const m = src.match(/const SEVO_VERSION\s*=\s*'([^']+)'/);
process.stdout.write(m ? m[1] : '');
" 2>/dev/null || true)"
fi

if [ -n "$INSTALLED_VERSION" ] && [ -n "$NEW_VERSION" ] && [ "$NEW_VERSION" != "unknown" ]; then
  OLD_MAJOR="${INSTALLED_VERSION%%.*}"
  NEW_MAJOR="${NEW_VERSION%%.*}"
  if [ "$OLD_MAJOR" != "$NEW_MAJOR" ]; then
    printf '[sevo-init] ⚠️  Major version upgrade detected: %s → %s\n' "$INSTALLED_VERSION" "$NEW_VERSION"
    printf '[sevo-init] This may include breaking changes. Continue? [y/N] '
    read -r CONFIRM
    case "$CONFIRM" in
      [yY]|[yY][eE][sS]) log "Major upgrade confirmed by user" ;;
      *) die "Major upgrade aborted by user" ;;
    esac
  else
    log "Version upgrade: $INSTALLED_VERSION → $NEW_VERSION (minor/patch — auto-proceeding)"
  fi
fi

log "Verifying SEVO runtime hook declarations"
HOOK_REPORT="$({ OPENCLAW_PLUGIN_MAIN="$PLUGIN_MAIN" node <<'NODE'
const fs = require('fs');
const pluginMain = process.env.OPENCLAW_PLUGIN_MAIN;
const source = fs.readFileSync(pluginMain, 'utf8');

function hasHook(eventName, priority) {
  const escaped = eventName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`api\\.on\\(\\s*['\"]${escaped}['\"][\\s\\S]{0,12000}?\\{\\s*priority\\s*:\\s*${priority}\\s*\\}\\s*\\);`, 'm');
  return pattern.test(source);
}

const report = {
  beforePromptBuild850: hasHook('before_prompt_build', 850),
  subagentEnded200: hasHook('subagent_ended', 200)
};

if (!report.beforePromptBuild850 || !report.subagentEnded200) {
  console.error(JSON.stringify(report));
  process.exit(0);
}

process.stdout.write(JSON.stringify(report));
NODE
} 2>&1)" || warn "Plugin runtime hook verification degraded: $HOOK_REPORT"

printf '\n安装结果摘要\n'
printf '  - CLI 自检：sevo --help / sevo init --help / sevo project create --help / sevo fr add --help\n'
printf '  - Hook 校验：失败只告警，不阻断安装（当前结果：%s）\n' "$HOOK_REPORT"
printf '  - OpenClaw 集成：延迟到首次加载/手动 init，不在 postinstall 阶段改写 openclaw.json\n'
printf '  - 下一步：如需接入当前 OpenClaw 环境，请手动执行 npx sevo init，并在确认 doctor Errors: 0 后再重启 Gateway\n'

echo ""
echo "✅ SEVO package installed successfully!"
echo ""
echo "Next steps:"
echo "  1. First-run setup:  npx sevo init"
echo "  2. Optional doctor:  openclaw doctor --non-interactive --no-workspace-suggestions"
echo "  3. Restart Gateway only after doctor Errors: 0"
echo "  4. First project:    sevo project create hello-sevo --description \"What you want to build\""
echo "  5. First FR:         sevo fr add hello-sevo \"Ship the first user-visible feature\""
echo ""
exit 0
