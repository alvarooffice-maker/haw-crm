-- ============================================================
-- HAW CRM — Row Level Security (RLS)
-- Execute DEPOIS de 001_schema.sql
-- ============================================================

-- Habilitar RLS em todas as tabelas
alter table public.usuarios         enable row level security;
alter table public.clientes         enable row level security;
alter table public.receitas         enable row level security;
alter table public.produtos         enable row level security;
alter table public.pedidos          enable row level security;
alter table public.pedido_itens     enable row level security;
alter table public.pipeline_historico enable row level security;
alter table public.config           enable row level security;

-- ── HELPER: perfil do usuário logado ──────────────────────
create or replace function public.meu_perfil()
returns text language sql security definer stable as $$
  select perfil from public.usuarios where id = auth.uid();
$$;

create or replace function public.meu_vendedor_id()
returns uuid language sql security definer stable as $$
  select id from public.usuarios where id = auth.uid();
$$;

-- ── USUARIOS ──────────────────────────────────────────────
-- Qualquer autenticado lê; só dono cria/edita
create policy "usuarios_select" on public.usuarios
  for select to authenticated using (true);

create policy "usuarios_insert" on public.usuarios
  for insert to authenticated
  with check (public.meu_perfil() in ('dono','gestor'));

create policy "usuarios_update" on public.usuarios
  for update to authenticated
  using (public.meu_perfil() in ('dono','gestor'));

-- ── CLIENTES ──────────────────────────────────────────────
-- Vendedor vê só os seus; gestor/dono/financeiro vê todos
create policy "clientes_select" on public.clientes
  for select to authenticated using (
    deleted_at is null and (
      public.meu_perfil() in ('gestor','dono','financeiro')
      or vendedor_id = auth.uid()
    )
  );

create policy "clientes_insert" on public.clientes
  for insert to authenticated
  with check (public.meu_perfil() in ('vendedor','gestor','dono'));

create policy "clientes_update" on public.clientes
  for update to authenticated using (
    public.meu_perfil() in ('gestor','dono')
    or (public.meu_perfil() = 'vendedor' and vendedor_id = auth.uid())
  );

create policy "clientes_delete" on public.clientes
  for update to authenticated
  using (public.meu_perfil() in ('gestor','dono'));

-- ── RECEITAS ──────────────────────────────────────────────
create policy "receitas_select" on public.receitas
  for select to authenticated using (deleted_at is null);

create policy "receitas_insert" on public.receitas
  for insert to authenticated
  with check (public.meu_perfil() in ('vendedor','gestor','dono'));

create policy "receitas_update" on public.receitas
  for update to authenticated
  using (public.meu_perfil() in ('gestor','dono'));

-- ── PRODUTOS ──────────────────────────────────────────────
-- Todos lêem; só gestor/dono escreve
create policy "produtos_select" on public.produtos
  for select to authenticated using (deleted_at is null);

create policy "produtos_insert" on public.produtos
  for insert to authenticated
  with check (public.meu_perfil() in ('gestor','dono'));

create policy "produtos_update" on public.produtos
  for update to authenticated
  using (public.meu_perfil() in ('gestor','dono'));

-- ── PEDIDOS ───────────────────────────────────────────────
create policy "pedidos_select" on public.pedidos
  for select to authenticated using (
    deleted_at is null and (
      public.meu_perfil() in ('gestor','dono','financeiro')
      or vendedor_id = auth.uid()
    )
  );

create policy "pedidos_insert" on public.pedidos
  for insert to authenticated
  with check (public.meu_perfil() in ('vendedor','gestor','dono'));

create policy "pedidos_update" on public.pedidos
  for update to authenticated using (
    public.meu_perfil() in ('gestor','dono')
    or (public.meu_perfil() = 'vendedor' and vendedor_id = auth.uid())
  );

-- ── PEDIDO_ITENS ──────────────────────────────────────────
create policy "itens_select" on public.pedido_itens
  for select to authenticated using (true);

create policy "itens_insert" on public.pedido_itens
  for insert to authenticated
  with check (public.meu_perfil() in ('vendedor','gestor','dono'));

create policy "itens_delete" on public.pedido_itens
  for delete to authenticated
  using (public.meu_perfil() in ('vendedor','gestor','dono'));

-- ── PIPELINE HISTÓRICO ────────────────────────────────────
create policy "historico_select" on public.pipeline_historico
  for select to authenticated using (true);

create policy "historico_insert" on public.pipeline_historico
  for insert to authenticated with check (true);

-- ── CONFIG ────────────────────────────────────────────────
create policy "config_select" on public.config
  for select to authenticated using (true);

create policy "config_update" on public.config
  for update to authenticated
  using (public.meu_perfil() in ('dono','gestor'));
