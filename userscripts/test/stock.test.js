const test = require('node:test');
const assert = require('node:assert/strict');
const { core, page, sleep, J } = require('./harness');
const { parse, tpPrice, underlyingInfo } = core();

const NV = 'US67066G1040';
// gekürzt nach dem echten Seitentext (inkl. Derivate-Liste mit $-KO-Werten, die nicht stören dürfen)
const NVPAGE = `Finanzen invest\nPortfolio\nicon\nNVIDIA Corp.\nAI Analyse\n152,32\nHeute\n+ 0,54 €\nISIN:\n${NV}\n3.667,55 Mrd. €\nKGV:\n38,32\n` +
  `Derivate auf NVIDIA Corp.\nHebel\nKO\nEmittent / Ask\nMorgan Stanley OE Turbo Long NVIDIA 159.21\nMorgan Stanley\nmehr Infos\n9,924\n159,21 $\n1,58\nopen-end\n` +
  `Verkaufen\n152,32 €\nKaufen\n152,60 €\nKursinformationen\nKurszeit\n11.11.2026\n`;
const POS = 'Meine Position (10 Stück)\nEinstandskurs\n140,00 €\nVerfügbar\n10\n';

test('parse: Aktie erkannt (Name, Bid/Ask, keine KO-Werte)', () => {
  const d = parse(NVPAGE + POS);
  assert.equal(d.stock, true); assert.equal(d.uname, 'NVIDIA Corp.');
  assert.equal(d.bid, 152.32); assert.equal(d.ask, 152.6); assert.equal(d.ko, undefined);
  assert.equal(d.qty, 10); assert.equal(d.ek, 140); assert.equal(d.free, 10);
});

test('Aktie: Ziele in $ über EUR/USD, in € direkt', () => {
  const d = { stock: true, bid: 152.32, ask: 152.6, tcur: '$', fxo: 1.1148 };
  assert.ok(Math.abs(underlyingInfo(d).S - 152.46 * 1.1148) < 1e-9);
  assert.ok(Math.abs(tpPrice(d, 200).price - 200 / 1.1148) < 1e-9);
  d.tcur = '€'; assert.equal(tpPrice(d, 170).price, 170);
});

test('Rechner auf der Aktienseite: Stop-Feld, CRV, Positionsgröße, Snapshot', async () => {
  const store = { eurusd: J({ v: 1.1148, ts: Date.now() }), bases: J({ [NV]: 10 }), p1: 50, p2: 50, p3: 0, ['t1:' + NV]: '190', ['t2:' + NV]: '210', ['stop:' + NV]: '155' };
  const p = page({ url: 'https://mein.finanzen-zero.net/instrument/' + NV, text: NVPAGE + POS, store });
  await sleep(1500);
  assert.equal(JSON.parse(store['snap:' + NV]).stock, true);
  assert.notEqual(p.$('#stockrow').style.display, 'none');
  assert.equal(p.$('#tcur').value, '$', 'US-ISIN: Ziele in $ vorbelegt');
  const out = p.$('#out').textContent;
  assert.match(out, /Stop 155,00 \$/);
  const S = 152.46 * 1.1148, crv1 = (190 - S) / (S - 155);
  assert.match(out, new RegExp(crv1.toFixed(2).replace('.', ',')));
  assert.match(out, /170,43 €/, 'TP Z1 = 190 $ / 1,1148');
  const rps = 152.6 - 155 / 1.1148, n = Math.floor((10000 * 2 / 100) / rps);
  assert.match(out, new RegExp(`bis Stop = ${n} Stk`));
  assert.equal(p.$('#sub').textContent, 'NVIDIA Corp. · ' + NV);
});

test('Aktie ohne EUR/USD und $-Ziele: Hinweis statt falscher Zahlen', async () => {
  const p = page({ url: 'https://mein.finanzen-zero.net/instrument/' + NV, text: NVPAGE, store: { ['t1:' + NV]: '190' } });
  await sleep(1500);
  assert.match(p.$('#out').textContent, /EUR\/USD fehlt/);
});

test('Alle Trades: Aktie mit Stop-Abstand und Risiko bis Stop', () => {
  const store = { eurusd: J({ v: 1.1148, ts: Date.now() }), bases: J({ [NV]: 10 }), ['t1:' + NV]: '190', ['stop:' + NV]: '155',
    ['snap:' + NV]: J({ stock: true, uname: 'NVIDIA Corp.', cur: '€', bid: 152.32, ask: 152.6, ek: 140, qty: 10, tsAt: Date.now() }) };
  const p = page({ url: 'https://mein.finanzen-zero.net/uebersicht#ko-dashboard', store });
  const row = [...p.w.document.querySelectorAll('#ko-dash tr')][1];
  assert.match(row.children[0].textContent, /NVIDIA/);
  assert.match(row.children[4].textContent, /Stop 155,00/);
  const risk = 10 * (140 - 155 / 1.1148);
  assert.match(p.$('#ko-dash .cards').textContent, new RegExp('−' + Math.round(risk) + ' €'));
});
