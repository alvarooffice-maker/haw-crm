// ============================================================
// HAW CRM — Camada de dados Supabase
// Injete este script DEPOIS do index.html carregar
// ============================================================

(function () {
  'use strict';

  // ── Inicializar cliente Supabase ──────────────────────────
  function initSupabase() {
    const cfg = window.HAW_CONFIG || {};
    const url = cfg.supabaseUrl || '';
    const key = cfg.supabaseKey || '';
    if (!url || !key || url.includes('SEU-PROJETO')) {
      console.warn('[HAW] Supabase não configurado — usando localStorage');
      return null;
    }
    try {
      return window.supabase.createClient(url, key);
    } catch (e) {
      console.error('[HAW] Erro ao inicializar Supabase:', e);
      return null;
    }
  }

  // sb é inicializado no DOMContentLoaded, após config.js já ter executado
  let sb = null;

  // ── Estado de sincronização ───────────────────────────────
  let syncStatus = 'offline';

  function setSyncStatus(s) {
    syncStatus = s;
    const el = document.getElementById('sync-status');
    if (el) {
      el.textContent = s === 'online' ? '🟢 Online' : s === 'syncing' ? '🔄 Sincronizando…' : '🔴 Offline';
      el.style.color = s === 'online' ? 'var(--green)' : s === 'syncing' ? 'var(--gold)' : 'var(--red)';
    }
  }

  // ── AUTH ──────────────────────────────────────────────────

  async function sbLogin(email, password) {
    if (!sb) return { error: 'Supabase não configurado' };
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    // Carregar perfil do usuário
    const { data: usr } = await sb.from('usuarios').select('*').eq('id', data.user.id).single();
    if (usr) {
      window.currentUser = {
        id: usr.id, nome: usr.nome, perfil: usr.perfil,
        initials: usr.nome.split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase()
      };
      if (typeof renderSidebarUser === 'function') renderSidebarUser();
    }
    return { user: data.user };
  }

  async function sbLogout() {
    if (!sb) return;
    await sb.auth.signOut();
    window.location.reload();
  }

  async function sbSession() {
    if (!sb) return null;
    const { data } = await sb.auth.getSession();
    return data.session;
  }

  // ── SYNC: localStorage → Supabase ────────────────────────

  async function syncToSupabase() {
    if (!sb) return;
    setSyncStatus('syncing');
    try {
      await Promise.all([
        syncTabela('clientes'),
        syncTabela('receitas'),
        syncTabela('produtos'),
        syncTabela('pedidos'),
        syncPedidoItens(),
      ]);
      setSyncStatus('online');
      if (typeof toast === 'function') toast('✅ Dados sincronizados com Supabase!');
    } catch (e) {
      console.error('[HAW] Erro sync:', e);
      setSyncStatus('offline');
    }
  }

  async function syncTabela(nome) {
    const rows = (window.DB[nome] || []).filter(r => !r.deleted);
    if (!rows.length) return;
    // Mapear campos camelCase → snake_case
    const mapped = rows.map(r => toSnake(nome, r));
    const { error } = await sb.from(nome).upsert(mapped, { onConflict: 'id' });
    if (error) throw error;
  }

  async function syncPedidoItens() {
    const pedidos = (window.DB.pedidos || []).filter(p => !p.deleted);
    for (const p of pedidos) {
      if (!p.itens?.length) continue;
      // Apagar itens antigos e reinserir
      await sb.from('pedido_itens').delete().eq('pedido_id', p.id);
      const itens = p.itens.map(it => ({
        pedido_id: p.id,
        produto_id: it.prodId || null,
        descricao: it.desc || it.descricao || 'Item',
        quantidade: it.qtd || 1,
        preco_unitario: it.preco || 0,
        subtotal: (it.qtd || 1) * (it.preco || 0),
      }));
      await sb.from('pedido_itens').insert(itens);
    }
  }

  // ── LOAD: Supabase → localStorage ────────────────────────

  async function loadFromSupabase() {
    if (!sb) return false;
    setSyncStatus('syncing');
    try {
      const [clis, recs, prods, peds, itens, users] = await Promise.all([
        sb.from('clientes').select('*').is('deleted_at', null).order('created_at', { ascending: false }),
        sb.from('receitas').select('*').is('deleted_at', null).order('created_at', { ascending: false }),
        sb.from('produtos').select('*').is('deleted_at', null).order('nome'),
        sb.from('pedidos').select('*').is('deleted_at', null).order('created_at', { ascending: false }),
        sb.from('pedido_itens').select('*').order('created_at'),
        sb.from('usuarios').select('*').eq('ativo', true),
      ]);

      if (clis.data)   window.DB.clientes  = clis.data.map(r => toCamel('clientes', r));
      if (recs.data)   window.DB.receitas  = recs.data.map(r => toCamel('receitas', r));
      if (prods.data)  window.DB.produtos  = prods.data.map(r => toCamel('produtos', r));
      if (users.data && users.data.length > 0) {
        // Supabase tem usuários — usar eles
        window.DB.usuarios = users.data.map(r => toCamel('usuarios', r));
      } else if (users.data && users.data.length === 0 && window.DB.usuarios && window.DB.usuarios.length > 0) {
        // Supabase vazio mas há usuários locais — sincronizar para o Supabase
        const mapped = window.DB.usuarios.filter(u => !u.deleted).map(r => toSnake('usuarios', r));
        if (mapped.length) {
          sb.from('usuarios').upsert(mapped, { onConflict: 'id' })
            .then(() => console.log('[HAW] Usuários locais sincronizados para Supabase'))
            .catch(e => console.warn('[HAW] Falha ao sincronizar usuários:', e));
        }
      }
      if (peds.data) {
        window.DB.pedidos = peds.data.map(p => {
          const obj = toCamel('pedidos', p);
          obj.itens = (itens.data || [])
            .filter(it => it.pedido_id === p.id)
            .map(it => ({
              prodId: it.produto_id, desc: it.descricao,
              qtd: it.quantidade, preco: it.preco_unitario, sub: it.subtotal,
            }));
          return obj;
        });
      }

      // Salvar localmente como cache
      if (typeof save === 'function') save();
      setSyncStatus('online');
      return true;
    } catch (e) {
      console.error('[HAW] Erro ao carregar Supabase:', e);
      setSyncStatus('offline');
      return false;
    }
  }

  // ── REALTIME ──────────────────────────────────────────────

  function setupRealtime() {
    if (!sb) return;
    sb.channel('haw-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => {
        loadFromSupabase().then(() => {
          if (typeof renderDashboard === 'function') renderDashboard();
          if (typeof renderPipeline  === 'function') renderPipeline();
          if (typeof renderPedidos   === 'function') renderPedidos();
          if (typeof updateNavCounts === 'function') updateNavCounts();
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clientes' }, () => {
        loadFromSupabase().then(() => {
          if (typeof renderClientes === 'function') renderClientes();
          if (typeof updateNavCounts === 'function') updateNavCounts();
          if (typeof populateSelects === 'function') populateSelects();
        });
      })
      .subscribe();
  }

  // ── MAPEAMENTO snake_case ↔ camelCase ─────────────────────

  const fieldMap = {
    clientes: {
      vendedor_id: 'vendedorId', data_nascimento: 'dataNasc',
      deleted_at: 'deletedAt', created_at: 'createdAt', updated_at: 'updatedAt',
    },
    receitas: {
      cliente_id: 'clienteId', data_receita: 'dataReceita',
      od_esf: 'odEsf', od_cil: 'odCil', od_eixo: 'odEixo', od_adi: 'odAdi',
      oe_esf: 'oeEsf', oe_cil: 'oeCil', oe_eixo: 'oeEixo', oe_adi: 'oeAdi',
      is_atual: 'isAtual', deleted_at: 'deletedAt', created_at: 'createdAt',
    },
    produtos: {
      deleted_at: 'deletedAt', created_at: 'createdAt', updated_at: 'updatedAt',
    },
    pedidos: {
      cliente_id: 'clienteId', receita_id: 'receitaId', vendedor_id: 'vendedorId',
      desconto_pct: 'desconto', desconto_motivo: 'descontoMotivo',
      desconto_autorizado_por: 'descontoAutorizadoPor',
      forma_pagamento: 'pagamento', data_prevista_lab: 'prevLab',
      data_entrega: 'dataEntrega',
      deleted_at: 'deletedAt', created_at: 'createdAt', updated_at: 'updatedAt',
    },
    usuarios: {
      meta_mensal: 'meta', created_at: 'createdAt', updated_at: 'updatedAt',
    },
  };

  function toCamel(tabela, row) {
    const map = fieldMap[tabela] || {};
    const out = {};
    for (const [k, v] of Object.entries(row)) {
      const camel = map[k] || k;
      out[camel] = v;
    }
    return out;
  }

  function toSnake(tabela, row) {
    const map = fieldMap[tabela] || {};
    const reversed = Object.fromEntries(Object.entries(map).map(([k, v]) => [v, k]));
    const out = {};
    for (const [k, v] of Object.entries(row)) {
      if (k === 'itens' || k === 'deleted') continue; // skip virtual fields
      const snake = reversed[k] || k;
      out[snake] = v;
    }
    // garantir deleted_at para soft delete
    if (row.deleted) out.deleted_at = new Date().toISOString();
    return out;
  }

  // ── API PÚBLICA ───────────────────────────────────────────

  window.HAW_SB = {
    isOnline: () => !!sb && syncStatus !== 'offline',
    login: sbLogin,
    logout: sbLogout,
    sync: syncToSupabase,
    load: loadFromSupabase,
    setupRealtime,
    get client() { return sb; },
  };

  // ── AUTO-INIT ─────────────────────────────────────────────
  // Executar após o DOM carregar — config.js já executou neste ponto
  document.addEventListener('DOMContentLoaded', async () => {
    // Inicializar Supabase AGORA (config.js já carregou de forma síncrona)
    sb = initSupabase();
    window._hawSB = sb;

    // Adicionar indicador de status na topbar
    const tbRight = document.querySelector('.topbar-right');
    if (tbRight) {
      const indicator = document.createElement('span');
      indicator.id = 'sync-status';
      indicator.style.cssText = 'font-size:11px;font-weight:500;cursor:pointer';
      indicator.title = 'Clique para sincronizar';
      indicator.onclick = () => window.HAW_SB.sync();
      tbRight.prepend(indicator);
    }

    if (sb) {
      setSyncStatus('syncing');
      const ok = await loadFromSupabase();
      if (ok) {
        setupRealtime();
        // Re-render tudo com dados do servidor
        setTimeout(() => {
          if (typeof renderDashboard  === 'function') renderDashboard();
          if (typeof renderPipeline   === 'function') renderPipeline();
          if (typeof renderClientes   === 'function') renderClientes();
          if (typeof renderPedidos    === 'function') renderPedidos();
          if (typeof renderReceitas   === 'function') renderReceitas();
          if (typeof renderFinanceiro === 'function') renderFinanceiro();
          if (typeof renderCatalogo   === 'function') renderCatalogo();
          if (typeof renderRelatorios === 'function') renderRelatorios();
          if (typeof renderConfig     === 'function') renderConfig();
          if (typeof updateNavCounts  === 'function') updateNavCounts();
          if (typeof populateSelects  === 'function') populateSelects();
        }, 200);
      }
    } else {
      setSyncStatus('offline');
    }
  });

  // ── OVERRIDE: save() para persistir no Supabase ──────────
  // Aguarda o index.html definir save() e sobrescreve
  // Usa 'load' (após DOMContentLoaded) — sb já está inicializado
  window.addEventListener('load', () => {
    const originalSave = window.save;
    if (originalSave) {
      window.save = function () {
        originalSave(); // salva localStorage
        if (sb && syncStatus !== 'offline') {
          // Debounce: sync 1s depois do último save
          clearTimeout(window._sbSyncTimer);
          window._sbSyncTimer = setTimeout(() => window.HAW_SB.sync(), 1000);
        }
      };
    }
  });

})();
