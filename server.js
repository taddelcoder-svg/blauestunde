'use strict';
// Blaue Stunde – Server: liefert das Spiel aus, verwaltet Fahrernamen,
// die Bestenliste und Online-Rennen (WebSocket unter /ws).
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const zugang = require('./zugang')({ titel:'Blaue Stunde' });
const olymp = require('./olymp')({ spiel:'blauestunde' });

const PORT = Number(process.env.PORT) || 10000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_DATEI = path.join(DATA_DIR, 'db.json');
const STUFEN = ['leicht', 'normal', 'schwer'];
const RENNEN_DAUER = 180_000;   // ms
const COUNTDOWN = 4_000;         // ms
const LISTE_LAENGE = 25;

/* ---------- Plausibilität ----------
   Obergrenzen aus den Spielregeln in index.html (STUFEN, AUTOS, Nitro):
   Höchsttempo = basisMax + gasPlus + 110 (Nitro Stufe 5), Punktfaktor × 1,15 (Vesper) × 2 (Nitro),
   Combo höchstens ×8. Ein Ergebnis darüber ist manipuliert oder stammt aus dem alten Nitro-Glitch. */
const REGELN = { leicht:{ vmax:370, faktor:0.7 }, normal:{ vmax:432, faktor:1 }, schwer:{ vmax:480, faktor:1.5 } };
const KNAPP_PRO_KM = 40;
function maxStreckeKm(stufe, sek){ return sek*REGELN[stufe].vmax/3600*1.05 + 0.05; }
function maxPunkte(stufe, km, knapp){
  const r = REGELN[stufe], mult = r.faktor*1.15*2;
  const fahrt = km*1000*0.432*2.05*mult;                       // Grundpunkte pro Meter bei voller Combo
  const proKnapp = (60 + 0.6*r.vmax)*8*mult;
  return 2000 + 1.1*(fahrt + Math.min(knapp, km*KNAPP_PRO_KM + 20)*proKnapp);
}

/* ---------- Speicher ----------
   Mit SUPABASE_URL und SUPABASE_SERVICE_KEY liegen Namen und Bestenliste als
   eine Zeile in der Supabase-Tabelle „blauestunde_speicher“ (siehe
   supabase_setup.sql) und überleben so Deploys auf Render. Ohne diese
   Variablen wird wie bisher eine JSON-Datei in DATA_DIR benutzt. */
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const MIT_SUPABASE = !!(SUPABASE_URL && SUPABASE_KEY);
const SPEICHER_TABELLE = `${SUPABASE_URL}/rest/v1/blauestunde_speicher`;
const supabaseKopf = { apikey:SUPABASE_KEY, Authorization:'Bearer ' + SUPABASE_KEY };

