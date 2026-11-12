const test = require('node:test');
const assert = require('node:assert/strict');
const { page, J, ISIN } = require('./harness');

const A = ISIN.cu;
const HEAD = 'Orders\nOffen\nAusgeführt\nGestrichen\nAnzahl\nStatus\tOrderart\n';
const pos = (a, b) => `Gesamt\n1.000,00\n€\nKupfer\n${A}\n\t\n${a}\n${b}\n\t\n5,261 €\n`;
const row = (q, st, art, px, rest) => `Kupfer\n${A}\n${q}\n${st}\n${art}\n${px ? px + ' €\n' : ''}${rest}\n`;
const old = Date.now() - 600000;
const twoOpen = () => J({ 1: { qty: 38, price: 11.97, ts: old, status: 'offen' }, 2: { qty: 38, price: 18.83, ts: old + 1000, status: 'offen' } });
function run(done, text) {
  const store = { bases: J({ [A]: 95 }), ['done:' + A]: done };
  page({ url: 'https://mein.finanzen-zero.net/uebersicht', text, store });
  return JSON.parse(store['done:' + A] || '{}');
}

test('Häkchen bleiben, wenn beide Orders offen sind', () => {
  const r = run(twoOpen(), pos(95, 19) + HEAD + row(38, 'offen', 'Limit', '18,83', '11.11.26\n30.12.26\nVerkauf\n715,54 €') + row(38, 'offen', 'Limit', '11,97', '11.11.26\n30.12.26\nVerkauf\n454,86 €'));
  assert.deepEqual(Object.keys(r), ['1', '2']); assert.equal(r[1].status, 'offen');
});

test('Storniert: nicht mehr offen, Bestand unverändert -> Häkchen weg', () => {
  const r = run(twoOpen(), pos(95, 57) + HEAD + row(38, 'offen', 'Limit', '18,83', '11.11.26\n30.12.26\nVerkauf\n715,54 €'));
  assert.deepEqual(Object.keys(r), ['2']);
});

test('Ausgeführt: nicht mehr offen, Bestand -38 -> ✓✓', () => {
  const r = run(twoOpen(), pos(57, 57) + HEAD + row(38, 'offen', 'Limit', '18,83', '11.11.26\n30.12.26\nVerkauf\n715,54 €'));
  assert.equal(r[1].status, 'ausgeführt'); assert.equal(r[2].status, 'offen');
});

test('Offene Orders ohne Häkchen werden den Zielen zugeordnet', () => {
  const B = ISIN.arm;
  const store = { bases: J({ [B]: 141 }), p1: 40, p2: 40, p3: 20, ['t1:' + B]: '409', ['t2:' + B]: '545', ['t3:' + B]: '570',
    ['snap:' + B]: J({ ko: 146.7213, cur: '$', abs: 48, ask: 3.96, bid: 3.95, bv: 0.1, bvOk: true, fxo: 1.1148, fxoAt: Date.now(), qty: 141 }),
    ['done:' + B]: J({ 1: { qty: 56, price: 24.03, ts: old, status: 'offen' } }) };
  const r2 = (q, px) => `ARM\n${B}\n${q}\noffen\nLimit\n${px} €\n11.11.26\n30.12.26\nVerkauf\n1,00 €\n`;
  page({ url: 'https://mein.finanzen-zero.net/uebersicht', text: `ARM\n${B}\n\t\n141\n0\n\t\n3,557 €\n` + HEAD + r2(29, '38,62') + r2(56, '36,49') + r2(56, '24,03'), store });
  const d = JSON.parse(store['done:' + B]);
  assert.equal(d[2].price, 36.49); assert.equal(d[3].price, 38.62); assert.equal(d[1].price, 24.03);
});

test('Haltedauer: Kaufdatum aus "Ausgeführt", Löschen bei geschlossener Position', () => {
  const store = { bases: J({ [A]: 95 }) };
  page({ url: 'https://mein.finanzen-zero.net/uebersicht', store,
    text: pos(95, 95) + HEAD + row(95, 'ausgeführt', 'Markt', '5,26', '28.10.26\n10:15:00\nKauf\n-499,75 €') });
  const sv = JSON.parse(store['since:' + A]);
  assert.equal(sv.src, 'order'); assert.equal(new Date(sv.t).getDate(), 28);
  page({ url: 'https://mein.finanzen-zero.net/uebersicht', store, text: `Andere\n${ISIN.arm}\n\t\n141\n141\n\t\n3,68 €\n` });
  assert.equal(store['since:' + A], 'null');
});
