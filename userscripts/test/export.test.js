const test = require('node:test');
const assert = require('node:assert/strict');
const { page, sleep, J } = require('./harness');

for (const zip of [true, false]) test(`Export/Import ${zip ? 'komprimiert' : 'unkomprimiert'}`, async () => {
  const A = { 't1:DE000TESTKO1': '6.9', p1: 40, bases: J({ DE000TESTKO1: 95 }), 'done:DE000TESTKO1': J({ 1: { qty: 38 } }), 'snap:DE000TESTKO1': '{"x":1}', pending: 'null' };
  const mk = store => { const p = page({ url: 'https://mein.finanzen-zero.net/instrument/DE000TESTKO1', store });
    if (zip) Object.assign(p.w, { CompressionStream, DecompressionStream, Response, Blob }); return p; };
  const a = mk(A); a.$('#ex').click(); await sleep(200);
  assert.match(a.w.__clip, zip ? /^KOTP1z\./ : /^KOTP1\./);
  const B = { p1: 50 }; const b = mk(B);
  b.w.prompt = () => a.w.__clip; b.w.confirm = () => true; b.w.location.reload = () => {};
  b.$('#im').click(); await sleep(200);
  assert.equal(B['t1:DE000TESTKO1'], '6.9'); assert.equal(B.p1, 40); assert.equal(B['done:DE000TESTKO1'], A['done:DE000TESTKO1']);
  assert.equal(B['snap:DE000TESTKO1'], undefined, 'Snapshots werden nicht übertragen');
});
