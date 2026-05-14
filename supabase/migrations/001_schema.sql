-- ============================================================
-- HAW CRM — Schema completo
-- Execute no Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

create extension if not exists "pgcrypto";

-- ── USUARIOS ──────────────────────────────────────────────
create table if not exists public.usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  nome varchar(200) not null,
  email varchar(200) not null,
  perfil varchar(20) not null default 'vendedor'
    check (perfil in ('vendedor','gestor','financeiro','dono')),
  meta_mensal decimal(10,2) default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── CLIENTES ──────────────────────────────────────────────
create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  nome varchar(200) not null,
  cpf varchar(14),
  telefone varchar(20),
  email varchar(200),
  data_nascimento date,
  endereco jsonb default '{}',
  vendedor_id uuid references public.usuarios(id),
  status varchar(20) not null default 'ativo'
    check (status in ('ativo','inativo')),
  obs text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ── RECEITAS ÓPTICAS ──────────────────────────────────────
create table if not exists public.receitas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id),
  data_receita date not null,
  medico varchar(200),
  dnp decimal(4,1),
  od_esf decimal(5,2), od_cil decimal(5,2), od_eixo smallint, od_adi decimal(4,2),
  oe_esf decimal(5,2), oe_cil decimal(5,2), oe_eixo smallint, oe_adi decimal(4,2),
  is_atual boolean not null default true,
  obs text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ── PRODUTOS (catálogo) ───────────────────────────────────
create table if not exists public.produtos (
  id uuid primary key default gen_random_uuid(),
  categoria varchar(20) not null check (categoria in ('armacao','lente','acessorio','avulso')),
  subcategoria varchar(100),
  material varchar(100),
  tratamento varchar(100),
  nome varchar(200) not null,
  codigo varchar(50),
  preco decimal(10,2) not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ── PEDIDOS ───────────────────────────────────────────────
create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(),
  numero varchar(10) not null unique,
  cliente_id uuid not null references public.clientes(id),
  receita_id uuid references public.receitas(id),
  vendedor_id uuid references public.usuarios(id),
  status varchar(30) not null default 'atendimento'
    check (status in ('lead','atendimento','proposta_enviada','pedido_feito',
                      'em_laboratorio','pronto','entregue','pos_venda')),
  subtotal decimal(10,2) not null default 0,
  desconto_pct decimal(5,2) default 0,
  desconto_motivo text,
  desconto_autorizado_por uuid references public.usuarios(id),
  total decimal(10,2) not null default 0,
  forma_pagamento varchar(100),
  parcelas smallint default 1,
  data_prevista_lab date,
  data_entrega timestamptz,
  obs text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ── ITENS DO PEDIDO ───────────────────────────────────────
create table if not exists public.pedido_itens (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  produto_id uuid references public.produtos(id),
  descricao varchar(300) not null,
  quantidade smallint not null default 1,
  preco_unitario decimal(10,2) not null,
  subtotal decimal(10,2) not null,
  created_at timestamptz not null default now()
);

-- ── HISTÓRICO DO PIPELINE ─────────────────────────────────
create table if not exists public.pipeline_historico (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id),
  status_anterior varchar(30),
  status_novo varchar(30) not null,
  usuario_id uuid references public.usuarios(id),
  obs text,
  created_at timestamptz not null default now()
);

-- ── CONFIG ────────────────────────────────────────────────
create table if not exists public.config (
  key varchar(100) primary key,
  value text
);
insert into public.config(key,value) values('next_numero','1') on conflict do nothing;

-- ── ÍNDICES ───────────────────────────────────────────────
create index if not exists idx_clientes_vendedor  on public.clientes(vendedor_id)  where deleted_at is null;
create index if not exists idx_pedidos_cliente    on public.pedidos(cliente_id)    where deleted_at is null;
create index if not exists idx_pedidos_status     on public.pedidos(status)        where deleted_at is null;
create index if not exists idx_pedidos_vendedor   on public.pedidos(vendedor_id)   where deleted_at is null;
create index if not exists idx_receitas_cliente   on public.receitas(cliente_id)   where deleted_at is null;

-- ── FUNÇÕES ───────────────────────────────────────────────

-- Próximo número de pedido (atômico)
create or replace function public.next_pedido_numero()
returns text language plpgsql security definer as $$
declare n int;
begin
  update public.config
  set value = (value::int + 1)::text
  where key = 'next_numero'
  returning (value::int - 1) into n;
  return lpad(n::text, 4, '0');
end;
$$;

-- Trigger updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create or replace trigger trg_usuarios_updated before update on public.usuarios
  for each row execute function public.set_updated_at();
create or replace trigger trg_clientes_updated before update on public.clientes
  for each row execute function public.set_updated_at();
create or replace trigger trg_pedidos_updated before update on public.pedidos
  for each row execute function public.set_updated_at();
create or replace trigger trg_produtos_updated before update on public.produtos
  for each row execute function public.set_updated_at();

-- Receita atual automática
create or replace function public.set_receita_atual()
returns trigger language plpgsql as $$
begin
  if NEW.is_atual = true then
    update public.receitas set is_atual = false
    where cliente_id = NEW.cliente_id and id <> NEW.id;
  end if;
  return NEW;
end;
$$;
create or replace trigger trg_receita_atual after insert or update on public.receitas
  for each row execute function public.set_receita_atual();
