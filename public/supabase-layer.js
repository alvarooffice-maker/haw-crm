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
    if (s === 'online') {
      localStorage.removeItem('haw_pending_sync');
      _showOfflineBanner(false);
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
        syncTabela('pedidos').catch(() => {}), // falha silenciosa se coluna motivo_perda não existir ainda
        syncPedidoItens(),
        syncTabela('usuarios').catch(() => {}), // falha silenciosa se RLS bloquear
        syncTabela('crediarios').catch(() => {}), // tabela pode não existir ainda
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
      // Apagar itens antigos — verificar erro antes de reinserir
      const { error: delErr } = await sb.from('pedido_itens').delete().eq('pedido_id', p.id);
      if (delErr) {
        console.warn('[HAW] Falha ao remover itens do pedido', p.id, delErr.message);
        continue; // não insere se delete falhou (evita duplicatas)
      }
      const itens = p.itens.map(it => ({
        pedido_id: p.id,
        produto_id: it.prodId || null,
        descricao: it.desc || it.descricao || 'Item',
        quantidade: it.qtd || 1,
        preco_unitario: it.preco || 0,
        subtotal: (it.qtd || 1) * (it.preco || 0),
      }));
      const { error: insErr } = await sb.from('pedido_itens').insert(itens);
      if (insErr) console.warn('[HAW] Falha ao inserir itens do pedido', p.id, insErr.message);
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
        // Busca TODOS os usuários — filtro de ativo e demo é feito em JS
        sb.from('usuarios').select('*'),
      ]);

      // Merge clientes: preserva registros locais que ainda não chegaram ao Supabase
      if (clis.data) {
        const sbIds = new Set(clis.data.map(r => r.id));
        const sbItems = clis.data.map(r => toCamel('clientes', r));
        const localOnly = (window.DB.clientes || []).filter(c => !sbIds.has(c.id) && !c.deleted);
        window.DB.clientes = [...sbItems, ...localOnly];
        if (localOnly.length) {
          sb.from('clientes').upsert(localOnly.map(r => toSnake('clientes', r)), { onConflict: 'id' })
            .catch(e => console.warn('[HAW] Falha ao sincronizar clientes locais:', e));
        }
      }
      // Merge receitas
      if (recs.data) {
        const sbIds = new Set(recs.data.map(r => r.id));
        const sbItems = recs.data.map(r => toCamel('receitas', r));
        const localOnly = (window.DB.receitas || []).filter(r => !sbIds.has(r.id) && !r.deleted);
        window.DB.receitas = [...sbItems, ...localOnly];
        if (localOnly.length) {
          sb.from('receitas').upsert(localOnly.map(r => toSnake('receitas', r)), { onConflict: 'id' })
            .catch(e => console.warn('[HAW] Falha ao sincronizar receitas locais:', e));
        }
      }
      // Merge pedidos
      if (peds.data) {
        const sbPedIds = new Set(peds.data.map(r => r.id));
        const localOnlyPeds = (window.DB.pedidos || []).filter(p => !sbPedIds.has(p.id) && !p.deleted);
        if (localOnlyPeds.length) {
          sb.from('pedidos').upsert(localOnlyPeds.map(r => toSnake('pedidos', r)), { onConflict: 'id' })
            .catch(e => console.warn('[HAW] Falha ao sincronizar pedidos locais:', e));
        }
      }
      // Merge produtos: preserva itens locais (ex: importados da tabela lab) que não estão no Supabase
      if (prods.data) {
        const sbProdIds = new Set(prods.data.map(r => r.id));
        const sbProds   = prods.data.map(r => toCamel('produtos', r));
        const localOnly = (window.DB.produtos || []).filter(p => !sbProdIds.has(p.id) && !p.deleted);
        window.DB.produtos = [...sbProds, ...localOnly];
        // Sincronizar produtos locais para o Supabase
        if (localOnly.length) {
          sb.from('produtos').upsert(localOnly.map(r => toSnake('produtos', r)), { onConflict: 'id' })
            .catch(e => console.warn('[HAW] Falha ao sincronizar produtos locais:', e));
        }
      }
      // IDs de usuários demo que devem ser ignorados/deletados
      const DEMO_IDS = new Set(['u1', 'u2', 'u3']);
      const DEMO_NAMES = new Set(['Dono HAW', 'Ana Lima', 'Carlos Souza']);

      if (users.data && users.data.length > 0) {
        const localUsers = window.DB.usuarios || [];
        // Filtra fora os demos do Supabase antes de processar
        const validSbUsers = users.data.filter(r =>
          !DEMO_IDS.has(r.id) && !DEMO_NAMES.has(r.nome)
        );
        const sbIds = new Set(validSbUsers.map(r => r.id));
        // Mescla usuários do Supabase preservando senha local
        const sbMerged = validSbUsers.map(r => {
          const camel = toCamel('usuarios', r);
          // ativo=null no Supabase tratado como true (campo pode não ter DEFAULT)
          if (camel.ativo === null || camel.ativo === undefined) camel.ativo = true;
          const local = localUsers.find(u => u.id === camel.id)
                     || localUsers.find(u => u.nome === camel.nome);
          if (local && local.senha) camel.senha = local.senha;
          return camel;
        });
        // Mantém usuários locais reais que ainda não estão no Supabase
        const localOnly = localUsers.filter(u =>
          !sbIds.has(u.id) &&
          u.ativo !== false &&
          !DEMO_IDS.has(u.id) &&
          !DEMO_NAMES.has(u.nome)
        );
        window.DB.usuarios = [...sbMerged, ...localOnly];
        // Sincronizar usuários local-only para o Supabase
        if (localOnly.length) {
          const mapped = localOnly.map(r => toSnake('usuarios', r));
          sb.from('usuarios').upsert(mapped, { onConflict: 'id' })
            .then(() => console.log('[HAW] Usuários locais sincronizados para Supabase:', localOnly.map(u => u.nome)))
            .catch(e => console.warn('[HAW] Falha ao sincronizar usuários locais:', e));
        }
        // Deletar usuários demo do Supabase se existirem lá
        users.data
          .filter(r => DEMO_IDS.has(r.id) || DEMO_NAMES.has(r.nome))
          .forEach(r => {
            sb.from('usuarios').delete().eq('id', r.id)
              .then(() => console.log('[HAW] Demo user removido do Supabase:', r.nome))
              .catch(() => {});
          });
      } else if (users.data && users.data.length === 0 && window.DB.usuarios && window.DB.usuarios.length > 0) {
        // Supabase vazio mas há usuários locais reais — sincronizar
        const mapped = window.DB.usuarios
          .filter(u => !u.deleted && !DEMO_IDS.has(u.id) && !DEMO_NAMES.has(u.nome))
          .map(r => toSnake('usuarios', r));
        if (mapped.length) {
          sb.from('usuarios').upsert(mapped, { onConflict: 'id' })
            .then(() => console.log('[HAW] Usuários locais sincronizados para Supabase'))
            .catch(e => console.warn('[HAW] Falha ao sincronizar usuários:', e));
        }
      }
      if (peds.data) {
        const sbPedIds2 = new Set(peds.data.map(p => p.id));
        const sbPedidos = peds.data.map(p => {
          const obj = toCamel('pedidos', p);
          obj.itens = (itens.data || [])
            .filter(it => it.pedido_id === p.id)
            .map(it => ({
              prodId: it.produto_id, desc: it.descricao,
              qtd: it.quantidade, preco: it.preco_unitario, sub: it.subtotal,
            }));
          return obj;
        });
        const localOnlyPeds2 = (window.DB.pedidos || []).filter(p => !sbPedIds2.has(p.id) && !p.deleted);
        window.DB.pedidos = [...sbPedidos, ...localOnlyPeds2];
      }

      // Merge crediarios (tabela opcional — falha silenciosa se não existir)
      try {
        const creds = await sb.from('crediarios').select('*').order('created_at', { ascending: false });
        if (creds.data && creds.data.length > 0) {
          const sbIds = new Set(creds.data.map(r => r.id));
          const sbItems = creds.data.map(r => toCamel('crediarios', r));
          const localOnly = (window.DB.crediarios || []).filter(c => !sbIds.has(c.id) && c.status !== 'cancelado');
          window.DB.crediarios = [...sbItems, ...localOnly];
          if (localOnly.length) {
            sb.from('crediarios').upsert(localOnly.map(r => toSnake('crediarios', r)), { onConflict: 'id' })
              .catch(e => console.warn('[HAW] Falha ao sincronizar crediários locais:', e));
          }
        }
      } catch (e) { /* tabela crediarios ainda não criada no Supabase */ }

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
      data_entrega: 'dataEntrega', motivo_perda: 'motivoPerda',
      deleted_at: 'deletedAt', created_at: 'createdAt', updated_at: 'updatedAt',
    },
    crediarios: {
      cliente_id: 'clienteId', cliente_nome: 'clienteNome', pedido_id: 'pedidoId',
      valor_parcelado: 'valorParcelado', num_parcelas: 'numParcelas',
      taxa_mora: 'taxaMora', multa_mora: 'multaMora',
      created_at: 'createdAt', updated_at: 'updatedAt',
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
      if (tabela === 'usuarios' && k === 'senha') continue; // senha fica só no local
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

  // ── RE-RENDER HELPER ─────────────────────────────────────
  function _reRenderAll() {
    setTimeout(() => {
      [renderDashboard, renderPipeline, renderClientes, renderPedidos,
       renderReceitas, renderFinanceiro, renderCatalogo, renderRelatorios,
       renderConfig, updateNavCounts, populateSelects, populateLoginUsers]
      .forEach(fn => { try { if (typeof fn === 'function') fn(); } catch(e){} });
    }, 200);
  }

  // ── OFFLINE BANNER ───────────────────────────────────────
  function _showOfflineBanner(show) {
    let banner = document.getElementById('haw-offline-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'haw-offline-banner';
      banner.style.cssText = [
        'position:fixed;top:0;left:0;right:0;z-index:99998',
        'background:#c0392b;color:#fff;text-align:center',
        'padding:7px 16px;font-size:12px;font-weight:600',
        'display:none;letter-spacing:.02em',
      ].join(';');
      document.body.prepend(banner);
    }
    if (show) {
      banner.textContent = '⚠️  SEM CONEXÃO COM SERVIDOR — dados salvos localmente e serão sincronizados quando a conexão voltar';
      banner.style.display = 'block';
    } else {
      banner.style.display = 'none';
    }
  }

  // ── RETRY AUTOMÁTICO ─────────────────────────────────────
  let _retryInterval = null;
  let _retryAttempts = 0;

  async function _tentarReconectar() {
    if (syncStatus !== 'offline') return;
    console.log('[HAW] Tentando reconectar ao Supabase... tentativa', _retryAttempts + 1);
    const ok = await loadFromSupabase();
    if (ok) {
      _retryAttempts = 0;
      if (_retryInterval) { clearInterval(_retryInterval); _retryInterval = null; }
      setupRealtime();
      _reRenderAll();
      if (typeof toast === 'function') toast('✅ Conexão restaurada — dados sincronizados!');
    } else {
      _retryAttempts++;
    }
  }

  function _startRetry() {
    if (_retryInterval) return; // já está rodando
    // Tentativas rápidas no início, depois estabiliza em 2 minutos
    setTimeout(() => _tentarReconectar(), 15000);   // 15s
    setTimeout(() => _tentarReconectar(), 45000);   // 45s
    setTimeout(() => _tentarReconectar(), 120000);  // 2min
    _retryInterval = setInterval(() => _tentarReconectar(), 2 * 60 * 1000);
  }

  // ── AUTO-INIT ─────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', async () => {
    sb = initSupabase();
    window._hawSB = sb;

    // Indicador de status na topbar
    const tbRight = document.querySelector('.topbar-right');
    if (tbRight) {
      const indicator = document.createElement('span');
      indicator.id = 'sync-status';
      indicator.style.cssText = 'font-size:11px;font-weight:500;cursor:pointer';
      indicator.title = 'Clique para sincronizar agora';
      indicator.onclick = () => { _tentarReconectar(); window.HAW_SB.sync(); };
      tbRight.prepend(indicator);
    }

    if (sb) {
      setSyncStatus('syncing');
      const ok = await loadFromSupabase();
      if (ok) {
        setupRealtime();
        _reRenderAll();
      } else {
        _showOfflineBanner(true);
        _startRetry();
      }
    } else {
      setSyncStatus('offline');
    }

    // Reconecta imediatamente quando a rede voltar (ex: WiFi reconectado)
    window.addEventListener('online', async () => {
      if (syncStatus === 'offline') {
        console.log('[HAW] Rede voltou — reconectando ao Supabase...');
        await _tentarReconectar();
      }
    });

    // Avisa antes de fechar a aba se há dados pendentes de sync
    window.addEventListener('beforeunload', (e) => {
      if (localStorage.getItem('haw_pending_sync') === '1' && syncStatus === 'offline') {
        e.preventDefault();
        e.returnValue = 'Há dados não sincronizados com o servidor. Tem certeza que quer sair?';
        return e.returnValue;
      }
    });
  });

  // ── OVERRIDE: save() ─────────────────────────────────────
  window.addEventListener('load', () => {
    const originalSave = window.save;
    if (!originalSave) return;
    window.save = function () {
      originalSave(); // sempre salva localStorage primeiro
      if (sb && syncStatus !== 'offline') {
        clearTimeout(window._sbSyncTimer);
        window._sbSyncTimer = setTimeout(() => window.HAW_SB.sync(), 1000);
      } else if (sb) {
        // offline: marca pendente, mostra banner, inicia retry
        localStorage.setItem('haw_pending_sync', '1');
        _showOfflineBanner(true);
        _startRetry();
      }
    };
  });

})();
