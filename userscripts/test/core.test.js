const test = require('node:test');
const assert = require('node:assert/strict');
const { core } = require('./harness');
const { parse, plan, tpPrice, underlyingInfo } = core();

test('parse: Kupfer-Produktseite', () => {
  const d = parse('Knock-Out: 5,6896 $\nAsk\n5,640€\nBasiswert: COMEX Kupfer\nKeine Werte vorhanden\nAbstand Knock-Out\n0,6314 $\nBezugsverhältnis\n10,00\nMeine Position  (95 Stück)\nEinstandskurs\n5,261 €');
  assert.equal(d.ko, 5.6896); assert.equal(d.cur, '$'); assert.equal(d.abs, 0.6314);
  assert.equal(d.bv, 10); assert.equal(d.bvOk, true); assert.equal(d.qty, 95); assert.equal(d.ek, 5.261);
  assert.equal(d.uname, 'COMEX Kupfer');
});

test('parse: Platzhalter "Keine Werte vorhanden" ist kein Name, KO in €', () => {
  assert.equal(parse('Basiswert: Keine Werte vorhanden').uname, null);
  const d = parse('Knock-Out: 996,9697 €\nBasiswert: ASML NV\n1.390,80\nEUR');
  assert.equal(d.cur, '€'); assert.equal(d.und, 1390.8); assert.equal(d.ucur, '€');
});

test('plan: Aufteilung Z1-Z3', () => {
  assert.deepEqual(plan(95, [40, 40, 20]), [38, 38, 19]);
  assert.deepEqual(plan(95, [40, 60, 0]), [38, 57, 0]);
  assert.deepEqual(plan(95, [50, 50, 0]), [48, 47, 0]);
  assert.deepEqual(plan(95, [30, 30, 100]), [29, 29, 37]);
  assert.deepEqual(plan(95, [40, 40, 0]), [38, 38, 0]);
});

test('tpPrice: aus Preis + EUR/USD = BV * (Ziel - KO) / EURUSD', () => {
  const d = { ko: 5.6896, cur: '$', abs: 0.5784, ask: 5.26, bv: 10, bvOk: true, fxo: 1.1167, fxoAt: Date.now() };
  assert.equal(underlyingInfo(d).src, 'preis');
  assert.ok(Math.abs(tpPrice(d, 8).price - 10 * (8 - 5.6896) / 1.1167) < 1e-9);
});

test('underlyingInfo: Basiswert in EUR, KO in USD (impliziter Wechselkurs)', () => {
  const d = { ko: 252.8593, cur: '$', abs: 79.9187, ask: 7.13, bv: 0.1, bvOk: true, und: 298.25, ucur: '€' };
  const r = underlyingInfo(d);
  assert.equal(r.src, 'basiswert'); assert.ok(Math.abs(r.S - 332.3) < 0.1);
});

test('underlyingInfo: falsches Bezugsverhältnis wird verworfen', () => {
  const d = { ko: 295.9355, cur: '$', abs: 75, ask: 8.43, bv: 1, bvOk: true, und: 349, ucur: '€' };
  assert.equal(underlyingInfo(d).src, 'stale');
});

test('underlyingInfo: veralteter EUR/USD (> 3 Tage) -> Kennzahlen', () => {
  const d = { ko: 5.6896, cur: '$', abs: 0.5784, ask: 5.26, bv: 10, bvOk: true, fxo: 1.1167, fxoAt: Date.now() - 5 * 86400000 };
  assert.equal(underlyingInfo(d).src, 'stale');
});
