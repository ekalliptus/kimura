// Runnable self-check for the /_img open-proxy guard: `bun packages/core/src/img.check.ts`.
// canOptimize gates which URLs the edge optimizer will proxy — a regression here
// (e.g. a bare host check) would turn /_img into an open image proxy for every
// public Supabase bucket. Keep this in sync with the host check in apps/web/src/worker.ts.
import { strict as assert } from 'node:assert';
import { canOptimize } from './img';

const SB = 'https://ptrbczteqpyamwasidai.supabase.co';

// Cloudbeds CDN — allowed.
assert.equal(canOptimize('https://h-img1.cloudbeds.com/uploads/x.jpg'), true);
// room-images public object — allowed.
assert.equal(canOptimize(`${SB}/storage/v1/object/public/room-images/abc.webp`), true);
// a DIFFERENT public bucket on the same host — rejected (no open proxy).
assert.equal(canOptimize(`${SB}/storage/v1/object/public/secrets/x.png`), false);
// arbitrary host — rejected.
assert.equal(canOptimize('https://evil.example.com/x.jpg'), false);
// junk / empty — rejected.
assert.equal(canOptimize('not a url'), false);
assert.equal(canOptimize(''), false);

console.log('img.check.ts: all assertions passed');
