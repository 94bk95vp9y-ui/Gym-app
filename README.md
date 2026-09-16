# Gym

Private Trainings-App: Workout-Logging, eigene Übungen & Routinen sowie
Verlauf/Fortschritt. Läuft komplett im Browser, keine Anmeldung, kein
Server – alle Daten liegen nur lokal auf deinem Gerät (`localStorage`).
Als PWA installierbar, funktioniert danach auch offline.

## Hosting auf GitHub Pages (kostenlos)

1. Repo auf GitHub pushen (main-Branch).
2. **Settings → Pages** öffnen.
3. Unter **Build and deployment** → **Source**: `Deploy from a branch` wählen.
4. Branch `main`, Ordner `/ (root)` auswählen, **Save**.
5. Nach ein bis zwei Minuten ist die App unter
   `https://<dein-github-name>.github.io/<repo-name>/` erreichbar.

## Auf dem iPhone installieren

1. Die GitHub-Pages-URL in **Safari** öffnen (wichtig: Safari, nicht Chrome).
2. Teilen-Symbol → **Zum Home-Bildschirm**.
3. Die App liegt danach als eigenes Icon auf dem Homescreen und startet
   im Vollbild ohne Browser-Leiste.

## Struktur

```
index.html            App-Shell
css/styles.css         Design (hell/dunkel automatisch)
js/app.js               Views, Routing, Events
js/storage.js           Datenlayer (localStorage)
js/utils.js             Formatierung, 1RM-Berechnung, Chart
js/icons.js              SVG-Icon-Set
manifest.webmanifest    PWA-Manifest
service-worker.js       Offline-Caching
icons/                  App-Icons
```

## Funktionen

- **Training starten**: aus einer Routine oder leer, mit Live-Timer.
- **Sätze loggen**: Gewicht/Wiederholungen pro Satz, "Letztes Mal" als
  Referenz, Training läuft auch nach Neuladen/App-Schließen weiter.
- **Bibliothek**: eigene Übungen (Name, Muskelgruppe, Notizen) und
  Routinen (Reihenfolge frei per Pfeiltasten anpassbar).
- **Verlauf**: alle abgeschlossenen Trainings mit Detailansicht.
- **Fortschritt**: Chart des geschätzten 1RM (Epley-Formel) pro Übung
  plus persönlicher Rekord.
- **Backup**: Export/Import als JSON-Datei in den Einstellungen.

## Daten sichern

Da alles nur lokal im Browser gespeichert wird, gehen die Daten beim
Löschen der Browser-Daten verloren. Regelmäßig in den Einstellungen
**Daten exportieren** nutzen, um ein Backup zu haben.
