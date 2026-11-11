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
- Woche ganz oben: Stand zum Wochenziel als große Zahl, die sieben Tage als
  Felder, das Ziel als Scheiben auf der Stange und die Serie der Wochen
- Hauptkarte als Block in der Akzentfarbe, mit den Zielmuskeln des Plans als
  Figur
- Körpergewicht: ein Wert je Tag, Kachel mit Verlauf, Blatt mit Diagramm,
  7er-Schnitt und Veränderung über etwa vier Wochen
- Hauptkarte zeigt, was heute im Plan ansteht: wo mehr Gewicht drin ist, wo
  ein Plateau hakt und ob die Zielmuskeln noch erholen
- Erholung: Körperkarte (vorn/hinten) mit dem Zustand jeder Muskelgruppe –
  belastet, erholt sich, bereit; Antippen zeigt Details und die Faustregel
- Mobility als Karte, Hinweis auf eine fällige Sicherung

**Training**
- Pläne anlegen und bearbeiten (Reihenfolge per Ziehen, Satzzahl pro Übung)
- Pläne per KI erstellen: Prompt kopieren, Antwort der KI einfügen
- Vorlagen: vier bewährte Aufteilungen (Push/Pull/Beine, Ober-/Unterkörper,
  Ganzkörper A/B, Maschinen) mit einem Tipp übernehmen – vorhandene Pläne
  werden nie überschrieben
- Mobility hat neben der Kachel auf „Heute“ einen eigenen Bereich im Tab
- Übungsbibliothek mit 138 Übungen nach Muskelgruppe, eigene Übungen
- Übungsdetail: Bestleistung, geschätztes 1RM als Verlauf (mit dem Finger
  abfahren), Notiz zur Ausführung, eigene Satzpause
- Übungsdetail: Diagramm umschaltbar (1RM, schwerster Satz, Volumen),
  Bestwerte nach Wiederholungen (z. B. „8+ Wdh: 80 kg“)
- Plan-Karten zeigen, wie weit die Zielmuskeln erholt sind
- Lange drücken auf einen Plan: starten, bearbeiten, duplizieren, löschen
- Gewicht je Übung als Gesamtgewicht, je Seite (z. B. Smith-Maschine) oder
  je Hantel eintragen – Gewichtssprung und Vorschläge rechnen in derselben
  Einheit (je Seite: +1,25 kg pro Seite statt +5 kg)

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
- Fokus-Timer: Tippen auf die Pausenzeit zeigt sie bildschirmfüllend – für
  das Handy auf der Bank; schließt sich nach der Pause von selbst
- Fortschritt oben als Abschnitte: einer je Übung, so breit wie ihre Satzzahl
- Rekord-Erkennung, Hinweis bei anderer Vorbelastung
- Scheibenrechner: bei Langhantel-Übungen (und allem, was „je Seite“
  eingetragen wird) zeigt das Zahlenfeld, welche Scheiben auf jede Seite
  kommen; Stange je Übung wählbar, vorhandene Scheiben in den Einstellungen
- Aufwärmsätze: Rampe vor dem ersten schweren Satz (leere Stange, dann etwa
  40/60/80 %), mit Scheiben je Satz – über „…“ an der Übung oder die
  Scheiben-Zeile
- Zusammenfassung: Kennzahlen, Rekorde, jede Übung im Vergleich zum letzten
  Mal, Körperkarte der trainierten Muskeln, Plan-Änderungen übernehmen bzw.
  freies Training als Plan speichern; Konfetti bei Rekord oder erreichtem
  Wochenziel; „Teilen“ erzeugt ein Bild des Trainings

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
- Statistik: Woche mit Vergleich zur Vorwoche (bis zum selben Wochentag),
  Wochenverlauf über zwölf Wochen (Trainings, Volumen, Sätze oder Zeit –
  Säule antippen zeigt den Wert), Aktivität der letzten 20 Wochen als
  Kästchenraster, Kraftentwicklung, Sätze pro Muskel mit Körperkarte,
  Rekorde, Körpergewicht, Gesamtzahlen
- Meilensteine als Hantelscheiben: geschaffte Marken (Trainings, bewegte
  Tonnen, Wochen im Ziel, Rekorde, Stunden) und der Weg zur nächsten
- Sätze pro Muskel zählen „fraktionell“: Zielmuskel 1, mitarbeitende Muskeln
  ½ (z. B. Trizeps beim Bankdrücken)

**Mobility**
- Tägliche Kick-Routine (ca. 55–70 Min, jeden Tag gleich): Aufwärmen,
  statisch und Anspannen-Loslassen dehnen, aktive Beweglichkeit, Kicks in
  Zeitlupe, Kraft in Dehnposition – komplett, kurz (Dehnteil halbiert) oder
  nach dem Beintag (Kraftteil nur ein Satz); mit den Regeln aus dem Plan
- Mobility-Plan Unterkörper (jeden Tag gleich): Aufwärmen, aktive Kontrolle,
  Kraft in Dehnposition, Dehnen mit Anspannen-Loslassen; Nerv-Gleiten und
  Kicks lassen sich in der Vorschau zuschalten
- Kurze tägliche Routine (Hüfte & Beine plus Tagesfokus, Dauer einstellbar)
- Beinplan in vier Blöcken (Aufwärmen, mit Gewicht in tiefer Position,
  statisch dehnen, aktive Beweglichkeit) – mit Gewicht oder für die anderen
  Tage ohne, dafür mit mehr aktiver Beweglichkeit; mit Sätzen und Pausen
- Zwei tiefe Einheiten für die Beine
- Geführter Player mit 3D-Figur (menschliches Modell mit Kleidung und
  farbig markierten Zielmuskeln), Atemführung, Sprachansage und
  Anspannen-Loslassen mit Zeiten pro Übung

