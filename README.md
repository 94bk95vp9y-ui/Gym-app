# Gym

Private Trainings-App für das iPhone: Pläne, Training, Supplements – und
bei Bedarf eine kurze Mobility-Routine. Läuft komplett im Browser, ohne
Anmeldung und ohne Server. Alle Daten liegen nur lokal auf dem Gerät
(`localStorage`). Als App auf dem Homescreen installierbar, funktioniert
danach auch offline.

## Funktionen

**Heute**
- Nächstes Training (Plan-Rotation) mit Start-Knopf, laufendes oder heute
  erledigtes Training
- Supplements des Tages zum Abhaken, Hinweis bei knappem Vorrat
- Wochenstreifen mit Wochenziel und Serie
- Mobility als kleine Zeile, Hinweis auf eine fällige Sicherung

**Training**
- Pläne anlegen und bearbeiten (Reihenfolge per Ziehen, Satzzahl pro Übung)
- Pläne per KI erstellen: Prompt kopieren, Antwort der KI einfügen
- Übungsbibliothek mit 138 Übungen nach Muskelgruppe, eigene Übungen
- Übungsdetail: Bestleistung, geschätztes 1RM, Verlauf, Notiz zur Ausführung,
  eigene Satzpause

**Training läuft**
- Die aktuelle Übung ist hervorgehoben, fertige Übungen klappen zu und die
  nächste rückt ins Bild
- Spalte „Vorher“ und vorausgefüllte Werte vom letzten Mal
- Pausentimer nach jedem Satz (Standard oder pro Übung), zeigt den nächsten Satz
- Rekord-Erkennung, Gewichts-Empfehlung, Hinweis bei anderer Vorbelastung
- Notiz pro Übung, Übung ersetzen, Reihenfolge ändern, Sätze löschen mit
  „Rückgängig“
- Zusammenfassung: Rekorde, Vergleich mit dem letzten Mal, Plan-Änderungen
  übernehmen bzw. freies Training als Plan speichern

**Supplements**
- Abhaken nach Tageszeit, Kalender zum Nachtragen, Serie und Quote
- Vorrat: zählt beim Abhaken herunter, „Neue Packung“ füllt auf
- Tägliche Erinnerung über den iPhone-Kalender (`reminders/*.ics`)

**Verlauf**
- Kalender und Liste aller Trainings mit Detailansicht
- Statistik: Woche, Trainings pro Woche, Kraftentwicklung, Sätze pro Muskel,
  Rekorde

**Mobility**
- Tägliche Routine (Hüfte & Beine plus Tagesfokus, Dauer einstellbar)
- Zwei tiefe Einheiten für die Beine
- Geführter Player mit 3D-Figur, Atemführung und Sprachansage

**Einstellungen**
- kg/lb, Wochenziel, Satzpause, Gewichts-Empfehlung, Bildschirm anlassen
- Hell, Dunkel oder wie das iPhone, Akzentfarbe, Töne
- Sicherung erstellen/wiederherstellen (JSON), Erinnerung an die Sicherung

## Hosting auf GitHub Pages

1. **Settings → Pages** öffnen.
2. Unter **Build and deployment** → **Source**: `Deploy from a branch`.
3. Branch wählen, Ordner `/ (root)`, **Save**.
4. Nach ein bis zwei Minuten ist die App unter
   `https://<github-name>.github.io/<repo-name>/` erreichbar.

## Auf dem iPhone installieren

1. Die URL in **Safari** öffnen.
2. Teilen-Symbol → **Zum Home-Bildschirm**.
3. Updates kommen von selbst. Nur ein neues App-Icon übernimmt iOS erst,
   wenn die App entfernt und neu hinzugefügt wird. Vorher unbedingt eine
   Sicherung erstellen – beim Entfernen kann iOS die Daten der App löschen –
   und sie danach in der neuen App wiederherstellen.

## Struktur

```
index.html              App-Gerüst
css/app.css             Design-System (hell/dunkel)
js/main.js              Start, globale Ereignisse
js/core/                Daten und Logik ohne Oberfläche
  store.js              localStorage, Migration, Sicherung
  training.js           Vorschläge, Rekorde, Statistik, Plan-Rotation
  supplements.js        Tage, Serie, Vorrat, Erinnerungen
  plan-import.js        KI-Prompt und Parser
  catalog.js            Übungskatalog
js/ui/                  Router, Bausteine, Sheets, Dialoge, Icons, Diagramme
js/views/               Heute, Training, Workout, Supplements, Verlauf,
                        Einstellungen, Mobility
js/mobility/            Routinen, Player, 3D-Figur (three.js)
service-worker.js       Offline-Cache
```

## Daten sichern

Alles liegt nur lokal auf dem Gerät. In den Einstellungen regelmäßig
**Sicherung erstellen** nutzen – die App erinnert nach 14 Tagen daran.
