// Testumgebung: führt das Userscript in jsdom aus, mit Tampermonkey-Funktionen als In-Memory-Speicher.
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'ko-tp-rechner', 'ko-tp-rechner.user.js');
const SRC = fs.readFileSync(FILE, 'utf8');

// Reine Rechenfunktionen (Block zwischen //<core und //</core)
function core() {
  const a = SRC.indexOf('//<core'), b = SRC.indexOf('//</core');
  return new Function(SRC.slice(a, b) + '\nreturn { num, pick, parse, plan, tpPrice, limitU, underlying, underlyingInfo };')();
}

// innerText-Nachbildung: sichtbarer Text, display:none wird ausgelassen (wie im Browser)
function visibleText(w) {
  const out = [], tw = w.document.createTreeWalker(w.document.body, 4);
  const shown = el => { for (let e = el; e && e.nodeType === 1; e = e.parentElement) if (e.style && e.style.display === 'none') return false; return true; };
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    if (n.parentElement.closest('style, script')) continue;
    const v = n.nodeValue.trim();
    if (v && shown(n.parentElement)) out.push(v);
  }
  return out.join('\n');
}

/**
 * page({ url, text, html, store, realInterval })
 *  text: String (fester Seitentext) | { v } (änderbar) | 'dom' (aus dem DOM berechnet)
 */
function page({ url, text = '', html = '', store = {}, realInterval = false } = {}) {
  const w = new JSDOM('<body>' + html + '</body>', { url, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole() }).window;
  w.HTMLElement.prototype.getClientRects = function () { return [1]; };
  const t = typeof text === 'object' ? text : { v: text };
  Object.defineProperty(w.document.body, 'innerText', { get: () => (t.v === 'dom' ? visibleText(w) : t.v) });
  w.GM_getValue = (k, d) => (k in store ? store[k] : d);
  w.GM_setValue = (k, v) => { store[k] = v; };
  w.GM_listValues = () => Object.keys(store);
  w.GM_setClipboard = s => { w.__clip = s; };
  w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;
  if (!realInterval) w.setInterval = () => 1;
  w.eval(SRC);
  return { w, store, text: t, $: sel => w.document.querySelector(sel) };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const J = v => JSON.stringify(v);

// Beispieldaten (aus echten Seiten nachgebildet)
const ISIN = { cu: 'DE000TESTKO1', arm: 'DE000TESTAR2', asml: 'DE000TESTAS3' };
const PAGE = {
  cu: `ISIN: ${ISIN.cu}\nHebel: 9,9405\nKnock-Out: 5,6896 $\nBid\n5,630€\n+ 0,380 €\n+ 7,24 %\n09:52:20\nAsk\n5,640€\n+ 0,380 €\n+ 7,22 %\n09:52:20\nBasiswert: COMEX Kupfer (Copper) Rolling Future\nKeine Werte vorhanden\nBerechnungszeitpunkt\n11.11.2026 09:19:47\nAbstand Knock-Out\n0,6314 $\nBezugsverhältnis\n10,00\nMeine Position (95 Stück)\nEinstandskurs\n5,261 €\nVerfügbar\n95`,
  arm: `ISIN: ${ISIN.arm}\nKnock-Out: 146,7213 $\nBid\n4,240€\nAsk\n4,310€\nBasiswert: Arm Holdings\n173,32\nEUR\nAbstand Knock-Out\n46,9598 $\nBezugsverhältnis\n0,10\nMeine Position (141 Stück)\nEinstandskurs\n3,680 €`,
};
const SNAP = {
  cu: { uname: 'COMEX Kupfer', ko: 5.6896, cur: '$', abs: 0.6314, ask: 5.64, bid: 5.63, bv: 10, bvOk: true, fxo: 1.1148, ek: 5.261, qty: 95 },
};
const snapNow = s => J({ ...s, fxoAt: Date.now(), tsAt: Date.now() });

module.exports = { SRC, core, page, sleep, J, ISIN, PAGE, SNAP, snapNow, visibleText };
