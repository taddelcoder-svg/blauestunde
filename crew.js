'use strict';
// Verräter an Bord – Online-Spiel für Familie und Freunde im Stil von „Among Us“.
// Der Server führt das Spiel: Räume mit Code, Karte, Rollen, Aufgaben, Töten,
// Melden, Abstimmen, Sabotage und einfache Bots, damit man auch zu zweit spielen kann.
// Alles liegt nur im Arbeitsspeicher; nach einem Neustart sind die Räume weg.
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

/* ---------- Karte ----------
   Kachelraster, 1 Einheit = 1 Kachel. Räume und Gänge sind Rechtecke (x, y, Breite, Höhe),
   alles andere ist Wand. Der Client bekommt dieselben Daten und baut das Raster genauso. */
const BREITE = 72, HOEHE = 46;
const RAEUME = [
  { id:'motorOben',  name:'Motor oben',     x:4,  y:4,  w:9,  h:8,  wo:'im oberen Motor', farbe:'#4a5568' },
  { id:'kantine',    name:'Kantine',        x:29, y:2,  w:16, h:13, wo:'in der Kantine', farbe:'#5b6b7d' },
  { id:'waffen',     name:'Waffen',         x:52, y:3,  w:9,  h:8,  wo:'bei den Waffen', farbe:'#4d5a6b' },
  { id:'kranken',    name:'Krankenstation', x:18, y:12, w:8,  h:7,  wo:'in der Krankenstation', farbe:'#4f6b70' },
  { id:'reaktor',    name:'Reaktor',        x:1,  y:17, w:7,  h:10, wo:'im Reaktor', farbe:'#5a4a5c' },
  { id:'sicherheit', name:'Sicherheit',     x:15, y:19, w:6,  h:6,  wo:'in der Sicherheit', farbe:'#4b5563' },
  { id:'sauerstoff', name:'Sauerstoff',     x:47, y:14, w:6,  h:6,  wo:'beim Sauerstoff', farbe:'#4a6560' },
  { id:'navigation', name:'Navigation',     x:63, y:17, w:8,  h:9,  wo:'in der Navigation', farbe:'#47586e' },
  { id:'verwaltung', name:'Verwaltung',     x:43, y:22, w:8,  h:6,  wo:'in der Verwaltung', farbe:'#5c5a4a' },
  { id:'elektrik',   name:'Elektrik',       x:21, y:25, w:8,  h:7,  wo:'in der Elektrik', farbe:'#5b5640' },
  { id:'lager',      name:'Lager',          x:31, y:28, w:11, h:12, wo:'im Lager', farbe:'#56504a' },
  { id:'motorUnten', name:'Motor unten',    x:4,  y:31, w:9,  h:8,  wo:'im unteren Motor', farbe:'#4a5568' },
  { id:'schilde',    name:'Schilde',        x:53, y:30, w:8,  h:8,  wo:'bei den Schilden', farbe:'#4a5a6e' },
  { id:'komm',       name:'Kommunikation',  x:43, y:39, w:8,  h:6,  wo:'in der Kommunikation', farbe:'#4d5866' }
];
const GAENGE = [
  [13,6,16,3], [20,9,3,3], [9,12,3,19], [8,20,1,4], [12,20,3,3], [13,33,18,3], [23,32,3,1],
  [36,15,3,13], [39,23,4,3], [45,6,7,3], [56,11,3,19], [53,15,3,3], [59,19,4,3], [42,34,11,3], [45,37,3,2]
].map(([x, y, w, h]) => ({ x, y, w, h }));

// Aufgabenstationen: art bestimmt das Minispiel im Client
const STATIONEN = [
  { id:'s1',  raum:'kantine',    x:31.5, y:3.5,  art:'kabel',       name:'Kabel reparieren' },
  { id:'s2',  raum:'kantine',    x:42.5, y:3.5,  art:'download',    name:'Daten herunterladen' },
  { id:'s3',  raum:'motorOben',  x:5.5,  y:5.5,  art:'tanken',      name:'Motor betanken' },
  { id:'s4',  raum:'motorOben',  x:11.5, y:5.5,  art:'kalibrieren', name:'Motor ausrichten' },
  { id:'s5',  raum:'motorUnten', x:5.5,  y:37.5, art:'tanken',      name:'Motor betanken' },
  { id:'s6',  raum:'motorUnten', x:11.5, y:37.5, art:'kalibrieren', name:'Motor ausrichten' },
  { id:'s7',  raum:'reaktor',    x:2.5,  y:21.5, art:'zahlen',      name:'Reaktor starten' },
  { id:'s8',  raum:'sicherheit', x:19.5, y:20.5, art:'kabel',       name:'Kabel reparieren' },
  { id:'s9',  raum:'kranken',    x:21.5, y:13.5, art:'scan',        name:'Körperscan' },
  { id:'s10', raum:'elektrik',   x:22.5, y:26.5, art:'kabel',       name:'Kabel reparieren' },
  { id:'s11', raum:'elektrik',   x:25.5, y:26.5, art:'download',    name:'Daten herunterladen' },
  { id:'s12', raum:'lager',      x:32.5, y:38.5, art:'tanken',      name:'Kanister füllen' },
  { id:'s13', raum:'lager',      x:40.5, y:29.5, art:'zahlen',      name:'Fracht sortieren' },
  { id:'s14', raum:'verwaltung', x:49.5, y:23.5, art:'karte',       name:'Karte durchziehen' },
  { id:'s15', raum:'verwaltung', x:44.5, y:23.5, art:'download',    name:'Daten hochladen' },
  { id:'s16', raum:'waffen',     x:58.5, y:4.5,  art:'asteroiden',  name:'Asteroiden abschießen' },
  { id:'s17', raum:'sauerstoff', x:48.5, y:15.5, art:'zahlen',      name:'Filter tauschen' },
  { id:'s18', raum:'navigation', x:69.5, y:21.5, art:'kalibrieren', name:'Kurs festlegen' },
  { id:'s19', raum:'navigation', x:64.5, y:18.5, art:'download',    name:'Daten herunterladen' },
  { id:'s20', raum:'schilde',    x:59.5, y:34.5, art:'asteroiden',  name:'Schilde prüfen' },
  { id:'s21', raum:'komm',       x:44.5, y:43.5, art:'download',    name:'Daten hochladen' },
  { id:'s22', raum:'komm',       x:49.5, y:40.5, art:'kabel',       name:'Kabel reparieren' }
];
// Lüftungsschächte: Schächte in derselben Gruppe sind verbunden
const VENTS = [
  { id:'v1', g:1, x:7.5,  y:10.5 }, { id:'v2', g:1, x:5.5,  y:25.5 }, { id:'v3', g:1, x:7.5,  y:32.5 },
  { id:'v4', g:2, x:24.5, y:17.5 }, { id:'v5', g:2, x:16.5, y:23.5 }, { id:'v6', g:2, x:27.5, y:30.5 },
  { id:'v7', g:3, x:53.5, y:9.5 },  { id:'v8', g:3, x:65.5, y:24.5 },
  { id:'v9', g:4, x:69.5, y:18.5 }, { id:'v10', g:4, x:54.5, y:36.5 },
  { id:'v11', g:5, x:43.5, y:13.5 }, { id:'v12', g:5, x:47.5, y:26.5 }, { id:'v13', g:5, x:57.5, y:26.5 }
];
const KNOPF = { x:37, y:8.5 };                    // Notfallknopf auf dem Kantinentisch
const REPARATUR = {
  licht:{ x:27.5, y:29.5, raum:'elektrik' },
  r1:{ x:1.5, y:18.5, raum:'reaktor' },
  r2:{ x:1.5, y:25.5, raum:'reaktor' }
};

