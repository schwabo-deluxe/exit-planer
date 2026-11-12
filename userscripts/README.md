# Userscripts

Tampermonkey-Skripte, versioniert im öffentlichen Repo [schwabo-deluxe/exit-planer](https://github.com/schwabo-deluxe/exit-planer).

| Ordner | Inhalt |
|---|---|
| `ko-tp-rechner/` | KO-TP-Rechner für Finanzen Invest (`mein.finanzen-zero.net`) |
| `viguard/` | viGuard-Userscript (hier ablegen) |
| `test/` | automatische Tests (jsdom) |

## Einrichten

```bash
git clone git@github.com:schwabo-deluxe/exit-planer.git
cd exit-planer/userscripts
npm install
npm test
```

## In Tampermonkey nutzen

**A) Installation mit Auto-Update (empfohlen)**
1. [ko-tp-rechner.user.js (raw)](https://raw.githubusercontent.com/schwabo-deluxe/exit-planer/main/userscripts/ko-tp-rechner/ko-tp-rechner.user.js) im Browser öffnen, Tampermonkey zeigt den Installationsdialog.
2. Tampermonkey prüft über `@updateURL` regelmäßig (Standard: täglich) und installiert, sobald `@version` höher ist. Sofort: Dashboard → „Nach Updates suchen“. GitHub raw cached ca. 5 Minuten.

**B) Dev-Loader aus dem lokalen Klon (zum Entwickeln)**
1. Chrome/Edge: Erweiterungen → Tampermonkey → Details → **„Zugriff auf Datei-URLs zulassen“** einschalten.
2. In `ko-tp-rechner/dev-loader.user.js` den Pfad in `@require file:///…` anpassen und dieses Skript in Tampermonkey installieren.
3. Änderungen wirken nach Neuladen der Seite, ohne Push.

`@match` und `@grant` gelten aus dem Header des Dev-Loaders. Kommen im Hauptskript neue `@grant`s dazu, müssen sie dort nachgetragen werden.

Nur eine Variante gleichzeitig aktiv lassen. Die gespeicherten Daten (Ziele, Häkchen, Haltedauer …) gehören zum jeweiligen Tampermonkey-Skript: beim Wechsel vorher im alten Skript **Export**, im neuen **Import**. Ein bereits manuell installiertes Hauptskript (gleicher `@name`/`@namespace`) wird bei A ersetzt, die Daten bleiben.

## Änderungen veröffentlichen

1. Code ändern, `@version` im Header und den Titel im Rechner (`KO-TP-Rechner vX.Y`) hochzählen.
2. `npm run check && npm test`
3. `git commit -am "1.42: …"` und `git push`. Tampermonkey-Installationen (Variante A) ziehen das Update automatisch.
4. Optional Release markieren: `git tag v1.42 && git push --tags`.

Zurück auf eine ältere Version: `git checkout v1.41 -- ko-tp-rechner/ko-tp-rechner.user.js`

## Daten gehören nicht ins Repo

Export-Strings (`KOTP1z.…`), Broker-Exporte (CSV) und Notizen mit Positionen enthalten persönliche Finanzdaten. `.gitignore` schließt `*.csv`, `*.export.txt` und `exports/` aus.
