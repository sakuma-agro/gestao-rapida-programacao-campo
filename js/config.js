/* =====================================================================
   CONFIGURAÇÃO — Gestão Rápida · Programação Campo
   Mesmo projeto Supabase dos apps Gestão Rápida (Manutenções) e Vistorias.
   A chave "anon public" pode ficar aqui: ela é pública de propósito e
   quem protege os dados é o Row Level Security, no banco.
   ===================================================================== */
window.CONFIG = {
  SUPABASE_URL: 'https://jhwnmtekxsdkhvgcjzhj.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impod25tdGVreHNka2h2Z2NqemhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3MzY4NTksImV4cCI6MjEwMzMxMjg1OX0.L6kwNPBh6K0snxrLahv3WnU1WGHSEeTA8WzMbOXprqk',

  // As tabelas deste app ficam no schema "programacao". Ele precisa estar em
  // Supabase → Project Settings → API (Data API) → Exposed schemas, junto com
  // "manutencao" (de onde vem a lista de usuários). Sem isso toda consulta falha.
  SCHEMA: 'programacao',

  // Mudar este número força o app a baixar tudo de novo.
  VERSAO_BASE: 1
};