const raster = new Uint8Array(BREITE * HOEHE);
for (const r of [...RAEUME, ...GAENGE])
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) raster[y * BREITE + x] = 1;
const frei = (x, y) => x >= 0 && y >= 0 && x < BREITE && y < HOEHE && raster[(y|0) * BREITE + (x|0)] === 1;
const RADIUS = 0.3;
const begehbar = (x, y) => frei(x - RADIUS, y - RADIUS) && frei(x + RADIUS, y - RADIUS) && frei(x - RADIUS, y + RADIUS) && frei(x + RADIUS, y + RADIUS);
const raumBei = (x, y) => { const r = RAEUME.find(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h); return r ? r.wo : 'im Gang'; };
const abstand = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
// Sichtlinie durch das Raster (kleine Schritte reichen bei kurzen Strecken)
function sichtfrei(a, b){
  const d = abstand(a, b), n = Math.ceil(d * 4);
  for (let i = 1; i < n; i++){ const t = i / n; if (!frei(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) return false; }
  return true;
}
// Breitensuche für die Bots, Weg als Liste von Kachelmitten
function weg(von, nach){
  const s = (von.y|0) * BREITE + (von.x|0), z = (nach.y|0) * BREITE + (nach.x|0);
  if (!raster[s] || !raster[z]) return [];
  const vor = new Int32Array(BREITE * HOEHE).fill(-1); vor[s] = s;
  const q = [s];
  for (let i = 0; i < q.length && vor[z] < 0; i++){
    const c = q[i], cx = c % BREITE, cy = (c / BREITE) | 0;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const nx = cx + dx, ny = cy + dy, n = ny * BREITE + nx;
      if (nx < 0 || ny < 0 || nx >= BREITE || ny >= HOEHE || !raster[n] || vor[n] >= 0) continue;
      vor[n] = c; q.push(n);
    }
  }
  if (vor[z] < 0) return [];
  const pfad = [];
  for (let c = z; c !== s; c = vor[c]) pfad.push({ x:c % BREITE + 0.5, y:((c / BREITE) | 0) + 0.5 });
  pfad.reverse(); pfad.push({ x:nach.x, y:nach.y });
  return pfad;
}

/* ---------- Regeln ---------- */
const TEMPO = 4;                 // Kacheln pro Sekunde
const TICK = 66;                 // ms
const REICHWEITE = { toeten:1.7, melden:2.2, benutzen:1.6, knopf:2.2, vent:1.3 };
const SICHT = { crew:6, verraeter:8.5, dunkel:1.8 };
const FARBEN = ['rot','blau','gruen','pink','orange','gelb','schwarz','weiss','lila','braun','cyan','limette'];
const MAX_SPIELER = FARBEN.length;
const BOT_NAMEN = ['Kiwi','Pixel','Krümel','Socke','Tofu','Wolke','Funke','Mops','Blitz','Nuss','Zorro','Keks'];
const STANDARD = { verraeter:1, killCd:25, aufgaben:5, diskussion:15, abstimmung:45, bestaetigen:true };
const GRENZEN = { verraeter:[1,3], killCd:[10,60], aufgaben:[2,8], diskussion:[0,90], abstimmung:[15,180] };
const AUSWURF_MS = 7000, REAKTOR_MS = 40_000, SAB_CD = 30_000, KNOPF_CD = 15_000;

