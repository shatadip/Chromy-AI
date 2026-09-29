import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runChecks } from '../scripts/check.mjs';

test('static release checks pass (manifest, files, CSP, no unsafe HTML, element ids)', () => {
  assert.deepEqual(runChecks(), []);
});
