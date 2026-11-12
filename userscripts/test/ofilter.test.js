const test = require('node:test');
const assert = require('node:assert/strict');
const { page, J, ISIN, SNAP, snapNow } = require('./harness');

const A = ISIN.cu, B = ISIN.arm;

test('Alle Trades: Klick auf ein Ziel merkt den Filter fürs Produkt', () => {
  const store = { bases: J({ [A]: 95 }), ['t1:' + A]: '6.9', ['snap:' + A]: snapNow(SNAP.cu) };
  const p = page({ url: 'https://mein.finanzen-zero.net/uebersicht#ko-dashboard', store });
  const cell = p.$('#ko-dash td.zc');
  assert.ok(cell); cell.querySelector('b').click();
  assert.equal(JSON.parse(store.ofilter).id, A);
});

const row = (id, q) => `<div class="r"><span>HSBC Turbo</span><span>${id}</span><span>${q}</span><span>offen</span></div>`;
const LIST = `<main><h1>Orders</h1><div class="list">${row(A, 38)}${row(B, 56)}${row(A, 19)}${row(B, 29)}</div></main>`;

test('meine-orders: nur Zeilen des Instruments sichtbar, "Alle zeigen" hebt den Filter auf', () => {
  const store = { ofilter: J({ id: A, name: 'Kupfer' }) };
  const p = page({ url: 'https://mein.finanzen-zero.net/meine-orders', html: LIST, store });
  const vis = () => [...p.w.document.querySelectorAll('.r')].map(e => e.style.display !== 'none');
  assert.deepEqual(vis(), [true, false, true, false]);
  assert.match(p.$('#ko-ofilter').textContent, /Gefiltert: Kupfer/);
  p.$('#ko-ofilter [data-act="ofoff"]').click();
  assert.deepEqual(vis(), [true, true, true, true]);
  assert.equal(p.$('#ko-ofilter'), null); assert.equal(store.ofilter, 'null');
});

test('Filter endet beim Verlassen der Orders-Seite', () => {
  const store = { ofilter: J({ id: A }) };
  page({ url: 'https://mein.finanzen-zero.net/uebersicht', store });
  assert.equal(store.ofilter, 'null');
});
