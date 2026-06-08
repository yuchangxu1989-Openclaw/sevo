import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { appendJsonLineWithRotation } from '../event-log.js';

describe('src event log rotation', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('rotates pipeline events when the next JSONL line would exceed maxBytes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-src-event-log-'));
    tmpDirs.push(dir);
    const logPath = path.join(dir, 'events.jsonl');

    for (let index = 0; index < 4; index += 1) {
      appendJsonLineWithRotation(logPath, { index, payload: 'x'.repeat(40) }, { maxBytes: 90, retention: 1 });
    }

    expect(fs.existsSync(logPath)).toBe(true);
    expect(fs.existsSync(`${logPath}.1`)).toBe(true);
    expect(fs.existsSync(`${logPath}.2`)).toBe(false);

    const current = fs.readFileSync(logPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    const previous = fs.readFileSync(`${logPath}.1`, 'utf8').trim().split('\n').map((line) => JSON.parse(line));

    expect(current.at(-1)?.index).toBe(3);
    expect(previous.at(-1)?.index).toBe(2);
  });
});
