# Userscripts

Tampermonkey-Skripte, versioniert in einem privaten Repo.

| Ordner | Inhalt |
|---|---|
| `ko-tp-rechner/` | KO-TP-Rechner für Finanzen Invest (`mein.finanzen-zero.net`) |
| `viguard/` | viGuard-Userscript (hier ablegen) |
| `test/` | automatische Tests (jsdom), laufen lokal und in GitHub Actions |

## Einrichten

```bash
git clone git@github.com:<DEIN-USER>/userscripts.git
cd userscripts
npm install
npm test
```

## In Tampermonkey nutzen (privates Repo)

Tampermonkey kann sich nicht bei GitHub anmelden, Auto-Updates direkt aus einem privaten Repo gehen daher nicht. Zwei Wege:

**A) Dev-Loader aus dem lokalen Klon (empfohlen)**
1. Chrome/Edge: Erweiterungen → Tampermonkey → Details → **„Zugriff auf Datei-URLs zulassen“** einschalten.
2. In `ko-tp-rechner/dev-loader.user.js` den Pfad in `@require file:///…` anpassen und dieses Skript in Tampermonkey installieren.
3. Updates: `git pull`, Seite neu laden. Fertig, auf jedem PC.

`@match` und `@grant` gelten aus dem Header des Dev-Loaders. Kommen im Hauptskript neue `@grant`s dazu, müssen sie dort nachgetragen werden.

**B) Klassisch**
Nach `git pull` den Inhalt von `ko-tp-rechner/ko-tp-rechner.user.js` im Tampermonkey-Editor ersetzen und mit Strg+S speichern.

Wechsel zwischen A und B: Die gespeicherten Daten (Ziele, Häkchen, Haltedauer …) gehören zum jeweiligen Tampermonkey-Skript. Vorher im alten Skript **Export**, im neuen **Import**.

## Änderungen veröffentlichen

1. Code ändern, `@version` im Header und den Titel im Rechner (`KO-TP-Rechner vX.Y`) hochzählen.
2. `npm run check && npm test`
3. `git commit -am "1.42: …"` und `git push`. GitHub Actions führt die Tests erneut aus.
4. Optional Release markieren: `git tag v1.42 && git push --tags`.

Zurück auf eine ältere Version: `git checkout v1.41 -- ko-tp-rechner/ko-tp-rechner.user.js`

## Daten gehören nicht ins Repo

Export-Strings (`KOTP1z.…`), Broker-Exporte (CSV) und Notizen mit Positionen enthalten persönliche Finanzdaten. `.gitignore` schließt `*.csv`, `*.export.txt` und `exports/` aus.
