'use strict';
// Blaue Stunde – Server: liefert das Spiel aus, verwaltet Fahrernamen,
// die Bestenliste und Online-Rennen (WebSocket unter /ws).
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT) || 10000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_DATEI = path.join(DATA_DIR, 'db.json');
const STUFEN = ['leicht', 'normal', 'schwer'];
const RENNEN_DAUER = 180_000;   // ms
const COUNTDOWN = 4_000;         // ms
const LISTE_LAENGE = 25;

/* ---------- Speicher (JSON-Datei) ---------- */
let db = { spieler:{}, bestwerte:{ leicht:{}, normal:{}, schwer:{} } };
try {
  const geladen = JSON.parse(fs.readFileSync(DB_DATEI, 'utf8'));
  db = { spieler:geladen.spieler || {}, bestwerte:Object.assign(db.bestwerte, geladen.bestwerte || {}) };
} catch (e) { /* noch keine Daten */ }
let speicherTimer = null;
function speichern(){
  if (speicherTimer) return;
  speicherTimer = setTimeout(() => {
    speicherTimer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive:true });
      fs.writeFileSync(DB_DATEI + '.tmp', JSON.stringify(db));
      fs.renameSync(DB_DATEI + '.tmp', DB_DATEI);
    } catch (e) { console.error('Speichern fehlgeschlagen:', e.message); }
  }, 1000);
}

/* ---------- Fahrer ---------- */
const hash = t => crypto.createHash('sha256').update(t).digest('hex');
const tokenIndex = new Map(Object.entries(db.spieler).map(([id, s]) => [s.tokenHash, id]));
const nameSchluessel = n => n.toLocaleLowerCase('de-DE');
const nameIndex = new Map(Object.entries(db.spieler).map(([id, s]) => [nameSchluessel(s.name), id]));

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
    .map(([id, w], i) => ({ platz:i + 1, id, name:db.spieler[id].name, punkte:w.punkte, strecke:w.strecke, datum:w.datum }));
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
      if (!stufe || !Number.isFinite(punkte) || punkte < 0 || !Number.isFinite(dauer) || dauer <= 0 || dauer > 6*3600
        || !Number.isFinite(strecke) || strecke < 0 || strecke > dauer*0.2 /* max. ~720 km/h */
        || punkte > 2000 + dauer*9000) return json(res, 400, { fehler:'Ergebnis nicht plausibel.' });
      const alt = db.bestwerte[stufe][s.id];
      const neu = !alt || punkte > alt.punkte;
      if (neu){ db.bestwerte[stufe][s.id] = { punkte, strecke:Math.round(strecke*10)/10, datum:Date.now() }; speichern(); }
      const alle = bestenliste(stufe);
      const ich = alle.find(x => x.id === s.id);
      return json(res, 200, { neuerBestwert:neu, platz:ich ? ich.platz : null, gesamt:alle.length, bester:ich ? ich.punkte : punkte });
    }
    json(res, 404, { fehler:'Nicht gefunden' });
  } catch (e) {
    json(res, 400, { fehler:'Ungültige Anfrage' });
  }
});

/* ---------- Online & Rennen ---------- */
const wss = new WebSocketServer({ server, path:'/ws', maxPayload:4096 });
const verbindungen = new Set();   // ws mit ws.spieler = {id, name}
const lobby = {
  phase:'warten',                 // warten | countdown | rennen
  stufe:'normal',
  mitglieder:new Map(),           // id -> { ws, bereit }
  teilnehmer:new Map(),           // id -> { name, d, x, kmh, p, aus, auto, lack }
  startZeit:0, timer:null
};

const senden = (ws, m) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };
const anAlle = m => { const s = JSON.stringify(m); verbindungen.forEach(ws => { if (ws.readyState === 1) ws.send(s); }); };
const anLobby = m => { const s = JSON.stringify(m); lobby.mitglieder.forEach(({ ws }) => { if (ws.readyState === 1) ws.send(s); }); };

function lobbyZustand(){
  return {
    t:'lobby', phase:lobby.phase, stufe:lobby.stufe,
    mitglieder:[...lobby.mitglieder].map(([id, m]) => ({ id, name:m.ws.spieler.name, bereit:m.bereit, faehrt:lobby.teilnehmer.has(id) && !lobby.teilnehmer.get(id).aus })),
    restMs:lobby.phase === 'rennen' ? Math.max(0, lobby.startZeit + RENNEN_DAUER - Date.now()) : null
  };
}
function onlineSenden(){
  const namen = new Set();
  verbindungen.forEach(ws => ws.spieler && namen.add(ws.spieler.name));
  anAlle({ t:'online', anzahl:namen.size, inLobby:lobby.mitglieder.size, phase:lobby.phase });
  anLobby(lobbyZustand());
}

