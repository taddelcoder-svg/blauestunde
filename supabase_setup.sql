-- Blaue Stunde: Speicher für Fahrernamen und Bestenliste
-- Einmal im Supabase-Dashboard unter "SQL Editor" ausführen.
--
-- Der Server legt alle Daten als eine JSON-Zeile (id = 'haupt') ab.
-- RLS ist aktiv und es gibt absichtlich keine Policies: Nur der Server mit dem
-- service_role-Schlüssel (Render-Variable SUPABASE_SERVICE_KEY) kommt an die
-- Daten. Der öffentliche anon-Schlüssel hat keinen Zugriff.

create table if not exists public.blauestunde_speicher (
  id           text primary key,
  daten        jsonb not null,
  geaendert_am timestamptz not null default now()
);

alter table public.blauestunde_speicher enable row level security;
