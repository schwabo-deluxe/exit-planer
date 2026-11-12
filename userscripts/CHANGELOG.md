# Changelog KO-TP-Rechner

## 1.45
- Kaufdatum aus der Timeline des Produkts (`/instrument/<ISIN>/timeline`), in „Alle Trades“ automatisch im Hintergrund abgefragt; liefert nur den Tag (Valuta), Anzeige mit „~“
- „Ausgeführt“ liefert weiter die genaue Kaufzeit und hat Vorrang vor der Timeline
- Fix: Käufe im Reiter „Ausgeführt“ wurden nicht erkannt (Icon-Zeichen nach der ISIN, Minuszeichen „−“ im Wert)

## 1.44
- Hinweis in „Alle Trades“ und im Rechner, wenn das Kaufdatum unbekannt ist (Reiter „Ausgeführt“ öffnen oder manuell setzen)
- Auto-Update über GitHub raw (`@updateURL`/`@downloadURL`)

## 1.43
- Aktien-Modus: Aktienseiten werden erkannt (Name, Bid/Ask), Ziele/Stop in $ (über EUR/USD) oder €
- Eigenes Stop-Feld: CRV, Abstand zum Stop und Positionsgröße nach Risiko bis Stop
- „Alle Trades“: Aktien mit Stop-Abstand, Risiko-Kachel rechnet bis Stop

## 1.42
- Stop-Loss nachziehen per Maske: „Stop → Maske“ (freie Stücke, Stop = Einstand) und „Zn als OCO → Maske“ (Limit = TP, Stop = Einstand)
- Rückfrage, wenn für das Ziel noch eine Limit-Order besteht; nach dem Abschicken gilt der Stop als nachgezogen
- Bestätigungsseite warnt nur noch bei Marktorders (OCO/Stop sind ok)

## 1.41
- Haltedauer-Tracker (Wochen 1-8, farbcodiert), Kaufdatum aus „Ausgeführt“ oder manuell
- Reminder „Stop-Loss nachziehen“ bei Erreichen von Z1
- Spalte Haltedauer in „Alle Trades“

## 1.40
- Hintergrund-Abruf fehlender Produktdaten (unsichtbares iframe)

## 1.39
- Fix: eigene Anzeige wurde als Seiteninhalt gelesen (aufschaukelnde Positionsbasis)

## 1.38
- Fix: Produktwechsel ohne Neuladen speicherte Werte unter falscher ISIN; „Kursdaten zurücksetzen“

Ältere Versionen (1.0-1.37): Entwicklung vor dem Repo.
