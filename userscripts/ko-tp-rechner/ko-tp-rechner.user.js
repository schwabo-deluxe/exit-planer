// ==UserScript==
// @name         KO-Zertifikat TP-Rechner (Finanzen Invest)
// @namespace    max.tools
// @version      1.44
// @match        https://mein.finanzen-zero.net/*
// @updateURL    https://raw.githubusercontent.com/schwabo-deluxe/exit-planer/main/userscripts/ko-tp-rechner/ko-tp-rechner.user.js
// @downloadURL  https://raw.githubusercontent.com/schwabo-deluxe/exit-planer/main/userscripts/ko-tp-rechner/ko-tp-rechner.user.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_listValues
// @grant        GM_setClipboard
// ==/UserScript==

(function () {
  'use strict';

  //<core
  const num = s => parseFloat(s.replace(/\./g, '').replace(',', '.'));
  const pick = (t, re) => { const m = t.match(re); return m ? num(m[1]) : null; };

  function parse(t) {
    const km  = t.match(/Knock-Out:\s*([\d.,]+)\s*([$€])/i);       // KO in $ oder €
    const ko  = km ? num(km[1]) : null, cur = km ? km[2] : '$';
    const abs = pick(t, /Abstand Knock-Out\s+([\d.,]+)\s*[$€]/i);
    const um  = t.match(/Basiswert:[^\n]*\n\s*([\d.,]+)\s*(EUR|USD)\b/);   // aktueller Basiswertkurs (falls angezeigt)
    const und = um ? num(um[1]) : null, ucur = um ? (um[2] === 'EUR' ? '€' : '$') : null;
    const ask = pick(t, /\bAsk\s*([\d.,]+)\s*€/i);
    const bid = pick(t, /\bBid\s*([\d.,]+)\s*€/i);
    const bvm = pick(t, /Bezugsverhältnis\s*([\d.,]+)/i), bv = bvm || 10, bvOk = !!bvm;
    const cm  = t.match(/Berechnungszeitpunkt\s+(\d\d)\.(\d\d)\.(\d{4})\s+(\d\d):(\d\d):(\d\d)/);
    const calcAt = cm ? new Date(+cm[3], +cm[2] - 1, +cm[1], +cm[4], +cm[5], +cm[6]).getTime() : null;
    const am  = t.match(/\bAsk\s*[\d.,]+\s*€\s+[+\-−]?\s*[\d.,]+\s*€\s+[+\-−]?\s*[\d.,]+\s*%\s+(\d\d):(\d\d):(\d\d)/);
    const askAt = am ? (() => { const n = new Date(); n.setHours(+am[1], +am[2], +am[3], 0); return n.getTime(); })() : null;  // nur Uhrzeit = heute, live
    const ek  = pick(t, /Einstandskurs\s*([\d.,]+)\s*€/i);
    const qty = pick(t, /Meine Position\s+\((\d+)\s+Stück\)/i);
    const free = pick(t, /Verfügbar\s+(\d[\d.]*)(?:\s|$)/i);
    const unm = t.match(/Basiswert:[ \t]*([^\n]+)/) || t.match(/Basiswert[ \t]*\n[ \t]*([^\n\d][^\n]*)/);
    const uname = unm && !/keine werte/i.test(unm[1]) ? unm[1].trim() : null;
    // Aktie (kein Hebelprodukt): "Verkaufen <Bid> € Kaufen <Ask> €", Name steht vor "AI Analyse"
    if (!ko) {
      const sm = t.match(/Verkaufen\s+([\d.,]+)\s*€\s+Kaufen\s+([\d.,]+)\s*€/);
      if (sm && /ISIN:\s*[A-Z]{2}[A-Z0-9]{9}\d/.test(t)) {
        const nm = t.match(/(?:^|\n)([^\n]+)\nAI Analyse\n/);
        return { stock: true, uname: nm ? nm[1].trim() : uname, cur: '€', bid: num(sm[1]), ask: num(sm[2]), ek, qty, free };
      }
    }
    return { uname, ko, cur, abs, und, ucur, ask, bid, bv, bvOk, calcAt, askAt, ek, qty, free };
  }

  // Kapital = Gesamt (Depot + Konto) auf der Übersicht
  const parseCap = t => pick(t, /Gesamt\s+([\d.,]+)\s*€/);

  // Underlying: live Basiswertkurs, wenn er in der KO-Währung angezeigt wird, sonst KO + Abstand (Berechnungszeitpunkt)
  function underlyingInfo(d) {
    if (d.stock) {                                   // Aktie: Kurs selbst; Ziele/Stop wahlweise in $ (über EUR/USD) oder €
      const fx = d.tcur === '$' ? d.fxo : 1, mid = d.bid && d.ask ? (d.bid + d.ask) / 2 : d.ask;
      return { S: mid * fx, live: true, src: d.tcur === '$' ? 'aktie-fx' : 'aktie', fx };
    }
    if (d.und && d.ucur === d.cur) return { S: d.und, live: true, src: 'basiswert' };
    if (d.und && d.ucur === '€' && d.cur === '$' && d.bvOk && d.ask > 0) {
      // Basiswert live in EUR, KO in USD: Preis = BV * (S_eur - KO_eur)  ->  KO_eur und damit EURUSD aus dem Live-Paar (Basiswert, Ask)
      const koEur = d.und - d.ask / d.bv;
      if (koEur > 0) { const fx = d.ko / koEur; if (fx > 0.9 && fx < 1.4) return { S: d.und * fx, live: true, src: 'basiswert' }; }
    }
    if (d.cur === '$' && d.bvOk && d.ask > 0 && d.fxo > 0.9 && d.fxo < 1.4 && Date.now() - (d.fxoAt || 0) < 3 * 86400000) {
      // kein Basiswertkurs (z. B. Kupfer): Underlying aus dem Live-Preis des Zertifikats und EUR/USD (Übersicht): Preis = (S - KO) * BV / EURUSD
      return { S: d.ko + d.ask * d.fxo / d.bv, live: true, src: 'preis' };
    }
    return { S: d.ko + d.abs, live: false, src: 'stale' };   // Stand des Berechnungszeitpunkts (kann veraltet sein)
  }
  const underlying = d => underlyingInfo(d).S;

  // Preis = (S - KO) * BV / FX ; FX wird aus aktuellem Ask abgeleitet
  function tpPrice(d, T) {
    if (d.stock) { const fx = d.tcur === '$' ? d.fxo : 1; return { S: underlyingInfo(d).S, fx, price: T / fx }; }
    const S = underlying(d);
    const fx = (S - d.ko) * d.bv / d.ask;
    return { S, fx, price: (T - d.ko) * d.bv / fx };
  }
  // Aufteilung der Position auf Z1..Zn (ps = Prozent je Ziel, bezogen auf die Gesamtposition).
  // Sobald die kumulierten Prozent 100 erreichen, bekommt dieses Ziel den kompletten Rest.
  const plan = (total, ps) => {
    let used = 0, cum = 0;
    return ps.map((p, i) => {
      cum += p;
      let q = cum >= 100 ? total - used : Math.round(total * p / 100);
      if (i === 0 && p > 0) q = Math.max(1, q);
      q = Math.min(total - used, Math.max(0, q));
      used += q;
      return q;
    });
  };
  //</core

  if (typeof document === 'undefined') return;

  const inFrame = (() => { try { return window.top !== window.self; } catch (e) { return true; } })();   // Hintergrund-Abruf läuft in einem unsichtbaren iframe
  let forcedIsin = '', forcedName = '';           // per TP-Button auf Übersicht/Orders gewähltes Produkt
  const onProdOrMask = () => /^\/instrument\//.test(location.pathname) || /kaufenverkaufen/.test(location.pathname);
  const getIsin = () => new URLSearchParams(location.search).get('isin') ||
    (location.pathname.match(/\/instrument\/([A-Z0-9]{12})/) || [])[1] ||
    (!/kaufenverkaufen/.test(location.pathname) ? forcedIsin : '');
  let isin = '';

  // Performance: innerText erzwingt ein Layout -> höchstens alle 300 ms neu lesen; Speicher nur bei Änderung schreiben
  let txtCache = '', txtAt = 0;
  // Eigene Elemente (Rechner, "Alle Trades", Orders-Block, Banner) werden beim Lesen kurz ausgeblendet, damit das Skript
  // nie seine eigenen Zahlen als Seiteninhalt liest (sonst schaukeln sich z. B. Stückzahlen über "Alle Trades" auf).
  const OURS_SEL = '#ko-box, #ko-dash, #ko-orders-block, #ko-limit-banner';
  const pageText = () => {
    const n = Date.now();
    if (n - txtAt > 300) {
      const hid = [...document.querySelectorAll(OURS_SEL)].map(e => [e, e.style.getPropertyValue('display'), e.style.getPropertyPriority('display')]);
      hid.forEach(([e]) => e.style.setProperty('display', 'none', 'important'));
      txtCache = document.body.innerText || '';
      hid.forEach(([e, v, pr]) => { if (v) e.style.setProperty('display', v, pr); else e.style.removeProperty('display'); });
      txtAt = n;
    }
    return txtCache;
  };
  const wrote = new Map();
  const gset = (k, v) => { const sv = JSON.stringify(v); if (wrote.get(k) === sv) return; wrote.set(k, sv); GM_setValue(k, v); };
  const box = document.createElement('div');
  box.id = 'ko-box';
  box.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:99999;width:380px;max-width:calc(100vw - 32px);box-sizing:border-box';
  const css = document.createElement('style');
  css.textContent = `
    #ko-box{background:#17191b;color:#e6e6e6;font:13px/1.45 system-ui,sans-serif;padding:14px;border:1px solid #3a3f44;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.35)}
    #ko-box input,#ko-box select,#ko-box button{background:#24282c;color:#e6e6e6;border:1px solid #444a50;border-radius:5px;padding:3px 6px;font:inherit}
    #ko-box input:disabled{opacity:.6}
    #ko-box button{cursor:pointer}#ko-box button:hover{border-color:#64b5f6}
    #ko-box .ko-hd{display:flex;justify-content:space-between;align-items:center;gap:8px}
    #ko-box .ko-ttl{font-weight:700;color:#64b5f6}
    #ko-box .ko-sub{font-size:12px;color:#b8c2cc;margin:2px 0 10px}
    #ko-box .ko-g{display:grid;grid-template-columns:24px 1fr 74px auto 22px;gap:6px 6px;align-items:center}
    #ko-box .ko-g input{width:100%;box-sizing:border-box}
    #ko-box .ko-z{font-weight:700;color:#64b5f6}
    #ko-box .ko-gh{font-size:11px;color:#8d98a3}
    #ko-box .ko-row{display:flex;gap:8px;align-items:center;margin:10px 0 4px;flex-wrap:wrap}
    #ko-box .ko-sec{border-top:1px solid #2e3338;margin-top:10px;padding-top:8px}
    #ko-box .ko-u b{font-size:15px}
    #ko-box .ko-s{font-size:11.5px;color:#8d98a3}
    #ko-box .ko-meta{font-size:12.5px;line-height:1.55;color:#a3adb7;margin-top:8px}
    #ko-box table{width:100%;border-collapse:collapse;margin-top:6px;font-size:12px}
    #ko-box th{font-weight:500;color:#8d98a3;text-align:right;padding:2px 4px;font-size:11px}
    #ko-box td{text-align:right;padding:3px 4px;border-top:1px solid #262a2e;white-space:nowrap}
    #ko-box td:first-child,#ko-box th:first-child{text-align:left}
    #ko-box .ko-pos{color:#4caf50}#ko-box .ko-neg{color:#ff6b6b}#ko-box .ko-mid{color:#f0c060}
    #ko-box .ko-w{color:#f0c060;font-size:12px}
    #ko-box .ko-sum{display:flex;justify-content:space-between;align-items:baseline;margin-top:8px;padding:6px 8px;background:#1f2a20;border-radius:6px}
    #ko-box .ko-sum b{font-size:15px}
    #ko-box .ko-hb{display:flex;gap:3px;margin-top:4px}#ko-box .ko-hb i{flex:1;height:7px;border-radius:2px;background:#2a2f34}
    #ko-box .ko-rem{background:#3a2a10;border:1px solid #8a6d1f;color:#ffd27a;border-radius:6px;padding:8px 10px;margin:0 0 10px;font-size:12.5px}
    #ko-box .ko-rem button{margin-top:6px}`;
  document.head.appendChild(css);
  box.innerHTML = `
    <div class="ko-hd"><span class="ko-ttl">KO-TP-Rechner v1.44</span>
      <span id="kx" title="schließen" style="cursor:pointer;display:none;padding:0 6px;font-size:16px;line-height:1">×</span></div>
    <div id="sub" class="ko-sub"></div>
    <div id="hold" title="Haltedauer · Klick: Kaufdatum setzen" style="cursor:pointer;margin:-4px 0 10px"></div>
    <div id="slrem"></div>
    <div class="ko-g">
      <span></span><span class="ko-gh">Ziel Underlying</span><span class="ko-gh">Anteil</span><span></span><span></span>
      <span class="ko-z">Z1</span><input id="t1" type="number" step="0.01"><select id="p1"></select><button id="f1" type="button">→ Maske</button><span id="d1" style="color:#4caf50;font-weight:bold;font-size:16px;cursor:pointer"></span>
      <span class="ko-z">Z2</span><input id="t2" type="number" step="0.01"><select id="p2"></select><button id="f2" type="button">→ Maske</button><span id="d2" style="color:#4caf50;font-weight:bold;font-size:16px;cursor:pointer"></span>
      <span class="ko-z">Z3</span><input id="t3" type="number" step="0.01"><select id="p3"></select><button id="f3" type="button">→ Maske</button><span id="d3" style="color:#4caf50;font-weight:bold;font-size:16px;cursor:pointer"></span>
    </div>
    <div class="ko-row"><span class="ko-gh">Kapital €</span><input id="cap" type="number" step="100" style="width:90px">
      <label title="Kapital automatisch von der Übersicht" class="ko-gh"><input id="auto" type="checkbox"> auto</label>
      <span class="ko-gh">Risiko %</span><input id="rsk" type="number" step="0.1" style="width:52px"></div>
    <div class="ko-row" id="stockrow" style="display:none;margin-top:0"><span class="ko-gh">Stop</span><input id="sstop" type="number" step="0.01" style="width:90px" title="Stop-Kurs der Aktie (in der gewählten Währung)">
      <span class="ko-gh">Ziele/Stop in</span><select id="tcur"><option value="$">$ (USD)</option><option value="€">€ (EUR)</option></select></div>
    <div id="out" class="ko-sec" style="overflow-wrap:anywhere"></div>
    <div id="warn" style="margin-top:6px;color:#ff6b6b;font-weight:bold;white-space:pre-wrap"></div>
    <div id="msg" style="margin-top:6px;color:#f0c060;white-space:pre-wrap"></div>
    <div class="ko-sec" style="display:flex;gap:6px;align-items:center">
      <button id="ex" type="button" title="Ziele, Anteile, Häkchen und Positionsbasis als Text in die Zwischenablage">Export</button>
      <button id="im" type="button" title="Export-String von einem anderen PC einfügen">Import</button>
      <button id="dash" type="button" title="Übersicht aller Trades (auch über #ko-dashboard in der Adresse)" style="margin-left:auto">Alle Trades</button></div>`;
  document.body.appendChild(box);
  const $ = id => box.querySelector('#' + id);
  const pos = (v, d) => { v = parseFloat(v); return v > 0 ? v : d; };
  $('cap').value = pos(GM_getValue('cap', 10000), 10000);
  $('auto').checked = GM_getValue('auto', true);
  $('rsk').value = pos(GM_getValue('rsk', 2), 2);
  for (const id of ['p1', 'p2', 'p3']) {
    const opts = [10, 20, 25, 30, 33, 40, 50, 60, 67, 70, 75, 80, 90, 100];
    if (id === 'p3') opts.unshift(0);
    for (const v of opts) $(id).add(new Option(v + ' %', v));
    const def = id === 'p3' ? 0 : 50, v = parseFloat(GM_getValue(id, def));
    $(id).value = String(isNaN(v) ? def : v);
  }

  // Mausrad auf fokussiertem Zielfeld: Schrittweite ~0,1 % vom Underlying (Shift = x10)
  const nice = x => { const e = Math.pow(10, Math.floor(Math.log10(x))), m = x / e;
    return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * e; };
  for (const id of ['t1', 't2', 't3']) {
    $(id).addEventListener('wheel', ev => {
      if (document.activeElement !== $(id)) return;
      ev.preventDefault();
      const d = parse(pageText());
      const S = (d.ko && d.abs) ? d.ko + d.abs : parseFloat($(id).value) || 1;
      const step = nice(S * 0.001) * (ev.shiftKey ? 10 : 1);
      const cur = parseFloat($(id).value) || S;
      const v = Math.round((cur + (ev.deltaY < 0 ? step : -step)) / step) * step;
      $(id).value = +v.toFixed(4);
      render();
    }, { passive: false });
  }

  const f = (x, n = 2) => x.toFixed(n).replace('.', ',');

  let lastD = null, lastTotal = 0, stab = { sig: '', n: 0 };

  const getBases = () => { try { return JSON.parse(GM_getValue('bases', '{}')) || {}; } catch (e) { return {}; } };
  const getDone = id => { try { return JSON.parse(GM_getValue('done:' + id, '{}')) || {}; } catch (e) { return {}; } };
  const setDone = (id, o) => GM_setValue('done:' + id, JSON.stringify(o));
  // Orders-Liste der Übersicht (Reiter Offen / Ausgeführt / Gestrichen): Zeile = ISIN, Anzahl, Status, Orderart, [Limit/Preis €], Datum [Uhrzeit]
  function parseOrders(t) {
    const out = [];
    const re = /\b([A-Z]{2}[A-Z0-9]{9}\d)\s+([\d.,]+)\s+(offen|ausgeführt|gestrichen|abgelaufen|abgerechnet|teilausgeführt)\s+([^\n]+?)\s+(?:([\d.,]+)\s*€\s+)?(\d\d)\.(\d\d)\.(\d\d)(?:\s+(\d\d):(\d\d):(\d\d))?(?:\s+(\d\d\.\d\d\.\d\d))?(?:\s+(Kauf|Verkauf)\s+(-?[\d.,]+)\s*€)?/gi;
    for (const m of t.matchAll(re)) {
      const hasTime = m[9] !== undefined;
      out.push({ isin: m[1], qty: num(m[2]), status: m[3].toLowerCase(), price: m[5] ? num(m[5]) : null, hasTime,
        valid: m[12] || null, side: m[13] || null, wert: m[14] ? num(m[14]) : null,
        at: new Date(2000 + +m[8], +m[7] - 1, +m[6], hasTime ? +m[9] : 0, hasTime ? +m[10] : 0, hasTime ? +m[11] : 0).getTime() });
    }
    return out;
  }

  // Häkchen mit der Orders-Liste abgleichen:
  //   offen: gleiche ISIN + Anzahl + Limit in "Offen"  |  ausgeführt: in "Ausgeführt" nach dem Abschicken  |  gestrichen: in "Gestrichen"
  //   Reiter "Offen" sichtbar, Order dort nicht mehr da und sonst nichts gefunden: Bestand entscheidet (verkauft = ausgeführt, sonst storniert)
  function reconcile(id, c) {
    const dn = getDone(id), ks = Object.keys(dn);
    if (!ks.length) return;
    const base = Math.max(getBases()[id] || 0, c.total);
    let sold = Math.max(0, base - c.total), changed = false;
    const mine = c.orders.filter(o => o.isin === id), used = new Set();
    const take = pred => { const i = mine.findIndex((o, j) => !used.has(j) && pred(o)); if (i < 0) return false; used.add(i); return true; };
    const day0 = ts => { const d = new Date(ts); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
    for (const k of ks.sort((x, y) => dn[x].ts - dn[y].ts)) {
      const r = dn[k], fresh = Date.now() - r.ts < 120000;
      const q = o => Math.abs(o.qty - r.qty) < 1e-6;
      let st = null, gone = false;
      if (c.openTab && take(o => o.status === 'offen' && q(o) && (o.price == null || Math.abs(o.price - r.price) < 0.006 || (r.stop && Math.abs(o.price - r.stop) < 0.006)))) st = 'offen';
      else if (c.execTab && take(o => /ausgeführt|abgerechnet/.test(o.status) && q(o) && o.at >= (o.hasTime ? r.ts - 60000 : day0(r.ts)))) st = 'ausgeführt';
      else if (c.cancTab && take(o => /gestrichen|abgelaufen/.test(o.status) && q(o) && o.at >= day0(r.ts))) gone = true;
      else if (c.openTab && !fresh) { if (sold >= r.qty) { sold -= r.qty; st = 'ausgeführt'; } else gone = true; }
      if (gone) { delete dn[k]; changed = true; }
      else if (st && r.status !== st) { r.status = st; changed = true; }
    }
    if (changed) setDone(id, dn);
  }
  // Offene Orders den Zielen Z1-Z3 zuordnen: nächstes Limit zum aktuellen Soll-TP (max. 30 % Abstand), engste Paare zuerst
  function matchTargets(id, list, d) {
    const res = {};
    if (!d || !(d.ko || d.stock) || !list.length) return res;
    const pairs = [];
    for (const n of [1, 2, 3]) {
      const T = parseFloat(GM_getValue('t' + n + ':' + id, ''));
      if (!T) continue;
      const tp = tpPrice(d, T).price;
      list.forEach((o, i) => { if (o.side !== 'Kauf' && o.price > 0) pairs.push({ n, i, dist: Math.abs(o.price / tp - 1) }); });
    }
    const usedN = new Set(), usedI = new Set();
    for (const pr of pairs.sort((a, b) => a.dist - b.dist)) {
      if (pr.dist >= 0.3 || usedN.has(pr.n) || usedI.has(pr.i)) continue;
      usedN.add(pr.n); usedI.add(pr.i); res[pr.n] = list[pr.i];
    }
    return res;
  }
  // Aktien-Modus: Zielwährung je Produkt ($ bei US/CA-ISIN vorbelegt) und eigener Stop
  const getTcur = id => GM_getValue('tcur:' + id, /^(US|CA)/.test(id || '') ? '$' : '€');
  const getStopT = id => parseFloat(GM_getValue('stop:' + id, '')) || null;
  function enrichStock(d, id) {
    if (!d || !d.stock) return d;
    d.tcur = getTcur(id); d.stopT = getStopT(id);
    try { const fo = JSON.parse(GM_getValue('eurusd', 'null')); if (fo) { d.fxo = fo.v; d.fxoAt = fo.ts; } } catch (e) { /* */ }
    return d;
  }
  // Haltedauer: since:<ISIN> = { t: Kaufzeitpunkt, src: 'order' (Orders-Liste) | 'seen' (erstmals gesehen, Untergrenze) | 'manual' }
  const getSince = id => { try { return JSON.parse(GM_getValue('since:' + id, 'null')); } catch (e) { return null; } };
  const setSince = (id, t, src) => GM_setValue('since:' + id, JSON.stringify({ t, src }));
  const WEEK_COL = ['#2e7d32', '#43a047', '#7cb342', '#c0ca33', '#fdd835', '#fb8c00', '#f4511e', '#e53935'];
  const holdInfo = id => {
    const sv = getSince(id);
    if (!sv || !sv.t) return null;
    const days = Math.max(0, Math.floor((Date.now() - sv.t) / 86400000)), week = Math.floor(days / 7) + 1;
    return { days, week, col: WEEK_COL[Math.min(week, 8) - 1], approx: sv.src === 'seen', src: sv.src, t: sv.t };
  };
  function clearTrack(k) { GM_setValue('since:' + k, 'null'); GM_setValue('z1hit:' + k, 0); GM_setValue('slok:' + k, 0); }
  function bumpBase(id, n) {
    if (id && n > 0 && !getSince(id)) setSince(id, Date.now(), 'seen');
    if (!id || !(n > 0)) return;
    const b = getBases();
    if (!(b[id] >= n)) { b[id] = n; GM_setValue('bases', JSON.stringify(b)); }
  }
  // Übersicht: je Zeile ISIN + zwei Zahlen (Bestand / frei); größere = Gesamtbestand inkl. durch Orders belegter
  function syncPositions(t) {
    const rows = [...t.matchAll(/\b([A-Z]{2}[A-Z0-9]{9}\d)\s+(\d[\d.]*)\s+(\d[\d.]*)\s/g)];
    if (!rows.length) return;                       // Tabelle noch nicht geladen: nichts löschen
    const old = getBases(), nu = {};
    for (const m of rows) nu[m[1]] = Math.max(old[m[1]] || 0, num(m[2]), num(m[3]));
    for (const k in old) if (!(k in nu)) { setDone(k, {}); clearTrack(k); }   // Position weg: Häkchen, Haltedauer, Reminder zurücksetzen
    for (const k in nu) if (!getSince(k)) setSince(k, Date.now(), 'seen');
    gset('bases', JSON.stringify(nu));      // verkaufte Positionen fallen weg
    const orders = parseOrders(t);
    for (const k in nu) {                          // Kaufdatum aus "Ausgeführt" übernehmen (frühester Kauf), manuell gesetztes bleibt
      const buys = orders.filter(o => o.isin === k && o.side === 'Kauf' && /ausgeführt|abgerechnet/.test(o.status));
      if (!buys.length) continue;
      const cand = Math.min(...buys.map(o => o.at)), sv = getSince(k);
      if (!sv || (sv.src !== 'manual' && (sv.src === 'seen' || cand < sv.t) && cand < (sv.t || Infinity))) setSince(k, cand, 'order');
    }
    const ctx = {
      orders,
      openTab: /aktuell keine offenen Orders/i.test(t) || orders.some(o => o.status === 'offen'),
      execTab: orders.some(o => /ausgeführt|abgerechnet/.test(o.status)),
      cancTab: orders.some(o => /gestrichen|abgelaufen/.test(o.status)),
    };
    if (ctx.openTab) {                              // offene Orders je ISIN merken (für den Block unter "Meine Position")
      const by = {};
      for (const m of rows) by[m[1]] = [];
      for (const o of orders) if (o.status === 'offen') (by[o.isin] = by[o.isin] || []).push({ qty: o.qty, price: o.price, valid: o.valid, side: o.side, wert: o.wert });
      for (const k in by) {
        let prev = null; try { prev = JSON.parse(GM_getValue('oo:' + k, 'null')); } catch (e) { /* */ }
        if (!prev || JSON.stringify(prev.list) !== JSON.stringify(by[k]) || Date.now() - prev.ts > 60000)
          GM_setValue('oo:' + k, JSON.stringify({ ts: Date.now(), list: by[k] }));
        // Orders ohne Häkchen (vor Version 1.17 gesetzt, geändert, anderswo aufgegeben) den Zielen zuordnen und als Häkchen übernehmen
        let snap = null; try { snap = JSON.parse(GM_getValue('snap:' + k, 'null')); } catch (e) { /* */ }
        const mt = matchTargets(k, by[k], enrichStock(snap, k)), dn = getDone(k);
        let ch = false;
        for (const n in mt) {
          const o = mt[n], cur = dn[n];
          const same = cur && Math.abs(cur.qty - o.qty) < 1e-6 && Math.abs(cur.price - o.price) < 0.006;
          if (!cur || (cur.status !== 'ausgeführt' && !same)) { dn[n] = { qty: o.qty, price: o.price, ts: Date.now(), status: 'offen', auto: true }; ch = true; }
        }
        if (ch) setDone(k, dn);
      }
    }
    for (const m of rows) { const a = num(m[2]), b = num(m[3]); reconcile(m[1], Object.assign({ total: Math.max(a, b) }, ctx)); }
  }

  let lastSync = 0;

  // Seite bleibt zentriert; nur wenn der Rechner Inhalt verdecken würde, wird so weit nach rechts verschoben wie nötig
  let shiftP = 0, lastShiftAt = 0;
  function setShift(P) {
    if (Math.abs(P - shiftP) < 4) return;
    shiftP = P;
    if (P > 0) { document.body.style.setProperty('padding-left', P + 'px', 'important'); document.body.style.setProperty('box-sizing', 'border-box'); }
    else document.body.style.removeProperty('padding-left');
  }
  function updateShift() {
    if (Date.now() - lastShiftAt < 10000) return;      // Messen nur bei Bedarf (Resize, Produktwechsel) bzw. alle 10 s
    lastShiftAt = Date.now();
    const r = box.getBoundingClientRect();
    let L = Infinity;
    for (const e of document.body.querySelectorAll('div, section, main, article, header, nav, table')) {
      if (e === box || box.contains(e)) continue;
      const b = e.getBoundingClientRect();
      if (b.width < 200 || b.width > window.innerWidth * 0.9 || b.height < 20 || b.bottom < r.top || b.top > r.bottom) continue;
      if (b.left < L) L = b.left;
    }
    if (!isFinite(L)) return;
    const need = r.right + 16 - (L - shiftP / 2);       // linke Inhaltskante ohne Verschiebung (zentriert: Verschiebung = P/2)
    setShift(need > 0 ? Math.min(2 * need, 900) : 0);
  }

  // Kleiner Button (nur SVG, kein Text, damit innerText und die Zeilenerkennung unberührt bleiben) neben jeder ISIN in Listen
  function injectButtons() {
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const hits = [];
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      const t = n.nodeValue.trim();
      if (t.length === 12 && /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(t)) hits.push(n);
    }
    for (const n of hits) {
      const el = n.parentElement, id = n.nodeValue.trim();
      if (!el || box.contains(el) || el.closest('#ko-dash, #ko-orders-block')) continue;
      const par = el.parentElement;
      if (par && [...par.children].some(c => c.classList.contains('ko-open') && c.dataset.isin === id)) continue;   // schon vorhanden
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'ko-open'; b.dataset.isin = id;
      b.title = 'KO-TP-Rechner für dieses Produkt öffnen'; b.setAttribute('aria-label', b.title);
      b.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;margin-left:6px;padding:0;border:1px solid rgba(128,128,128,.5);border-radius:6px;background:#1b1e20;color:#e6e6e6;cursor:pointer;vertical-align:middle';
      b.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h8M18 6h2M4 12h2M12 12h8M4 18h10M20 18h0"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/></svg>';
      let name = '', c = el.parentElement;
      for (let i = 0; i < 3 && c && !name; i++, c = c.parentElement) {
        const x = (c.textContent || '').replace(id, '').replace(/[☆★⭐]/g, '').replace(/\bISIN:?/g, '').replace(/\s+/g, ' ').trim();
        if (x && x.length < 90) name = x;
      }
      b.dataset.name = name.slice(0, 45);
      b.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); forcedIsin = id; forcedName = b.dataset.name; render(); });
      el.insertAdjacentElement('afterend', b);
    }
  }

  function renderInner() {
    if (onProdOrMask()) forcedIsin = '';
    else {
      const txt = pageText();
      const portfolioLike = location.pathname.startsWith('/uebersicht') || /Offen[\s\S]{0,60}Ausgeführt[\s\S]{0,60}Gestrichen/.test(txt);
      if (location.pathname.startsWith('/uebersicht')) { const c = parseCap(txt); if (c) gset('capAuto', c); }
      if (portfolioLike && Date.now() - lastSync > 4000) {       // Positionen/Orders abgleichen (alle paar Sekunden reicht)
        lastSync = Date.now();
        syncPositions(txt);
        const fxm = txt.match(/EUR\/USD\s+([\d.,]+)/);
        if (fxm) {
          let fo = null; try { fo = JSON.parse(GM_getValue('eurusd', 'null')); } catch (e) { /* */ }
          const v = num(fxm[1]);
          if (!fo || fo.v !== v || Date.now() - fo.ts > 600000) GM_setValue('eurusd', JSON.stringify({ v, ts: Date.now() }));
        }
      }
      injectButtons();
    }
    const cur = getIsin();
    if (cur !== isin) {
      lastShiftAt = 0;                       // Seitenwechsel (SPA): Ziele der neuen ISIN laden
      isin = cur;
      $('t1').value = GM_getValue('t1:' + isin, '');
      $('t2').value = GM_getValue('t2:' + isin, '');
      $('t3').value = GM_getValue('t3:' + isin, '');
      $('sstop').value = GM_getValue('stop:' + isin, '');
      $('tcur').value = getTcur(isin);
    }
    trackOrder();
    if (!isin) { box.style.display = 'none'; setShift(0); return; }
    box.style.display = inFrame ? 'none' : '';
    if (!inFrame) updateShift();
    const forced = !!forcedIsin && !onProdOrMask();
    $('kx').style.display = forced ? '' : 'none';
    let uname = '';
    try { uname = (JSON.parse(GM_getValue('snap:' + isin, 'null')) || {}).uname || ''; } catch (e) { /* */ }
    const nm = uname || (forced && !/^ISIN:?$/i.test(forcedName) ? forcedName : '');
    $('sub').textContent = (nm ? nm + ' · ' : '') + isin;
    updateWarn();
    const dn = getDone(isin);
    for (const n of [1, 2, 3]) {
      const el = $('d' + n), r = dn[n];
      el.textContent = r ? (r.status === 'ausgeführt' ? '✓✓' : '✓') : '';
      el.title = r ? `Z${n}: ${r.qty} Stk @ ${f(r.price)} € ${r.status === 'ausgeführt' ? 'vermutlich ausgeführt' : 'abgeschickt, offen'} (Klick = entfernen)` : '';
    }
    const capAuto = GM_getValue('capAuto', 0);
    if ($('auto').checked && capAuto) $('cap').value = capAuto;
    $('cap').disabled = $('auto').checked && !!capAuto;
    gset('auto', $('auto').checked);
    const t1 = parseFloat($('t1').value), t2 = parseFloat($('t2').value), t3 = parseFloat($('t3').value);
    const cap = parseFloat($('cap').value), rsk = parseFloat($('rsk').value);
    gset('t1:' + isin, $('t1').value); gset('t2:' + isin, $('t2').value); gset('t3:' + isin, $('t3').value);
    if ($('stockrow').style.display !== 'none') { gset('stop:' + isin, $('sstop').value); gset('tcur:' + isin, $('tcur').value); }
    if (cap > 0) gset('cap', cap);
    if (rsk > 0) gset('rsk', rsk);

    const ptx = pageText();
    let d = parse(ptx);
    // Beim Wechsel zwischen Produkten (Single-Page-App) steht kurz noch der alte Inhalt auf der Seite.
    // Live-Werte nur übernehmen, wenn die angezeigte ISIN zur Adresse passt und die Kennzahlen zweimal hintereinander gleich sind.
    let liveOk = false;
    if (((d.ko && d.abs) || d.stock) && d.ask && /^\/instrument\//.test(location.pathname)) {
      const pIsin = (ptx.match(/ISIN:\s*([A-Z]{2}[A-Z0-9]{9}\d)/) || [])[1];
      const ssig = JSON.stringify([isin, d.stock, d.ko, d.abs, d.bv, d.cur, d.uname, d.qty, d.ek]);
      if (pIsin === isin) {
        stab.n = stab.sig === ssig ? stab.n + 1 : 1; stab.sig = ssig;
        liveOk = stab.n >= 2;
        if (!liveOk) setTimeout(render, 1200);          // zweite Prüfung bald nachholen
      } else stab = { sig: '', n: 0 };
    }
    if (liveOk) {                              // Produktseite: Snapshot speichern
      try { const fo = JSON.parse(GM_getValue('eurusd', 'null')); if (fo) { d.fxo = fo.v; d.fxoAt = fo.ts; } } catch (e) { /* */ }
      if (!d.uname) { try { d.uname = (JSON.parse(GM_getValue('snap:' + isin, 'null')) || {}).uname || null; } catch (e) { /* */ } }
      const sig = JSON.stringify(d);
      if (wrote.get('snapsig:' + isin) !== sig) {        // nur speichern, wenn sich die Daten geändert haben
        wrote.set('snapsig:' + isin, sig);
        d.ts = new Date().toLocaleTimeString('de-DE'); d.tsAt = Date.now();
        GM_setValue('snap:' + isin, JSON.stringify(d));
      } else { try { d.ts = JSON.parse(GM_getValue('snap:' + isin, 'null')).ts; } catch (e) { /* */ } }
    } else {                                  // z. B. Verkaufsmaske: letzte Werte halten
      try { d = JSON.parse(GM_getValue('snap:' + isin, 'null')); } catch (e) { d = null; }
      const onProd = /^\/instrument\//.test(location.pathname);
      if (!onProd && !inFrame && (!d || !d.tsAt || Date.now() - d.tsAt > 30 * 60000)) bgLoad([isin]);   // fehlt oder älter als 30 min
      if (!d) {
        $('out').textContent = onProd ? 'Lade Produktdaten …'
          : bgFail.has(isin) ? 'Hintergrundabruf fehlgeschlagen: Produktseite einmal öffnen.' : 'Lade Produktdaten im Hintergrund …';
        return;
      }
    }
    enrichStock(d, isin);
    $('stockrow').style.display = d.stock ? '' : 'none';
    if (d.stock && d.tcur === '$' && !(d.fxo > 0.9)) { $('out').textContent = 'EUR/USD fehlt: einmal die Übersicht öffnen oder Ziele/Stop in € stellen.'; return; }
    const base = d.ek || d.ask;
    const ui = underlyingInfo(d), S = ui.S, cs = d.stock ? d.tcur : (d.cur || '$');
    const hm = ms => new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    lastD = d;
    if (d.uname) $('sub').textContent = d.uname + ' · ' + isin;
    const av = availFromPage();
    if (d.qty) bumpBase(isin, d.qty);
    lastTotal = getBases()[isin] || d.qty || (av ? av.avail : 0);
    const pcs = ['p1', 'p2', 'p3'].map(id => parseFloat($(id).value) || 0);
    pcs.forEach((v, i) => gset('p' + (i + 1), v));
    const qs = lastTotal ? plan(lastTotal, pcs) : [0, 0, 0];
    const src = ui.src === 'aktie' ? 'Kurs' : ui.src === 'aktie-fx' ? 'aus €-Kurs, EUR/USD ' + f(d.fxo, 4) : ui.src === 'basiswert' ? 'live' : ui.src === 'preis' ? 'aus Preis, EUR/USD ' + f(d.fxo, 4) : d.calcAt ? 'Stand ' + hm(d.calcAt) : '';
    // Haltedauer-Tracker (Wochen 1-8)
    const hi = holdInfo(isin);
    if (hi) {
      const segs = WEEK_COL.map((c, i) => `<i style="${i < hi.week ? 'background:' + c : ''}"></i>`).join('');
      $('hold').innerHTML = `<div style="display:flex;justify-content:space-between;font-size:12px"><span>Haltedauer <b style="color:${hi.col}">${hi.approx ? '≥ ' : ''}${hi.days} T · Woche ${hi.week}${hi.week > 8 ? ' ⚠' : ''}</b></span>
        <span class="ko-s">seit ${new Date(hi.t).toLocaleDateString('de-DE')}${hi.approx ? ' (erstmals gesehen)' : hi.src === 'manual' ? ' (manuell)' : ''}</span></div><div class="ko-hb">${segs}</div>${hi.approx ? '<div class="ko-s" style="color:#f0c060">⚠ Kaufdatum unbekannt: Übersicht → Orders → Reiter „Ausgeführt“ öffnen oder hier klicken</div>' : ''}`;
    } else $('hold').innerHTML = '<span class="ko-s">Haltedauer unbekannt · Klick: Kaufdatum setzen</span>';
    // Reminder: Z1 erreicht -> Stop-Loss nachziehen
    const dn1 = getDone(isin)[1];
    if (t1 && ((S >= t1) || (dn1 && dn1.status === 'ausgeführt')) && !GM_getValue('z1hit:' + isin, 0)) GM_setValue('z1hit:' + isin, Date.now());
    const z1hit = GM_getValue('z1hit:' + isin, 0), slok = GM_getValue('slok:' + isin, 0);
    if (z1hit && !(slok >= z1hit)) {
      const be = d.ek || base, beU = d.stock ? be * (d.tcur === '$' ? d.fxo : 1) : d.ko + be * (S - d.ko) / d.ask;   // Underlying-Niveau, bei dem das Zertifikat den Einstand wert ist
      const rest = Math.max(0, lastTotal - (dn1 && dn1.status === 'ausgeführt' ? dn1.qty : qs[0]));
      $('slrem').innerHTML = `<div class="ko-rem">⚑ <b>Z1 erreicht</b> (${new Date(z1hit).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}): Stop-Loss nachziehen,
        z. B. auf Einstand <b>${f(be, 3)} €</b> (Underlying ≈ ${f(beU, Math.abs(beU) < 20 ? 4 : 2)} ${cs})${rest ? ' für die restlichen ' + rest + ' Stk' : ''}.
        ${d.free != null ? '<div class="ko-s">frei (nicht durch Orders gebunden): ' + d.free + ' Stk</div>' : ''}
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
          <button type="button" data-sl="stop" title="Stop-Order auf Einstand für die freien Stücke">Stop → Maske</button>
          ${[2, 3].filter(n => [t1, t2, t3][n - 1] && !(getDone(isin)[n] && (getDone(isin)[n].status === 'ausgeführt' || getDone(isin)[n].oco)))
            .map(n => `<button type="button" data-sl="oco" data-n="${n}" title="Z${n} als OCO: Limit = TP, Stop = Einstand (vorher Z${n}-Limit-Order löschen)">Z${n} als OCO → Maske</button>`).join('')}
          <button id="slok" type="button">Stop nachgezogen ✓</button></div></div>`;
      $('slok').onclick = () => { GM_setValue('slok:' + isin, Date.now()); render(); };
      for (const b of $('slrem').querySelectorAll('[data-sl]')) b.onclick = () => onStop(b.dataset.sl, +b.dataset.n || 0);
    } else $('slrem').innerHTML = '';
    const eur0 = v => (v >= 0 ? '+' : '−') + f(Math.abs(v), 0) + ' €';
    const crvCls = c => c >= 2 ? 'ko-pos' : c >= 1 ? 'ko-mid' : 'ko-neg';
    const nd = x => Math.abs(x) < 20 ? 4 : 2;
    const stopRef = d.stock ? d.stopT : d.ko;
    let h = `<div class="ko-u"><b>${f(S, nd(S))} ${cs}</b> <span class="ko-s">${d.stock ? 'Aktie' : 'Underlying'}${src ? ' (' + src + ')' : ''}</span>
      <div class="ko-s">${stopRef ? `${d.stock ? 'Stop' : 'KO'} ${f(stopRef, nd(stopRef))} ${cs} · Abstand ${f((S - stopRef) / S * 100, 1)} %` : 'Stop: nicht gesetzt (Feld „Stop“)'}</div></div>`;
    if (!ui.live && d.calcAt && d.askAt && d.askAt - d.calcAt > 10 * 60000)
      h += `<div class="ko-w">⚠ Abstand von ${hm(d.calcAt)}, Kurs von ${hm(d.askAt)}: TP ungenau</div>`;
    let profSum = 0, profAny = false, rows = '';
    for (const [n, T] of [[1, t1], [2, t2], [3, t3]]) {
      if (!T) continue;
      const r = tpPrice(d, T);
      const crv = stopRef ? (T - S) / (S - stopRef) : null;
      const pr = getDone(isin)[n];                    // schon gesetzte Order hat Vorrang (Menge/Limit)
      const pq = pr ? pr.qty : qs[n - 1], pp = pr ? pr.price : r.price;
      const g = pq ? pq * (pp - base) : null;
      if (g != null) { profSum += g; profAny = true; }
      const pct = (r.price / base - 1) * 100;
      const dA = T - S, dP = dA / S * 100, sg = dA >= 0 ? '+' : '−';
      rows += `<tr><td class="ko-z">Z${n}</td><td class="${dA >= 0 ? '' : 'ko-neg'}">${sg}${f(Math.abs(dA), 2)} ${cs}<br><span class="ko-s">${sg}${f(Math.abs(dP), 1)} %</span></td><td><b>${f(r.price)} €</b></td><td class="${pct >= 0 ? 'ko-pos' : 'ko-neg'}">${pct >= 0 ? '+' : ''}${f(pct, 0)} %</td>
        <td class="${crv == null ? '' : crvCls(crv)}">${crv == null ? '–' : f(crv)}</td><td>${pq || '–'}</td><td class="${g == null ? '' : g >= 0 ? 'ko-pos' : 'ko-neg'}">${g == null ? '–' : eur0(g)}</td></tr>`;
      if (pr && pr.status !== 'ausgeführt') {
        const dev = (pr.price / r.price - 1) * 100;
        if (Math.abs(dev) >= 2) rows += `<tr><td></td><td colspan="6" class="ko-w" style="text-align:left;border-top:0">Order-Limit ${f(pr.price)} € liegt ${dev > 0 ? '+' : ''}${f(dev, 0)} % neben Soll</td></tr>`;
      }
    }
    if (rows) h += `<table><tr><th></th><th>bis Ziel</th><th>TP</th><th>Gewinn %</th><th>CRV</th><th>Stk</th><th>Gewinn €</th></tr>${rows}</table>`;
    if (profAny) h += `<div class="ko-sum"><span>Gewinn gesamt</span><b class="${profSum >= 0 ? 'ko-pos' : 'ko-neg'}">≈ ${eur0(profSum)}</b></div>
      <div class="ko-s" style="text-align:right">Basis ${d.ek ? 'Einstand ' + f(d.ek, 3) + ' €' : 'Ask'} · ohne Gebühren/Steuern</div>`;
    const meta = [];
    if (lastTotal) meta.push(`Position ${lastTotal} Stk${av ? ' (frei ' + av.avail + ')' : ''} · Rest nach Z1-Z3: ${lastTotal - qs[0] - qs[1] - qs[2]}`);
    if (cap && rsk) {
      const eins = cap * rsk / 100;
      if (!d.stock) meta.push(`Einsatz ${f(eins, 0)} € (${f(rsk, 1)} %) = ${Math.floor(eins / d.ask)} Stk`);
      else if (d.stopT) {
        const rps = d.ask - d.stopT / (d.tcur === '$' ? d.fxo : 1), n = rps > 0 ? Math.floor(eins / rps) : 0;   // Risiko je Aktie bis zum Stop
        meta.push(`Risiko ${f(eins, 0)} € (${f(rsk, 1)} %) bis Stop = ${n} Stk (≈ ${f(n * d.ask, 0)} € Einsatz)`);
      } else meta.push('Positionsgröße: erst Stop eintragen');
    }
    meta.push(`Datenstand Produktseite: ${d.ts || '–'}`);
    h += `<div class="ko-meta">${meta.join('<br>')}</div>`;
    renderOrdersBlock();
    $('out').innerHTML = h;
  }

  // ---------- Verkaufsmaske ausfüllen (sendet NIE ab) ----------
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const vis = el => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  const fields = () => [...document.querySelectorAll('input')].filter(el => !box.contains(el) && vis(el) &&
    !['hidden', 'checkbox', 'radio', 'button', 'submit'].includes(el.type) && !el.disabled && !el.readOnly);
  function labelOf(el) {
    let t = [el.getAttribute('aria-label'), el.placeholder, el.name, el.id].filter(Boolean).join(' ');
    let n = el.parentElement;
    for (let i = 0; i < 3 && n; i++, n = n.parentElement) {
      const x = (n.innerText || n.textContent || '').trim();
      if (x && x.length < 80) { t += ' ' + x; break; }
    }
    return t;
  }
  const isSearch = el => /suche|wkn|isin/i.test(labelOf(el));
  const findQty = () => { const a = fields().filter(el => !isSearch(el));
    return a.find(el => /anzahl|stück/i.test(labelOf(el))) || a.find(el => el.type === 'number') || null; };
  const findLimit = q => { const a = fields().filter(el => el !== q && !isSearch(el));
    return a.find(el => /limit/i.test(labelOf(el))) || (a.length === 1 ? a[0] : null); };
  const diag = () => fields().map(el => el.type + '|' + labelOf(el).replace(/\s+/g, ' ').slice(0, 30)).join('; ');
  function setVal(el, v) {
    const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
    set.call(el, String(v));
    for (const t of ['input', 'change', 'blur']) el.dispatchEvent(new Event(t, { bubbles: true }));
  }
  function availFromPage() {
    const m = pageText().match(/(\d+)\s+von\s+(\d+)\s+verfügbaren/i);
    return m ? { entered: +m[1], avail: +m[2] } : null;   // "31 von 57": eingegeben von frei verfügbar
  }
  async function waitFor(fn, ms) {
    for (let t = 0; t < ms; t += 100) { const r = fn(); if (r) return r; await sleep(100); }
    return null;
  }

  const getLimitBtn = () => document.querySelector('[data-zid="limit-order"]');
  const limitActive = () => { const b = getLimitBtn(); return !!b && /abwählen/i.test(b.textContent); };
  let watchLimit = false;       // nach einem Ausfüllen: Limit-Status dauerhaft überwachen
  const LIMIT_WARN = '⚠ LIMIT NICHT ANGEWÄHLT: die Order wäre eine Marktorder!\nLimit-Button anklicken, danach erneut → Maske.';

  // Warnung im Rechner UND als rotes Banner direkt über dem Button ("ORDER PRÜFEN" bzw. "ORDER KOSTENPFLICHTIG AUFGEBEN")
  const findOrderBtn = () => [...document.querySelectorAll('button, [role="button"], a')]
    .find(b => /^\s*order (prüfen|kostenpflichtig aufgeben)\s*$/i.test(b.textContent) && vis(b)) || null;

  function warnState() {
    const t = pageText();
    if (/Bitte prüfe Deine Orderdaten/i.test(t)) {              // Bestätigungsseite vor dem Abschicken
      const m = t.match(/Orderart\s+([^\n]+)/i);
      if (m && /^(markt|bestens|billigst)/i.test(m[1].trim()))
        return `⚠ ORDERART IST ${m[1].trim().toUpperCase()}: Order wäre eine Marktorder!\nZurück zur Ordereingabe und Limit/OCO/Stop anwählen.`;
      return '';
    }
    if (watchLimit && /direction=sell/.test(location.search) && !orderDone() && getLimitBtn() && !limitActive()) return LIMIT_WARN;
    return '';
  }

  function updateWarn() {
    const w = warnState();
    $('warn').textContent = w;
    let ban = document.getElementById('ko-limit-banner');
    if (!w) { if (ban) ban.remove(); return; }
    const text = w.split('\n')[0];
    const ob = findOrderBtn();
    if (!ob || !ob.parentElement) return;
    if (ban && ban.nextElementSibling === ob && ban.textContent === text) return;
    if (ban) ban.remove();
    ban = document.createElement('div');
    ban.id = 'ko-limit-banner';
    ban.style.cssText = 'background:#c62828;color:#fff;font:bold 15px system-ui;padding:12px 14px;border-radius:8px;margin:0 0 10px 0;text-align:center';
    ban.textContent = text;
    ob.parentElement.insertBefore(ban, ob);
  }

  // Abgeschickte Orders erkennen: Maske gefüllt -> Bestätigungsseite (passt Limit/Anzahl?) -> "erfolgreich aufgegeben" -> Häkchen
  function trackOrder() {
    let lf = null; try { lf = JSON.parse(GM_getValue('lastfill', 'null')); } catch (e) { /* */ }
    if (!lf || Date.now() - lf.ts > 30 * 60000) return;
    const t = pageText();
    if (/Bitte prüfe Deine Orderdaten/i.test(t)) {
      if (getIsin() !== lf.isin) return;
      const side = t.match(/Kauf \/ Verkauf\s+(\w+)/i);
      const lp = pick(t, /Limitpreis\s+([\d.,]+)\s*€/i), an = pick(t, /Anzahl\s+(\d+)/i);
      const ok = (!side || /verkauf/i.test(side[1])) && (lp == null || (Math.abs(lp - lf.price) < 0.006 && (an == null || an === lf.qty)));
      const sv = ok ? JSON.stringify(lf) : 'null';
      if (GM_getValue('submit', 'null') !== sv) GM_setValue('submit', sv);
    } else if (orderDone()) {
      let sb = null; try { sb = JSON.parse(GM_getValue('submit', 'null')); } catch (e) { /* */ }
      if (sb) {
        if (sb.kind === 'stop' || sb.kind === 'oco') GM_setValue('slok:' + sb.isin, Date.now());   // Stop nachgezogen
        if (sb.kind !== 'stop') {
          const d = getDone(sb.isin);
          d[sb.n] = { qty: sb.qty, price: sb.price, ts: Date.now(), status: 'offen' };
          if (sb.kind === 'oco') { d[sb.n].stop = sb.stop; d[sb.n].oco = true; }
          setDone(sb.isin, d);
        }
      }
      GM_setValue('submit', 'null'); GM_setValue('lastfill', 'null');
    }
  }

  // Plausibilitätsprüfung + Menge/Preis für Ziel n
  function prepare(n) {
    if (!lastD) throw new Error('Keine Produktdaten, erst Produktseite öffnen.');
    const T = parseFloat($('t' + n).value);
    if (!T) throw new Error(`Ziel ${n} fehlt.`);
    const ex = getDone(isin)[n];
    if (ex && ex.status === 'offen')
      throw new Error(`Z${n} ist schon gesetzt (${f(ex.qty, 0)} Stk @ ${f(ex.price)} €).\nHäkchen anklicken, wenn du neu setzen willst.`);
    if (!lastTotal) throw new Error('Positionsgröße unbekannt (Übersicht öffnen).');
    const qty = plan(lastTotal, ['p1', 'p2', 'p3'].map(id => parseFloat($(id).value) || 0))[n - 1];
    const price = tpPrice(lastD, T).price;
    if (lastD.bid && price <= lastD.bid)
      throw new Error(`TP ${f(price)} € liegt nicht über Bid ${f(lastD.bid)} €: würde sofort ausgeführt, nicht gefüllt.`);
    return { qty, price };
  }

  async function fillMask(n) {
    const msg = $('msg'); msg.textContent = '';
    try {
      if (!/direction=sell/.test(location.search)) throw new Error('Nur auf der Verkaufsmaske möglich.');
      await waitFor(availFromPage, 5000);          // Maske fertig geladen?
      const { qty: q0, price } = prepare(n);
      const av = availFromPage();
      const qty = av ? Math.min(q0, av.avail) : q0;
      if (!qty) throw new Error('Menge 0 (nichts mehr verfügbar, Anteil 0 % oder schon vorher 100 % vergeben).');
      watchLimit = true;
      const btn0 = await waitFor(getLimitBtn, 8000);
      if (!btn0) throw new Error('Limit-Button nicht gefunden.');
      if (!limitActive()) {
        getLimitBtn().click();
        if (!(await waitFor(limitActive, 1500))) {          // Button wird bei Re-Render neu geholt, zweiter Versuch
          if (!limitActive() && getLimitBtn()) getLimitBtn().click();
          await waitFor(limitActive, 1500);
        }
      }
      const qEl = await waitFor(findQty, 2000);
      if (!qEl) throw new Error('Anzahl-Feld nicht gefunden. Felder: ' + diag());
      setVal(qEl, qty);
      if (!limitActive()) {
        updateWarn();
        msg.textContent = `Z${n}: ${qty} Stk eingetragen, aber KEIN Limit-Wert (Limit nicht aktiv).`;
        return;
      }
      const pEl = await waitFor(() => findLimit(qEl), 3000);
      if (!pEl) throw new Error('Limit-Feld nicht gefunden. Felder: ' + diag());
      setVal(pEl, pEl.type === 'number' ? price.toFixed(2) : price.toFixed(2).replace('.', ','));
      await sleep(200);
      if (parseFloat(qEl.value) !== qty) setVal(qEl, qty);
      updateWarn();
      GM_setValue('lastfill', JSON.stringify({ n, isin, qty, price: +price.toFixed(2), ts: Date.now() }));
      msg.textContent = `Z${n}: ${qty} Stk, Limit ${f(price)} € eingetragen.\nPrüfen und ORDER PRÜFEN selbst klicken.`;
    } catch (e) { msg.textContent = e.message; }
  }

  // ---------- Stop-Loss nachziehen: Stop- oder OCO-Order in die Maske (sendet NIE ab) ----------
  const TYPE = { stop: { zid: 'stop-order', re: /^\s*stop\b/i, name: 'Stop' }, oco: { zid: 'oco-order', re: /^\s*oco\b/i, name: 'OCO' } };
  const getTypeBtn = k => document.querySelector(`[data-zid="${TYPE[k].zid}"]`) ||
    [...document.querySelectorAll('[data-zid*="order"], button, .btn')].find(e => TYPE[k].re.test((e.textContent || '').replace(/abwählen/i, '').trim()) && vis(e)) || null;
  const typeActive = k => { const b = getTypeBtn(k); return !!b && /abwählen/i.test(b.textContent); };
  function findByLabel(re, other, excl) {
    const a = fields().filter(el => !excl.includes(el) && !isSearch(el));
    return a.find(el => re.test(labelOf(el)) && !other.test(labelOf(el))) || a.find(el => re.test(labelOf(el))) || null;
  }
  const floor2 = v => Math.floor(v * 100 + 1e-6) / 100;

  function prepareStop(kind, n) {
    if (!lastD) throw new Error('Keine Produktdaten, erst Produktseite öffnen.');
    if (!lastTotal) throw new Error('Positionsgröße unbekannt (Übersicht öffnen).');
    const stop = floor2(lastD.ek || lastD.ask);                 // Stop auf Einstand (Break-even), abgerundet
    if (lastD.bid && stop >= lastD.bid) throw new Error(`Stop ${f(stop)} € liegt nicht unter Bid ${f(lastD.bid)} €: würde sofort auslösen.`);
    const dn = getDone(isin);
    if (kind === 'stop') {
      const sold = Object.values(dn).filter(r => r.status === 'ausgeführt').reduce((a, r) => a + r.qty, 0);
      return { qty: Math.max(0, lastTotal - sold), stop };
    }
    const T = parseFloat($('t' + n).value);
    if (!T) throw new Error(`Ziel ${n} fehlt.`);
    const ex = dn[n];
    if (ex && ex.status === 'ausgeführt') throw new Error(`Z${n} ist bereits ausgeführt.`);
    if (ex && ex.status === 'offen' && !ex.oco) {
      if (!confirm(`Z${n} steht noch als Limit-Order (${f(ex.qty, 0)} Stk @ ${f(ex.price)} €).\nDiese Order zuerst in der Orders-Liste löschen, sonst sind die Stücke doppelt verplant.\n\nIst sie gelöscht?`))
        throw new Error(`Abgebrochen: Z${n}-Limit-Order zuerst löschen, dann erneut klicken.`);
      delete dn[n]; setDone(isin, dn);
    } else if (ex && ex.oco) throw new Error(`Z${n} ist schon als OCO gesetzt (Stop ${f(ex.stop)} €).`);
    const qty = (ex && ex.qty) || plan(lastTotal, ['p1', 'p2', 'p3'].map(id => parseFloat($(id).value) || 0))[n - 1];
    return { qty, stop, limit: tpPrice(lastD, T).price };
  }

  async function fillStop(kind, n) {
    const msg = $('msg'); msg.textContent = '';
    try {
      if (!/direction=sell/.test(location.search)) throw new Error('Nur auf der Verkaufsmaske möglich.');
      await waitFor(availFromPage, 5000);
      const pr = prepareStop(kind, n);
      const av = availFromPage();
      const qty = av ? Math.min(pr.qty, av.avail) : pr.qty;
      if (!qty) throw new Error(kind === 'stop'
        ? 'Keine freien Stücke: alle sind durch Limit-Orders gebunden.\nStattdessen die offenen Ziele als OCO setzen (Limit = TP, Stop = Einstand): Button "Z2 als OCO".'
        : 'Menge 0 (nichts mehr verfügbar).');
      watchLimit = false;
      if (limitActive()) { getLimitBtn().click(); await waitFor(() => !limitActive(), 1500); }   // reine Stop-/OCO-Order
      const b0 = await waitFor(() => getTypeBtn(kind), 8000);
      if (!b0) throw new Error(`${TYPE[kind].name}-Button nicht gefunden.`);
      if (!typeActive(kind)) {
        getTypeBtn(kind).click();
        if (!(await waitFor(() => typeActive(kind), 1500))) { if (!typeActive(kind) && getTypeBtn(kind)) getTypeBtn(kind).click(); await waitFor(() => typeActive(kind), 1500); }
      }
      if (!typeActive(kind)) throw new Error(`${TYPE[kind].name} ließ sich nicht anwählen. Bitte von Hand anklicken und erneut versuchen.`);
      const qEl = await waitFor(findQty, 2000);
      if (!qEl) throw new Error('Anzahl-Feld nicht gefunden. Felder: ' + diag());
      setVal(qEl, qty);
      const fmt = (el, v) => el.type === 'number' ? v.toFixed(2) : v.toFixed(2).replace('.', ',');
      const sEl = await waitFor(() => findByLabel(/stop/i, /limit/i, [qEl]), 3000);
      if (!sEl) throw new Error('Stop-Feld nicht gefunden. Felder: ' + diag());
      setVal(sEl, fmt(sEl, pr.stop));
      if (kind === 'oco') {
        const lEl = await waitFor(() => findByLabel(/limit/i, /stop/i, [qEl, sEl]), 3000);
        if (!lEl) throw new Error('Limit-Feld der OCO nicht gefunden. Felder: ' + diag());
        setVal(lEl, fmt(lEl, pr.limit));
      }
      await sleep(200);
      if (parseFloat(qEl.value) !== qty) setVal(qEl, qty);
      GM_setValue('lastfill', JSON.stringify({ n: kind === 'oco' ? n : 0, kind, isin, qty, price: kind === 'oco' ? +pr.limit.toFixed(2) : null, stop: pr.stop, ts: Date.now() }));
      msg.textContent = kind === 'oco'
        ? `Z${n} als OCO: ${qty} Stk, Limit ${f(pr.limit)} €, Stop ${f(pr.stop)} € eingetragen.\nPrüfen und ORDER PRÜFEN selbst klicken.`
        : `Stop: ${qty} Stk, Stop ${f(pr.stop)} € eingetragen.\nPrüfen und ORDER PRÜFEN selbst klicken.`;
    } catch (e) { msg.textContent = e.message; }
  }

  function goStop(kind, n) {
    const msg = $('msg'); msg.textContent = '';
    try {
      const { qty } = prepareStop(kind, n);
      GM_setValue('pending', JSON.stringify({ n, kind, isin, ts: Date.now() }));
      msg.textContent = 'Weiterleitung zur Verkaufsmaske …';
      location.href = `https://mein.finanzen-zero.net/meindepot/kaufenverkaufen?isin=${isin}&direction=sell&quantity=${qty || 1}`;
    } catch (e) { msg.textContent = e.message; }
  }
  const onStop = (kind, n) => (/direction=sell/.test(location.search) && !orderDone()) ? fillStop(kind, n) : goStop(kind, n);

  // Produktseite: zur Verkaufsmaske weiterleiten, dort wird automatisch befüllt
  function goMask(n) {
    const msg = $('msg'); msg.textContent = '';
    try {
      const { qty } = prepare(n);
      GM_setValue('pending', JSON.stringify({ n, isin, ts: Date.now() }));
      msg.textContent = 'Weiterleitung zur Verkaufsmaske …';
      location.href = `https://mein.finanzen-zero.net/meindepot/kaufenverkaufen?isin=${isin}&direction=sell&quantity=${qty || 1}`;
    } catch (e) { msg.textContent = e.message; }
  }
  // Offene Verkaufsmaske: direkt füllen. Alles andere (Produktseite, Bestätigungsseite nach Order, ...): weiterleiten.
  const orderDone = () => /erfolgreich aufgegeben/i.test(pageText());
  const onFill = n => (/direction=sell/.test(location.search) && !orderDone()) ? fillMask(n) : goMask(n);
  $('kx').addEventListener('click', () => { forcedIsin = ''; forcedName = ''; render(); });
  $('dash').addEventListener('click', () => openDash());
  $('hold').addEventListener('click', () => {
    const hi = holdInfo(isin), cur = hi ? new Date(hi.t).toLocaleDateString('de-DE') : '';
    const v = (prompt('Kaufdatum der Position (TT.MM.JJJJ):', cur) || '').trim();
    const m = v.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
    if (!m) return;
    const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    setSince(isin, new Date(y, +m[2] - 1, +m[1], 12).getTime(), 'manual'); render();
  });

  // ---------- Export / Import (Übertragung auf einen anderen PC/Browser) ----------
  // Nur Nutzerdaten; Snapshots, Orders-Listen und EUR/USD entstehen beim nächsten Seitenbesuch neu.
  const EXPORT_KEY = /^(t[123]:|p[123]$|cap$|rsk$|auto$|bases$|done:|since:|z1hit:|slok:)/;
  const toB64 = u8 => { let b = ''; for (let i = 0; i < u8.length; i += 0x8000) b += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const fromB64 = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
    const b = atob(s), u8 = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u8[i] = b.charCodeAt(i); return u8; };
  const canZip = () => typeof CompressionStream !== 'undefined' && typeof Response !== 'undefined';
  const zip = async (u8, Cls, mode) => new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new Cls(mode))).arrayBuffer());

  $('ex').addEventListener('click', async () => {
    try {
      const data = {};
      for (const k of GM_listValues()) if (EXPORT_KEY.test(k)) data[k] = GM_getValue(k);
      let u8 = new TextEncoder().encode(JSON.stringify({ v: 1, ts: Date.now(), data })), tag = 'KOTP1.';
      if (canZip()) { u8 = await zip(u8, CompressionStream, 'deflate-raw'); tag = 'KOTP1z.'; }
      const str = tag + toB64(u8);
      GM_setClipboard(str, 'text');
      const n = new Set(Object.keys(data).map(k => k.split(':')[1]).filter(Boolean)).size;
      $('msg').textContent = `Export in der Zwischenablage: ${n} Produkte, ${str.length} Zeichen.\nAm anderen PC: Import klicken und einfügen.`;
    } catch (e) { $('msg').textContent = 'Export fehlgeschlagen: ' + e.message; }
  });

  $('im').addEventListener('click', async () => {
    try {
      const str = (prompt('Export-String einfügen:') || '').trim();
      if (!str) return;
      const m = str.match(/^KOTP1(z?)\.([A-Za-z0-9_-]+)$/);
      if (!m) throw new Error('kein gültiger Export-String');
      let u8 = fromB64(m[2]);
      if (m[1]) {
        if (typeof DecompressionStream === 'undefined') throw new Error('Browser kann den komprimierten String nicht entpacken');
        u8 = await zip(u8, DecompressionStream, 'deflate-raw');
      }
      const obj = JSON.parse(new TextDecoder().decode(u8));
      const keys = Object.keys(obj.data || {}).filter(k => EXPORT_KEY.test(k));
      const n = new Set(keys.map(k => k.split(':')[1]).filter(Boolean)).size;
      if (!confirm(`Import: ${n} Produkte, ${keys.length} Werte (Stand ${new Date(obj.ts).toLocaleString('de-DE')}).\nVorhandene Werte mit gleichem Schlüssel werden überschrieben. Fortfahren?`)) return;
      for (const k of keys) GM_setValue(k, obj.data[k]);
      location.reload();
    } catch (e) { $('msg').textContent = 'Import fehlgeschlagen: ' + e.message; }
  });
  $('f1').addEventListener('click', () => onFill(1));
  $('f2').addEventListener('click', () => onFill(2));
  $('f3').addEventListener('click', () => onFill(3));
  for (const n of [1, 2, 3]) $('d' + n).addEventListener('click', () => {
    const d = getDone(isin); delete d[n]; setDone(isin, d); render();
  });

  // Block "Offene Orders" unter "Meine Position" auf der Produktseite
  function renderOrdersBlock() {
    let blk = document.getElementById('ko-orders-block');
    if (!/^\/instrument\//.test(location.pathname) || !isin) { if (blk) blk.remove(); return; }
    let card = document.querySelector('[data-zid="my-position"] .tile') || document.querySelector('[data-zid="my-position"]');
    if (!card) {                                    // Fallback: Überschrift suchen (Whitespace im Text ist uneinheitlich)
      const heading = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6, div, span, p')]
        .filter(e => /^Meine\s+Position\s+\(/.test(e.textContent.trim()) && e.textContent.trim().length < 40 && vis(e))
        .sort((x, y) => x.querySelectorAll('*').length - y.querySelectorAll('*').length)[0];
      if (!heading) { if (blk) blk.remove(); return; }
      card = heading;
      while (card.parentElement && !/Einstandskurs/.test(card.textContent)) card = card.parentElement;
      if (!/Einstandskurs/.test(card.textContent)) return;
    }

    let rec = null; try { rec = JSON.parse(GM_getValue('oo:' + isin, 'null')); } catch (e) { /* */ }
    const dn = getDone(isin);
    const list = rec ? rec.list.map(o => Object.assign({}, o)) : [];
    for (const k in dn) {                           // seit dem letzten Besuch der Übersicht abgeschickt
      const r = dn[k];
      if (r.status === 'offen' && (!rec || r.ts > rec.ts)) list.push({ qty: r.qty, price: r.price, valid: null, side: 'Verkauf', wert: +(r.qty * r.price).toFixed(2), neu: true });
    }
    list.sort((a, b) => a.price - b.price);        // niedrigstes Limit zuerst (Z1, Z2, Z3)
    const hm = ms => new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    const rows = list.map(o => {
      const nk = Object.keys(dn).find(k => Math.abs(dn[k].qty - o.qty) < 1e-6 && Math.abs(dn[k].price - o.price) < 0.006);
      let soll = '';
      const T = nk ? parseFloat($('t' + nk).value) : NaN;
      if (lastD && T) {
        const tp = tpPrice(lastD, T).price, dev = (o.price / tp - 1) * 100;
        soll = ` · Soll ${f(tp)} €` + (Math.abs(dev) >= 2 ? ` <b style="color:#ff6b6b">(${dev > 0 ? '+' : ''}${f(dev, 0)} %)</b>` : '');
      }
      return `<div style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-top:1px solid rgba(128,128,128,.25)">
        <span>${nk ? 'Z' + nk + ' · ' : ''}${o.side || ''} ${f(o.qty, 0)} Stk · Limit <b>${f(o.price)} €</b></span>
        <span>${o.wert != null ? f(o.wert) + ' €' : ''}</span></div>
        <div style="font-size:12px;opacity:.7;margin-top:-4px;padding-bottom:4px">${o.valid ? 'gültig bis ' + o.valid : ''}${o.neu ? 'neu abgeschickt' : ''}${soll}</div>`;
    }).join('');
    const bound = list.reduce((a, o) => a + (o.side !== 'Kauf' ? o.qty : 0), 0);
    const head = `<div style="display:flex;justify-content:space-between;align-items:baseline"><b style="font-size:16px">Offene Orders (${list.length})</b>
      <span style="font-size:12px;opacity:.7">${rec ? 'Stand ' + hm(rec.ts) : 'noch nicht geladen'}${bound ? ' · ' + f(bound, 0) + ' Stk gebunden' : ''}</span></div>`;
    const body = rows || `<div style="font-size:13px;opacity:.7;padding-top:6px">${rec ? 'Keine offenen Orders.' : 'Übersicht öffnen, um die Orders zu laden.'}</div>`;
    const html = head + body;
    if (blk && blk.parentElement === card && blk.dataset.sig === html) return;
    if (blk) blk.remove();
    blk = document.createElement('div');
    blk.id = 'ko-orders-block';
    blk.dataset.sig = html;
    blk.style.cssText = 'margin-top:16px;padding-top:12px;border-top:1px solid rgba(128,128,128,.35);font-size:14px;color:inherit';
    blk.innerHTML = html;
    card.appendChild(blk);
  }

  // ---------- Hintergrund-Abruf: Produktseite unsichtbar im iframe laden; das Skript im iframe speichert den Snapshot ----------
  const bgQueue = [], bgTried = new Set(), bgFail = new Set();
  let bgBusy = false, bgStatus = '';
  function bgLoad(ids, force) {
    if (inFrame) return;
    let added = false;
    for (const id of ids) if (id && (force || !bgTried.has(id)) && !bgQueue.includes(id)) { bgTried.add(id); bgQueue.push(id); added = true; }
    if (added && !bgBusy) bgNext();
  }
  function bgNext() {
    const id = bgQueue.shift();
    if (!id) { const was = bgBusy; bgBusy = false; bgStatus = ''; schedule(); if (was && document.getElementById('ko-dash')) openDash(); return; }
    bgBusy = true;
    const t0 = Date.now();
    const fr = document.createElement('iframe');
    fr.id = 'ko-bg'; fr.src = '/instrument/' + id; fr.setAttribute('aria-hidden', 'true'); fr.tabIndex = -1;
    fr.style.cssText = 'position:fixed;left:-20000px;top:0;width:1280px;height:1000px;opacity:0;pointer-events:none;border:0';
    document.body.appendChild(fr);
    bgStatus = `Lade im Hintergrund: ${id}${bgQueue.length ? ' (+' + bgQueue.length + ')' : ''}`;
    if (document.getElementById('ko-dash')) openDash();
    const iv = setInterval(() => {
      let sn = null; try { sn = JSON.parse(GM_getValue('snap:' + id, 'null')); } catch (e) { /* */ }
      const ok = !!(sn && sn.tsAt >= t0), late = Date.now() - t0 > 30000;
      if (!ok && !late) return;
      clearInterval(iv); fr.remove();
      if (ok) bgFail.delete(id); else bgFail.add(id);
      schedule();
      if (document.getElementById('ko-dash')) openDash();
      setTimeout(bgNext, 300);
    }, 500);
  }

  // ---------- Seite "Alle Trades" (Overlay, Daten aus dem gespeicherten Stand je Produkt) ----------
  let dashSort = { k: 'koP', dir: 1 };
  function collectTrades() {
    const bases = getBases(), hasBases = Object.keys(bases).length > 0, out = [];
    const pcs = [1, 2, 3].map(n => parseFloat(GM_getValue('p' + n, n === 3 ? 0 : 50)) || 0);
    for (const k of GM_listValues()) {
      if (!k.startsWith('snap:')) continue;
      const id = k.slice(5);
      let d = null; try { d = JSON.parse(GM_getValue(k, 'null')); } catch (e) { /* */ }
      if (!d || !(d.ko || d.stock) || !d.ask) continue;
      enrichStock(d, id);
      if (d.stock && d.tcur === '$' && !(d.fxo > 0.9)) continue;
      const total = bases[id] || (hasBases ? 0 : (d.qty || 0));    // in der Übersicht nicht mehr vorhanden = geschlossen
      if (!total) continue;
      const ui = underlyingInfo(d), S = ui.S, cs = d.stock ? d.tcur : (d.cur || '$'), ek = d.ek || null, bid = d.bid || d.ask;
      const stopRef = d.stock ? d.stopT : d.ko, fx = d.stock && d.tcur === '$' ? d.fxo : 1;
      const qs = plan(total, pcs), dn = getDone(id);
      const zs = [1, 2, 3].map(n => {
        const T = parseFloat(GM_getValue('t' + n + ':' + id, ''));
        if (!T) return null;
        const tp = tpPrice(d, T).price, pr = dn[n], q = pr ? pr.qty : qs[n - 1], px = pr ? pr.price : tp;
        return { n, T, dA: T - S, dP: (T - S) / S * 100, tp, st: pr ? pr.status : null, lim: pr ? pr.price : null, q,
          gain: ek && q ? q * (px - ek) : null, crv: stopRef ? (T - S) / (S - stopRef) : null };
      }).filter(Boolean);
      out.push({ id, name: d.uname || '', total, ek, bid, value: total * bid, pl: ek ? total * (bid - ek) : null,
        plP: ek ? (bid / ek - 1) * 100 : null, S, cs, src: ui.src, stock: !!d.stock, ko: stopRef, koA: stopRef ? S - stopRef : null, koP: stopRef ? (S - stopRef) / S * 100 : null, zs,
        risk: ek ? total * (d.stock && stopRef ? Math.max(0, ek - stopRef / fx) : ek) : 0,
        gain: zs.some(z => z.gain != null) ? zs.reduce((a, z) => a + (z.gain || 0), 0) : null, tsAt: d.tsAt || null, ts: d.ts || '',
        hold: holdInfo(id), rem: (+GM_getValue('z1hit:' + id, 0) || 0) > (+GM_getValue('slok:' + id, 0) || 0) });
    }
    return out;
  }

  function openDash() {
    let ov = document.getElementById('ko-dash');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'ko-dash';
      document.body.appendChild(ov);
      ov.addEventListener('click', ev => {
        const t = ev.target.closest('[data-k],[data-act]');
        if (!t) return;
        if (t.dataset.act === 'close') { ov.remove(); if (location.hash === '#ko-dashboard') history.replaceState(null, '', location.pathname + location.search); return; }
        if (t.dataset.act === 'reload') { openDash(); return; }
        if (t.dataset.act === 'bgall') { bgLoad([...new Set([...Object.keys(getBases()), ...collectTrades().map(r => r.id)])], true); return; }
        if (t.dataset.act === 'reset') {
          if (!confirm('Gespeicherte Kursdaten (Snapshots) und Positionsbasis löschen?\nZiele, Anteile und Häkchen bleiben erhalten. Danach Übersicht und Produktseiten einmal öffnen.')) return;
          for (const k of GM_listValues()) if (k.startsWith('snap:')) GM_setValue(k, 'null');
          GM_setValue('bases', '{}'); wrote.clear();
          openDash(); return;
        }
        if (t.dataset.k) { dashSort = { k: t.dataset.k, dir: dashSort.k === t.dataset.k ? -dashSort.dir : 1 }; openDash(); }
      });
    }
    const rows = collectTrades();
    const known = new Set(rows.map(r => r.id));
    const missing = Object.keys(getBases()).filter(id => !known.has(id));
    if (missing.length) bgLoad(missing);                // Positionen ohne gespeicherte Daten automatisch nachladen
    const val = (r, k) => k === 'name' ? (r.name || r.id) : k === 'z1' ? (r.zs[0] ? r.zs[0].dP : 1e9) : k === 'age' ? -(r.tsAt || 0) : k === 'hold' ? (r.hold ? r.hold.days : -1) : (r[k] == null ? -1e12 : r[k]);
    rows.sort((a, b) => { const x = val(a, dashSort.k), y = val(b, dashSort.k); return (x > y ? 1 : x < y ? -1 : 0) * dashSort.dir; });
    const sg = v => v >= 0 ? '+' : '−', eur = v => sg(v) + f(Math.abs(v), 0) + ' €';
    const cls = v => v == null ? '' : v >= 0 ? 'p' : 'n';
    const nd = x => Math.abs(x) < 20 ? 4 : 2;
    const koCls = p => p < 5 ? 'n' : p < 10 ? 'm' : 'p';
    const age = r => {
      if (!r.tsAt) return `<span class="m">${r.ts || '–'}</span>`;
      const min = (Date.now() - r.tsAt) / 60000;
      const t = min < 60 ? `vor ${Math.round(min)} min` : min < 1440 ? `vor ${Math.round(min / 60)} h` : `vor ${Math.round(min / 1440)} T`;
      return `<span class="${min < 30 ? '' : min < 1440 ? 'm' : 'n'}">${t}</span>`;
    };
    const zcell = z => !z ? '<td class="s">–</td>' :
      `<td><b>${f(z.T, nd(z.T))}</b> <span class="${cls(z.dA)}">${sg(z.dA)}${f(Math.abs(z.dP), 1)} %</span>
       <div class="s">${sg(z.dA)}${f(Math.abs(z.dA), nd(z.dA))} · TP ${f(z.tp)} € · ${z.q || 0} Stk
       ${z.st === 'ausgeführt' ? '<span class="p">✓✓</span>' : z.st ? '<span class="p">✓</span>' + (Math.abs(z.lim / z.tp - 1) >= 0.02 ? ` <span class="m">Limit ${f(z.lim)}</span>` : '') : '<span class="m">keine Order</span>'}</div></td>`;
    const H = (k, t) => `<th data-k="${k}">${t}${dashSort.k === k ? (dashSort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
    const noBuy = rows.filter(r => !r.hold || r.hold.approx);
    let body = '', sv = 0, spl = 0, sg2 = 0, ek0 = 0;
    for (const r of rows) {
      sv += r.value; if (r.pl != null) spl += r.pl; if (r.gain != null) sg2 += r.gain; ek0 += r.risk || 0;
      body += `<tr>
        <td><a href="/instrument/${r.id}">${r.name || r.id}</a><div class="s">${r.id}${r.rem ? ' <span class="m">⚑ Stop nachziehen</span>' : ''}</div></td>
        <td>${r.total}<div class="s">${f(r.value, 0)} €</div></td>
        <td>${r.ek ? f(r.ek, 3) : '–'} → ${f(r.bid, 3)} €<div class="${cls(r.pl)}">${r.pl == null ? '' : eur(r.pl) + ' · ' + sg(r.plP) + f(Math.abs(r.plP), 1) + ' %'}</div></td>
        <td><b>${f(r.S, nd(r.S))} ${r.cs}</b><div class="s">${r.stock ? 'Aktie' : r.src === 'stale' ? '<span class="m">Stand Kennzahlen</span>' : r.src === 'preis' ? 'aus Preis' : 'live'}</div></td>
        <td>${r.koP == null ? '<span class="m">kein Stop</span>' : `<span class="${koCls(r.koP)}">−${f(r.koP, 1)} %</span><div class="s">−${f(r.koA, nd(r.koA))} ${r.cs} · ${r.stock ? 'Stop' : 'KO'} ${f(r.ko, nd(r.ko))}</div>`}</td>
        ${zcell(r.zs.find(z => z.n === 1))}${zcell(r.zs.find(z => z.n === 2))}${zcell(r.zs.find(z => z.n === 3))}
        <td class="${cls(r.gain)}">${r.gain == null ? '–' : eur(r.gain)}</td>
        <td>${r.hold ? `<b style="color:${r.hold.col}">W${r.hold.week}</b> <span class="s">${r.hold.approx ? '≥' : ''}${r.hold.days} T</span>` : '<span class="s">–</span>'}</td>
        <td>${age(r)}</td></tr>`;
    }
    ov.innerHTML = `<style>
      #ko-dash{position:fixed;inset:0;z-index:100000;background:rgba(14,16,18,.97);color:#e6e6e6;font:13px/1.45 system-ui,sans-serif;overflow:auto;padding:24px 28px}
      #ko-dash h2{margin:0;font-size:20px;color:#64b5f6}#ko-dash .bar{display:flex;gap:10px;align-items:center;margin-bottom:14px}
      #ko-dash button{background:#24282c;color:#e6e6e6;border:1px solid #444a50;border-radius:6px;padding:5px 12px;cursor:pointer;font:inherit}
      #ko-dash table{width:100%;border-collapse:collapse}#ko-dash th{color:#8d98a3;font-weight:500;text-align:left;padding:6px 8px;cursor:pointer;white-space:nowrap;border-bottom:1px solid #333}
      #ko-dash td{padding:8px;border-bottom:1px solid #262a2e;vertical-align:top;white-space:nowrap}#ko-dash tr:hover td{background:#1b1f22}
      #ko-dash a{color:#e6e6e6;font-weight:600;text-decoration:none}#ko-dash a:hover{color:#64b5f6}
      #ko-dash .s{font-size:11.5px;color:#9aa5b0}#ko-dash .p{color:#4caf50}#ko-dash .n{color:#ff6b6b}#ko-dash .m{color:#f0c060}
      #ko-dash .sum td{font-weight:700;border-top:2px solid #3a3f44;border-bottom:0}
      #ko-dash .cards{display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap}#ko-dash .card{background:#1b1f22;border:1px solid #2e3338;border-radius:8px;padding:10px 14px;min-width:150px}
      #ko-dash .card b{display:block;font-size:18px}</style>
      <div class="bar"><h2>Alle Trades</h2><span class="s">${rows.length} Positionen · Werte vom letzten Abruf der jeweiligen Produktseite</span>
        <span class="m">${bgStatus}${bgFail.size ? ' · fehlgeschlagen: ' + [...bgFail].join(', ') : ''}</span>
        <button data-act="bgall" style="margin-left:auto" title="Alle Produktseiten nacheinander unsichtbar laden">Alle im Hintergrund aktualisieren</button>
        <button data-act="reload">Aktualisieren</button>
        <button data-act="reset" title="Gespeicherte Kurse und Positionsbasis löschen; Ziele, Anteile und Häkchen bleiben">Kursdaten zurücksetzen</button><button data-act="close">Schließen</button></div>
      <div class="cards">
        <div class="card"><span class="s">Positionswert (Bid)</span><b>${f(sv, 0)} €</b></div>
        <div class="card"><span class="s">G/V offen</span><b class="${cls(spl)}">${eur(spl)}</b></div>
        <div class="card"><span class="s">Erwarteter Gewinn alle Ziele</span><b class="${cls(sg2)}">${eur(sg2)}</b></div>
        <div class="card"><span class="s">Risiko bei KO/Stop (vom Einstand)</span><b class="n">−${f(ek0, 0)} €</b></div></div>
      ${noBuy.length ? `<div class="hint" style="background:#3a3010;border:1px solid #f0c060;color:#f0c060;border-radius:8px;padding:8px 12px;margin-bottom:14px">⚠ Kaufdatum für ${noBuy.length} von ${rows.length} Positionen unbekannt (Haltedauer mit „≥“ zählt erst ab erstmals gesehen).
        Auf der <b>Übersicht</b> in der Orders-Liste den Reiter <b>„Ausgeführt“</b> öffnen, bei älteren Käufen „Mehr anzeigen“ – oder auf der Produktseite auf „Haltedauer“ klicken und das Datum setzen.</div>` : ''}
      <table><tr>${H('name', 'Produkt')}${H('value', 'Stk / Wert')}${H('plP', 'Einstand → Bid')}<th>Underlying</th>${H('koP', 'bis KO (Stop)')}${H('z1', 'Z1')}<th>Z2</th><th>Z3</th>${H('gain', 'erw. Gewinn')}${H('hold', 'Haltedauer')}${H('age', 'Stand')}</tr>
        ${body || '<tr><td colspan="11" class="s">Noch keine Daten. Produktseiten einmal öffnen.</td></tr>'}
        ${rows.length ? `<tr class="sum"><td>Summe</td><td>${f(sv, 0)} €</td><td class="${cls(spl)}">${eur(spl)}</td><td></td><td></td><td></td><td></td><td></td><td class="${cls(sg2)}">${eur(sg2)}</td><td></td><td></td></tr>` : ''}
      </table>
      <div class="s" style="margin-top:12px">Ohne Gebühren/Steuern. "bis KO" = Abstand des Underlyings zum Knock-out (Totalverlust). Spalten mit Pfeil sind sortierbar.</div>`;
  }
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && document.getElementById('ko-dash')) document.getElementById('ko-dash').remove(); });
  window.addEventListener('hashchange', () => { if (location.hash === '#ko-dashboard') openDash(); });

  function render() {
    try { renderInner(); }
    catch (e) { $('out').textContent = 'Fehler: ' + e.message; }
  }

  box.addEventListener('input', render);
  // Ereignisgesteuert statt Dauer-Polling: nur rechnen, wenn sich die Seite ändert (SPA lädt Inhalte nach,
  // Reiterwechsel, "Mehr anzeigen", Live-Kurse). Eigene Änderungen (Rechner, Buttons, Block, Banner) lösen nichts aus.
  const ours = n => { const e = n && (n.nodeType === 1 ? n : n.parentElement); return !!e && (box.contains(e) || !!e.closest('.ko-open, #ko-orders-block, #ko-limit-banner, #ko-dash, #ko-bg')); };
  let moTimer = null, lastRun = Date.now();
  const schedule = () => {
    if (moTimer) return;
    moTimer = setTimeout(() => { moTimer = null; if (document.hidden) return; lastRun = Date.now(); render(); },
      Math.max(400, 1500 - (Date.now() - lastRun)));      // höchstens alle 1,5 s
  };
  new MutationObserver(ms => {
    if (ms.some(m => !(ours(m.target) || (m.type === 'childList' && [...m.addedNodes, ...m.removedNodes].every(ours))))) schedule();
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });
  window.addEventListener('resize', () => { lastShiftAt = 0; schedule(); });
  setInterval(() => { if (!document.hidden) render(); }, 15000);
  if (location.hash === '#ko-dashboard' && !inFrame) openDash();
  render();

  // Nach Weiterleitung: Maske automatisch befüllen (einmalig, max. 60 s alt)
  try {
    const pd = JSON.parse(GM_getValue('pending', 'null'));
    if (pd) {
      GM_setValue('pending', 'null');
      if (Date.now() - pd.ts < 60000 && pd.isin === getIsin() && /direction=sell/.test(location.search)) { if (pd.kind) fillStop(pd.kind, pd.n); else fillMask(pd.n); }
    }
  } catch (e) { /* ignorieren */ }
})();
