#!/bin/sh
# Temporary stub: persisted shell cwd drifted into projects/sevo and broke the
# cwd-relative PreToolUse hook resolver. Point hooks back at the workspace root.
# Safe to delete once the shell cwd is reset to /root/.openclaw/workspace.
echo /root/.openclaw/workspace
