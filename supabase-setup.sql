-- =====================================================
-- HAW Vision CRM — Setup Supabase
-- Execute este SQL no SQL Editor do seu projeto Supabase
-- =====================================================

-- CLIENTES
create table if not exists clientes (
  id           text primary key,
  nome         text not null,
  cpf          text,
  telefone     text,
  email        text,
  data_nascimento date,
  vendedor_id  text,
  endereco     jsonb,          -- {rua, num, bairro, cidade, uf}
  obs          text,
  status       text default 'ativo',
  deleted_at   timestamptz,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- RECEITAS ÓPTICAS
create table if not exists receitas (
  id           text primary key,
  cliente_id   text,
  data_receita date,
  medico       text,
  dnp          text,
  od_esf       numeric, od_cil numeric, od_eixo integer, od_adi numeric,
  oe_esf       numeric, oe_cil numeric, oe_eixo integer, oe_adi numeric,
  obs          text,
  is_atual     boolean default true,
  deleted_at   timestamptz,
  created_at   timestamptz default now()
);

-- PRODUTOS / CATÁLOGO
create table if not exists produtos (
  id           text primary key,
  nome         text not null,
  categoria    text,
  subcategoria text,
  codigo       text,
  material     text,
  tratamento   text,
  preco        numeric default 0,
  ativo        boolean default true,
  deleted_at   timestamptz,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- PEDIDOS
create table if not exists pedidos (
  id                      text primary key,
  numero                  text,
  cliente_id              text,
  receita_id              text,
  vendedor_id             text,
  status                  text default 'lead',
  subtotal                numeric default 0,
  desconto_pct            numeric default 0,
  desconto_motivo         text,
  desconto_autorizado_por text,
  total                   numeric default 0,
  forma_pagamento         text,
  parcelas                text,
  data_prevista_lab       date,
  data_entrega            date,
  obs                     text,
  deleted_at              timestamptz,
  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
);

-- ITENS DOS PEDIDOS
create table if not exists pedido_itens (
  id             uuid primary key default gen_random_uuid(),
  pedido_id      text references pedidos(id) on delete cascade,
  produto_id     text,
  descricao      text,
  quantidade     integer default 1,
  preco_unitario numeric default 0,
  subtotal       numeric default 0,
  created_at     timestamptz default now()
);

-- USUÁRIOS DO SISTEMA
create table if not exists usuarios (
  id         text primary key,
  nome       text not null,
  email      text,
  perfil     text default 'vendedor',
  meta_mensal numeric default 0,
  ativo      boolean default true,
  senha      text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =====================================================
-- RLS — Row Level Security
-- O app controla autenticação via PIN próprio.
-- Habilitamos RLS mas permitimos acesso pela chave anon.
-- =====================================================
alter table clientes    enable row level security;
alter table receitas    enable row level security;
alter table produtos    enable row level security;
alter table pedidos     enable row level security;
alter table pedido_itens enable row level security;
alter table usuarios    enable row level security;

create policy "anon_all" on clientes     for all to anon using (true) with check (true);
create policy "anon_all" on receitas     for all to anon using (true) with check (true);
create policy "anon_all" on produtos     for all to anon using (true) with check (true);
create policy "anon_all" on pedidos      for all to anon using (true) with check (true);
create policy "anon_all" on pedido_itens for all to anon using (true) with check (true);
create policy "anon_all" on usuarios     for all to anon using (true) with check (true);
