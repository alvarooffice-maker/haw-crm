-- ============================================================
-- HAW CRM — Anotações de clientes
-- ============================================================

create table if not exists public.anotacoes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  texto text not null,
  autor varchar(200),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_anotacoes_cliente on public.anotacoes(cliente_id) where deleted_at is null;

-- RLS: qualquer autenticado pode ler e escrever (mesma política do restante do app)
alter table public.anotacoes enable row level security;

create policy "anotacoes_anon_all" on public.anotacoes
  for all to anon using (true) with check (true);
