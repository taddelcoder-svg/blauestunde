# Blaue Stunde – Autobahn

Endloses 3D-Nachtfahrt-Spiel im Browser (three.js). Weiche dem Verkehr aus – je knapper, desto mehr Punkte. Münzen sammeln, in der Garage Autos, Tuning, Lack und Licht kaufen.

## Online-Funktionen

- **Fahrername:** einmal wählen (ohne Passwort). Der Name wird auf dem Gerät gespeichert und ist weltweit eindeutig.
- **Bestenliste:** getrennt nach Leicht, Normal und Schwer. Jede Fahrt mit Namen wird automatisch gewertet.
- **Online-Rennen:** Alle in der Lobby drücken „Bereit“, dann startet ein 3-Minuten-Rennen auf derselben Stufe. Mitspieler erscheinen als halbtransparente Geisterautos mit Namensschild, oben rechts läuft die Live-Rangliste. Die meisten Punkte gewinnen; wer einen Unfall baut, ist raus, behält aber seine Punkte.

Ohne Server (z. B. `index.html` direkt als Datei geöffnet) läuft das Spiel wie gewohnt offline, die Online-Knöpfe werden dann ausgeblendet.

## Lokal starten

```bash
npm install
npm start
```

Dann http://localhost:10000 öffnen.

## Deployment (Render)

Das `Dockerfile` startet den Node-Server auf `$PORT`. Die Daten (Namen und Bestenliste) liegen in `DATA_DIR` (Standard: `/app/data`) als JSON-Datei.

**Wichtig:** Ohne Persistent Disk ist das Dateisystem auf Render flüchtig – nach jedem Deploy oder Neustart ist die Bestenliste leer. Abhilfe: in Render eine Disk anlegen und unter `/app/data` einhängen. Fahrer, deren Name verloren ging, bekommen ihn beim nächsten Besuch automatisch neu, solange ihn niemand anderes belegt hat.

## Steuerung

- **Tastatur:** Lenken mit ← → oder A D, Gas ↑, Bremse ↓, Nitro Leertaste, Pause Esc/P
- **Touch:** Wischen, Tippen oder Neigen (im Menü wählbar)
