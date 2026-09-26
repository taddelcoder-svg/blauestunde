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

Das `Dockerfile` startet den Node-Server auf `$PORT`.

### Speicher: Supabase

Namen und Bestenliste speichert der Server in Supabase, damit sie Deploys und Neustarts überleben:

1. In Supabase unter **SQL Editor** den Inhalt von `supabase_setup.sql` ausführen.
2. In Render beim Dienst unter **Environment** eintragen:
   - `SUPABASE_URL`: die Projekt-URL, z. B. `https://xyz.supabase.co`
   - `SUPABASE_SERVICE_KEY`: der `service_role`-Schlüssel (Supabase → Project Settings → API). Dieser Schlüssel ist geheim und gehört nie ins Repo oder in `index.html`.

Ohne diese beiden Variablen nutzt der Server eine JSON-Datei in `DATA_DIR` (Standard: `/app/data`). Auf Render ist die ohne Persistent Disk nach jedem Deploy leer.

## Steuerung

- **Tastatur:** Lenken mit ← → oder A D, Gas ↑, Bremse ↓, Nitro Leertaste, Pause Esc/P
- **Touch:** Wischen, Tippen oder Neigen (im Menü wählbar)
