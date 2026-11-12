const test = require('node:test');
const assert = require('node:assert/strict');
const { page, sleep, ISIN, PAGE } = require('./harness');

test('Produktwechsel (SPA): alter Inhalt wird nicht unter neuer ISIN gespeichert', async () => {
  const p = page({ url: 'https://mein.finanzen-zero.net/instrument/' + ISIN.cu, text: { v: PAGE.cu } });
  assert.equal(p.store['snap:' + ISIN.cu], undefined, 'erst nach zweiter Prüfung speichern');
  await sleep(1500);
  assert.equal(JSON.parse(p.store['snap:' + ISIN.cu]).qty, 95);

  p.w.history.pushState(null, '', '/instrument/' + ISIN.arm);            // Adresse neu, Inhalt noch Kupfer
  p.$('#t1').dispatchEvent(new p.w.Event('input', { bubbles: true }));
  await sleep(1500);
  assert.equal(p.store['snap:' + ISIN.arm], undefined);

  p.text.v = PAGE.arm;                                                    // Inhalt kommt an
  p.$('#t1').dispatchEvent(new p.w.Event('input', { bubbles: true }));
  await sleep(1500);
  const s = JSON.parse(p.store['snap:' + ISIN.arm]);
  assert.equal(s.uname, 'Arm Holdings'); assert.equal(s.qty, 141);
  assert.equal(JSON.parse(p.store.bases)[ISIN.cu], 95, 'Kupfer-Basis unverändert');
});

test('Eigene Anzeige ("Alle Trades") wird nicht als Seiteninhalt gelesen (keine aufschaukelnde Basis)', async () => {
  const A = ISIN.cu;
  const store = { bases: JSON.stringify({ [A]: 95 }), ['snap:' + A]: JSON.stringify({ uname: 'Kupfer', ko: 5.6896, cur: '$', abs: 0.63, ask: 5.64, bid: 5.63, bv: 10, bvOk: true, fxo: 1.1148, fxoAt: Date.now(), ek: 5.261, qty: 95, tsAt: Date.now() }) };
  const html = `<div>Positionen<div>Kupfer</div><div>${A}</div><div>95</div><div>95</div><div>5,261 €</div></div><div>Orders Offen Ausgeführt Gestrichen</div>`;
  const p = page({ url: 'https://mein.finanzen-zero.net/uebersicht#ko-dashboard', text: { v: 'dom' }, html, store });
  const seq = [];
  for (let i = 0; i < 2; i++) {
    await sleep(4300);
    p.w.document.body.insertAdjacentHTML('beforeend', '<p></p>');
    await sleep(1700);
    seq.push(JSON.parse(store.bases)[A]);
  }
  assert.deepEqual(seq, [95, 95]);
});

test('Buttons neben ISINs: keine Duplikate, keine im Dashboard', async () => {
  const A = ISIN.cu;
  const p = page({ url: 'https://mein.finanzen-zero.net/uebersicht', text: 'Orders', html: `<div><span>${A}</span><span>☆</span></div><div><span>${A}</span></div>`, store: { bases: JSON.stringify({ [A]: 95 }) } });
  p.w.document.querySelector('span').insertAdjacentHTML('afterend', '<i>x</i>');
  p.w.document.body.insertAdjacentHTML('beforeend', '<p></p>');
  await sleep(1700);
  assert.equal(p.w.document.querySelectorAll('.ko-open').length, 2);
  p.$('.ko-open').click(); p.$('#dash').click();
  await sleep(1700);
  assert.equal(p.w.document.querySelectorAll('#ko-dash .ko-open').length, 0);
});
