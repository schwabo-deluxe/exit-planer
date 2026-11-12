const test = require('node:test');
const assert = require('node:assert/strict');
const { page, sleep, J, ISIN, SNAP, snapNow } = require('./harness');

const A = ISIN.cu;
const URL = `https://mein.finanzen-zero.net/meindepot/kaufenverkaufen?isin=${A}&direction=sell&quantity=95`;
const MASK = '<div><span>Anzahl eingeben</span><input type="number" aria-label="Anzahl eingeben" value="95"></div><div data-zid="limit-order">Limit</div>';
const base = () => ({ bases: J({ [A]: 95 }), p1: 40, p2: 40, p3: 20, ['t1:' + A]: '6.9', ['snap:' + A]: snapNow(SNAP.cu) });

async function fill(activate) {
  const p = page({ url: URL, text: '95 von 95 verfügbaren Stücken', html: MASK, store: base() });
  const btn = () => p.$('[data-zid="limit-order"]');
  btn().addEventListener('click', () => activate && setTimeout(() => { btn().textContent = 'Limit abwählen'; p.w.document.body.insertAdjacentHTML('beforeend', '<div><label>Limit Wert</label><input type="text" id="lim"></div>'); }, 300));
  p.$('#f1').click();
  await sleep(activate ? 1500 : 4000);
  return p;
}

test('Verkaufsmaske: Menge und Limit werden eingetragen (nichts abgeschickt)', async () => {
  const p = await fill(true);
  assert.equal(p.$('input[type=number]').value, '38');
  assert.equal(p.$('#lim').value, '10,86');
  assert.equal(p.$('#warn').textContent, '');
  assert.ok(JSON.parse(p.store.lastfill).qty === 38);
});

test('Limit lässt sich nicht anwählen -> Warnung, kein Limitpreis', async () => {
  const p = await fill(false);
  assert.match(p.$('#warn').textContent, /LIMIT NICHT ANGEWÄHLT/);
  assert.equal(p.$('#lim'), null);
});

test('TP nicht über Bid -> wird nicht gefüllt', async () => {
  const store = base(); store['t1:' + A] = '5.70';
  const p = page({ url: URL, text: '95 von 95 verfügbaren Stücken', html: MASK, store });
  p.$('#f1').click(); await sleep(300);
  assert.match(p.$('#msg').textContent, /nicht über Bid/);
});

test('Doppelte Order verhindert, wenn Ziel schon gesetzt', async () => {
  const store = base(); store['done:' + A] = J({ 1: { qty: 38, price: 10.86, ts: 1, status: 'offen' } });
  const p = page({ url: 'https://mein.finanzen-zero.net/instrument/' + A, text: '', store });
  p.$('#f1').click();
  assert.match(p.$('#msg').textContent, /schon gesetzt/);
  assert.equal(store.pending, undefined);
});
