let selectedUser = null;
let sbClient = null;

function initials(nome) {
  return (nome || '').split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase();
}

async function loadUsuarios() {
  const cfg = window.HAW_CONFIG || {};
  let users = [];

  if (cfg.supabaseUrl && cfg.supabaseKey && !cfg.supabaseUrl.includes('SEU-PROJETO')) {
    try {
      sbClient = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);
      const { data, error } = await sbClient.from('usuarios').select('id,nome,perfil,ativo,email').eq('ativo', true);
      if (!error && data && data.length > 0) {
        users = data;
      }
    } catch(e) {}
  }

  // Fallback: lê do localStorage
  if (!users.length) {
    try {
      const raw = localStorage.getItem('haw_crm_v1');
      const db = raw ? JSON.parse(raw) : {};
      if (Array.isArray(db.usuarios) && db.usuarios.length) {
        users = db.usuarios.filter(u => u.ativo !== false);
      }
    } catch(e) {}
  }

  // Fallback final: defaults
  if (!users.length) {
    users = [
      {id:'u1',nome:'Dono HAW',perfil:'dono',ativo:true},
      {id:'u2',nome:'Ana Lima',perfil:'vendedor',ativo:true},
      {id:'u3',nome:'Carlos Souza',perfil:'vendedor',ativo:true},
    ];
  }

  renderUsuarios(users);
}

function renderUsuarios(users) {
  document.getElementById('loading').style.display = 'none';
  const list = document.getElementById('user-list');
  const colors = ['#F7CF13','#4a90d9','#27ae60','#e67e22','#9b59b6'];
  list.innerHTML = users.map((u, i) => {
    const ini = initials(u.nome);
    const bg = colors[i % colors.length];
    const tc = i === 0 ? '#13182C' : '#fff';
    return `<button class="user-btn" onclick='selecionarUsuario(${JSON.stringify(u)})'>
      <div class="avatar" style="background:${bg};color:${tc}">${ini}</div>
      <div class="user-info">
        <div class="user-name">${u.nome}</div>
        <div class="user-role">${u.perfil}</div>
      </div>
    </button>`;
  }).join('');
  list.style.display = 'block';
}

function selecionarUsuario(u) {
  selectedUser = u;
  const ini = initials(u.nome);
  document.getElementById('user-list').style.display = 'none';
  document.getElementById('card-sub').textContent = 'Redefina o PIN de acesso';
  document.getElementById('selected-display').innerHTML = `
    <div class="avatar">${ini}</div>
    <div class="user-info"><div class="user-name">${u.nome}</div><div class="user-role">${u.perfil}</div></div>`;
  document.getElementById('pin-section').style.display = 'block';
  document.getElementById('new-pin').focus();
}

function voltarLista() {
  selectedUser = null;
  document.getElementById('pin-section').style.display = 'none';
  document.getElementById('user-list').style.display = 'block';
  document.getElementById('card-sub').textContent = 'Selecione o usuário para redefinir o PIN';
  document.getElementById('msg').textContent = '';
  document.getElementById('new-pin').value = '';
  document.getElementById('new-pin2').value = '';
}

async function salvarPin() {
  const pin  = document.getElementById('new-pin').value.trim();
  const pin2 = document.getElementById('new-pin2').value.trim();
  const msg  = document.getElementById('msg');

  if (!/^\d{4}$/.test(pin)) {
    msg.className = 'msg err'; msg.textContent = 'PIN deve ter exatamente 4 dígitos numéricos.'; return;
  }
  if (pin !== pin2) {
    msg.className = 'msg err'; msg.textContent = 'Os PINs não coincidem.'; return;
  }

  msg.className = 'msg'; msg.textContent = '⏳ Salvando…';

  const u = selectedUser;

  // 1. Grava em haw_pins — chave usada pelo doLogin(), nunca tocada pelo Supabase
  try {
    const p = JSON.parse(localStorage.getItem('haw_pins') || '{}');
    p[u.nome] = pin;
    localStorage.setItem('haw_pins', JSON.stringify(p));
  } catch(e) {}

  // 2. Atualiza localStorage haw_crm_v1
  try {
    const raw = localStorage.getItem('haw_crm_v1');
    const db  = raw ? JSON.parse(raw) : {};
    if (!Array.isArray(db.usuarios)) db.usuarios = [];
    const idx = db.usuarios.findIndex(x => x.id === u.id || x.nome === u.nome);
    if (idx >= 0) {
      db.usuarios[idx].senha = pin;
    } else {
      db.usuarios.push({...u, senha: pin, ativo: true});
    }
    localStorage.setItem('haw_crm_v1', JSON.stringify(db));
  } catch(e) {}

  // 3. Atualiza Supabase (por ID real)
  let sbOk = false;
  if (sbClient) {
    try {
      const { error } = await sbClient.from('usuarios').update({ senha: pin }).eq('id', u.id);
      if (!error) sbOk = true;
    } catch(e) {}
  }

  // 4. Grava sessão com ID real e redireciona
  const ini = initials(u.nome);
  const session = { id: u.id, nome: u.nome, perfil: u.perfil, initials: ini };
  sessionStorage.setItem('haw_session', JSON.stringify(session));

  msg.className = 'msg ok';
  msg.textContent = sbOk ? '✅ PIN salvo no banco e localmente! Abrindo…' : '✅ PIN salvo localmente! Abrindo…';

  setTimeout(() => { window.location.href = 'index.html'; }, 1200);
}

// Inicia
loadUsuarios();
