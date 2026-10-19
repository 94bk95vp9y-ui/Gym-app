# Gym

Private Trainings-App für das iPhone: Pläne, Training, Supplements – und
bei Bedarf eine kurze Mobility-Routine. Läuft komplett im Browser, ohne
Anmeldung und ohne Server. Alle Daten liegen nur lokal auf dem Gerät
(`localStorage`). Als App auf dem Homescreen installierbar, funktioniert
danach auch offline.

## Funktionen

**Heute**
- Nächstes Training (Plan-Rotation) mit Start-Knopf; „Wechseln“ öffnet die
  Planauswahl direkt am Knopf
- Laufendes oder heute erledigtes Training
- Supplements des Tages zum Abhaken, Hinweis bei knappem Vorrat
- Wochenstreifen mit Wochenziel, Mobility als kleine Kachel, Hinweis auf
  eine fällige Sicherung

**Training**
- Pläne anlegen und bearbeiten (Reihenfolge per Ziehen, Satzzahl pro Übung)
- Pläne per KI erstellen: Prompt kopieren, Antwort der KI einfügen
- Übungsbibliothek mit 138 Übungen nach Muskelgruppe, eigene Übungen
- Übungsdetail: Bestleistung, geschätztes 1RM als Verlauf (mit dem Finger
  abfahren), Notiz zur Ausführung, eigene Satzpause
- Lange drücken auf einen Plan: starten, bearbeiten, duplizieren, löschen

**Training läuft**
- Wächst aus der angetippten Karte heraus, minimiert schrumpft es in die
  Leiste über den Tabs
- Eigenes Zahlenfeld für Gewicht und Wiederholungen: große Tasten, ± in
  2,5-kg- bzw. 1-Wdh-Schritten, „Weiter“ springt zum nächsten Feld,
  „Abhaken“ schließt den Satz ab (in den Einstellungen abschaltbar)
- Die aktuelle Übung ist hervorgehoben, fertige Übungen klappen zu
- Spalte „Vorher“ – antippen übernimmt die Werte vom letzten Mal
- Satz nach links wischen zum Löschen, mit „Rückgängig“
- Pausentimer nach jedem Satz (Standard oder pro Übung), zeigt den nächsten Satz
- Rekord-Erkennung, Hinweis bei anderer Vorbelastung
- Zusammenfassung: Kennzahlen, Rekorde, jede Übung im Vergleich zum letzten
  Mal, Plan-Änderungen übernehmen bzw. freies Training als Plan speichern

**Steigerung (Ziel je Übung)**
- Doppelprogression: erst mehr Wiederholungen, dann mehr Gewicht – sobald
  jeder Arbeitssatz das obere Ende des Wiederholungsbereichs erreicht
- Wiederholungsbereich und Gewichtssprung je Übung automatisch (Übungsart,
  eigener Verlauf) oder selbst gewählt; großer Sprung (z. B. leichte
  Kurzhanteln) erst nach ein paar Wdh mehr
- Plateau-Erkennung mit Vorschlag zum Neuaufbau, leichterer Wiedereinstieg
  nach drei und mehr Wochen Pause
- Im Training: Ziel-Karte mit Fortschritt bis zum nächsten Gewicht,
  markierte Zielfelder, „+1 Wdh“ beim Abhaken, „Stufe geschafft“; Antippen
  der Karte zeigt Details und erlaubt eine eigene Wahl
- Ausblick in der Zusammenfassung, Etiketten auf der Plan-Seite, eigener
  Abschnitt auf der Übungsseite

**Supplements**
- Abhaken nach Tageszeit, Kalender mit einem Ring pro Tag zum Nachtragen,
  Serie und Quote
- Vorrat: zählt beim Abhaken herunter, „Neue Packung“ füllt auf
- Tägliche Erinnerung über den iPhone-Kalender (`reminders/*.ics`)

**Verlauf**
- Kalender und Liste aller Trainings (erst die letzten sechs Monate, ältere
  auf Wunsch) mit Detailansicht und Vergleich zum letzten Mal
- Statistik: Woche, Trainings pro Woche mit Ziellinie, Kraftentwicklung,
  Sätze pro Muskel, Rekorde

**Mobility**
- Tägliche Routine (Hüfte & Beine plus Tagesfokus, Dauer einstellbar)
- Beinplan in vier Blöcken (Aufwärmen, mit Gewicht in tiefer Position,
  statisch dehnen, aktive Beweglichkeit) – mit Gewicht oder für die anderen
  Tage ohne, dafür mit mehr aktiver Beweglichkeit; mit Sätzen und Pausen
- Zwei tiefe Einheiten für die Beine
- Geführter Player mit 3D-Figur, Atemführung und Sprachansage

**Einstellungen**
- kg/lb, Wochenziel, Satzpause, Steigerungs-Ziele, Zahlenfeld, Bildschirm
  anlassen
- Hell, Dunkel oder wie das iPhone, Akzentfarbe, Transparenz reduzieren,
  Haptik, Töne
- Sicherung erstellen/wiederherstellen (JSON), Erinnerung an die Sicherung

## Bedienung wie in iOS

- Schwebende Tableiste und Kopfknöpfe aus Glas, Inhalte auf ruhigen Flächen
- Seitenwechsel mit Parallaxe; vom linken Rand wischen geht zurück, die
  vorige Seite ist dabei schon zu sehen
- Menüs öffnen direkt am Knopf, langes Drücken öffnet Kontextmenüs
- Haptisches Klopfen beim Abhaken und im Zahlenfeld (über einen
  unsichtbaren Schalter – Safari bietet Web-Apps keine Vibration an)
- Zahlen in SF Pro Rounded, Federkurven nach Apples Vorbild,
  „Bewegung reduzieren“ wird respektiert

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
css/app.css             Design-System (hell/dunkel, Glas, Bewegung)
js/main.js              Start, globale Ereignisse
js/core/                Daten und Logik ohne Oberfläche
  store.js              localStorage, Migration, Sicherung
  training.js           Vorschläge, Rekorde, Vergleiche, Statistik, Plan-Rotation
  supplements.js        Tage, Serie, Vorrat, Erinnerungen
  plan-import.js        KI-Prompt und Parser
  catalog.js            Übungskatalog
js/ui/                  Router (Übergänge, Wisch-zurück), Sheets und Menüs,
                        Zahlenfeld, Wischen-zum-Löschen, Haptik, Diagramme,
                        Icons, Bausteine
js/views/               Heute, Training, Workout, Supplements, Verlauf,
                        Einstellungen, Mobility
js/mobility/            Routinen, Player, 3D-Figur (three.js)
service-worker.js       Offline-Cache
```

## Daten sichern

Alles liegt nur lokal auf dem Gerät. In den Einstellungen regelmäßig
**Sicherung erstellen** nutzen – die App erinnert nach 14 Tagen daran.
