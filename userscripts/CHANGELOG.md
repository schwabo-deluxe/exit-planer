# Changelog KO-TP-Rechner

## 1.55
- Erweiterte Statistik auf `/statistik`: Gewinn gesamt (Depot + Cash + Auszahlungen − Einzahlungen), Rendite auf Netto-Einlage, offen/realisiert
- Abgeschlossene Trades (FIFO aus gespeicherten Ausführungen): Winrate, Ø Gewinn/Verlust, realisiertes CRV, Profit-Faktor, Erwartung, Ø Rendite, Ø Haltedauer, bester/schlechtester Trade
- Offene Positionen: Ø geplantes CRV bis Z1 und aller offenen Ziele, Risiko bei KO/Stop
- Ausführungen aus „Ausgeführt“ werden dauerhaft gespeichert (auch im Export)

## 1.54
- „nächstes Ziel“ farbig nach Abstand: grün < 10 %, gelb 10–50 %, rot ab 50 %, blau = erreicht

## 1.53
- „Alle Trades“: Spalte „nächstes Ziel“ (Abstand des Underlyings zum nächsten nicht ausgeführten Ziel), sortierbar

## 1.52
- Fix: offene Orders wurden nur auf der Übersicht erkannt, nicht auf „Meine Orders“ (keine Positionstabelle) – Ziele zeigten „keine Order“. Jetzt werden sie auch dort zugeordnet

## 1.51
- Fix: verkaufte Positionen tauchten wieder in der Positionsbasis auf (alter Snapshot aus Verkaufsmaske/Orders-Liste) und wurden in „Alle Trades“ ständig im Hintergrund nachgeladen. Bestand wird nur noch von der Produktseite bzw. Übersicht übernommen

## 1.50
- „Alle Trades“: Klick auf ein Ziel öffnet „Meine Orders“, gefiltert auf dieses Produkt (Banner mit „Alle zeigen“; Filter endet beim Verlassen der Seite)
- Rechner: Erlös je Ziel unter dem Gewinn (= „Geschätztes Ordervolumen“ der Maske)

## 1.49
- Fix: „Z1 erreicht“ blieb stehen, nachdem Z1 geändert wurde. Die Erinnerung gilt jetzt nur für das Ziel, bei dem sie ausgelöst wurde; geändertes und nicht erreichtes Z1 verwirft sie (Rechner und „Alle Trades“)

## 1.48
- Fix: offene Orders konnten Z2/Z3 vertauscht zugeordnet werden, wenn die TPs wanderten. Zuordnung jetzt als beste Gesamtlösung: höheres Ziel = höheres Limit, Stückzahl laut Aufteilung zählt mit; bestehende Vertauschungen korrigieren sich beim nächsten Öffnen von „Offen“

## 1.47
- Fix: Kaufdatum wurde auf der Orders-Seite ohne Positionstabelle nicht übernommen
- Kaufzeit = Beginn der laufenden Position (vom Bestand rückwärts gerechnet, Teilverkäufe/Nachkäufe berücksichtigt); reicht die Liste nicht so weit zurück, gilt der älteste sichtbare Kauf als Untergrenze („≥“)

## 1.46
- TP = innerer Wert am Ziel: (Ziel − KO) × BV / EUR/USD. Hängt nicht mehr vom aktuellen Ask ab (Spread, Aufgeld, vorbörsliche Kurse bei altem US-Basiswertkurs); Rückfall auf die Ask-Hochrechnung nur, wenn BV oder EUR/USD fehlen bzw. nicht zum Preis passen
- Limit-Warnung rechnet das Limit aufs Underlying zurück und warnt ab 0,5 % Abweichung vom Ziel (statt 2 % Preisabweichung zum TP)

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
