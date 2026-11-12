// ==UserScript==
// @name         KO-Zertifikat TP-Rechner (lokal aus Git)
// @namespace    max.tools
// @version      0.1
// @description  Lädt den Rechner direkt aus dem lokalen Git-Klon. Nach "git pull" reicht ein Neuladen der Seite.
// @match        https://mein.finanzen-zero.net/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_listValues
// @grant        GM_setClipboard
// @require      file:///C:/Users/DEINNAME/git/userscripts/ko-tp-rechner/ko-tp-rechner.user.js
// ==/UserScript==
// Pfad oben anpassen. Voraussetzung in Chrome/Edge: Erweiterungen -> Tampermonkey -> Details -> "Zugriff auf Datei-URLs zulassen".
// @match/@grant gelten aus DIESEM Header; der Header der eingebundenen Datei wird ignoriert.
// Wichtig: Gespeicherte Daten (Ziele, Häkchen ...) gehören zum jeweiligen Skript. Beim Umstieg vom normalen Skript
// vorher dort "Export" klicken und hier "Import".
