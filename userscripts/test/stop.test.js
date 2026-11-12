const test = require('node:test');
const assert = require('node:assert/strict');
const { page, sleep, J, ISIN, SNAP } = require('./harness');

const A = ISIN.cu;
const URL = `https://mein.finanzen-zero.net/meindepot/kaufenverkaufen?isin=${A}&direction=sell&quantity=57`;
// Maske mit Limit-, Stop- und OCO-Umschalter; Stop/OCO blenden ihre Felder erst nach dem Anwählen ein
const MASK = '<div><span>Anzahl eingeben</span><input type="number" aria-label="Anzahl eingeben" value="57"></div>' +
  '<div data-zid="limit-order">Limit</div><div data-zid="oco-order">OCO</div><div data-zid="stop-order">Stop</div>';
const hit = () => J({ ...SNAP.cu, ask: 12.0, bid: 11.95, fxoAt: Date.now(), tsAt: Date.now() });   // Kurs über Z1
const store = extra => Object.assign({ bases: J({ [A]: 95 }), p1: 40, p2: 40, p3: 20, ['t1:' + A]: '6.9', ['t2:' + A]: '7.6', ['t3:' + A]: '7.96', ['snap:' + A]: hit() }, extra);

function mask(st, avail) {
  const p = page({ url: URL, text: `${avail} von ${avail} verfügbaren Stücken`, html: MASK, store: st });
  const tog = (zid, fieldsHtml) => {
    const b = p.$(`[data-zid="${zid}"]`);
    b.addEventListener('click', () => setTimeout(() => { b.textContent = b.textContent + ' abwählen'; p.w.document.body.insertAdjacentHTML('beforeend', fieldsHtml); }, 200));
  };
  tog('stop-order', '<div><label>Stop Wert</label><input type="text" id="stp"></div>');
  tog('oco-order', '<div><label>Limit Wert</label><input type="text" id="lim"></div><div><label>Stop Wert</label><input type="text" id="stp"></div>');
  return p;
}

test('Reminder bei Z1 zeigt Stop- und OCO-Buttons', () => {
  const p = page({ url: 'https://mein.finanzen-zero.net/instrument/' + A, store: store() });
  assert.match(p.$('#slrem').textContent, /Z1 erreicht/);
  assert.ok(p.$('#slrem [data-sl="stop"]'));
  assert.equal(p.w.document.querySelectorAll('#slrem [data-sl="oco"]').length, 2);
});

test('Stop → Maske: freie Stücke, Stop auf Einstand', async () => {
  const p = mask(store(), 57);
  p.$('#slrem [data-sl="stop"]').click(); await sleep(1500);
  assert.equal(p.$('input[type=number]').value, '57');
  assert.equal(p.$('#stp').value, '5,26');
  assert.equal(JSON.parse(p.store.lastfill).kind, 'stop');
});

test('Stop → Maske ohne freie Stücke -> Hinweis auf OCO', async () => {
  const p = mask(store(), 0);
  p.$('#slrem [data-sl="stop"]').click(); await sleep(300);
  assert.match(p.$('#msg').textContent, /als OCO/);
});

test('Z2 als OCO: Limit-Order vorher löschen (Rückfrage), dann Limit = TP2 und Stop = Einstand', async () => {
  const st = store({ ['done:' + A]: J({ 2: { qty: 38, price: 17.14, ts: 1, status: 'offen' } }) });
  const p = mask(st, 38);
  p.w.confirm = () => true;
  p.$('#slrem [data-sl="oco"][data-n="2"]').click(); await sleep(1500);
  assert.equal(p.$('input[type=number]').value, '38');
  assert.equal(p.$('#stp').value, '5,26');
  assert.equal(p.$('#lim').value, (10 * (7.6 - 5.6896) / 1.1148).toFixed(2).replace('.', ','));
  assert.equal(JSON.parse(st['done:' + A])[2], undefined, 'alte Limit-Zuordnung entfernt');
});

test('Nach Abschicken der OCO: Häkchen (OCO) und Reminder erledigt', () => {
  const st = store({ lastfill: J({ n: 2, kind: 'oco', isin: A, qty: 38, price: 17.14, stop: 5.26, ts: Date.now() }) });
  page({ url: URL, text: 'Bitte prüfe Deine Orderdaten\nKauf / Verkauf\nVerkauf\nOrderart\nOCO\nLimitpreis\n17,14 €\nAnzahl\n38', store: st });
  page({ url: URL, text: 'Deine Order wurde erfolgreich aufgegeben.', store: st });
  const d = JSON.parse(st['done:' + A]);
  assert.equal(d[2].oco, true); assert.equal(d[2].stop, 5.26);
  assert.ok(+st['slok:' + A] > 0);
});

test('Bestätigungsseite: OCO/Stop ohne Warnung, Marktorder mit Warnung', () => {
  const html = '<div><button>ORDER KOSTENPFLICHTIG AUFGEBEN</button></div>';
  for (const [art, warn] of [['OCO', false], ['Stop', false], ['Limit', false], ['Markt', true]]) {
    const p = page({ url: URL, text: `Bitte prüfe Deine Orderdaten\nOrderart\n${art}\nAnzahl\n6`, html, store: {} });
    assert.equal(!!p.w.document.getElementById('ko-limit-banner'), warn, art);
  }
});
