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

test('Alter Snapshot (ohne Produktseite) belebt verkaufte Position nicht wieder', () => {
  const store = { bases: J({ [B]: 141 }), ['snap:' + A]: snapNow(SNAP.cu) };   // A verkauft, Snapshot hat noch qty 95
  page({ url: `https://mein.finanzen-zero.net/meindepot/kaufenverkaufen?isin=${A}&direction=sell&quantity=10`, store });
  assert.deepEqual(Object.keys(JSON.parse(store.bases)), [B]);
});

test('Meine Orders (ohne Positionstabelle): offene Orders werden den Zielen zugeordnet', () => {
  const store = { bases: J({ [A]: 95 }), p1: 40, p2: 40, p3: 20, ['t1:' + A]: '6.9', ['t2:' + A]: '7.6', ['t3:' + A]: '7.96', ['snap:' + A]: snapNow(SNAP.cu) };
  const r = (q, lim, w) => `HSBC OE-Turbo Test Call\n5.69\n${A} ☆\n${q}\noffen\nLimit\n${lim} €\n11.11.26\n30.12.26\nVerkauf\n${w} €\n09:49:39\n8,190 €\n`;
  const text = 'Orders\nOffen\nAusgeführt\nGestrichen\nName↓\nISIN↓\nAnzahl\nStatus\nOrderart\nStop / Limit\nErstelldatum\nGültigkeit\nRichtung\nWert\nKurszeit\nKurs\n' +
    r(19, '20,30', '385,70') + r(38, '17,10', '649,80') + r(38, '10,80', '410,40');
  page({ url: 'https://mein.finanzen-zero.net/meine-orders', store, text });
  const dn = JSON.parse(store['done:' + A]);
  assert.deepEqual([1, 2, 3].map(n => dn[n] && dn[n].price), [10.8, 17.1, 20.3]);
  assert.equal(JSON.parse(store['oo:' + A]).list.length, 3);
});

test('Alle Trades: Spalte "nächstes Ziel" überspringt ausgeführte Ziele und ist sortierbar', () => {
  const store = { bases: J({ [A]: 95 }), ['t1:' + A]: '6.0', ['t2:' + A]: '7.6', ['t3:' + A]: '7.96', ['snap:' + A]: snapNow(SNAP.cu),
    ['done:' + A]: J({ 1: { qty: 38, price: 3, status: 'ausgeführt', ts: 1 } }) };
  const p = page({ url: 'https://mein.finanzen-zero.net/uebersicht#ko-dashboard', store });
  const th = [...p.w.document.querySelectorAll('#ko-dash th')].find(e => /nächstes Ziel/.test(e.textContent));
  assert.equal(th.dataset.k, 'nxP');
  const row = [...p.w.document.querySelectorAll('#ko-dash tr')][1];
  assert.match(row.children[5].textContent, /Z2/);
});
