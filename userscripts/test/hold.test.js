const test = require('node:test');
const assert = require('node:assert/strict');
const { page, J, ISIN } = require('./harness');

const A = ISIN.cu;
const HEAD = 'Orders\nOffen\nAusgeführt\nGestrichen\nName\nISIN\nAnzahl\nStatus\nOrderart\nAusführung\nDatum\nUhrzeit\nRichtung\nWert\n';

test('Ausgeführt im echten Format (☆ nach ISIN, Minus U+2212): Kaufzeit wird übernommen', () => {
  const store = { bases: J({ [A]: 260 }), ['since:' + A]: J({ t: Date.now(), src: 'seen' }) };
  const text = `Testprodukt\n${A}\n\t\n260\n260\n\t\n0,98 €\n` + HEAD +
    `HSBC OE-Turbo Test Call\n${A} ☆\n260\nabgerechnet\nMarkt\n0,98 €\n09.11.26\n10:08:37\nKauf\n−254,80 €\n`;
  page({ url: 'https://mein.finanzen-zero.net/uebersicht', store, text });
  const sv = JSON.parse(store['since:' + A]);
  assert.equal(sv.src, 'order');
  const d = new Date(sv.t);
  assert.deepEqual([d.getDate(), d.getMonth(), d.getHours(), d.getMinutes()], [9, 10, 10, 8]);
});

const TL = (rows) => `Zurück\nTestprodukt\nSumme investiert\n498,00 €\nSumme deinvestiert\n0,00 €\nTimeline\nStück\nDatum\nKurs\nTyp\nGesamtwert\nStatus\n${rows}Finanzen invest\n`;
const r = (q, d, px, typ, w, st) => `${q}\n${d}\n${px} €\n${typ}\n${w} €\n${st}\n`;

test('Timeline: Kaufdatum (Valuta) wird übernommen, offene Orders ignoriert', () => {
  const store = { ['since:' + A]: J({ t: Date.now(), src: 'seen' }) };
  page({ url: `https://mein.finanzen-zero.net/instrument/${A}/timeline`, store,
    text: TL(r(28, '—', '11,76', 'Verkauf: Limit', '+329,28', 'offen') + r(140, '12.11.26', '3,56', 'Kauf: Markt', '-498,00', 'abgerechnet')) });
  const sv = JSON.parse(store['since:' + A]);
  assert.equal(sv.src, 'tl'); assert.equal(new Date(sv.t).getDate(), 12);
  assert.ok(+store['tlAt:' + A] > 0);
});

test('Timeline: nach Glattstellung zählt der neue Kauf', () => {
  const store = {};
  page({ url: `https://mein.finanzen-zero.net/instrument/${A}/timeline`, store,
    text: TL(r(50, '05.11.26', '4,00', 'Kauf: Markt', '-200,00', 'abgerechnet') + r(100, '01.10.26', '5,00', 'Verkauf: Limit', '+500,00', 'abgerechnet') +
      r(60, '15.09.26', '3,00', 'Kauf: Markt', '-180,00', 'abgerechnet') + r(40, '10.09.26', '3,00', 'Kauf: Markt', '-120,00', 'abgerechnet')) });
  assert.equal(new Date(JSON.parse(store['since:' + A]).t).getDate(), 5);
});

test('Timeline überschreibt weder "Ausgeführt" noch manuell; "Ausgeführt" überschreibt Timeline', () => {
  const t0 = new Date(2026, 10, 11, 10, 8).getTime();
  for (const src of ['order', 'manual']) {
    const store = { ['since:' + A]: J({ t: t0, src }) };
    page({ url: `https://mein.finanzen-zero.net/instrument/${A}/timeline`, store, text: TL(r(140, '13.11.26', '3,56', 'Kauf: Markt', '-498,00', 'abgerechnet')) });
    assert.equal(JSON.parse(store['since:' + A]).src, src);
  }
  const store = { bases: J({ [A]: 95 }), ['since:' + A]: J({ t: new Date(2026, 10, 13).getTime(), src: 'tl' }) };
  page({ url: 'https://mein.finanzen-zero.net/uebersicht', store,
    text: `Testprodukt\n${A}\n\t\n95\n95\n\t\n5,26 €\n` + HEAD + `X\n${A}\n95\nabgerechnet\nMarkt\n5,26 €\n11.11.26\n10:08:37\nKauf\n-499,75 €\n` });
  const sv = JSON.parse(store['since:' + A]);
  assert.equal(sv.src, 'order'); assert.equal(new Date(sv.t).getHours(), 10);
});

test('Eigene Orders-Seite ohne Positionstabelle: Kaufzeit der laufenden Position (Nachkauf nach Teilverkauf)', () => {
  const B = ISIN.arm;
  const store = { bases: J({ [B]: 141, [A]: 50 }), ['since:' + B]: J({ t: Date.now(), src: 'seen' }) };
  const row = (isin, q, px, d, t, side, w) => `HSBC OE-Turbo Test Call\n${isin}\n\n${q}\nabgerechnet\nMarkt\n${px} €\n${d}\n${t}\n${side}\n${w} €\n\n\n`;
  const text = 'Orders\n\n\n\nOffen\n\nAusgeführt\n\nGestrichen\n\nAnzahl\nStatus\tOrderart\nAusführung\tDatum\n\nWert\t\n' +
    row(B, 29, '4,11', '11.11.26', '08:09:13', 'Kauf', '-119,19') + row(B, 29, '4,08', '11.11.26', '08:00:02', 'Verkauf', '118,32') +
    row(B, 141, '3,55', '10.11.26', '08:45:42', 'Kauf', '-500,55') + row(A, 20, '5,25', '06.11.26', '18:25:53', 'Kauf', '-105,00') + 'Mehr anzeigen\n';
  page({ url: 'https://mein.finanzen-zero.net/uebersicht', store, text });
  const sv = JSON.parse(store['since:' + B]), d = new Date(sv.t);
  assert.equal(sv.src, 'order'); assert.deepEqual([d.getDate(), d.getHours(), d.getMinutes()], [10, 8, 45]);
  const sa = JSON.parse(store['since:' + A]);                 // Liste reicht nicht bis zum Positionsbeginn: nur Untergrenze
  assert.equal(sa.src, 'seen'); assert.equal(new Date(sa.t).getDate(), 6);
  assert.equal(JSON.parse(store.bases)[B], 141, 'Bestände bleiben unangetastet');
});
