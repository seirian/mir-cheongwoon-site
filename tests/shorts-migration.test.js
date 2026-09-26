import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('shorts cache replacement uses bounded slots and keeps production safeupdate protection', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20260927035000_shorts_cache_scoped_replace.sql', import.meta.url), 'utf8');
  assert.match(sql, /delete\s+from\s+public\.recent_shorts\s+where\s+position\s+between\s+1\s+and\s+10\s*;/i);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.recent_shorts\s*;/i);
  assert.doesNotMatch(sql, /set\s+(?:local\s+)?safeupdate|disable\s+row\s+level\s+security/i);
  assert.match(sql, /security invoker/i);
  assert.match(sql, /grant execute .* to service_role/i);
});
