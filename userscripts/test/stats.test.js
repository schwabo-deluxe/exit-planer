const test = require('node:test');
const assert = require('node:assert/strict');
const { core, page, J, ISIN } = require('./harness');
const { parseDepot, tradeStats } = core();

const A = ISIN.cu, B = ISIN.arm, C = ISIN.asml;
const DEP = 'Meine Gesamtentwicklung\nDepotwert\t1.000,00 €\nCash-Bestand\t50,00 €\nGesamt (Depot + Cash)\t1.050,00 €\nEinzahlungen\t5.000,00 €\nAuszahlungen\t4.200,00 €\nSumme Depot Ein- und Ausgänge\t0,00 €\nPerformance auf Einlage\t31,25 %\n';

test('parseDepot: Gewinn = Depot + Cash + Auszahlungen − Einzahlungen, Rendite wie die Seite', () => {
  const d = parseDepot(DEP);
  assert.ok(Math.abs(d.profit - 250) < 1e-9); assert.ok(Math.abs(d.net - 800) < 1e-9); assert.ok(Math.abs(d.perf - 31.25) < 1e-9);
});

const day = n => new Date(2026, 9, n, 10).getTime();
const K = (isin, n, qty, wert) => ({ isin, at: day(n), side: 'Kauf', qty, price: wert / qty, wert: -wert });
const V = (isin, n, qty, wert) => ({ isin, at: day(n), side: 'Verkauf', qty, price: wert / qty, wert });

test('tradeStats: FIFO, Teilverkäufe, Winrate, CRV, Profit-Faktor, Verkauf ohne Kauf', () => {
  const s = tradeStats([
    K(A, 1, 100, 500), V(A, 3, 40, 300), V(A, 5, 60, 480),                 // +280 in 4 Tagen
    K(B, 2, 50, 400), V(B, 4, 50, 300),                                    // −100 in 2 Tagen
    K(B, 6, 10, 100), V(B, 7, 10, 160),                                    // +60 in 1 Tag (neuer Trade)
    V(C, 1, 5, 50),                                                        // Kauf vor der Aufzeichnung
    K(C, 8, 20, 200),                                                      // noch offen
  ]);
  assert.equal(s.n, 3); assert.equal(s.wins, 2); assert.equal(s.losses, 1);
  assert.ok(Math.abs(s.winrate - 66.6667) < 1e-3);
  assert.ok(Math.abs(s.pnl - 240) < 1e-9);
  assert.ok(Math.abs(s.avgWin - 170) < 1e-9); assert.ok(Math.abs(s.avgLoss - 100) < 1e-9);
  assert.ok(Math.abs(s.payoff - 1.7) < 1e-9); assert.ok(Math.abs(s.pf - 3.4) < 1e-9);
  assert.ok(Math.abs(s.avgHold - 7 / 3) < 1e-6);
  assert.equal(s.orphan, 1); assert.equal(s.open.length, 1);
  assert.equal(s.best.isin, A); assert.equal(s.worst.isin, B);
});

test('Ausführungen werden aus "Ausgeführt" gespeichert (ohne Dubletten) und auf /statistik ausgewertet', () => {
  const store = {};
  const HEAD = 'Orders\nOffen\nAusgeführt\nGestrichen\nName\nISIN\nAnzahl\nStatus\nOrderart\nAusführung\nDatum\nUhrzeit\nRichtung\nWert\n';
  const row = (q, px, d, t, side, w) => `X\n${A} ☆\n${q}\nabgerechnet\nMarkt\n${px} €\n${d}\n${t}\n${side}\n${w} €\n`;
  const text = HEAD + row(100, '6,00', '12.11.26', '10:00:00', 'Verkauf', '600,00') + row(100, '5,00', '10.11.26', '09:00:00', 'Kauf', '−500,00');
  page({ url: 'https://mein.finanzen-zero.net/meine-orders', store, text });
  page({ url: 'https://mein.finanzen-zero.net/meine-orders', store, text });
  assert.equal(JSON.parse(store.ex).length, 2);
  const p = page({ url: 'https://mein.finanzen-zero.net/statistik', store, text: DEP, html: '<main><section><h2>Meine Gesamtentwicklung</h2><p>Performance auf Einlage</p></section></main>' });
  const t = p.$('#ko-stats').textContent;
  assert.match(t, /Gewinn gesamt\s*\+250,00 €/);
  assert.match(t, /Winrate\s*100,0 %/);
  assert.match(t, /Bester Trade\s*\+100,00 €/);
  assert.equal(p.$('#ko-stats').previousElementSibling.tagName, 'SECTION', 'Block steht unter der Gesamtentwicklung');
});