**Einstellungen**
- kg/lb, Wochenziel, Satzpause, Steigerungs-Ziele, Zahlenfeld, Bildschirm
  anlassen
- Gewicht der Langhantel und vorhandene Scheiben
- Hell, Dunkel oder wie das iPhone (Standard), sieben Akzentfarben,
  Transparenz reduzieren,
  Haptik, Töne (mit „Ton testen“ und optional auch bei Stumm-Schalter)
- Sicherung erstellen/wiederherstellen (JSON), Erinnerung an die Sicherung

## Gestaltung („Eisen“)

- Zwei Stimmungen: **Nacht** (fast schwarz, die Akzentfarbe leuchtet wie
  eine Anzeige) und **Kreide** (warmes Papier, Tinte für Text und Daten, die
  Akzentfarbe als Textmarker)
- Überschriften und Zahlen in Archivo (schmal, kräftig): lange deutsche
  Übungsnamen passen in eine Zeile, Zahlen sind aus Armlänge lesbar.
  Fließtext bleibt die Systemschrift
- Tableiste, Zahlenfeld, Pause und Fokus-Timer sind in beiden Stimmungen
  dunkel – die Bedienung unten sieht immer gleich aus
- Wiederkehrende Motive aus dem Gym: Rändelung (das Kreuzmuster der
  Hantelstange) als Textur, Scheiben als Zähler und Abzeichen
- Akzentfarben: Volt (Standard), Glut, Kobalt, Minze, Magenta, Violett, Mono.
  Helle Farben tragen dunkle Schrift; auf hellem Grund zeichnet bei Volt die
  Tinte die Daten, weil Gelbgrün auf Papier zu wenig Kontrast hätte
- Seitenwechsel mit Parallaxe; vom linken Rand wischen geht zurück
- Menüs öffnen direkt am Knopf, langes Drücken öffnet Kontextmenüs
- Haptisches Klopfen beim Abhaken und im Zahlenfeld (über einen
  unsichtbaren Schalter – Safari bietet Web-Apps keine Vibration an)
- „Bewegung reduzieren“ wird respektiert

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
css/tokens.css          Farben, Formen, Schrift, Bewegung (hell/dunkel)
css/base.css            Gerüst: Seiten, Kopf, Tableiste
css/components.css      Bausteine, Blätter, Menüs, Zahlenfeld
css/views.css           Heute, Training, Verlauf, Supplements, Mobility
css/workout.css         Training läuft, Pause, Fokus-Timer, Zusammenfassung
fonts/                  Archivo (variabel, SIL Open Font License)
js/main.js              Start, globale Ereignisse
js/core/                Daten und Logik ohne Oberfläche
  store.js              localStorage, Migration, Sicherung
  training.js           Vorschläge, Rekorde, Vergleiche, Statistik, Plan-Rotation
  progression.js        Steigerungs-Ziele (Doppelprogression, Plateau, Pause)
  muscles.js            Muskel-Anteile je Übung, Sätze pro Muskel, Erholung
  plates.js             Scheibenrechner, Aufwärmsätze
  insights.js           Wochenreihen, Aktivität, Gesamtzahlen, Bestwerte
  milestones.js         Meilensteine über alle Trainings
  templates.js          Plan-Vorlagen
  supplements.js        Tage, Serie, Vorrat, Erinnerungen
  plan-import.js        KI-Prompt und Parser
  catalog.js            Übungskatalog
js/ui/                  Router (Übergänge, Wisch-zurück), Sheets und Menüs,
                        Zahlenfeld, Wischen-zum-Löschen, Haptik, Diagramme,
                        Körperkarte, Konfetti, Teilen-Bild, Icons, Bausteine
js/views/               Heute, Training, Workout, Supplements, Verlauf,
                        Einstellungen, Mobility
js/mobility/            Routinen, Player, 3D-Figur (three.js), Modell-Skinning (skin.js)
models/figure.glb       3D-Modell der Figur
service-worker.js       Offline-Cache
```

## Herkunft des 3D-Modells

`models/figure.glb` ist das „3D Male Base Mesh“ von BoQsc
(github.com/BoQsc/Godot-Male-Base-Mesh), laut Godot Asset Library unter
CC0 (gemeinfrei). Das Repository selbst enthält keine Lizenzdatei.
three.js und die Hilfsdateien in `js/vendor/` stehen unter der MIT-Lizenz.
Die Schrift Archivo (Omnibus-Type) steht unter der SIL Open Font License 1.1
(`fonts/Archivo-LICENSE.txt`).

## Annahmen hinter den Auswertungen

- **Erholung** ist eine Faustregel, keine Messung: je mehr Sätze ein Muskel
  abbekommen hat, desto länger die angenommene Pause (ein bis drei Tage).
  Schlaf, Ernährung und Tagesform kennt die App nicht.
- **Mitarbeitende Muskeln** leitet die App aus Muskelgruppe und Namen der
  Übung ab (z. B. Rudern → Bizeps). Bei eigenen Übungen mit ungewöhnlichem
  Namen zählt nur der Zielmuskel.
- **Scheiben** rechnet die App mit 20 kg (45 lb) für die Langhantel und
  10 kg für SZ-Stangen, solange nichts anderes eingestellt ist – SZ-Stangen
  wiegen je nach Modell unterschiedlich.
- **Aufwärmsätze** sind Richtwerte und werden nicht mitgezählt.

## Daten sichern

Alles liegt nur lokal auf dem Gerät. In den Einstellungen regelmäßig
**Sicherung erstellen** nutzen – die App erinnert nach 14 Tagen daran.