let db = { spieler:{}, bestwerte:{ leicht:{}, normal:{}, schwer:{} } };
function uebernehmen(geladen){
  if (!geladen) return;
  db = { spieler:geladen.spieler || {}, bestwerte:Object.assign(db.bestwerte, geladen.bestwerte || {}) };
}
async function laden(){
  if (!MIT_SUPABASE){
    try { uebernehmen(JSON.parse(fs.readFileSync(DB_DATEI, 'utf8'))); } catch (e) { /* noch keine Daten */ }
    return;
  }
  // Ohne geladene Daten nicht starten: sonst würde der erste Speichervorgang die Bestenliste überschreiben.
  for (let versuch = 1; ; versuch++){
    try {
      const res = await fetch(`${SPEICHER_TABELLE}?id=eq.haupt&select=daten`, { headers:supabaseKopf });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      const zeilen = await res.json();
      uebernehmen(zeilen[0] && zeilen[0].daten);
      console.log('Daten aus Supabase geladen.');
      return;
    } catch (e) {
      console.error(`Laden aus Supabase fehlgeschlagen (Versuch ${versuch}):`, e.message);
      if (versuch >= 5) throw e;
      await new Promise(ok => setTimeout(ok, 2000 * versuch));
    }
  }
}
async function schreiben(){
  const inhalt = JSON.stringify(db);
  if (!MIT_SUPABASE){
    fs.mkdirSync(DATA_DIR, { recursive:true });
    fs.writeFileSync(DB_DATEI + '.tmp', inhalt);
    fs.renameSync(DB_DATEI + '.tmp', DB_DATEI);
    return;
  }
  const res = await fetch(SPEICHER_TABELLE, {
    method:'POST',
    headers:{ ...supabaseKopf, 'Content-Type':'application/json', Prefer:'resolution=merge-duplicates,return=minimal' },
    body:`{"id":"haupt","daten":${inhalt},"geaendert_am":"${new Date().toISOString()}"}`
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
}
let speicherTimer = null, schreibt = Promise.resolve();
function jetztSpeichern(){
  clearTimeout(speicherTimer); speicherTimer = null;
  schreibt = schreibt.then(schreiben).catch(e => { console.error('Speichern fehlgeschlagen:', e.message); speicherTimer = setTimeout(jetztSpeichern, 10_000); });
  return schreibt;
}
function speichern(){
  if (!speicherTimer) speicherTimer = setTimeout(jetztSpeichern, 1000);
}

/* ---------- Fahrer ---------- */
const hash = t => crypto.createHash('sha256').update(t).digest('hex');
const nameSchluessel = n => n.toLocaleLowerCase('de-DE');
const tokenIndex = new Map(), nameIndex = new Map();
function indizesAufbauen(){
  tokenIndex.clear(); nameIndex.clear();
  for (const [id, s] of Object.entries(db.spieler)){ if (s.olymp) continue; tokenIndex.set(s.tokenHash, id); nameIndex.set(nameSchluessel(s.name), id); }
}

function nameFehler(name){
  if (typeof name !== 'string') return 'Name fehlt.';
  if (name.length < 3 || name.length > 16) return 'Der Name muss 3 bis 16 Zeichen lang sein.';
  if (!/^[A-Za-z0-9ÄÖÜäöüß_\-. ]+$/.test(name)) return 'Erlaubt sind Buchstaben, Ziffern, Leerzeichen und _ - .';
  if (/^\s|\s$|\s\s/.test(name)) return 'Keine Leerzeichen am Anfang, am Ende oder doppelt.';
  return null;
}
function spielerAusToken(token){
  if (typeof token !== 'string' || token.length < 20) return null;
  const id = tokenIndex.get(hash(token));
  return id ? { id, ...db.spieler[id] } : null;
}

/* ---------- Bestenliste ---------- */
function bestenliste(stufe){
  return Object.entries(db.bestwerte[stufe] || {})
    .filter(([id]) => db.spieler[id])
    .sort((a, b) => b[1].punkte - a[1].punkte)
    .map(([id, w], i) => ({ platz:i + 1, id, name:db.spieler[id].name, olymp:!!db.spieler[id].olymp, punkte:w.punkte, strecke:w.strecke, datum:w.datum }));
}
// Olympia-Fahrer haben kein Fahrerkonto: Sie bekommen einen eigenen Eintrag (ohne Token, Name aus dem Ticket),
// der über alle Läufe derselben Olympiade gleich bleibt.
function bestwertEintragen(stufe, id, punkte, strecke){
  const alt = db.bestwerte[stufe][id];
  if (alt && punkte <= alt.punkte) return false;
  db.bestwerte[stufe][id] = { punkte, strecke:Math.round(strecke*10)/10, datum:Date.now() };
  speichern();
  return true;
}
function olympBestwerte(lb, rangliste){
  const t = lb.olymp.t;
  rangliste.forEach(e => {
    if (e.punkte <= 0) return;
    const id = 'o-' + hash(t.u + ':' + e.id.split(':').pop()).slice(0, 16);
    db.spieler[id] = { name:e.name, olymp:true, erstellt:(db.spieler[id] && db.spieler[id].erstellt) || Date.now() };
    bestwertEintragen(lb.stufe, id, e.punkte, e.strecke/1000);
  });
  speichern();
}

/* ---------- Anfragen-Begrenzung ---------- */
const zaehler = new Map();
function begrenzt(schluessel, max, fensterMs){
  const jetzt = Date.now();
  const e = zaehler.get(schluessel);
  if (!e || jetzt > e.bis){ zaehler.set(schluessel, { n:1, bis:jetzt + fensterMs }); return false; }
  return ++e.n > max;
}
setInterval(() => { const j = Date.now(); for (const [k, e] of zaehler) if (j > e.bis) zaehler.delete(k); }, 60_000).unref();

/* ---------- HTTP ---------- */
const INDEX = path.join(__dirname, 'index.html');
const DATENSCHUTZ = path.join(__dirname, 'datenschutz.html');
const VENDOR = path.join(__dirname, 'vendor');
const TYPEN = { '.js':'text/javascript; charset=utf-8', '.woff2':'font/woff2', '.txt':'text/plain; charset=utf-8' };
function json(res, status, daten){
  res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' });
  res.end(JSON.stringify(daten));
}
function koerperLesen(req){
  return new Promise((ok, nein) => {
    let d = '';
    req.on('data', c => { d += c; if (d.length > 10_000){ nein(new Error('zu groß')); req.destroy(); } });
    req.on('end', () => { try { ok(d ? JSON.parse(d) : {}); } catch (e) { nein(e); } });
    req.on('error', nein);
  });
}
const tokenAus = req => (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
const ipAus = req => (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'GET' && (url.pathname === '/datenschutz' || url.pathname === '/datenschutz.html')){
      res.writeHead(200, { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-cache' });
      return fs.createReadStream(DATENSCHUTZ).pipe(res);
    }
    if (zugang.pruefen(req, res)) return;
    // Selbst ausgelieferte Schriften und three.js (keine Verbindung zu Google oder CDNs)
    const vendor = /^\/vendor\/([\w-]+(?:\.[\w-]+)*\.(js|woff2|txt))$/.exec(url.pathname);
    if (req.method === 'GET' && vendor){
      const datei = path.join(VENDOR, vendor[1]);
      if (!fs.existsSync(datei)) return json(res, 404, { fehler:'Nicht gefunden' });
      res.writeHead(200, { 'Content-Type':TYPEN[path.extname(datei)], 'Cache-Control':'public, max-age=604800' });
      return fs.createReadStream(datei).pipe(res);
    }
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')){
      res.writeHead(200, { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-cache' });
      return fs.createReadStream(INDEX).pipe(res);
    }
    if (req.method === 'GET' && url.pathname === '/healthz') return json(res, 200, { ok:true });

    // Neuen Fahrer anlegen
    if (req.method === 'POST' && url.pathname === '/api/spieler'){
      if (begrenzt('neu:' + ipAus(req), 10, 3_600_000)) return json(res, 429, { fehler:'Zu viele neue Namen. Versuch es später nochmal.' });
      const { name } = await koerperLesen(req);
      const n = typeof name === 'string' ? name.trim() : name;
      const f = nameFehler(n); if (f) return json(res, 400, { fehler:f });
      if (nameIndex.has(nameSchluessel(n))) return json(res, 409, { fehler:'Dieser Name ist schon vergeben.' });
      const id = crypto.randomBytes(8).toString('hex');
      const token = crypto.randomBytes(32).toString('hex');
      db.spieler[id] = { name:n, tokenHash:hash(token), erstellt:Date.now() };
      tokenIndex.set(hash(token), id); nameIndex.set(nameSchluessel(n), id);
      speichern();
      return json(res, 201, { id, name:n, token });
    }
    // Eigenen Fahrer abfragen
    if (req.method === 'GET' && url.pathname === '/api/ich'){
      const s = spielerAusToken(tokenAus(req));
      return s ? json(res, 200, { id:s.id, name:s.name }) : json(res, 401, { fehler:'Unbekannt' });
    }
    // Umbenennen
    if (req.method === 'POST' && url.pathname === '/api/umbenennen'){
      const s = spielerAusToken(tokenAus(req)); if (!s) return json(res, 401, { fehler:'Unbekannt' });
      const { name } = await koerperLesen(req);
      const n = typeof name === 'string' ? name.trim() : name;
      const f = nameFehler(n); if (f) return json(res, 400, { fehler:f });
      const belegt = nameIndex.get(nameSchluessel(n));
      if (belegt && belegt !== s.id) return json(res, 409, { fehler:'Dieser Name ist schon vergeben.' });
      nameIndex.delete(nameSchluessel(db.spieler[s.id].name));
      db.spieler[s.id].name = n; nameIndex.set(nameSchluessel(n), s.id);
      speichern(); onlineSenden();
      return json(res, 200, { id:s.id, name:n });
    }
    // Bestenliste
    if (req.method === 'GET' && url.pathname === '/api/bestenliste'){
      const stufe = STUFEN.includes(url.searchParams.get('stufe')) ? url.searchParams.get('stufe') : 'normal';
      const alle = bestenliste(stufe);
      const s = spielerAusToken(tokenAus(req));
      const ich = s ? alle.find(e => e.id === s.id) || null : null;
      return json(res, 200, { stufe, eintraege:alle.slice(0, LISTE_LAENGE), ich, gesamt:alle.length });
    }
    // Ergebnis einer Fahrt
    if (req.method === 'POST' && url.pathname === '/api/ergebnis'){
      const s = spielerAusToken(tokenAus(req)); if (!s) return json(res, 401, { fehler:'Unbekannt' });
      if (begrenzt('erg:' + s.id, 30, 60_000)) return json(res, 429, { fehler:'Zu viele Ergebnisse.' });
      const e = await koerperLesen(req);
      const stufe = STUFEN.includes(e.stufe) ? e.stufe : null;
      const punkte = Math.floor(Number(e.punkte)), strecke = Number(e.strecke), dauer = Number(e.dauer);
      const knapp = Number.isInteger(e.knapp) && e.knapp >= 0 ? e.knapp : 0;
      if (!stufe || !Number.isFinite(punkte) || punkte < 0 || !Number.isFinite(dauer) || dauer <= 0 || dauer > 6*3600
        || !Number.isFinite(strecke) || strecke < 0 || strecke > maxStreckeKm(stufe, dauer)
        || punkte > maxPunkte(stufe, strecke, knapp)) return json(res, 400, { fehler:'Ergebnis nicht plausibel.' });
      const neu = bestwertEintragen(stufe, s.id, punkte, strecke);
      const alle = bestenliste(stufe);
      const ich = alle.find(x => x.id === s.id);
      return json(res, 200, { neuerBestwert:neu, platz:ich ? ich.platz : null, gesamt:alle.length, bester:ich ? ich.punkte : punkte });
    }
    json(res, 404, { fehler:'Nicht gefunden' });
  } catch (e) {
    json(res, 400, { fehler:'Ungültige Anfrage' });
  }
});

/* ---------- Online & Rennen ----------
   Es gibt die eine offene Lobby für alle und zusätzlich je eine eigene Lobby pro Olympia-Lauf.
   Olympia-Fahrer kommen mit einem signierten Ticket statt mit einem Fahrernamen. */
const wss = new WebSocketServer({ server, path:'/ws', maxPayload:4096, verifyClient:({ req }) => zugang.hatZugang(req) });
const verbindungen = new Set();   // ws mit ws.spieler = {id, name} und ws.lobby
function neueLobby(olympia){
  return {
    phase:'warten',               // warten | countdown | rennen
    stufe:olympia && STUFEN.includes(olympia.t.c.stufe) ? olympia.t.c.stufe : 'normal',
    mitglieder:new Map(),         // id -> { ws, bereit }
    teilnehmer:new Map(),         // id -> { name, d, x, kmh, p, aus, auto, lack }
    startZeit:0, timer:null,
    olymp:olympia || null         // { t, gestartet, gemeldet, schluessel }
  };
}
const lobby = neueLobby();
const olympLobbys = new Map();   // "lauf:gruppe" -> Lobby
const alleLobbys = () => [lobby, ...olympLobbys.values()];

const senden = (ws, m) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };
const anAlle = m => { const s = JSON.stringify(m); verbindungen.forEach(ws => { if (ws.readyState === 1 && !ws.olymp) ws.send(s); }); };
const anLobby = (lb, m) => { const s = JSON.stringify(m); lb.mitglieder.forEach(({ ws }) => { if (ws.readyState === 1) ws.send(s); }); };

function lobbyZustand(lb){
  return {
    t:'lobby', phase:lb.phase, stufe:lb.stufe,
    mitglieder:[...lb.mitglieder].map(([id, m]) => ({ id, name:m.ws.spieler.name, bereit:m.bereit, faehrt:lb.teilnehmer.has(id) && !lb.teilnehmer.get(id).aus })),
    restMs:lb.phase === 'rennen' ? Math.max(0, lb.startZeit + RENNEN_DAUER - Date.now()) : null,
    olymp:lb.olymp ? olympInfo(lb) : null
  };
}
function onlineSenden(lb = lobby){
  if (lb === lobby){
    const namen = new Set();
    verbindungen.forEach(ws => ws.spieler && !ws.olymp && namen.add(ws.spieler.name));
    anAlle({ t:'online', anzahl:namen.size, inLobby:lobby.mitglieder.size, phase:lobby.phase });
  }
  anLobby(lb, lobbyZustand(lb));
}

function vielleichtStarten(lb){
  if (lb.phase !== 'warten') return;
  const o = lb.olymp;
  if (o){
    // Olympiade: ein einziges Rennen – los geht's, wenn alle Erwarteten da sind oder alle Anwesenden bereit
    if (o.gestartet || !lb.mitglieder.size) return;
    const da = new Set(lb.mitglieder.keys());
    const alleDa = o.t.m.every(e => da.has(olympSpielerId(o.t, e.s)));
    const alleBereit = [...lb.mitglieder.values()].every(m => m.bereit);
    if (!alleDa && !alleBereit) return;
    o.gestartet = true;
  } else {
    if (lb.mitglieder.size < 2) return;
    for (const m of lb.mitglieder.values()) if (!m.bereit) return;
  }
  lb.phase = 'countdown';
  lb.teilnehmer.clear();
  lb.mitglieder.forEach((m, id) => lb.teilnehmer.set(id, { name:m.ws.spieler.name, d:0, x:0, kmh:0, p:0, aus:false, auto:'kestrel', lack:0xb0101c }));
  anLobby(lb, { t:'countdown', inMs:COUNTDOWN, stufe:lb.stufe, dauerMs:RENNEN_DAUER });
  onlineSenden(lb);
  if (o) olymp.status(o.t, [...lb.teilnehmer.keys()].map(id => id.split(':').pop()), 'laeuft');
  lb.timer = setTimeout(() => {
    lb.phase = 'rennen'; lb.startZeit = Date.now();
    onlineSenden(lb);
    lb.timer = setTimeout(() => rennenBeenden(lb), RENNEN_DAUER);
  }, COUNTDOWN);
}
function rennenPruefen(lb){
  if (lb.phase !== 'rennen' && lb.phase !== 'countdown') return;
  const aktiv = [...lb.teilnehmer.values()].filter(t => !t.aus);
  if (!aktiv.length) rennenBeenden(lb);
}
function rennenBeenden(lb){
  if (lb.phase === 'warten') return;
  clearTimeout(lb.timer); lb.timer = null;
  const rangliste = [...lb.teilnehmer].map(([id, t]) => ({ id, name:t.name, punkte:Math.floor(t.p), strecke:Math.round(t.d), aus:t.aus }))
    .sort((a, b) => b.punkte - a.punkte).map((e, i) => ({ ...e, platz:i + 1 }));
  const empf = new Set([...lb.teilnehmer.keys()]);
  lb.phase = 'warten';
  lb.mitglieder.forEach(m => m.bereit = false);
  if (lb.olymp){ olympMelden(lb, rangliste); olympBestwerte(lb, rangliste); }
  const s = JSON.stringify({ t:'ergebnis', rangliste });
  verbindungen.forEach(ws => { if (ws.spieler && ws.lobby === lb && empf.has(ws.spieler.id) && ws.readyState === 1) ws.send(s); });
  lb.teilnehmer.clear();
  onlineSenden(lb);
}
function lobbyVerlassen(ws){
  const id = ws.spieler && ws.spieler.id, lb = ws.lobby; if (!id || !lb) return;
  const mg = lb.mitglieder.get(id);
  if (!mg || mg.ws !== ws) return;   // gehört zu einer neueren Verbindung
  lb.mitglieder.delete(id);
  const t = lb.teilnehmer.get(id); if (t) t.aus = true;
  if (lb.phase === 'countdown' && [...lb.teilnehmer.values()].filter(x => !x.aus).length < (lb.olymp ? 1 : 2)){
    clearTimeout(lb.timer); lb.phase = 'warten'; lb.teilnehmer.clear();
    lb.mitglieder.forEach(m => m.bereit = false);
    if (lb.olymp) lb.olymp.gestartet = false;
    anLobby(lb, { t:'abbruch', grund:'Zu wenige Fahrer – Start abgebrochen.' });
  }
  rennenPruefen(lb); vielleichtStarten(lb); onlineSenden(lb);
  if (lb.olymp){
    olympStatus(lb);
    if (!lb.mitglieder.size && lb.phase === 'warten') setTimeout(() => { if (!lb.mitglieder.size && lb.phase === 'warten') olympLobbys.delete(lb.olymp.schluessel); }, 10 * 60_000);
  }
}

/* ---------- Olympiade ---------- */
const olympSpielerId = (t, s) => `olymp:${t.l}:${s}`;
function olympInfo(lb){
  const o = lb.olymp, da = new Set(lb.mitglieder.keys());
  return { ...olymp.fuerBrowser(o.t), erwartet:o.t.m.map(e => ({ n:e.n, da:da.has(olympSpielerId(o.t, e.s)) })), gestartet:o.gestartet, vorbei:o.gemeldet };
}
function olympStatus(lb){
  const o = lb.olymp;
  olymp.status(o.t, [...lb.mitglieder.keys()].map(id => id.split(':').pop()), lb.phase === 'warten' ? 'warten' : 'laeuft');
}
function olympMelden(lb, rangliste){
  const o = lb.olymp;
  if (o.gemeldet) return;
  o.gemeldet = true;
  olymp.rangMelden(o.t, rangliste.map(e => ({ s:e.id.split(':').pop(), wert:e.punkte, text:`${e.punkte.toLocaleString('de-DE')} Punkte${e.aus ? ' · Unfall' : ''}` })));
}
function olympLobbyFuer(t){
  const schluessel = t.l + ':' + t.g;
  let lb = olympLobbys.get(schluessel);
  if (!lb){ lb = neueLobby({ t, gestartet:false, gemeldet:false, schluessel }); olympLobbys.set(schluessel, lb); }
  return lb;
}

// Standmeldungen im Rennen: 10× pro Sekunde
setInterval(() => {
  for (const lb of alleLobbys()){
    if (lb.phase !== 'rennen') continue;
    const fahrer = [...lb.teilnehmer].map(([id, t]) => ({ id, name:t.name, d:Math.round(t.d*10)/10, x:Math.round(t.x*100)/100, kmh:Math.round(t.kmh), p:Math.floor(t.p), aus:t.aus, auto:t.auto, lack:t.lack }));
    const s = JSON.stringify({ t:'stand', fahrer, restMs:Math.max(0, lb.startZeit + RENNEN_DAUER - Date.now()) });
    lb.teilnehmer.forEach((_, id) => { const m = lb.mitglieder.get(id); if (m && m.ws.readyState === 1) m.ws.send(s); });
  }
}, 100).unref();

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://x');
  const olympTicket = url.searchParams.get('olymp');
  if (olympTicket){
    // Olympia-Fahrer: Name und Lobby kommen aus dem Ticket, gewertet wird für die Olympiade und die Bestenliste
    const t = olymp.ticketPruefen(olympTicket);
    if (!t){ ws.close(4003, 'ticket'); return; }
    const id = olympSpielerId(t, t.s), name = t.n;
    ws.spieler = { id, name };
    ws.olymp = true;
    ws.lobby = olympLobbyFuer(t);
    senden(ws, { t:'olympDu', id, name });
  } else {
    const s = spielerAusToken(url.searchParams.get('token'));
    if (!s){ ws.close(4001, 'unbekannt'); return; }
    ws.spieler = { id:s.id, get name(){ return (db.spieler[s.id] || s).name; } };
    ws.lobby = lobby;
  }
  // Ältere Verbindung desselben Fahrers ersetzen
  verbindungen.forEach(alt => { if (alt.spieler && alt.spieler.id === ws.spieler.id){ lobbyVerlassen(alt); alt.close(4002, 'ersetzt'); verbindungen.delete(alt); } });
  ws.lebt = true;
  verbindungen.add(ws);
  onlineSenden(ws.lobby);

  ws.on('pong', () => { ws.lebt = true; });
  ws.on('message', roh => {
    let m; try { m = JSON.parse(roh); } catch (e) { return; }
    const id = ws.spieler.id, lb = ws.lobby;
    switch (m.t){
      case 'beitreten':
        if (lb.olymp && lb.olymp.gemeldet){ senden(ws, { t:'olympVorbei' }); break; }
        if (!lb.mitglieder.has(id)) lb.mitglieder.set(id, { ws, bereit:false });
        else lb.mitglieder.get(id).ws = ws;
        onlineSenden(lb);
        if (lb.olymp){ olympStatus(lb); vielleichtStarten(lb); }
        break;
      case 'verlassen':
        lobbyVerlassen(ws); break;
      case 'bereit': {
        const mg = lb.mitglieder.get(id);
        if (mg && lb.phase === 'warten'){ mg.bereit = !!m.bereit; onlineSenden(lb); vielleichtStarten(lb); }
        break;
      }
      case 'stufe':
        if (!lb.olymp && lb.phase === 'warten' && lb.mitglieder.has(id) && STUFEN.includes(m.stufe)){
          lb.stufe = m.stufe; lb.mitglieder.forEach(x => x.bereit = false); onlineSenden(lb);
        }
        break;
      case 'pos': {
        const t = lb.teilnehmer.get(id);
        if (!t || t.aus || lb.phase !== 'rennen') break;
        const num = (v, min, max) => Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : 0;
        // Strecke und Punkte nur so weit, wie es seit dem Start überhaupt möglich ist
        const kmMax = maxStreckeKm(lb.stufe, (Date.now() - lb.startZeit)/1000 + 5);
        t.d = num(m.d, 0, kmMax*1000); t.x = num(m.x, -6, 6); t.kmh = num(m.kmh, 0, REGELN[lb.stufe].vmax + 10);
        t.p = num(m.p, 0, maxPunkte(lb.stufe, t.d/1000, Infinity));
        if (typeof m.auto === 'string' && m.auto.length < 20) t.auto = m.auto;
        if (Number.isInteger(m.lack)) t.lack = m.lack & 0xffffff;
        if (m.aus){ t.aus = true; rennenPruefen(lb); }
        break;
      }
    }
  });
  ws.on('close', () => { verbindungen.delete(ws); lobbyVerlassen(ws); onlineSenden(ws.lobby); });
});
setInterval(() => {
  verbindungen.forEach(ws => { if (!ws.lebt){ ws.terminate(); return; } ws.lebt = false; try { ws.ping(); } catch (e) {} });
}, 25_000).unref();

// Beim Neustart (z. B. Deploy auf Render) noch ausstehende Änderungen sichern
for (const signal of ['SIGTERM', 'SIGINT']){
  process.on(signal, async () => {
    if (speicherTimer) await jetztSpeichern();
    else await schreibt;
    process.exit(0);
  });
}

laden().then(() => {
  indizesAufbauen();
  server.listen(PORT, () => console.log(`Blaue Stunde läuft auf Port ${PORT} (Speicher: ${MIT_SUPABASE ? 'Supabase' : DB_DATEI})`));
}).catch(e => { console.error('Start abgebrochen:', e.message); process.exit(1); });