function vielleichtStarten(){
  if (lobby.phase !== 'warten' || lobby.mitglieder.size < 2) return;
  for (const m of lobby.mitglieder.values()) if (!m.bereit) return;
  lobby.phase = 'countdown';
  lobby.teilnehmer.clear();
  lobby.mitglieder.forEach((m, id) => lobby.teilnehmer.set(id, { name:m.ws.spieler.name, d:0, x:0, kmh:0, p:0, aus:false, auto:'kestrel', lack:0xb0101c }));
  anLobby({ t:'countdown', inMs:COUNTDOWN, stufe:lobby.stufe, dauerMs:RENNEN_DAUER });
  onlineSenden();
  lobby.timer = setTimeout(() => {
    lobby.phase = 'rennen'; lobby.startZeit = Date.now();
    onlineSenden();
    lobby.timer = setTimeout(rennenBeenden, RENNEN_DAUER);
  }, COUNTDOWN);
}
function rennenPruefen(){
  if (lobby.phase !== 'rennen' && lobby.phase !== 'countdown') return;
  const aktiv = [...lobby.teilnehmer.values()].filter(t => !t.aus);
  if (!aktiv.length) rennenBeenden();
}
function rennenBeenden(){
  if (lobby.phase === 'warten') return;
  clearTimeout(lobby.timer); lobby.timer = null;
  const rangliste = [...lobby.teilnehmer].map(([id, t]) => ({ id, name:t.name, punkte:Math.floor(t.p), strecke:Math.round(t.d), aus:t.aus }))
    .sort((a, b) => b.punkte - a.punkte).map((e, i) => ({ ...e, platz:i + 1 }));
  const empf = new Set([...lobby.teilnehmer.keys()]);
  lobby.phase = 'warten';
  lobby.mitglieder.forEach(m => m.bereit = false);
  const s = JSON.stringify({ t:'ergebnis', rangliste });
  verbindungen.forEach(ws => { if (ws.spieler && empf.has(ws.spieler.id) && ws.readyState === 1) ws.send(s); });
  lobby.teilnehmer.clear();
  onlineSenden();
}
function lobbyVerlassen(ws){
  const id = ws.spieler && ws.spieler.id; if (!id) return;
  const mg = lobby.mitglieder.get(id);
  if (!mg || mg.ws !== ws) return;   // gehört zu einer neueren Verbindung
  lobby.mitglieder.delete(id);
  const t = lobby.teilnehmer.get(id); if (t) t.aus = true;
  if (lobby.phase === 'countdown' && [...lobby.teilnehmer.values()].filter(x => !x.aus).length < 2){
    clearTimeout(lobby.timer); lobby.phase = 'warten'; lobby.teilnehmer.clear();
    lobby.mitglieder.forEach(m => m.bereit = false);
    anLobby({ t:'abbruch', grund:'Zu wenige Fahrer – Start abgebrochen.' });
  }
  rennenPruefen(); vielleichtStarten(); onlineSenden();
}

// Standmeldungen im Rennen: 10× pro Sekunde
setInterval(() => {
  if (lobby.phase !== 'rennen') return;
  const fahrer = [...lobby.teilnehmer].map(([id, t]) => ({ id, name:t.name, d:Math.round(t.d*10)/10, x:Math.round(t.x*100)/100, kmh:Math.round(t.kmh), p:Math.floor(t.p), aus:t.aus, auto:t.auto, lack:t.lack }));
  const s = JSON.stringify({ t:'stand', fahrer, restMs:Math.max(0, lobby.startZeit + RENNEN_DAUER - Date.now()) });
  lobby.teilnehmer.forEach((_, id) => { const m = lobby.mitglieder.get(id); if (m && m.ws.readyState === 1) m.ws.send(s); });
}, 100).unref();

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://x');
  const s = spielerAusToken(url.searchParams.get('token'));
  if (!s){ ws.close(4001, 'unbekannt'); return; }
  // Ältere Verbindung desselben Fahrers ersetzen
  verbindungen.forEach(alt => { if (alt.spieler && alt.spieler.id === s.id){ lobbyVerlassen(alt); alt.close(4002, 'ersetzt'); verbindungen.delete(alt); } });
  ws.spieler = { id:s.id, get name(){ return (db.spieler[s.id] || s).name; } };
  ws.lebt = true;
  verbindungen.add(ws);
  onlineSenden();

  ws.on('pong', () => { ws.lebt = true; });
  ws.on('message', roh => {
    let m; try { m = JSON.parse(roh); } catch (e) { return; }
    const id = ws.spieler.id;
    switch (m.t){
      case 'beitreten':
        if (!lobby.mitglieder.has(id)) lobby.mitglieder.set(id, { ws, bereit:false });
        onlineSenden(); break;
      case 'verlassen':
        lobbyVerlassen(ws); break;
      case 'bereit': {
        const mg = lobby.mitglieder.get(id);
        if (mg && lobby.phase === 'warten'){ mg.bereit = !!m.bereit; onlineSenden(); vielleichtStarten(); }
        break;
      }
      case 'stufe':
        if (lobby.phase === 'warten' && lobby.mitglieder.has(id) && STUFEN.includes(m.stufe)){
          lobby.stufe = m.stufe; lobby.mitglieder.forEach(x => x.bereit = false); onlineSenden();
        }
        break;
      case 'pos': {
        const t = lobby.teilnehmer.get(id);
        if (!t || t.aus || lobby.phase !== 'rennen') break;
        const num = (v, min, max) => Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : 0;
        t.d = num(m.d, 0, 1e6); t.x = num(m.x, -6, 6); t.kmh = num(m.kmh, 0, 800); t.p = num(m.p, 0, 1e9);
        if (typeof m.auto === 'string' && m.auto.length < 20) t.auto = m.auto;
        if (Number.isInteger(m.lack)) t.lack = m.lack & 0xffffff;
        if (m.aus){ t.aus = true; rennenPruefen(); }
        break;
      }
    }
  });
  ws.on('close', () => { verbindungen.delete(ws); lobbyVerlassen(ws); onlineSenden(); });
});
setInterval(() => {
  verbindungen.forEach(ws => { if (!ws.lebt){ ws.terminate(); return; } ws.lebt = false; try { ws.ping(); } catch (e) {} });
}, 25_000).unref();

server.listen(PORT, () => console.log(`Blaue Stunde läuft auf Port ${PORT}`));