module.exports = function crew({ hatZugang }){
  const wss = new WebSocketServer({ noServer:true, maxPayload:2048 });
  const raeume = new Map();          // code -> raum
  const jetzt = () => Date.now();

  const senden = (sp, m) => { if (sp.ws && sp.ws.readyState === 1) sp.ws.send(typeof m === 'string' ? m : JSON.stringify(m)); };
  const anAlle = (r, m, filter) => { const s = JSON.stringify(m); r.spieler.forEach(sp => { if (!filter || filter(sp)) senden(sp, s); }); };

  function neuerCode(){
    const z = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    for (;;){ let c = ''; for (let i = 0; i < 4; i++) c += z[crypto.randomInt(z.length)]; if (!raeume.has(c)) return c; }
  }
  function nameSaeubern(n){
    n = String(n || '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12);
    return n || 'Gast';
  }
  function eindeutig(r, name, ohne){
    const belegt = new Set([...r.spieler.values()].filter(s => s !== ohne).map(s => s.name.toLowerCase()));
    if (!belegt.has(name.toLowerCase())) return name;
    for (let i = 2; ; i++){ const n = name.slice(0, 10) + i; if (!belegt.has(n.toLowerCase())) return n; }
  }
  const freieFarbe = r => FARBEN.find(f => ![...r.spieler.values()].some(s => s.farbe === f));

  function neuerSpieler(r, name, bot){
    const sp = {
      id:crypto.randomBytes(6).toString('hex'), geheim:crypto.randomBytes(16).toString('hex'),
      name:eindeutig(r, name), farbe:freieFarbe(r), bot:!!bot, ws:null,
      x:KNOPF.x, y:KNOPF.y, lebt:true, rolle:'crew', aufgaben:[], notfaelle:1, killAb:0, vent:null,
      weg:false, wegSeit:0, raus:false, letztePos:0, nachrichten:0, nachrichtenAb:0
    };
    r.spieler.set(sp.id, sp);
    return sp;
  }

  function raumInfo(r){
    return {
      t:'raum', code:r.code, host:r.hostId, phase:r.phase === 'lobby' ? 'lobby' : 'spiel', einst:r.einst,
      spieler:[...r.spieler.values()].map(s => ({ id:s.id, name:s.name, farbe:s.farbe, bot:s.bot, weg:s.weg }))
    };
  }
  const raumSenden = r => anAlle(r, raumInfo(r));

  function hostPruefen(r){
    const h = r.spieler.get(r.hostId);
    if (h && !h.bot && !h.weg) return;
    const neu = [...r.spieler.values()].find(s => !s.bot && !s.weg);
    if (neu) r.hostId = neu.id;
  }
  function spielerEntfernen(r, sp){
    r.spieler.delete(sp.id);
    if (![...r.spieler.values()].some(s => !s.bot)){ raeume.delete(r.code); return; }
    hostPruefen(r);
    raumSenden(r);
  }

  /* ---------- Spielstart ---------- */
  function maxVerraeter(n){ return n <= 6 ? 1 : n <= 9 ? 2 : 3; }
  function spawnPunkt(i, n){
    const w = i / n * Math.PI * 2;
    for (let rad = 2.6; rad > 0; rad -= 0.4){ const p = { x:KNOPF.x + Math.cos(w) * rad, y:KNOPF.y + Math.sin(w) * rad * 0.8 }; if (begehbar(p.x, p.y)) return p; }
    return { x:KNOPF.x, y:KNOPF.y };
  }
  function alleZumTisch(r){
    const lebende = [...r.spieler.values()].filter(s => !s.raus);
    lebende.forEach((s, i) => { const p = spawnPunkt(i, lebende.length); s.x = p.x; s.y = p.y; s.vent = null; s.pfad = null; s.aktion = null; senden(s, { t:'tele', x:s.x, y:s.y }); });
  }
  function starten(r){
    const alle = [...r.spieler.values()];
    const anzahl = Math.min(r.einst.verraeter, maxVerraeter(alle.length));
    const gemischt = alle.slice().sort(() => Math.random() - 0.5);
    const verraeter = new Set(gemischt.slice(0, anzahl).map(s => s.id));
    r.phase = 'spiel'; r.leichen = []; r.sabotage = null; r.sabAb = jetzt() + 15_000; r.knopfAb = jetzt() + KNOPF_CD;
    r.treffen = null; r.runde = (r.runde || 0) + 1; r.start = jetzt();
    alle.forEach(s => {
      s.lebt = true; s.raus = false; s.vent = null; s.notfaelle = 1; s.gesehen = null; s.verdacht = null;
      s.rolle = verraeter.has(s.id) ? 'verraeter' : 'crew';
      s.killAb = jetzt() + 10_000;
      const stationen = STATIONEN.slice().sort(() => Math.random() - 0.5).slice(0, r.einst.aufgaben);
      s.aufgaben = stationen.map(st => ({ id:st.id, fertig:false }));
      s.pfad = null; s.aktion = null;
    });
    alleZumTisch(r);
    alle.forEach(s => senden(s, {
      t:'start', rolle:s.rolle, aufgaben:s.aufgaben,
      verraeter:s.rolle === 'verraeter' ? [...verraeter] : [], anzahlVerraeter:anzahl,
      einst:r.einst, killAb:s.killAb - jetzt()
    }));
    raumSenden(r);
  }

  // Wer mitten im Spiel neu verbindet, bekommt Rolle, Aufgaben und eine laufende Besprechung zurück
  function fortsetzen(r, sp){
    const verraeter = [...r.spieler.values()].filter(s => s.rolle === 'verraeter').map(s => s.id);
    senden(sp, { t:'start', wieder:true, rolle:sp.rolle, aufgaben:sp.aufgaben, verraeter:sp.rolle === 'verraeter' ? verraeter : [],
      anzahlVerraeter:verraeter.length, einst:r.einst, killAb:Math.max(0, sp.killAb - jetzt()), lebt:sp.lebt });
    senden(sp, { t:'tele', x:sp.x, y:sp.y, vent:sp.vent });
    const t = r.treffen;
    if (r.phase === 'treffen' && t) senden(sp, { t:'treffen', art:t.art, melder:t.melder, opfer:t.opfer, wieder:true,
      diskussion:Math.max(0, t.abstAb - jetzt()), abstimmung:t.ende - Math.max(jetzt(), t.abstAb),
      lebend:[...r.spieler.values()].filter(s => s.lebt && !s.raus).map(s => s.id),
      tot:[...r.spieler.values()].filter(s => !s.lebt || s.raus).map(s => s.id), gewaehlt:[...t.stimmen.keys()] });
  }

  /* ---------- Siegbedingungen ---------- */
  function fortschritt(r){
    let gesamt = 0, fertig = 0;
    r.spieler.forEach(s => { if (s.rolle !== 'crew' || s.abgang) return; gesamt += s.aufgaben.length; fertig += s.aufgaben.filter(a => a.fertig).length; });
    return { gesamt, fertig };
  }
  function siegPruefen(r){
    if (r.phase !== 'spiel' && r.phase !== 'auswurf') return false;
    const lebend = [...r.spieler.values()].filter(s => s.lebt && !s.raus);
    const v = lebend.filter(s => s.rolle === 'verraeter').length, c = lebend.length - v;
    const f = fortschritt(r);
    if (v === 0) return beenden(r, 'crew', 'Alle Verräter wurden entlarvt.');
    if (f.gesamt > 0 && f.fertig >= f.gesamt) return beenden(r, 'crew', 'Alle Aufgaben sind erledigt.');
    if (v >= c) return beenden(r, 'verraeter', 'Die Verräter sind in der Überzahl.');
    if (r.sabotage && r.sabotage.art === 'reaktor' && jetzt() > r.sabotage.bis) return beenden(r, 'verraeter', 'Der Reaktor ist durchgebrannt.');
    return false;
  }
  function beenden(r, sieger, grund){
    const verraeter = [...r.spieler.values()].filter(s => s.rolle === 'verraeter').map(s => ({ id:s.id, name:s.name, farbe:s.farbe }));
    anAlle(r, { t:'ende', sieger, grund, verraeter });
    r.phase = 'lobby'; r.treffen = null; r.sabotage = null; r.leichen = [];
    // Wer während des Spiels gegangen ist, fliegt jetzt endgültig raus
    [...r.spieler.values()].forEach(s => { if (s.weg) r.spieler.delete(s.id); s.lebt = true; s.vent = null; s.rolle = 'crew'; s.aufgaben = []; s.raus = false; s.abgang = false; });
    if (![...r.spieler.values()].some(s => !s.bot)){ raeume.delete(r.code); return true; }
    hostPruefen(r);
    raumSenden(r);
    return true;
  }

  /* ---------- Aktionen im Spiel ---------- */
  function toeten(r, taeter, opfer){
    opfer.lebt = false; opfer.vent = null;
    r.leichen.push({ id:opfer.id, x:opfer.x, y:opfer.y });
    taeter.x = opfer.x; taeter.y = opfer.y;
    taeter.killAb = jetzt() + r.einst.killCd * 1000;
    senden(taeter, { t:'tele', x:taeter.x, y:taeter.y });
    senden(taeter, { t:'kill', killAb:r.einst.killCd * 1000 });
    senden(opfer, { t:'getoetet', von:taeter.farbe });
    // Bots in Sichtweite merken sich, was sie gesehen haben
    r.spieler.forEach(b => {
      if (!b.bot || !b.lebt || b === taeter || b === opfer || b.rolle === 'verraeter') return;
      if (abstand(b, taeter) <= SICHT.crew && sichtfrei(b, taeter)) b.gesehen = { taeter:taeter.id, opfer:opfer.id };
    });
    siegPruefen(r);
  }
  function treffenStarten(r, melder, art, opfer){
    if (r.phase !== 'spiel') return;
    r.phase = 'treffen';
    r.sabotage = null;
    // Wer stand bei der Leiche? Das merken sich die Bots als Verdacht
    const leiche = opfer && r.leichen.find(l => l.id === opfer);
    r.spieler.forEach(s => { s.pfad = null; s.aktion = null; s.vent = null; });
    if (leiche) r.spieler.forEach(b => {
      if (!b.bot) return;
      const nah = [...r.spieler.values()].filter(s => s.lebt && s !== b && s !== melder && abstand(s, leiche) < 5);
      if (nah.length) b.verdacht = nah[Math.floor(Math.random() * nah.length)].id;
    });
    r.leichen = [];
    const d = r.einst.diskussion * 1000, a = r.einst.abstimmung * 1000;
    r.treffen = { art, melder:melder.id, opfer:opfer || null, abstAb:jetzt() + d, ende:jetzt() + d + a, stimmen:new Map(), anklagen:new Map() };
    anAlle(r, { t:'treffen', art, melder:melder.id, opfer:opfer || null, diskussion:d, abstimmung:a,
      lebend:[...r.spieler.values()].filter(s => s.lebt && !s.raus).map(s => s.id),
      tot:[...r.spieler.values()].filter(s => !s.lebt || s.raus).map(s => s.id) });
    botsImTreffen(r);
  }
  function abstimmungAuswerten(r){
    const t = r.treffen; if (!t || r.phase !== 'treffen') return;
    const zaehlung = new Map();
    t.stimmen.forEach(ziel => zaehlung.set(ziel, (zaehlung.get(ziel) || 0) + 1));
    let raus = null, max = 0, gleich = false;
    zaehlung.forEach((n, ziel) => { if (n > max){ max = n; raus = ziel; gleich = false; } else if (n === max) gleich = true; });
    if (gleich || raus === 'skip') raus = null;
    const opfer = raus && r.spieler.get(raus);
    if (opfer){ opfer.lebt = false; opfer.raus = true; }
    const stimmen = {}; t.stimmen.forEach((ziel, von) => { (stimmen[ziel] = stimmen[ziel] || []).push(von); });
    const restV = [...r.spieler.values()].filter(s => s.lebt && s.rolle === 'verraeter').length;
    anAlle(r, {
      t:'ergebnis', stimmen, raus:opfer ? opfer.id : null, gleichstand:gleich,
      warVerraeter:opfer && r.einst.bestaetigen ? opfer.rolle === 'verraeter' : null,
      uebrig:r.einst.bestaetigen ? restV : null, dauer:AUSWURF_MS
    });
    r.phase = 'auswurf'; r.treffen = null;
    r.weiterAb = jetzt() + AUSWURF_MS;
  }
  function weiterspielen(r){
    r.phase = 'spiel';
    if (siegPruefen(r)) return;
    r.knopfAb = jetzt() + KNOPF_CD; r.sabAb = Math.max(r.sabAb || 0, jetzt() + 10_000);
    r.spieler.forEach(s => { if (s.rolle === 'verraeter') s.killAb = jetzt() + r.einst.killCd * 1000; s.gesehen = null; s.verdacht = null; });
    alleZumTisch(r);
    r.spieler.forEach(s => senden(s, { t:'weiter', killAb:s.rolle === 'verraeter' ? r.einst.killCd * 1000 : 0 }));
  }
  function aufgabeFertig(r, sp, id){
    const a = sp.aufgaben.find(a => a.id === id);
    if (!a || a.fertig) return;
    a.fertig = true;
    senden(sp, { t:'aufgaben', aufgaben:sp.aufgaben });
    siegPruefen(r);
  }
  function sabotieren(r, art){
    if (r.sabotage || r.phase !== 'spiel' || jetzt() < r.sabAb) return;
    r.sabotage = art === 'reaktor' ? { art, bis:jetzt() + REAKTOR_MS, r1:0, r2:0 } : { art:'licht' };
    r.sabAb = jetzt() + SAB_CD;
  }
  function stimmeAbgeben(r, sp, ziel){
    const t = r.treffen;
    if (!t || jetzt() < t.abstAb || !sp.lebt || t.stimmen.has(sp.id)) return;
    if (ziel !== 'skip'){ const z = r.spieler.get(ziel); if (!z || !z.lebt || z.raus) return; }
    t.stimmen.set(sp.id, ziel);
    anAlle(r, { t:'gewaehlt', von:sp.id });
    const lebende = [...r.spieler.values()].filter(s => s.lebt && !s.raus && !s.weg);
    if (lebende.every(s => t.stimmen.has(s.id))) t.ende = Math.min(t.ende, jetzt() + 1200);
  }
  function chat(r, sp, text){
    text = String(text || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 140);
    if (!text) return;
    const geist = r.phase !== 'lobby' && !sp.lebt;
    if (r.phase === 'spiel' && !geist) return;          // Lebende reden nur in Besprechungen
    const m = { t:'chat', von:sp.id, text, geist };
    anAlle(r, m, geist ? (s => !s.lebt) : null);
    // Anklagen zählen, damit sich unentschlossene Bots anschließen können
    if (r.treffen && !geist){
      const klein = text.toLowerCase();
      r.spieler.forEach(s => { if (s !== sp && s.lebt && klein.includes(s.name.toLowerCase())) r.treffen.anklagen.set(s.id, (r.treffen.anklagen.get(s.id) || 0) + 1); });
    }
  }

  /* ---------- Bots ---------- */
  const zufall = a => a[Math.floor(Math.random() * a.length)];
  function botLaufen(r, b, dt){
    if (!b.pfad || !b.pfad.length) return true;
    let rest = TEMPO * dt;
    while (rest > 0 && b.pfad.length){
      const z = b.pfad[0], d = abstand(b, z);
      if (d <= rest){ b.x = z.x; b.y = z.y; b.pfad.shift(); rest -= d; }
      else { b.x += (z.x - b.x) / d * rest; b.y += (z.y - b.y) / d * rest; rest = 0; }
    }
    return !b.pfad.length;
  }
  function botZiel(b, ziel){ b.pfad = weg(b, ziel); b.zielPunkt = ziel; }
  function botSieht(r, b, ziel){ const sicht = r.sabotage && r.sabotage.art === 'licht' && b.rolle !== 'verraeter' ? SICHT.dunkel + 1 : SICHT.crew; return abstand(b, ziel) <= sicht && sichtfrei(b, ziel); }

  function botTick(r, b, dt){
    const t = jetzt();
    if (b.aktion && b.aktion.bis > t){
      if (b.aktion.art === 'halten' && r.sabotage && r.sabotage.art === 'reaktor') r.sabotage[b.aktion.punkt] = t;
      return;
    }
    if (b.aktion){ const a = b.aktion; b.aktion = null; if (a.art === 'aufgabe' && b.rolle === 'crew') aufgabeFertig(r, b, a.id); if (a.art === 'licht' && r.sabotage && r.sabotage.art === 'licht') r.sabotage = null; if (r.phase !== 'spiel') return; }

    if (b.lebt && b.rolle === 'crew'){
      // Leiche gesehen? Sofort melden.
      const leiche = r.leichen.find(l => botSieht(r, b, l));
      if (leiche){
        if (abstand(b, leiche) <= REICHWEITE.melden){ b.meldete = leiche.id; return treffenStarten(r, b, 'leiche', leiche.id); }
        if (!b.zielPunkt || b.zielPunkt !== leiche) botZiel(b, leiche);
        botLaufen(r, b, dt); return;
      }
      // Sabotage reparieren
      if (r.sabotage){
        const punkte = r.sabotage.art === 'reaktor' ? ['r1', 'r2'] : ['licht'];
        const helfer = [...r.spieler.values()].filter(s => s.bot && s.lebt && s.rolle === 'crew')
          .sort((x, y) => abstand(x, REPARATUR[punkte[0]]) - abstand(y, REPARATUR[punkte[0]]));
        const platz = helfer.indexOf(b);
        if (platz >= 0 && platz < punkte.length){
          const p = punkte[platz], ziel = REPARATUR[p];
          if (abstand(b, ziel) <= REICHWEITE.benutzen){
            b.aktion = p === 'licht' ? { art:'licht', bis:t + 3500 } : { art:'halten', punkt:p, bis:t + 1000 };
            return;
          }
          if (b.zielPunkt !== ziel) botZiel(b, ziel);
          botLaufen(r, b, dt); return;
        }
      }
    }
    if (b.lebt && b.rolle === 'verraeter'){
      // Jagen, wenn niemand zusieht
      if (t >= b.killAb && !b.vent){
        const opfer = [...r.spieler.values()].filter(s => s.lebt && s.rolle === 'crew' && !s.raus)
          .sort((x, y) => abstand(b, x) - abstand(b, y))[0];
        if (opfer){
          const zeugen = [...r.spieler.values()].filter(s => s.lebt && s !== opfer && s !== b && s.rolle === 'crew' && abstand(s, opfer) < 7 && sichtfrei(s, opfer));
          if (!zeugen.length && abstand(b, opfer) <= REICHWEITE.toeten && sichtfrei(b, opfer)){ toeten(r, b, opfer); b.pfad = null; b.zielPunkt = null; return; }
          if (!zeugen.length && abstand(b, opfer) < 14 && Math.random() < 0.8){
            if (!b.jagdNeu || t > b.jagdNeu){ botZiel(b, { x:opfer.x, y:opfer.y }); b.jagdNeu = t + 700; }
            botLaufen(r, b, dt); return;
          }
        }
      }
      if (!r.sabotage && t >= r.sabAb && Math.random() < dt * 0.02) sabotieren(r, Math.random() < 0.5 ? 'licht' : 'reaktor');
    }
    // Aufgaben abarbeiten (Verräter tun nur so)
    if (!b.pfad || !b.pfad.length){
      if (b.zielStation){
        const st = b.zielStation; b.zielStation = null;
        b.aktion = { art:'aufgabe', id:st.id, bis:t + 2500 + Math.random() * 4000 };
        return;
      }
      const offen = b.rolle === 'crew' ? b.aufgaben.filter(a => !a.fertig).map(a => STATIONEN.find(s => s.id === a.id)) : [];
      const st = offen.length ? offen.sort((x, y) => abstand(b, x) - abstand(b, y))[0] : zufall(STATIONEN);
      b.zielStation = st; botZiel(b, st);
      if (!b.pfad.length) b.zielStation = null;
    }
    botLaufen(r, b, dt);
  }

  function botsImTreffen(r){
    const t = r.treffen, melder = r.spieler.get(t.melder), opfer = t.opfer && r.spieler.get(t.opfer);
    const lebende = () => [...r.spieler.values()].filter(s => s.lebt && !s.raus);
    r.spieler.forEach(b => {
      if (!b.bot || !b.lebt) return;
      const runde = r.runde, treffen = t;
      const noch = () => r.treffen === treffen && r.runde === runde && b.lebt;
      let satz;
      if (b === melder && opfer) satz = `${opfer.name} liegt ${raumBei(b.x, b.y)}!`;
      else if (b === melder) satz = 'Ich hab den Knopf gedrückt. Wer war es?';
      else if (b.gesehen && r.spieler.get(b.gesehen.taeter)){ const v = r.spieler.get(b.gesehen.taeter); satz = `Ich hab gesehen, wie ${v.name} jemanden erledigt hat!`; }
      else if (b.rolle === 'verraeter' && Math.random() < 0.3){ const z = zufall(lebende().filter(s => s.rolle === 'crew' && s !== b)); satz = z ? `${z.name} war vorhin ganz allein unterwegs …` : 'Ich war bei meinen Aufgaben.'; }
      else satz = zufall([`Ich war ${raumBei(b.x, b.y)}.`, 'Keine Ahnung, ich hab nichts gesehen.', `Ich hab Aufgaben ${raumBei(b.x, b.y)} gemacht.`, 'Hmm …', 'Wer war in der Nähe?']);
      setTimeout(() => { if (noch()) chat(r, b, satz); }, 1500 + Math.random() * 6000);
      // Abstimmen
      const wartezeit = Math.max(0, t.abstAb - jetzt()) + 2000 + Math.random() * 10_000;
      setTimeout(() => {
        if (!noch() || r.phase !== 'treffen') return;
        let ziel = 'skip';
        const lebt = id => { const s = r.spieler.get(id); return s && s.lebt && !s.raus; };
        if (b.rolle === 'crew'){
          let meist = null, n = 0; r.treffen.anklagen.forEach((k, id) => { if (k > n && id !== b.id && lebt(id)){ meist = id; n = k; } });
          if (b.gesehen && lebt(b.gesehen.taeter)) ziel = b.gesehen.taeter;
          else if (meist && n >= 2) ziel = meist;
          else if (b.verdacht && lebt(b.verdacht) && b.verdacht !== b.id && Math.random() < 0.35) ziel = b.verdacht;
        } else {
          // Verräter schwimmen mit der Mehrheit, aber nie gegen die eigenen Leute
          const z = new Map(); r.treffen.stimmen.forEach(x => z.set(x, (z.get(x) || 0) + 1));
          let best = null, n = 0; z.forEach((k, id) => { const s = r.spieler.get(id); if (k > n && s && s.rolle === 'crew'){ best = id; n = k; } });
          if (best) ziel = best;
        }
        stimmeAbgeben(r, b, ziel);
      }, wartezeit);
    });
  }

  /* ---------- Takt ---------- */
  let letzterTakt = jetzt();
  setInterval(() => {
    const t = jetzt(), dt = Math.min(0.2, (t - letzterTakt) / 1000); letzterTakt = t;
    raeume.forEach(r => {
      // Spieler, die zu lange weg sind, scheiden aus
      r.spieler.forEach(s => {
        if (!s.weg || t - s.wegSeit < 45_000) return;
        if (r.phase === 'lobby'){ spielerEntfernen(r, s); return; }
        if (!s.abgang){ s.abgang = true; s.lebt = false; anAlle(r, { t:'info', text:`${s.name} hat das Spiel verlassen.` }); siegPruefen(r); }
      });
      if (!raeume.has(r.code)) return;
      if (r.phase === 'treffen' && t >= r.treffen.ende) abstimmungAuswerten(r);
      if (r.phase === 'auswurf' && t >= r.weiterAb) weiterspielen(r);
      if (r.phase !== 'spiel') return;
      if (r.sabotage && r.sabotage.art === 'reaktor'){
        if (t - r.sabotage.r1 < 600 && t - r.sabotage.r2 < 600){ r.sabotage = null; anAlle(r, { t:'info', text:'Reaktor stabilisiert.' }); }
        else if (siegPruefen(r)) return;
      }
      r.spieler.forEach(b => { if (b.bot && r.phase === 'spiel') botTick(r, b, dt); });
      if (r.phase !== 'spiel') return;
      // Zustand an jeden Spieler, jeweils mit dem, was er sehen darf
      const f = fortschritt(r);
      const sab = r.sabotage ? { art:r.sabotage.art, rest:r.sabotage.bis ? r.sabotage.bis - t : 0, r1:t - r.sabotage.r1 < 600, r2:t - r.sabotage.r2 < 600 } : null;
      const alle = [...r.spieler.values()].filter(s => !s.abgang);
      const leichen = r.leichen.map(l => [l.id, +l.x.toFixed(2), +l.y.toFixed(2)]);
      r.spieler.forEach(ich => {
        if (!ich.ws || ich.bot) return;
        const s = [];
        for (const o of alle){
          if (o !== ich){
            if (!o.lebt && ich.lebt) continue;                                  // Geister sieht nur, wer selbst tot ist
            if (o.vent && !(ich.rolle === 'verraeter' && o.rolle === 'verraeter')) continue;
          }
          s.push([o.id, +o.x.toFixed(2), +o.y.toFixed(2), (o.lebt ? 0 : 1) | (o.vent ? 2 : 0)]);
        }
        senden(ich, { t:'z', s, l:leichen, f:f.gesamt ? f.fertig / f.gesamt : 0, sab,
          kc:ich.rolle === 'verraeter' ? Math.max(0, ich.killAb - t) : 0,
          sc:ich.rolle === 'verraeter' ? Math.max(0, r.sabAb - t) : 0,
          kn:Math.max(0, r.knopfAb - t), nf:ich.notfaelle, v:ich.vent });
      });
    });
  }, TICK).unref();

  /* ---------- Verbindungen ---------- */
  const KARTE = { breite:BREITE, hoehe:HOEHE, raeume:RAEUME, gaenge:GAENGE, stationen:STATIONEN, vents:VENTS, knopf:KNOPF,
    reparatur:REPARATUR, tempo:TEMPO, radius:RADIUS, reichweite:REICHWEITE, sicht:SICHT, farben:FARBEN, max:MAX_SPIELER, grenzen:GRENZEN };

  wss.on('connection', ws => {
    let r = null, sp = null;
    ws.lebt = true;
    ws.on('pong', () => { ws.lebt = true; });
    ws.send(JSON.stringify({ t:'hallo', karte:KARTE }));

    function eintreten(raum, spieler){
      r = raum; sp = spieler;
      if (sp.ws && sp.ws !== ws) try { sp.ws.close(4002, 'ersetzt'); } catch (e) {}
      sp.ws = ws; sp.weg = false;
      hostPruefen(r);
      senden(sp, { t:'du', id:sp.id, geheim:sp.geheim, code:r.code });
      raumSenden(r);
      if (r.phase !== 'lobby') fortsetzen(r, sp);
    }

    ws.on('message', roh => {
      let m; try { m = JSON.parse(roh); } catch (e) { return; }
      if (!m || typeof m.t !== 'string') return;
      // Flutschutz
      const t = jetzt();
      if (sp){ if (t > sp.nachrichtenAb){ sp.nachrichtenAb = t + 1000; sp.nachrichten = 0; } if (++sp.nachrichten > 60) return; }

      if (!r){
        if (m.t === 'erstellen'){
          if (raeume.size >= 100) return ws.send(JSON.stringify({ t:'fehler', text:'Gerade sind zu viele Räume offen. Versuch es gleich nochmal.' }));
          const raum = { code:neuerCode(), spieler:new Map(), hostId:null, phase:'lobby', einst:{ ...STANDARD }, leichen:[] };
          raeume.set(raum.code, raum);
          const neu = neuerSpieler(raum, nameSaeubern(m.name));
          raum.hostId = neu.id;
          eintreten(raum, neu);
        } else if (m.t === 'beitreten'){
          const raum = raeume.get(String(m.code || '').toUpperCase().trim());
          if (!raum) return ws.send(JSON.stringify({ t:'fehler', text:'Diesen Raum gibt es nicht (mehr).' }));
          const alt = typeof m.geheim === 'string' && [...raum.spieler.values()].find(s => !s.bot && s.geheim === m.geheim);
          if (alt) return eintreten(raum, alt);
          if (raum.phase !== 'lobby') return ws.send(JSON.stringify({ t:'fehler', text:'In diesem Raum läuft gerade ein Spiel. Warte, bis es vorbei ist.' }));
          if (raum.spieler.size >= MAX_SPIELER){
            // Platz machen, falls ein Bot drin ist
            const bot = [...raum.spieler.values()].find(s => s.bot);
            if (!bot) return ws.send(JSON.stringify({ t:'fehler', text:'Der Raum ist voll.' }));
            raum.spieler.delete(bot.id);
          }
          eintreten(raum, neuerSpieler(raum, nameSaeubern(m.name)));
        }
        return;
      }

      const host = r.hostId === sp.id;
      switch (m.t){
        case 'verlassen':
          if (r.phase === 'lobby') spielerEntfernen(r, sp);
          else { sp.weg = true; sp.wegSeit = 0; sp.ws = null; }
          r = null; sp = null;
          break;
        case 'name':
          if (r.phase === 'lobby'){ sp.name = eindeutig(r, nameSaeubern(m.name), sp); raumSenden(r); }
          break;
        case 'farbe':
          if (r.phase === 'lobby' && FARBEN.includes(m.farbe) && ![...r.spieler.values()].some(s => s.farbe === m.farbe)){ sp.farbe = m.farbe; raumSenden(r); }
          break;
        case 'einst':
          if (host && r.phase === 'lobby' && m.einst && typeof m.einst === 'object'){
            for (const [k, [min, max]] of Object.entries(GRENZEN)){
              const v = Math.round(Number(m.einst[k]));
              if (Number.isFinite(v)) r.einst[k] = Math.max(min, Math.min(max, v));
            }
            if (typeof m.einst.bestaetigen === 'boolean') r.einst.bestaetigen = m.einst.bestaetigen;
            raumSenden(r);
          }
          break;
        case 'bot':
          if (!host || r.phase !== 'lobby') break;
          if (m.dazu && r.spieler.size < MAX_SPIELER){
            const frei = BOT_NAMEN.filter(n => ![...r.spieler.values()].some(s => s.name === n));
            neuerSpieler(r, zufall(frei.length ? frei : BOT_NAMEN), true);
          } else if (!m.dazu){
            const bots = [...r.spieler.values()].filter(s => s.bot);
            if (bots.length) r.spieler.delete(bots[bots.length - 1].id);
          }
          raumSenden(r);
          break;
        case 'start':
          if (host && r.phase === 'lobby'){
            if (r.spieler.size < 4) return senden(sp, { t:'fehler', text:'Ihr braucht mindestens 4 Spieler. Füll mit Bots auf!' });
            starten(r);
          }
          break;
        case 'p': {
          if (r.phase !== 'spiel' || sp.vent) break;
          const x = Number(m.x), y = Number(m.y);
          if (!Number.isFinite(x) || !Number.isFinite(y)) break;
          const dt = Math.min(1, (t - (sp.letztePos || t - 100)) / 1000);
          sp.letztePos = t;
          const max = TEMPO * dt * 1.6 + 0.35;
          const ok = Math.hypot(x - sp.x, y - sp.y) <= max && (sp.lebt ? begehbar(x, y) : x > 0 && y > 0 && x < BREITE && y < HOEHE);
          if (ok){ sp.x = x; sp.y = y; } else senden(sp, { t:'tele', x:sp.x, y:sp.y });
          break;
        }
        case 'toeten': {
          const o = r.spieler.get(m.ziel);
          if (r.phase === 'spiel' && sp.rolle === 'verraeter' && sp.lebt && !sp.vent && t >= sp.killAb && o && o.lebt && o.rolle === 'crew' && !o.vent && abstand(sp, o) <= REICHWEITE.toeten + 0.3)
            toeten(r, sp, o);
          break;
        }
        case 'melden': {
          if (r.phase !== 'spiel' || !sp.lebt || sp.vent) break;
          const l = r.leichen.filter(l => abstand(sp, l) <= REICHWEITE.melden + 0.3).sort((a, b) => abstand(sp, a) - abstand(sp, b))[0];
          if (l) treffenStarten(r, sp, 'leiche', l.id);
          break;
        }
        case 'notfall':
          if (r.phase === 'spiel' && sp.lebt && !sp.vent && sp.notfaelle > 0 && t >= r.knopfAb && !r.sabotage && abstand(sp, KNOPF) <= REICHWEITE.knopf + 0.3){
            sp.notfaelle--; treffenStarten(r, sp, 'knopf', null);
          }
          break;
        case 'aufgabe': {
          const st = STATIONEN.find(s => s.id === m.id);
          if (r.phase === 'spiel' && sp.rolle === 'crew' && st && abstand(sp, st) <= REICHWEITE.benutzen + 0.6) aufgabeFertig(r, sp, st.id);
          break;
        }
        case 'vent': {
          if (r.phase !== 'spiel' || sp.rolle !== 'verraeter' || !sp.lebt) break;
          const v = VENTS.find(v => v.id === m.id);
          if (m.aktion === 'rein' && !sp.vent && v && abstand(sp, v) <= REICHWEITE.vent + 0.4){ sp.vent = v.id; sp.x = v.x; sp.y = v.y; }
          else if (m.aktion === 'wechsel' && sp.vent && v && v.g === VENTS.find(x => x.id === sp.vent).g){ sp.vent = v.id; sp.x = v.x; sp.y = v.y; }
          else if (m.aktion === 'raus' && sp.vent) sp.vent = null;
          else break;
          sp.letztePos = t;
          senden(sp, { t:'tele', x:sp.x, y:sp.y, vent:sp.vent });
          break;
        }
        case 'sabotage':
          if (sp.rolle === 'verraeter' && (m.art === 'licht' || m.art === 'reaktor')) sabotieren(r, m.art);
          break;
        case 'reparatur': {
          const p = REPARATUR[m.punkt];
          if (r.phase !== 'spiel' || !sp.lebt || !r.sabotage || !p || abstand(sp, p) > REICHWEITE.benutzen + 0.6) break;
          if (m.punkt === 'licht' && r.sabotage.art === 'licht'){ r.sabotage = null; anAlle(r, { t:'info', text:'Das Licht ist wieder an.' }); }
          if ((m.punkt === 'r1' || m.punkt === 'r2') && r.sabotage.art === 'reaktor') r.sabotage[m.punkt] = t;
          break;
        }
        case 'stimme':
          if (r.phase === 'treffen') stimmeAbgeben(r, sp, m.ziel === 'skip' ? 'skip' : String(m.ziel));
          break;
        case 'chat':
          chat(r, sp, m.text);
          break;
      }
    });

    ws.on('close', () => {
      if (!r || !sp || sp.ws !== ws) return;
      sp.ws = null; sp.weg = true; sp.wegSeit = jetzt();
      if (r.phase === 'lobby'){
        // In der Lobby kurz warten (Neuladen), dann entfernen – das erledigt der Takt
        sp.wegSeit = jetzt() - 45_000 + 8_000;
      }
      hostPruefen(r);
      raumSenden(r);
    });
  });
  setInterval(() => {
    wss.clients.forEach(ws => { if (!ws.lebt){ ws.terminate(); return; } ws.lebt = false; try { ws.ping(); } catch (e) {} });
  }, 25_000).unref();

  function upgrade(req, socket, kopf){
    if (!hatZugang(req)){ socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return; }
    wss.handleUpgrade(req, socket, kopf, ws => wss.emit('connection', ws, req));
  }
  return { upgrade, _test:{ raster, begehbar, weg, RAEUME, STATIONEN, VENTS, REPARATUR, KNOPF, BREITE, HOEHE } };
};
