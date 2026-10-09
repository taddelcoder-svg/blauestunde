# Blaue Stunde – Autobahn

Endloses 3D-Nachtfahrt-Spiel im Browser (three.js). Weiche dem Verkehr aus – je knapper, desto mehr Punkte. Münzen sammeln, in der Garage Autos, Tuning, Lack und Licht kaufen.

## Nachtschicht-Update

- **Tagesfahrt:** Jeden Tag (deutsche Zeit) eine Strecke, die für alle gleich ist: gleiche Verkehrswellen, Münzreihen, Baustellen und gleiches Wetter. Gefahren wird auf Normal mit dem Kestrel GT ohne Tuning, damit nur das Fahren zählt. Gewertet wird in einer eigenen Tagesbestenliste (Reiter „Heute“). Wie viel Verkehr genau kommt, hängt auch vom eigenen Tempo ab, die Folge der Ereignisse bleibt aber gleich.
- **Baustellen:** Ab und zu ist die linke oder rechte Spur gesperrt, mit Absperrtafel, Lauflicht und Bakenreihe. Der Verkehr fädelt ein. Wer die Baken streift, kracht (oder verbraucht einen Airbag). Ohne Kratzer gibt es einen Bonus.
- **Nebel:** Neues Wetter. Die Sicht endet nach gut 150 m, dafür gibt es 35 % mehr Münzen.
- **Aufträge:** Jeden Tag drei Aufgaben für alle, z. B. „15 knappe Manöver in einer Fahrt“. Die Münzen gibt es sofort, wenn ein Auftrag geschafft ist.
- **Erfolge:** 17 dauerhafte Ziele über alle Fahrten (z. B. 100 km insgesamt, Combo ×8, 5 km im Nebel), jeder bringt einmal Münzen. Aufträge und Erfolge stehen im Menü unter „Ziele“.
- **Polizei-Verfolgung:** Eigener Modus. Ein Streifenwagen mit Blaulicht und Martinshorn folgt dir. Wer nur rollt, wird eingeholt, mit Gas hältst du Abstand, knappe Manöver bringen 6 m Luft. 25 % mehr Punkte und Münzen, eigener Rekord; Verfolgungen kommen nicht in die Online-Bestenliste.
- **Geisterauto:** Deine Bestfahrt je Stufe und Modus (und die heutige Tagesfahrt) fährt als halbtransparentes Auto mit. Oben links steht, wie viele Meter du vorn oder zurück bist.
- **Pannen:** Ab und zu steht ein liegengebliebenes Auto mit Warnblinker und Warndreieck auf der Fahrbahn. Der Verkehr weicht aus.
- **Tageszeit:** Bei klarem Wetter wandert der Himmel mit der Strecke von der Dämmerung in die Nacht und ins Morgengrauen.
- **Neue Autos:** Nomad SUV (zwei Airbags extra, schwerfällig) und Phantom EV (Nitro lädt doppelt so schnell, 10 % mehr Punkte).

## Verräter an Bord (Crew-Spiel)

Ein zweites Spiel im Stil von „Among Us“, erreichbar unter `/crew` (oder über den Knopf im Hauptmenü). Läuft nur mit Server.

- **Räume:** Einer erstellt einen Raum und bekommt einen Code aus 4 Buchstaben, die anderen treten mit Code oder Link bei. Name und Farbe sind frei wählbar, ohne Anmeldung. Bis zu 12 Spieler, ab 4 geht es los. Fehlende Mitspieler füllt der Gastgeber mit **Bots** auf.
- **Rollen:** Die Crew erledigt Aufgaben auf dem Raumschiff (Kabel verbinden, Zahlen drücken, Daten laden, Tanken, Karte durchziehen, Kalibrieren, Asteroiden abschießen, Körperscan). Die Verräter töten, kriechen durch Lüftungsschächte und sabotieren (Licht aus, Reaktor-Kernschmelze).
- **Besprechungen:** Leichen melden oder den Notfallknopf in der Kantine drücken, dann wird diskutiert (Chat) und abgestimmt. Tote spielen als Geister weiter, sehen andere Geister, machen Aufgaben und schreiben im Geister-Chat.
- **Sieg:** Crew gewinnt, wenn alle Aufgaben erledigt oder alle Verräter rausgeworfen sind. Verräter gewinnen bei Gleichstand der Zahl oder wenn der Reaktor durchbrennt.
- **Einstellungen (Gastgeber):** Anzahl Verräter, Abklingzeit fürs Töten, Aufgaben pro Person, Diskussions- und Abstimmzeit, Rolle beim Rauswurf zeigen.
- **Steuerung:** WASD/Pfeiltasten, E benutzen, R melden, Q töten, V Schacht, F Sabotage, M Karte. Auf Touch-Geräten: irgendwo hintippen und ziehen zum Laufen, Knöpfe rechts unten.
- Wer kurz die Verbindung verliert (Handy gesperrt), kommt im selben Tab automatisch zurück ins laufende Spiel.

Technik: `crew.js` (Spiellogik, Karte und Bots auf dem Server, WebSocket unter `/crew/ws`) und `crew.html` (Client mit Canvas). Räume liegen nur im Arbeitsspeicher.

## Online-Funktionen

- **Fahrername:** einmal wählen (ohne Passwort). Der Name wird auf dem Gerät gespeichert und ist weltweit eindeutig.
- **Bestenliste:** getrennt nach Leicht, Normal und Schwer. Jede Fahrt mit Namen wird automatisch gewertet. Wer noch keinen Namen hat, wird nach der Fahrt gefragt, die Fahrt zählt dann nachträglich. Olympia-Rennen kommen mit dem Namen aus dem Olympia-Ticket ebenfalls in die Liste (markiert mit „Olympia“).
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
