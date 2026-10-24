
// ══════════════════════════════════════════════
// HAW CRM — JavaScript Engine
// ══════════════════════════════════════════════

// ── STATE ──
let DB = {
  clientes:[],pedidos:[],receitas:[],produtos:[],usuarios:[],alertas:[],tabelas_lab:[],crediarios:[],caixa:[],despesas:[],
  eventos:[],orcamentos:[],consignados:[],anotacoes:[],
  settings:{supabaseUrl:'',supabaseKey:'',mesAtual: new Date().toISOString().slice(0,7),
    empresa:{nome:'HAW Vision',cnpj:'32.139.400/0001-79',telefone:'(91) 99801-9092',cidade:'Belém',estado:'PA',validade:15}}
};
window.DB = DB; // expõe para supabase-layer.js e outros scripts externos
let supabaseClient = null;
let currentUser = {id:'u1',nome:'Dono HAW',perfil:'dono',initials:'D'};
window.currentUser = currentUser;
let pedidoItensCount = 0;
let _nomeItemEditando = {};
let chartFat = null, chartFunil = null, chartVendedor = null, chartFatMensal = null;

// ── ACCESS CONTROL ──
const PAGE_ACCESS = {
  vendedor:   ['dashboard','pipeline','clientes','cliente','pedidos','receitas','os','catalogo','crediario'],
  gestor:     ['dashboard','pipeline','clientes','cliente','pedidos','receitas','os','catalogo','financeiro','relatorios','crediario'],
  financeiro: ['dashboard','financeiro','relatorios','crediario','cliente'],
  dono:       null, // acesso total
};

function canAccess(page){
  const allowed=PAGE_ACCESS[currentUser.perfil];
  if(allowed===null||allowed===undefined)return true;
  return allowed.includes(page);
}

function filterSidebar(){
  document.querySelectorAll('.sb-item').forEach(btn=>{
    const m=(btn.getAttribute('onclick')||'').match(/'([a-z]+)'/);
    if(!m)return;
    const allowed=PAGE_ACCESS[currentUser.perfil];
    btn.style.display=(allowed===null||allowed===undefined||allowed.includes(m[1]))?'':'none';
  });
}

function populateLoginUsers(){
  const sel=document.getElementById('login-user');
  if(!sel)return;
  const ativos=DB.usuarios.filter(u=>u.ativo!==false);
  sel.innerHTML=ativos.map(u=>`<option value="${u.id}">${u.nome} (${u.perfil})</option>`).join('');
  // Oculta o aviso de carregando quando usuários reais chegaram (mais de 1 ou Supabase carregou)
  const loadEl=document.getElementById('login-loading');
  if(loadEl){
    if(ativos.length>1){
      loadEl.textContent='';
    }
  }
  _loginHint();
}

// Retorna o PIN armazenado para um usuário (ou null se não tiver)
function _getPinUsuario(user){
  if(!user) return null;
  try{
    const p=JSON.parse(localStorage.getItem('haw_pins')||'{}');
    // Busca por ID primeiro (mais confiável), depois por nome
    if(p[user.id])  return p[user.id];
    if(p[user.nome])return p[user.nome];
  }catch(e){}
  // Fallback: senha guardada no objeto local (registro offline)
  return user.senha||null;
}

// Grava o PIN de um usuário em ambas as chaves (id e nome)
function _setPinUsuario(user, pin){
  try{
    const p=JSON.parse(localStorage.getItem('haw_pins')||'{}');
    p[user.id]=pin;
    p[user.nome]=pin;
    localStorage.setItem('haw_pins',JSON.stringify(p));
  }catch(e){}
  // Também grava no objeto local para funcionar offline
  const i=DB.usuarios.findIndex(u=>u.id===user.id);
  if(i>=0){DB.usuarios[i].senha=pin; save();}
}

// Atualiza o hint abaixo do campo PIN conforme o usuário selecionado
function _loginHint(){
  const el=document.getElementById('login-hint');
  if(!el)return;
  const sel=document.getElementById('login-user');
  const userId=sel?sel.value:'';
  const user=DB.usuarios.find(u=>u.id===userId);
  if(user&&!_getPinUsuario(user)){
    el.textContent='Primeiro acesso — este PIN será o seu PIN definitivo';
  } else {
    el.textContent='';
  }
}

function doLogin(){
  const pin=document.getElementById('login-pin').value.trim();
  const errEl=document.getElementById('login-err');
  errEl.textContent='';
  _garantirUsuarios();
  const sel=document.getElementById('login-user');
  if(sel&&!sel.options.length)populateLoginUsers();
  const userId=sel?sel.value:'';
  // Aceita ativo=null/undefined como ativo (campo pode estar sem DEFAULT no Supabase)
  const user=DB.usuarios.find(u=>u.id===userId&&u.ativo!==false)
          ||DB.usuarios.find(u=>u.ativo!==false&&sel&&sel.options[sel.selectedIndex]&&
             u.nome===sel.options[sel.selectedIndex].text.replace(/\s*\(.*\)\s*$/,'').trim());
  if(!user){
    errEl.textContent='Usuário não encontrado. Recarregue a página.';
    return;
  }
  if(pin.length<4){
    errEl.textContent='Digite 4 dígitos.';
    return;
  }
  const senhaValida=_getPinUsuario(user);
  if(!senhaValida){
    // ── Primeiro acesso: define o PIN agora ──
    _setPinUsuario(user, pin);
    // continua para fazer login normalmente
  } else if(pin!==senhaValida){
    errEl.textContent='PIN incorreto. Tente novamente.';
    document.getElementById('login-pin').value='';
    return;
  }
  // ── Login bem-sucedido ──
  document.getElementById('login-hint').textContent='';
  currentUser={id:user.id,nome:user.nome,perfil:user.perfil,
    initials:user.nome.split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase()};
  sessionStorage.setItem('haw_session',JSON.stringify(currentUser));
  document.getElementById('login-screen').classList.add('hidden');
  filterSidebar();
  renderSidebarUser();
  _aplicarNomeOtica();
  const first=(PAGE_ACCESS[currentUser.perfil]||['dashboard'])[0]||'dashboard';
  nav(first);
  // Reconecta ao Supabase se ainda offline (comum no primeiro carregamento)
  if(window.HAW_SB&&!window.HAW_SB.isOnline()){
    window.HAW_SB.load().then(ok=>{
      if(ok){window.HAW_SB.setupRealtime();if(typeof renderDashboard==='function')renderDashboard();}
    });
  }
}

function doLogout(){
  sessionStorage.removeItem('haw_session');
  currentUser={id:'',nome:'',perfil:'',initials:''};
  document.getElementById('login-pin').value='';
  document.getElementById('login-err').textContent='';
  populateLoginUsers();
  document.getElementById('login-screen').classList.remove('hidden');
}

function checkSession(){
  const raw=sessionStorage.getItem('haw_session');
  if(raw){
    try{
      const s=JSON.parse(raw);
      const u=DB.usuarios.find(x=>x.id===s.id&&x.ativo!==false);
      if(u){
        currentUser={id:u.id,nome:u.nome,perfil:u.perfil,initials:u.nome.split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase()};
        document.getElementById('login-screen').classList.add('hidden');
        filterSidebar();
        renderSidebarUser();
        _aplicarNomeOtica();
        return;
      }
    }catch(e){}
  }
  populateLoginUsers();
  document.getElementById('login-screen').classList.remove('hidden');
  // Avisa que está buscando usuários do servidor se só há o padrão
  const loadEl=document.getElementById('login-loading');
  if(loadEl&&DB.usuarios.filter(u=>u.ativo!==false).length<=1){
    loadEl.textContent='⏳ Buscando usuários do servidor...';
    setTimeout(()=>{
      if(loadEl.textContent.startsWith('⏳'))
        loadEl.textContent='Sem conexão. Use Admin HAW / PIN 0000.';
    },10000);
  }
}

// ── PIPELINE CONFIG ──
const PIPELINE_STAGES = [
  {key:'lead',label:'Lead',col:'col-lead'},
  {key:'atendimento',label:'Atendimento',col:'col-atend'},
  {key:'proposta_enviada',label:'Proposta',col:'col-prop'},
  {key:'pedido_feito',label:'Pedido Feito',col:'col-pedido'},
  {key:'em_laboratorio',label:'Laboratório',col:'col-lab'},
  {key:'pronto',label:'Pronto ✓',col:'col-pronto'},
  {key:'entregue',label:'Entregue',col:'col-entregue'},
  {key:'pos_venda',label:'Pós-venda',col:'col-pos'},
  {key:'perdido',label:'Perdido',col:'col-perdido'},
];

const STATUS_BADGE = {
  lead:{cls:'badge-gray',label:'Lead'},
  atendimento:{cls:'badge-blue',label:'Atendimento'},
  proposta_enviada:{cls:'badge-amber',label:'Proposta'},
  pedido_feito:{cls:'badge-gold',label:'Pedido Feito'},
  em_laboratorio:{cls:'badge-blue',label:'Em Lab'},
  pronto:{cls:'badge-green',label:'Pronto ✓'},
  entregue:{cls:'badge-green',label:'Entregue'},
  pos_venda:{cls:'badge-amber',label:'Pós-venda'},
  perdido:{cls:'badge-red',label:'Perdido'},
};

const MOTIVOS_PERDA = [
  'Fechou outro orçamento',
  'Fechou com a concorrência',
  'Oportunidade futura',
  'Fazendo cotação',
  'Preço alto',
  'Sem retorno do cliente',
  'Desistiu da compra',
  'Outro',
];

// ── INIT ──
// ── STORAGE ──
const DEFAULT_USUARIOS=[
  {id:'u1',nome:'Admin HAW',email:'admin@hawoticas.com.br',perfil:'dono',ativo:true,meta:0,senha:'0000'},
];
// IDs e nomes de usuários de demonstração que devem ser removidos automaticamente
const DEMO_USER_PURGE=[
  {id:'u2',nome:'Ana Lima'},{id:'u3',nome:'Carlos Souza'},{id:'u1',nome:'Dono HAW'},
];

function save(){localStorage.setItem('haw_crm_v1',JSON.stringify(DB))}

function _garantirUsuarios(){
  // Remover usuários de demonstração que nunca foram excluídos manualmente
  if(DB.usuarios&&DB.usuarios.length){
    const before=DB.usuarios.length;
    DB.usuarios=DB.usuarios.filter(u=>{
      return !DEMO_USER_PURGE.some(d=>d.id===u.id&&d.nome===u.nome);
    });
    if(DB.usuarios.length!==before) save();
  }
  // Nunca deixar DB.usuarios ficar vazio
  if(!DB.usuarios||!DB.usuarios.length){
    DB.usuarios=DEFAULT_USUARIOS.map(u=>({...u}));
    window.DB=DB;
    save();
  }
}

function loadFromStorage(){
  const raw=localStorage.getItem('haw_crm_v1');
  if(raw){try{const d=JSON.parse(raw);Object.assign(DB,d)}catch(e){}}
  window.DB=DB; // garante sincronização com scripts externos
  _garantirUsuarios();
  // ── Migração 1: normaliza categorias de produtos importados de labs
  // Produtos antigos têm categoria = string do lab (ex: "VISÃO SIMPLES - ACABADA")
  // em vez de 'lente' | 'armacao' | 'acessorio'. Corrige isso automaticamente.
  const CATS_VALIDAS = new Set(['lente','armacao','acessorio']);
  let migrou = false;
  (DB.produtos||[]).forEach(p=>{
    if(!p.deleted && !CATS_VALIDAS.has(p.categoria)){
      const catOrig = p.categoria || '';
      const isServico = catOrig.toUpperCase().includes('SERVI');
      p.subcategoria = p.subcategoria || catOrig;
      p.categoria    = isServico ? 'acessorio' : 'lente';
      migrou = true;
    }
  });
  // ── Migração 2: atribui campo `lab` a produtos sem lab quando há exatamente 1 lab importado
  // (seguro: se houver 2+ labs, não sabemos a origem, então não atribuímos)
  const tabsLab = DB.tabelas_lab || [];
  if(tabsLab.length === 1){
    const labNome = tabsLab[0].lab;
    (DB.produtos||[]).forEach(p=>{
      if(!p.deleted && !p.lab && p.custo && CATS_VALIDAS.has(p.categoria)){
        p.lab = labNome;
        migrou = true;
      }
    });
  }
  if(migrou){ save(); console.log('[HAW] Migração de produtos concluída.'); }
}

// Proteção: intercepta qualquer tentativa de zerar DB.usuarios
(function(){
  let _usr=DB.usuarios;
  Object.defineProperty(DB,'usuarios',{
    get(){return _usr},
    set(v){
      if(Array.isArray(v)&&v.length===0&&_usr&&_usr.length>0){
        console.warn('[HAW] Bloqueado: tentativa de zerar DB.usuarios ignorada');
        return; // não permite sobrescrever com array vazio
      }
      _usr=v;
    },
    configurable:true
  });
})();

// ── NAVIGATION ──
const navConfig = {
  dashboard:{title:'Dashboard',sub:'Visão geral do negócio',btn:'+ Novo Pedido',action:'openModal("modal-pedido")'},
  pipeline:{title:'Pipeline',sub:'Jornada de atendimento',btn:'+ Novo Pedido',action:'openModal("modal-pedido")'},
  os:{title:'Ordens de Serviço',sub:'Histórico de OSs geradas',btn:'+ Nova OS',action:'novaOrdemServico()'},
  clientes:{title:'Clientes',sub:'Cadastro e gestão de clientes',btn:'+ Novo Cliente',action:'openModal("modal-cliente")'},
  pedidos:{title:'Pedidos',sub:'Todos os pedidos',btn:'+ Novo Pedido',action:'openModal("modal-pedido")'},
  receitas:{title:'Receitas Ópticas',sub:'Prescrições dos clientes',btn:'+ Nova Receita',action:'openModal("modal-receita")'},
  financeiro:{title:'Financeiro',sub:'Controle de recebimentos',btn:''},
  crediario:{title:'Crediário',sub:'Parcelamentos e pagamentos próprios',btn:'+ Novo Crediário',action:'abrirNovoCrediario()'},
  catalogo:{title:'Catálogo de Produtos',sub:'Armações, lentes e acessórios',btn:''},
  relatorios:{title:'Relatórios',sub:'Análise de desempenho',btn:''},
  config:{title:'Configurações',sub:'Sistema e usuários',btn:''},
  agenda:{title:'Agenda',sub:'Consultas, retornos e entregas',btn:'+ Novo Evento'},
  orcamentos:{title:'Orçamentos',sub:'Propostas comerciais para clientes',btn:'+ Novo Orçamento'},
  lab:{title:'Laboratório',sub:'Pedidos enviados ao laboratório',btn:''},
  cliente:{title:'Prontuário',sub:'Histórico e ações do cliente',btn:''},
};
let _currentPage = 'dashboard';
function nav(page){
  if(!canAccess(page))return;
  if(window.innerWidth<=640)closeSidebar();
  _currentPage = page;
  document.querySelectorAll('.sb-item').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
  const btn=document.querySelector(`.sb-item[onclick*="'${page}'"]`);
  if(btn)btn.classList.add('active');
  const panel=document.getElementById(`tab-${page}`);
  if(panel)panel.classList.add('active');
  const cfg=navConfig[page]||{title:page,sub:'',btn:''};
  document.getElementById('page-title').textContent=cfg.title;
  document.getElementById('page-sub').textContent=cfg.sub;
  const ab=document.getElementById('tb-action-btn');
  if(cfg.btn){ab.textContent=cfg.btn;ab.style.display='flex';}
  else ab.style.display='none';
  if(page==='relatorios')setTimeout(renderRelatorioCharts,100);
  if(page==='crediario')renderCrediario();
  if(page==='pedidos')setPedidosView(_pedidosView);
  if(page==='os')renderOS();
  if(page==='agenda'){if(!document.getElementById('agenda-data').value)document.getElementById('agenda-data').value=new Date().toISOString().slice(0,10);renderAgenda();}
  if(page==='orcamentos')renderOrcamentos();
  if(page==='lab')renderLab();
  if(page==='cliente')renderClienteHub(_currentClienteId);
  if(page==='dashboard'){const el=document.getElementById('dash-busca-cli');if(el){el.value='';document.getElementById('dash-busca-results').innerHTML='';}}
}
function tbAction(){
  if(_currentPage==='crediario'){abrirNovoCrediario();return;}
  if(_currentPage==='os'){novaOrdemServico();return;}
  if(_currentPage==='agenda'){openModal('modal-evento');return;}
  if(_currentPage==='orcamentos'){openModal('modal-orcamento');return;}
  const modalMap={
    dashboard:'modal-pedido',pipeline:'modal-pedido',
    clientes:'modal-cliente',pedidos:'modal-pedido',receitas:'modal-receita'
  };
  const modal=modalMap[_currentPage]||'modal-pedido';
  openModal(modal);
}

// ── DATE ──
function renderDate(){
  const d=new Date();
  const opts={weekday:'short',day:'numeric',month:'long'};
  document.getElementById('sb-date').textContent=d.toLocaleDateString('pt-BR',opts);
}
function renderSidebarUser(){
  document.getElementById('sb-av').textContent=currentUser.initials||currentUser.nome[0];
  document.getElementById('sb-nome').textContent=currentUser.nome;
  document.getElementById('sb-role').textContent=currentUser.perfil.charAt(0).toUpperCase()+currentUser.perfil.slice(1);
}

// ── COUNTS ──
function updateNavCounts(){
  // Contadores podem não existir na sidebar (ex.: Pedidos saiu do menu) — checar antes de escrever
  const cliEl=document.getElementById('cnt-clientes');
  if(cliEl)cliEl.textContent=DB.clientes.filter(c=>!c.deleted).length;
  const pedEl=document.getElementById('cnt-pedidos');
  if(pedEl)pedEl.textContent=DB.pedidos.filter(p=>!p.deleted).length;
  const open=DB.pedidos.filter(p=>!p.deleted&&!['entregue','pos_venda','perdido'].includes(p.status)).length;
  const pipEl=document.getElementById('cnt-pipeline');
  if(pipEl)pipEl.textContent=open;
  const credAtivos=(DB.crediarios||[]).filter(c=>{const st=computeStatusCrediario(c);return st==='ativo'||st==='atrasado';}).length;
  const credEl=document.getElementById('cnt-crediario');
  if(credEl){credEl.textContent=credAtivos;credEl.style.display=credAtivos?'inline-block':'none';}
  // Novos
  const hoje=new Date().toISOString().slice(0,10);
  const agEl=document.getElementById('cnt-agenda');
  if(agEl){const n=(DB.eventos||[]).filter(e=>!e.deleted&&e.data===hoje&&e.status!=='concluido').length;agEl.textContent=n;agEl.style.display=n?'inline-block':'none';}
  const orcEl=document.getElementById('cnt-orcamentos');
  if(orcEl){const n=(DB.orcamentos||[]).filter(o=>!o.deleted&&(o.status==='rascunho'||o.status==='enviado')).length;orcEl.textContent=n;orcEl.style.display=n?'inline-block':'none';}
  const labEl=document.getElementById('cnt-lab');
  if(labEl){const n=(DB.pedidos||[]).filter(p=>!p.deleted&&p.labDataEnvio&&p.labStatus!=='recebido').length;labEl.textContent=n;labEl.style.display=n?'inline-block':'none';}
}

// ── SELECTS ──
function populateSelects(){
  const users=DB.usuarios.filter(u=>u.ativo!==false);
  const vendedores=users.filter(u=>['vendedor','gestor','dono'].includes(u.perfil));
  ['cli-vendedor','ped-vendedor'].forEach(id=>{
    const el=document.getElementById(id);
    if(!el)return;
    el.innerHTML='<option value="">Selecione</option>'+vendedores.map(u=>`<option value="${u.id}">${u.nome}</option>`).join('');
  });
  const clis=DB.clientes.filter(c=>!c.deleted);
  ['rec-cliente','ped-cliente'].forEach(id=>{
    const el=document.getElementById(id);
    if(!el)return;
    el.innerHTML='<option value="">Selecione</option>'+clis.map(c=>`<option value="${c.id}">${c.nome}</option>`).join('');
  });
}

// ── MASKS ──
function maskCPF(el){let v=el.value.replace(/\D/g,'');if(v.length>11)v=v.slice(0,11);v=v.replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2');el.value=v}
function maskTel(el){let v=el.value.replace(/\D/g,'');if(v.length>11)v=v.slice(0,11);if(v.length>10)v=v.replace(/^(\d{2})(\d{5})(\d{4})$/,'($1) $2-$3');else v=v.replace(/^(\d{2})(\d{4})(\d{0,4})$/,'($1) $2-$3');el.value=v.trim().replace(/-$/,'')}
function fmtMoney(v){return'R$ '+Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}
function fmtDate(iso){if(!iso)return'—';return new Date(iso+'T12:00:00').toLocaleDateString('pt-BR')}
function norm(s){return(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase()}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6)}
function nextNumero(){const nums=DB.pedidos.map(p=>parseInt(p.numero)||0);return(Math.max(0,...nums)+1).toString().padStart(4,'0')}
function initials(n){return n.split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase()}

// ── MODAL ──
function openModal(id,data={}){
  const el=document.getElementById(id);
  if(!el)return;
  // Garantir que o modal é filho direto do body (evita conflito com overflow:hidden de ancestors)
  if(el.parentElement!==document.body)document.body.appendChild(el);
  // reset form inputs
  el.querySelectorAll('input:not([type=hidden]),select,textarea').forEach(i=>{if(i.type!=='hidden')i.value=''});
  if(id==='modal-pedido'){
    pedidoItensCount=0;
    document.getElementById('ped-itens-list').innerHTML='';
    document.getElementById('ped-desconto').value='0';
    document.getElementById('ped-subtotal').textContent='R$ 0,00';
    document.getElementById('ped-total').textContent='R$ 0,00';
    document.getElementById('ped-id').value='';
    document.getElementById('modal-ped-title').textContent='Novo Pedido';
    populateSelects();
    const selMotivoPed=document.getElementById('ped-motivo');
    if(selMotivoPed)selMotivoPed.innerHTML='<option value="">— Selecione —</option>'+MOTIVOS_PERDA.map(m=>`<option value="${m}">${m}</option>`).join('');
    _toggleMotivoPerdaPed();
  }
  if(id==='modal-cliente'){
    document.getElementById('cli-id').value='';
    document.getElementById('modal-cli-title').textContent='Novo Cliente';
    populateSelects();
  }
  if(id==='modal-receita'){
    _editingRecId = null;
    document.getElementById('rec-data').value=new Date().toISOString().slice(0,10);
    const titleEl=document.getElementById('modal-rec-title');if(titleEl)titleEl.textContent='Nova Receita';
    document.querySelector('[name="rec-corrige"][value="ambos"]') && (document.querySelector('[name="rec-corrige"][value="ambos"]').checked=true);
    populateSelects();
    if(data.clienteId){document.getElementById('rec-cliente').value=data.clienteId}
  }
  if(id==='modal-produto'){
    const cat=data.cat||'armacao';
    document.getElementById('prod-cat').value=cat;
    document.getElementById('prod-id').value='';
    document.getElementById('modal-prod-title').textContent={armacao:'Nova Armação',lente:'Nova Lente',acessorio:'Novo Acessório'}[cat]||'Novo Produto';
    document.getElementById('prod-extra-lente').style.display=cat==='lente'?'block':'none';
    const extraArm=document.getElementById('prod-extra-armacao');
    if(extraArm)extraArm.style.display=cat==='armacao'?'block':'none';
  }
  el.classList.add('open');
}
function closeModal(id){document.getElementById(id).classList.remove('open')}
document.querySelectorAll('.modal-overlay').forEach(o=>o.addEventListener('click',e=>{if(e.target===o)o.classList.remove('open')}));

// ── CATÁLOGO TABS ──
function setCatTab(tab,btn){
  ['armacoes','lentes','acessorios','consignado'].forEach(t=>{
    document.getElementById(`cat-panel-${t}`).style.display=t===tab?'block':'none';
  });
  document.querySelectorAll('#tab-catalogo .inner-tab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  if(tab==='consignado') renderConsignados();
}
function setCfgTab(tab,btn){
  ['usuarios','metas','empresa','supabase','tabelas','backups'].forEach(t=>{
    const el=document.getElementById(`cfg-${t}`);
    if(el) el.style.display=t===tab?'block':'none';
  });
  document.querySelectorAll('#tab-config .inner-tab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  if(tab==='backups') renderBackups();
}
function setPipelineVendedor(v,btn){
  document.querySelectorAll('#pipeline-filters .fb').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderPipeline(v);
}
function filterClientes(f,btn){
  document.querySelectorAll('.filters .fb').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderClientes(f);
}
function filterPedidos(f,btn){
  document.querySelectorAll('#ped-list-filters .fb').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderPedidos(f);
}

// ── GLOBAL SEARCH ──
function closeSearchDrop(){
  const d=document.getElementById('search-drop');
  if(d)d.style.display='none';
}
function globalSearch(q){
  const drop=document.getElementById('search-drop');
  if(!q||!q.trim()){
    renderClientes();renderPedidos();
    if(drop)drop.style.display='none';
    return;
  }
  const term=norm(q);
  const clis=DB.clientes.filter(c=>!c.deleted&&(norm(c.nome).includes(term)||(c.telefone||'').includes(term)||(c.cpf||'').includes(term))).slice(0,5);
  const peds=DB.pedidos.filter(p=>!p.deleted&&(p.numero.includes(term)||norm((DB.clientes.find(c=>c.id===p.clienteId)||{}).nome||'').includes(term))).slice(0,4);
  const creds=(DB.crediarios||[]).filter(c=>!c.deleted&&(norm(c.clienteNome||'').includes(term)||norm(c.descricao||'').includes(term))).slice(0,3);
  const oss=(DB.ordens||[]).filter(o=>!o.deleted&&(norm(o.paciente||'').includes(term)||norm(o.num||'').includes(term))).slice(0,3);
  const recs=(DB.receitas||[]).filter(r=>!r.deleted&&norm((DB.clientes.find(c=>c.id===r.clienteId)||{}).nome||'').includes(term)).slice(0,3);
  renderClientesData(DB.clientes.filter(c=>!c.deleted&&(norm(c.nome).includes(term)||(c.telefone||'').includes(term)||(c.cpf||'').includes(term))));
  renderPedidosData(DB.pedidos.filter(p=>!p.deleted&&(p.numero.includes(term)||norm((DB.clientes.find(c=>c.id===p.clienteId)||{}).nome||'').includes(term))));
  if(!drop)return;
  if(!clis.length&&!peds.length&&!creds.length&&!oss.length&&!recs.length){
    drop.innerHTML='<div class="search-drop-empty">Nenhum resultado para "<strong>'+q+'</strong>"</div>';
    drop.style.display='block';return;
  }
  let html='';
  if(clis.length){
    html+='<div class="search-drop-section">Clientes</div>';
    clis.forEach(c=>{
      html+=`<div class="search-drop-item" onclick="abrirCliente('${c.id}');closeSearchDrop();document.getElementById('global-search').value=''">
        <span class="sdrop-icon">👤</span>
        <div style="min-width:0"><div class="sdrop-label">${c.nome}</div><div class="sdrop-sub">${c.telefone||c.cpf||'sem contato'}</div></div>
        <span class="sdrop-badge">${(DB.pedidos.filter(p=>!p.deleted&&p.clienteId===c.id)).length} ped.</span>
      </div>`;
    });
  }
  if(peds.length){
    html+='<div class="search-drop-section">Pedidos</div>';
    peds.forEach(p=>{
      const cli=DB.clientes.find(c=>c.id===p.clienteId)||{nome:'?'};
      const st=(STATUS_BADGE[p.status]||{label:p.status}).label;
      html+=`<div class="search-drop-item" onclick="nav('pedidos');closeSearchDrop();document.getElementById('global-search').value=''">
        <span class="sdrop-icon">🛍️</span>
        <div style="min-width:0"><div class="sdrop-label">#${p.numero} — ${cli.nome}</div><div class="sdrop-sub">${fmtMoney(p.total||0)} · ${st}</div></div>
        <span class="sdrop-badge">${fmtDate(p.createdAt)}</span>
      </div>`;
    });
  }
  if(creds.length){
    html+='<div class="search-drop-section">Crediário</div>';
    creds.forEach(cr=>{
      const venc=(cr.parcelas||[]).filter(p=>!p.pago&&p.dataVenc&&new Date(p.dataVenc)<new Date()).length;
      html+=`<div class="search-drop-item" onclick="nav('crediario');closeSearchDrop();document.getElementById('global-search').value=''">
        <span class="sdrop-icon">📋</span>
        <div style="min-width:0"><div class="sdrop-label">${cr.clienteNome}</div><div class="sdrop-sub">${cr.descricao||''} · ${fmtMoney(cr.total||0)}</div></div>
        ${venc?`<span class="sdrop-badge" style="color:var(--red);border-color:var(--red)">${venc} venc.</span>`:''}
      </div>`;
    });
  }
  if(oss.length){
    html+='<div class="search-drop-section">OS (Ordem de Serviço)</div>';
    oss.forEach(o=>{
      html+=`<div class="search-drop-item" onclick="nav('os');closeSearchDrop();document.getElementById('global-search').value=''">
        <span class="sdrop-icon">🔬</span>
        <div style="min-width:0"><div class="sdrop-label">${o.num||'—'} — ${o.paciente}</div><div class="sdrop-sub">${o.data?.split('-').reverse().join('/')||'—'}${o.valor?' · R$'+Number(o.valor).toLocaleString('pt-BR',{minimumFractionDigits:2}):''}</div></div>
      </div>`;
    });
  }
  if(recs.length){
    html+='<div class="search-drop-section">Receitas</div>';
    recs.forEach(r=>{
      const cli=DB.clientes.find(c=>c.id===r.clienteId)||{nome:'?'};
      html+=`<div class="search-drop-item" onclick="abrirCliente('${r.clienteId}');closeSearchDrop();document.getElementById('global-search').value=''">
        <span class="sdrop-icon">👁️</span>
        <div style="min-width:0"><div class="sdrop-label">${cli.nome}</div><div class="sdrop-sub">Receita de ${fmtDate(r.dataReceita)}${r.isAtual?' · atual':''}</div></div>
      </div>`;
    });
  }
  drop.innerHTML=html;
  drop.style.display='block';
}
document.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key==='k'){
    e.preventDefault();
    const inp=document.getElementById('global-search');
    if(inp){inp.focus();inp.select();}
  }
  if(e.key==='Escape')closeSearchDrop();
});


// ── SALVAR CLIENTE ──
function salvarCliente(){
  const nome=document.getElementById('cli-nome').value.trim();
  if(!nome){alert('Nome é obrigatório');return;}
  const id=document.getElementById('cli-id').value||uid();
  const isNew=!document.getElementById('cli-id').value;
  const obj={
    id,nome,cpf:document.getElementById('cli-cpf').value,
    telefone:document.getElementById('cli-tel').value,
    email:document.getElementById('cli-email').value,
    dataNasc:document.getElementById('cli-nasc').value,
    vendedorId:document.getElementById('cli-vendedor').value,
    obs:document.getElementById('cli-obs').value,
    endereco:{rua:document.getElementById('cli-rua').value,num:document.getElementById('cli-num').value,bairro:document.getElementById('cli-bairro').value,cidade:document.getElementById('cli-cidade').value,uf:document.getElementById('cli-uf').value},
    status:'ativo',createdAt:isNew?new Date().toISOString():undefined,
    updatedAt:new Date().toISOString()
  };
  if(isNew){obj.createdAt=new Date().toISOString();DB.clientes.push(obj)}
  else{const i=DB.clientes.findIndex(c=>c.id===id);if(i>=0)DB.clientes[i]=Object.assign(DB.clientes[i],obj)}
  save();closeModal('modal-cliente');
  populateSelects();renderClientes();updateNavCounts();renderDashboard();
  toast('Cliente salvo com sucesso!');
}

// ── EDITAR CLIENTE ──
function editarCliente(id){
  const c=DB.clientes.find(x=>x.id===id);if(!c)return;
  openModal('modal-cliente');
  document.getElementById('modal-cli-title').textContent='Editar Cliente';
  document.getElementById('cli-id').value=c.id;
  document.getElementById('cli-nome').value=c.nome;
  document.getElementById('cli-cpf').value=c.cpf||'';
  document.getElementById('cli-tel').value=c.telefone||'';
  document.getElementById('cli-email').value=c.email||'';
  document.getElementById('cli-nasc').value=c.dataNasc||'';
  document.getElementById('cli-vendedor').value=c.vendedorId||'';
  document.getElementById('cli-obs').value=c.obs||'';
  if(c.endereco){
    document.getElementById('cli-rua').value=c.endereco.rua||'';
    document.getElementById('cli-num').value=c.endereco.num||'';
    document.getElementById('cli-bairro').value=c.endereco.bairro||'';
    document.getElementById('cli-cidade').value=c.endereco.cidade||'Manaus';
    document.getElementById('cli-uf').value=c.endereco.uf||'AM';
  }
}
function excluirCliente(id){
  if(!confirm('Excluir este cliente?'))return;
  const i=DB.clientes.findIndex(c=>c.id===id);
  if(i>=0){DB.clientes[i].deleted=true;}
  save();renderClientes();updateNavCounts();renderDashboard();toast('Cliente removido.');
}

// ── PERFIL CLIENTE ──
function verPerfil(id){abrirCliente(id);}
function perfilTab(tabId,btn){
  const base=tabId.replace(/^(pedidos|receitas|crediario|os|eventos|orcamentos|garantias)-/,'');
  ['pedidos','receitas','crediario','os','eventos','orcamentos','garantias'].forEach(t=>{
    const el=document.getElementById(`perfil-tab-${t}-${base}`);
    if(el)el.style.display='none';
  });
  const el=document.getElementById(`perfil-tab-${tabId}`);
  if(el)el.style.display='block';
  document.querySelectorAll('#perfil-body .inner-tab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
}
function fmt(v){if(v==null)return'—';const s=Number(v).toFixed(2);return v>=0?'+'+s:s}

// ── CLIENTE HUB ──
let _currentClienteId=null;
function abrirCliente(id){_currentClienteId=id;nav('cliente');}

function novaOSparaCliente(id){
  const cli=DB.clientes.find(c=>c.id===id);
  novaOrdemServico();
  if(cli)setTimeout(()=>{const el=document.getElementById('os-paciente');if(el)el.value=cli.nome;osImportarReceita(cli.nome);},80);
}

function abrirNovoCrediarioParaCliente(cliId){
  abrirNovoCrediario();
  setTimeout(()=>{const sel=document.getElementById('cred-cliente-id');if(sel)sel.value=cliId;},80);
}

function dashBuscaCliente(term){
  const resultsEl=document.getElementById('dash-busca-results');
  if(!resultsEl)return;
  if(!term||!term.trim()){resultsEl.innerHTML='';return;}
  const t=norm(term);
  const matches=DB.clientes.filter(c=>!c.deleted&&(norm(c.nome).includes(t)||(c.telefone||'').includes(t))).slice(0,6);
  if(!matches.length){
    resultsEl.innerHTML=`<div style="text-align:center;padding:16px 0"><div style="color:#8899bb;font-size:13px;margin-bottom:10px">Nenhum cliente encontrado para "${term}"</div><button class="btn btn-gold btn-sm" onclick="openModal('modal-cliente')">+ Cadastrar novo cliente</button></div>`;
    return;
  }
  resultsEl.innerHTML=matches.map(c=>{
    const ult=DB.pedidos.filter(p=>!p.deleted&&p.clienteId===c.id&&p.status==='entregue').sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''))[0];
    const nPeds=DB.pedidos.filter(p=>!p.deleted&&p.clienteId===c.id).length;
    return`<div class="dash-cli-card" onclick="abrirCliente('${c.id}')">
      <div class="dash-cli-avatar">${initials(c.nome)}</div>
      <div style="flex:1;min-width:0">
        <div class="dash-cli-nome">${c.nome}</div>
        <div class="dash-cli-meta">${c.telefone||''}${ult?' · Última compra: '+fmtDate(ult.createdAt):(nPeds===0?' · Sem compras':' · '+nPeds+' pedido'+(nPeds>1?'s':''))}</div>
      </div>
      <div style="background:var(--gold);color:#13182C;font-size:11px;font-weight:700;padding:6px 18px;border-radius:20px;white-space:nowrap">Atender →</div>
    </div>`;
  }).join('');
}

function hubTab(tabId,btn){
  const base=tabId.replace(/^(pedidos|receitas|crediario|os|eventos|orcamentos|garantias|anotacoes|tarefas)-/,'');
  ['pedidos','receitas','crediario','os','eventos','orcamentos','garantias','anotacoes','tarefas'].forEach(t=>{
    const el=document.getElementById(`hub-tab-${t}-${base}`);
    if(el)el.style.display='none';
  });
  const el=document.getElementById(`hub-tab-${tabId}`);
  if(el)el.style.display='block';
  document.querySelectorAll('#cliente-hub-body .inner-tab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
}

function renderClienteHub(id){
  if(!id)return;
  const c=DB.clientes.find(x=>x.id===id);
  if(!c){nav('clientes');return;}
  const peds=DB.pedidos.filter(p=>!p.deleted&&p.clienteId===id);
  const recs=(DB.receitas||[]).filter(r=>!r.deleted&&r.clienteId===id).sort((a,b)=>(b.dataReceita||'').localeCompare(a.dataReceita||''));
  const creds=(DB.crediarios||[]).filter(cr=>!cr.deleted&&cr.clienteId===id);
  const ordens=(DB.ordens||[]).filter(o=>!o.deleted&&(o.clienteId===id||(o.paciente&&o.paciente.toLowerCase()===c.nome.toLowerCase()))).sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||''));
  const evts=(DB.eventos||[]).filter(e=>!e.deleted&&e.clienteId===id&&!['follow_up','visita','ligacao'].includes(e.tipo)).sort((a,b)=>(b.data||'').localeCompare(a.data||''));
  const tarefas=(DB.eventos||[]).filter(e=>!e.deleted&&e.clienteId===id&&['follow_up','visita','ligacao'].includes(e.tipo)).sort((a,b)=>(a.data||'').localeCompare(b.data||''));
  const anots=(DB.anotacoes||[]).filter(a=>!a.deleted&&a.clienteId===id).sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
  const orcs=(DB.orcamentos||[]).filter(o=>!o.deleted&&o.clienteId===id).sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
  const ult=peds.filter(p=>p.status==='entregue').sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''))[0];
  const totalGasto=peds.filter(p=>p.status==='entregue'||p.status==='pos_venda').reduce((s,p)=>s+Number(p.total||0),0);
  const pedsComGar=peds.filter(p=>p.garantiaMeses&&p.garantiaMeses>0);
  document.getElementById('page-title').textContent=c.nome;
  document.getElementById('page-sub').textContent='Prontuário do cliente';
  const ab=document.getElementById('tb-action-btn');if(ab)ab.style.display='none';
  document.getElementById('cliente-hub-body').innerHTML=`
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px;flex-wrap:wrap">
      <button class="btn btn-ghost btn-sm" onclick="nav('clientes')">← Voltar</button>
      ${c.telefone?`<button class="btn btn-sm" onclick="abrirWA('${id}')" style="background:#25D366;border-color:#25D366;color:#fff">📱 WhatsApp</button>`:''}
      <button class="btn btn-ghost btn-sm" onclick="editarCliente('${id}')">✏️ Editar dados</button>
    </div>
    <div class="perfil-header" style="margin-bottom:20px">
      <div class="perfil-avatar" style="width:64px;height:64px;font-size:26px">${initials(c.nome)}</div>
      <div style="flex:1">
        <div class="perfil-nome">${c.nome}</div>
        <div class="perfil-meta">${[c.telefone,c.email,c.cpf?'CPF: '+c.cpf:''].filter(Boolean).join(' · ')}</div>
        <div class="perfil-tags">
          <span class="badge badge-gold">${c.status||'ativo'}</span>
          ${ult?`<span class="badge badge-gray">Última compra: ${fmtDate(ult.createdAt)}</span>`:'<span class="badge badge-gray">Sem compras</span>'}
          ${totalGasto>0?`<span class="badge badge-green">Total: ${fmtMoney(totalGasto)}</span>`:''}
          ${peds.length?`<span class="badge badge-blue">${peds.length} pedido${peds.length>1?'s':''}</span>`:''}
        </div>
      </div>
    </div>
    <div class="hub-actions">
      <button class="hub-action-btn" onclick="openModal('modal-receita',{clienteId:'${id}'})">
        <div class="hub-action-icon">👁️</div>
        <div><div class="hub-action-label">Nova Receita</div><div class="hub-action-sub">Prescrição óptica</div></div>
        <div style="background:var(--gold);color:#13182C;font-size:10px;font-weight:800;padding:4px 14px;border-radius:20px">ABRIR</div>
      </button>
      <button class="hub-action-btn" onclick="abrirPedidoParaCliente('${id}')">
        <div class="hub-action-icon">🛍️</div>
        <div><div class="hub-action-label">Nova Venda</div><div class="hub-action-sub">Registra pedido<br>e entrada no caixa</div></div>
        <div style="background:var(--gold);color:#13182C;font-size:10px;font-weight:800;padding:4px 14px;border-radius:20px">ABRIR</div>
      </button>
      <button class="hub-action-btn" onclick="novaOSparaCliente('${id}')">
        <div class="hub-action-icon">📋</div>
        <div><div class="hub-action-label">Nova OS</div><div class="hub-action-sub">Ordem de serviço<br>com PDF</div></div>
        <div style="background:var(--gold);color:#13182C;font-size:10px;font-weight:800;padding:4px 14px;border-radius:20px">ABRIR</div>
      </button>
      <button class="hub-action-btn" onclick="abrirNovoCrediarioParaCliente('${id}')">
        <div class="hub-action-icon">💳</div>
        <div><div class="hub-action-label">Crediário</div><div class="hub-action-sub">Parcelamento<br>próprio</div></div>
        <div style="background:var(--gold);color:#13182C;font-size:10px;font-weight:800;padding:4px 14px;border-radius:20px">ABRIR</div>
      </button>
      <button class="hub-action-btn" onclick="openModal('modal-orcamento');setTimeout(()=>{const s=document.getElementById('orc-cliente');if(s){s.value='${id}';}},80)">
        <div class="hub-action-icon">📝</div>
        <div><div class="hub-action-label">Orçamento</div><div class="hub-action-sub">Proposta<br>comercial</div></div>
        <div style="background:var(--gold);color:#13182C;font-size:10px;font-weight:800;padding:4px 14px;border-radius:20px">ABRIR</div>
      </button>
      <button class="hub-action-btn" onclick="agendarTarefa('${id}')">
        <div class="hub-action-icon">📅</div>
        <div><div class="hub-action-label">Agendar Tarefa</div><div class="hub-action-sub">Follow-up, visita<br>ou ligação</div></div>
        <div style="background:var(--gold);color:#13182C;font-size:10px;font-weight:800;padding:4px 14px;border-radius:20px">ABRIR</div>
      </button>
    </div>
    <div class="inner-tabs">
      <button class="inner-tab active" onclick="hubTab('pedidos-${id}',this)">Pedidos (${peds.length})</button>
      <button class="inner-tab" onclick="hubTab('receitas-${id}',this)">Receitas (${recs.length})</button>
      <button class="inner-tab" onclick="hubTab('os-${id}',this)">OS (${ordens.length})</button>
      <button class="inner-tab" onclick="hubTab('crediario-${id}',this)">Crediário (${creds.length})</button>
      <button class="inner-tab" onclick="hubTab('tarefas-${id}',this)">Tarefas${tarefas.length?` <span class="sb-count">${tarefas.length}</span>`:' (0)'}</button>
      <button class="inner-tab" onclick="hubTab('anotacoes-${id}',this)">Anotações${anots.length?` <span class="sb-count">${anots.length}</span>`:''}</button>
      <button class="inner-tab" onclick="hubTab('eventos-${id}',this)">Eventos (${evts.length})</button>
      <button class="inner-tab" onclick="hubTab('orcamentos-${id}',this)">Orçamentos (${orcs.length})</button>
      ${pedsComGar.length?`<button class="inner-tab" onclick="hubTab('garantias-${id}',this)">Garantias (${pedsComGar.length})</button>`:''}
    </div>
    <div id="hub-tab-pedidos-${id}">
      ${peds.length?`<table><thead><tr><th>#</th><th>Data</th><th>Total</th><th>Status</th></tr></thead><tbody>
        ${peds.map(p=>`<tr><td>#${p.numero}</td><td>${fmtDate(p.createdAt)}</td><td>${fmtMoney(p.total)}</td><td><span class="badge ${(STATUS_BADGE[p.status]||{cls:'badge-gray'}).cls}">${(STATUS_BADGE[p.status]||{label:p.status}).label}</span></td></tr>`).join('')}
      </tbody></table>`:`<div class="empty"><div class="empty-icon">🛍️</div><div class="empty-title">Nenhum pedido ainda</div><button class="btn btn-gold btn-sm" style="margin-top:8px" onclick="abrirPedidoParaCliente('${id}')">+ Nova Venda</button></div>`}
    </div>
    <div id="hub-tab-receitas-${id}" style="display:none">
      ${recs.length?`<div style="display:flex;justify-content:flex-end;margin-bottom:8px"><button class="btn btn-gold btn-sm" onclick="openModal('modal-receita',{clienteId:'${id}'})">+ Nova Receita</button></div>`:''}
      ${recs.length?recs.map(r=>`
        <div class="card" style="margin-bottom:12px">
          <div class="ch"><span class="ct">Receita de ${fmtDate(r.dataReceita)}${r.medico?' — '+r.medico:''}</span><div style="display:flex;align-items:center;gap:8px">${r.isAtual?'<span class="badge badge-green">Atual</span>':''}<button class="btn btn-ghost btn-sm" onclick="editarReceita('${r.id}')" title="Editar">✏️</button><button class="btn btn-ghost btn-sm" onclick="excluirReceita('${r.id}');abrirCliente('${id}')" title="Excluir" style="color:var(--red)">🗑</button></div></div>
          <div style="padding:12px 16px">
            <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;font-size:12px;margin-bottom:4px">
              <div style="font-weight:600;color:var(--muted)">OD</div>
              <div style="text-align:center">${r.odEsf!=null?fmt(r.odEsf):'—'}</div>
              <div style="text-align:center">${r.odCil!=null?fmt(r.odCil):'—'}</div>
              <div style="text-align:center">${r.odEixo!=null?r.odEixo+'°':'—'}</div>
              <div style="text-align:center">${r.odAdi!=null?fmt(r.odAdi):'—'}</div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;font-size:12px">
              <div style="font-weight:600;color:var(--muted)">OE</div>
              <div style="text-align:center">${r.oeEsf!=null?fmt(r.oeEsf):'—'}</div>
              <div style="text-align:center">${r.oeCil!=null?fmt(r.oeCil):'—'}</div>
              <div style="text-align:center">${r.oeEixo!=null?r.oeEixo+'°':'—'}</div>
              <div style="text-align:center">${r.oeAdi!=null?fmt(r.oeAdi):'—'}</div>
            </div>
          </div>
        </div>`).join(''):`<div class="empty"><div class="empty-icon">👁️</div><div class="empty-title">Nenhuma receita</div><button class="btn btn-gold btn-sm" style="margin-top:8px" onclick="openModal('modal-receita',{clienteId:'${id}'})">+ Nova Receita</button></div>`}
    </div>
    <div id="hub-tab-os-${id}" style="display:none">
      <div style="display:flex;justify-content:flex-end;margin-bottom:8px"><button class="btn btn-gold btn-sm" onclick="novaOSparaCliente('${id}')">+ Nova OS</button></div>
      ${ordens.length?`<table><thead><tr><th>Nº OS</th><th>Data</th><th>Entrega</th><th>Valor</th><th></th></tr></thead><tbody>
        ${ordens.map(o=>`<tr>
          <td style="font-weight:700;color:var(--navy)">${o.num||'—'}</td>
          <td>${o.data?.split('-').reverse().join('/')||'—'}</td>
          <td>${o.entrega?.split('-').reverse().join('/')||'—'}</td>
          <td>${o.valor?'R$ '+Number(o.valor).toLocaleString('pt-BR',{minimumFractionDigits:2}):'—'}</td>
          <td><button class="btn btn-ghost btn-sm" onclick="editarOS('${o.id}')">✏️</button></td>
        </tr>`).join('')}
      </tbody></table>`:`<div class="empty"><div class="empty-icon">📋</div><div class="empty-title">Nenhuma OS</div></div>`}
    </div>
    <div id="hub-tab-crediario-${id}" style="display:none">
      ${creds.length?creds.map(cr=>{
        const venc=(cr.parcelas||[]).filter(p=>!p.pago&&p.dataVenc&&new Date(p.dataVenc)<new Date()).length;
        const pagas=(cr.parcelas||[]).filter(p=>p.pago).length;
        const total=cr.parcelas?.length||cr.numParcelas||0;
        return`<div class="card" style="margin-bottom:12px"><div class="ch"><span class="ct">${cr.descricao||'Crediário'}</span>${venc?`<span class="badge badge-red">${venc} vencida${venc>1?'s':''}</span>`:`<span class="badge badge-green">${pagas}/${total} pagas</span>`}</div><div style="padding:12px 16px;font-size:12px;color:var(--muted)">Total: ${fmtMoney(cr.total||0)} · ${pagas}/${total} parcelas pagas</div></div>`;
      }).join(''):`<div class="empty"><div class="empty-icon">💳</div><div class="empty-title">Nenhum crediário</div><button class="btn btn-gold btn-sm" style="margin-top:8px" onclick="abrirNovoCrediarioParaCliente('${id}')">+ Novo Crediário</button></div>`}
    </div>
    <div id="hub-tab-eventos-${id}" style="display:none">
      ${evts.length?`<table><thead><tr><th>Data</th><th>Tipo</th><th>Título</th><th>Status</th></tr></thead><tbody>
        ${evts.map(e=>`<tr><td>${fmtDate(e.data)}</td><td>${e.tipo||'—'}</td><td>${e.titulo||'—'}</td><td><span class="badge badge-blue">${e.status||'agendado'}</span></td></tr>`).join('')}
      </tbody></table>`:`<div class="empty"><div class="empty-icon">📅</div><div class="empty-title">Nenhum evento</div></div>`}
    </div>
    <div id="hub-tab-orcamentos-${id}" style="display:none">
      ${orcs.length?`<table><thead><tr><th>#</th><th>Data</th><th>Total</th><th>Status</th></tr></thead><tbody>
        ${orcs.map(o=>`<tr><td>#${o.numero||'—'}</td><td>${fmtDate(o.createdAt)}</td><td>${fmtMoney(o.total||0)}</td><td><span class="badge badge-gray">${o.status||'rascunho'}</span></td></tr>`).join('')}
      </tbody></table>`:`<div class="empty"><div class="empty-icon">📝</div><div class="empty-title">Nenhum orçamento</div></div>`}
    </div>
    ${pedsComGar.length?`<div id="hub-tab-garantias-${id}" style="display:none">
      <table><thead><tr><th>#Pedido</th><th>Data</th><th>Garantia</th><th>Status</th></tr></thead><tbody>
        ${pedsComGar.map(p=>`<tr><td>#${p.numero}</td><td>${fmtDate(p.createdAt)}</td><td>${p.garantiaMeses} meses</td><td>${_garantiaBadge(p)}</td></tr>`).join('')}
      </tbody></table>
    </div>`:''}
    <div id="hub-tab-tarefas-${id}" style="display:none">
      <div style="display:flex;justify-content:flex-end;margin-bottom:10px">
        <button class="btn btn-gold btn-sm" onclick="agendarTarefa('${id}')">+ Nova Tarefa</button>
      </div>
      ${tarefas.length?`<div style="display:flex;flex-direction:column;gap:10px">
        ${tarefas.map(t=>{
          const tipoLabel={'follow_up':'📞 Follow-up','visita':'🏠 Visita','ligacao':'📱 Ligação'}[t.tipo]||t.tipo;
          const vencido=t.data&&t.status!=='concluido'&&new Date(t.data)<new Date();
          return`<div class="card" style="margin-bottom:0;padding:0">
            <div class="ch" style="padding:10px 14px">
              <div style="display:flex;align-items:center;gap:10px;flex:1">
                <span style="font-size:18px">${t.lembrete?'🔔':'📋'}</span>
                <div>
                  <div style="font-size:13px;font-weight:600">${t.titulo}</div>
                  <div style="font-size:11px;color:var(--muted)">${tipoLabel} · ${t.data?.split('-').reverse().join('/')||'—'}${t.hora?' às '+t.hora:''}</div>
                </div>
              </div>
              <div style="display:flex;gap:6px;align-items:center">
                ${t.status==='concluido'?'<span class="badge badge-green">✓ Concluída</span>':vencido?'<span class="badge badge-red">Vencida</span>':'<span class="badge badge-blue">Pendente</span>'}
                ${t.status!=='concluido'?`<button class="btn btn-ghost btn-sm" onclick="concluirEvento('${t.id}');renderClienteHub('${id}')" title="Marcar concluída">✓</button>`:''}
                <button class="btn btn-ghost btn-sm" onclick="excluirEvento('${t.id}');renderClienteHub('${id}')" title="Excluir" style="color:var(--red)">🗑</button>
              </div>
            </div>
            ${t.obs?`<div style="padding:8px 14px;font-size:12px;color:var(--muted);border-top:1px solid var(--border-light)">${t.obs}</div>`:''}
          </div>`;
        }).join('')}
      </div>`:`<div class="empty"><div class="empty-icon">📅</div><div class="empty-title">Nenhuma tarefa agendada</div><button class="btn btn-gold btn-sm" style="margin-top:8px" onclick="agendarTarefa('${id}')">+ Agendar Tarefa</button></div>`}
    </div>
    <div id="hub-tab-anotacoes-${id}" style="display:none">
      <div class="card" style="margin-bottom:14px;padding:14px 16px">
        <div style="font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Nova anotação</div>
        <textarea id="anotacao-input-${id}" class="form-input" rows="3" placeholder="Escreva uma observação, histórico ou detalhe importante sobre este cliente…" style="resize:vertical;min-height:72px"></textarea>
        <div style="display:flex;justify-content:flex-end;margin-top:8px">
          <button class="btn btn-gold btn-sm" onclick="salvarAnotacao('${id}')">💾 Salvar anotação</button>
        </div>
      </div>
      ${anots.length?`<div style="display:flex;flex-direction:column;gap:8px">
        ${anots.map(a=>`<div style="display:flex;gap:12px;padding:10px 0;border-bottom:1px solid var(--border-light)">
          <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--dark3),var(--dark4));display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:var(--gold);flex-shrink:0">${initials(a.autor||'?')}</div>
          <div style="flex:1">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
              <span style="font-size:12px;font-weight:600">${a.autor||'Vendedor'}</span>
              <span style="font-size:10px;color:var(--muted)">${fmtDate(a.createdAt)}</span>
              <button class="btn btn-ghost btn-sm" onclick="excluirAnotacao('${a.id}','${id}')" style="margin-left:auto;color:var(--muted);padding:2px 6px;font-size:11px">🗑</button>
            </div>
            <div style="font-size:13px;line-height:1.5;white-space:pre-wrap">${a.texto}</div>
          </div>
        </div>`).join('')}
      </div>`:`<div class="empty"><div class="empty-icon">📝</div><div class="empty-title">Nenhuma anotação ainda</div><div class="empty-text">Use o campo acima para registrar observações sobre este cliente</div></div>`}
    </div>
  `;
}
window.abrirCliente=abrirCliente;
window.renderClienteHub=renderClienteHub;
window.hubTab=hubTab;
window.dashBuscaCliente=dashBuscaCliente;
window.novaOSparaCliente=novaOSparaCliente;
window.abrirNovoCrediarioParaCliente=abrirNovoCrediarioParaCliente;

function abrirPedidoParaCliente(cliId){
  openModal('modal-pedido');
  setTimeout(()=>{document.getElementById('ped-cliente').value=cliId;onPedClienteChange();},50);
}

// ── RECEITA ──
let _editingRecId = null;

function editarReceita(id) {
  const r = (DB.receitas||[]).find(x => x.id === id);
  if (!r) return;
  openModal('modal-receita');
  _editingRecId = id;
  document.getElementById('rec-cliente').value = r.clienteId || '';
  document.getElementById('rec-data').value = r.dataReceita || '';
  document.getElementById('rec-medico').value = r.medico || '';
  const corrige = r.corrige || 'ambos';
  const corEl = document.querySelector(`[name="rec-corrige"][value="${corrige}"]`);
  if (corEl) corEl.checked = true;
  const sf = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };
  sf('rec-od-esf', r.odEsf); sf('rec-od-cil', r.odCil); sf('rec-od-eixo', r.odEixo);
  sf('rec-od-adi', r.odAdi); sf('rec-od-esf-perto', r.odEsfPerto);
  sf('rec-od-dnp', r.odDnp); sf('rec-od-alt', r.odAlt); sf('rec-od-base', r.odBase); sf('rec-od-desc', r.odDesc);
  const odPEl = document.getElementById('rec-od-prisma'); if (odPEl) odPEl.checked = !!r.odPrisma;
  sf('rec-oe-esf', r.oeEsf); sf('rec-oe-cil', r.oeCil); sf('rec-oe-eixo', r.oeEixo);
  sf('rec-oe-adi', r.oeAdi); sf('rec-oe-esf-perto', r.oeEsfPerto);
  sf('rec-oe-dnp', r.oeDnp); sf('rec-oe-alt', r.oeAlt); sf('rec-oe-base', r.oeBase); sf('rec-oe-desc', r.oeDesc);
  const oePEl = document.getElementById('rec-oe-prisma'); if (oePEl) oePEl.checked = !!r.oePrisma;
  sf('rec-obs', r.obs);
  document.getElementById('modal-rec-title') && (document.getElementById('modal-rec-title').textContent = 'Editar Receita');
}

function excluirReceita(id) {
  if (!confirm('Excluir esta receita?')) return;
  const r = (DB.receitas||[]).find(x => x.id === id);
  if (!r) return;
  r.deleted = true;
  // Se era a atual, promove a mais recente restante
  if (r.isAtual) {
    const proxima = (DB.receitas||[])
      .filter(x => !x.deleted && x.clienteId === r.clienteId)
      .sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||''))[0];
    if (proxima) proxima.isAtual = true;
  }
  save(); renderReceitas(); toast('Receita excluída.');
}

function salvarReceita(){
  const cliId=document.getElementById('rec-cliente').value;
  if(!cliId){alert('Selecione o cliente');return;}
  const data=document.getElementById('rec-data').value;
  if(!data){alert('Data é obrigatória');return;}
  const rv=id=>document.getElementById(id)?.value?.trim()||null;
  const campos = {
    clienteId:cliId, dataReceita:data,
    medico:document.getElementById('rec-medico').value,
    corrige:document.querySelector('[name="rec-corrige"]:checked')?.value||'ambos',
    odEsf:rv('rec-od-esf'),odCil:rv('rec-od-cil'),odEixo:rv('rec-od-eixo'),
    odAdi:rv('rec-od-adi'),odEsfPerto:rv('rec-od-esf-perto'),
    odDnp:rv('rec-od-dnp'),odAlt:rv('rec-od-alt'),odBase:rv('rec-od-base'),odDesc:rv('rec-od-desc'),
    odPrisma:document.getElementById('rec-od-prisma')?.checked||false,
    oeEsf:rv('rec-oe-esf'),oeCil:rv('rec-oe-cil'),oeEixo:rv('rec-oe-eixo'),
    oeAdi:rv('rec-oe-adi'),oeEsfPerto:rv('rec-oe-esf-perto'),
    oeDnp:rv('rec-oe-dnp'),oeAlt:rv('rec-oe-alt'),oeBase:rv('rec-oe-base'),oeDesc:rv('rec-oe-desc'),
    oePrisma:document.getElementById('rec-oe-prisma')?.checked||false,
    obs:document.getElementById('rec-obs').value,
  };
  if (_editingRecId) {
    // Atualiza receita existente sem criar nova
    const existing = (DB.receitas||[]).find(x => x.id === _editingRecId);
    if (existing) Object.assign(existing, campos);
    _editingRecId = null;
  } else {
    // Nova receita: desmarca isAtual das anteriores
    DB.receitas.forEach(r=>{if(r.clienteId===cliId)r.isAtual=false;});
    DB.receitas.push({id:uid(), ...campos, isAtual:true, createdAt:new Date().toISOString()});
  }
  save();closeModal('modal-receita');renderReceitas();toast('Receita salva!');
  populateSelects();
}

// ── PEDIDO ITENS ──
function addItemPedido(item={}){
  pedidoItensCount++;
  const idx=pedidoItensCount;
  const div=document.createElement('div');
  div.id=`item-${idx}`;
  div.style.cssText='display:grid;grid-template-columns:2fr 64px 86px 58px 28px;gap:8px;align-items:start;margin-bottom:10px;position:relative';
  div.innerHTML=`
    <div style="position:relative">
      <div style="display:flex;gap:4px;margin-bottom:4px">
        <button type="button" class="item-tipo-btn active" data-idx="${idx}" data-tipo="" onclick="setTipoItem(${idx},'',this)" style="flex:1;padding:4px 2px;font-size:10px;border-radius:5px;border:1px solid #2A3560;background:#1a2240;color:var(--muted);cursor:pointer;transition:.15s">Todos</button>
        <button type="button" class="item-tipo-btn" data-idx="${idx}" data-tipo="lente" onclick="setTipoItem(${idx},'lente',this)" style="flex:1;padding:4px 2px;font-size:10px;border-radius:5px;border:1px solid #2A3560;background:#1a2240;color:var(--muted);cursor:pointer;transition:.15s">🔬 Lentes</button>
        <button type="button" class="item-tipo-btn" data-idx="${idx}" data-tipo="armacao" onclick="setTipoItem(${idx},'armacao',this)" style="flex:1;padding:4px 2px;font-size:10px;border-radius:5px;border:1px solid #2A3560;background:#1a2240;color:var(--muted);cursor:pointer;transition:.15s">👓 Armações</button>
        <button type="button" class="item-tipo-btn" data-idx="${idx}" data-tipo="acessorio" onclick="setTipoItem(${idx},'acessorio',this)" style="flex:1;padding:4px 2px;font-size:10px;border-radius:5px;border:1px solid #2A3560;background:#1a2240;color:var(--muted);cursor:pointer;transition:.15s">✨ Acessórios</button>
      </div>
      <input class="form-input item-prod-search" id="item-search-${idx}" autocomplete="off"
        placeholder="🔍 Buscar produto…"
        oninput="filtrarProdutos(${idx})"
        onfocus="mostrarDropdownProd(${idx})"
        onblur="_sairModoEditarNome(${idx})"
        onkeydown="navDropdown(event,${idx})">
      <input type="hidden" id="item-prod-${idx}" value="">
      <input type="hidden" id="item-tipo-${idx}" value="">
      <input type="hidden" id="item-tabela-${idx}" value="">
      <div class="prod-dropdown" id="item-drop-${idx}"></div>
      <div id="item-edit-nome-${idx}" style="display:none;font-size:10px;color:var(--gold);cursor:pointer;margin-top:3px;user-select:none" onclick="editarNomeItem(${idx})">✏️ editar nome</div>
    </div>
    <div>
      <input class="form-input" id="item-qtd-${idx}" type="number" min="1" value="1" placeholder="Qtd"
        oninput="calcTotal()" style="text-align:center">
    </div>
    <div>
      <input class="form-input" id="item-preco-${idx}" type="number" step="0.01" min="0" placeholder="0,00"
        oninput="calcTotal();atualizarDescItem(${idx})" style="text-align:right">
      <div id="item-tabela-hint-${idx}" style="font-size:9px;color:var(--muted);margin-top:2px;text-align:right;min-height:13px"></div>
    </div>
    <div>
      <input class="form-input" id="item-desc-pct-${idx}" type="number" min="0" max="100" step="0.5"
        placeholder="%" disabled
        oninput="aplicarDescItem(${idx})"
        style="text-align:center;padding-left:4px;padding-right:4px">
      <div id="item-disc-badge-${idx}" style="font-size:10px;margin-top:2px;text-align:center;min-height:13px;font-weight:600"></div>
    </div>
    <div><button class="btn btn-danger btn-sm" onclick="document.getElementById('item-${idx}').remove();calcTotal()" style="padding:7px 9px;margin-top:1px">×</button></div>`;
  document.getElementById('ped-itens-list').appendChild(div);
  // Pré-preencher ao editar pedido existente
  if(item.prodId||item.desc){
    const prod=DB.produtos.find(p=>p.id===item.prodId);
    const nome=prod?prod.nome:(item.desc||'');
    document.getElementById(`item-search-${idx}`).value=item.desc||nome;
    document.getElementById(`item-prod-${idx}`).value=item.prodId||'';
    document.getElementById(`item-preco-${idx}`).value=item.preco||'';
    document.getElementById(`item-qtd-${idx}`).value=item.qtd||1;
    if(prod?.preco){
      document.getElementById(`item-tabela-${idx}`).value=prod.preco;
    }
    if(item.prodId){
      const editBtn=document.getElementById(`item-edit-nome-${idx}`);
      if(editBtn) editBtn.style.display='block';
    }
    atualizarDescItem(idx);
  }
  calcTotal();
}

// ── Seletor de produto com busca ────────────────────────────
function setTipoItem(idx, tipo, btn){
  // Atualiza botão ativo
  document.querySelectorAll(`.item-tipo-btn[data-idx="${idx}"]`).forEach(b=>{
    const active = b===btn;
    b.classList.toggle('active', active);
    b.style.background = active ? 'var(--gold)' : '#1a2240';
    b.style.color = active ? '#000' : 'var(--muted)';
    b.style.borderColor = active ? 'var(--gold)' : '#2A3560';
    b.style.fontWeight = active ? '700' : '400';
  });
  document.getElementById(`item-tipo-${idx}`).value = tipo;
  // Limpa busca e mostra dropdown filtrado
  document.getElementById(`item-search-${idx}`).value = '';
  document.getElementById(`item-prod-${idx}`).value = '';
  filtrarProdutos(idx);
  document.getElementById(`item-search-${idx}`).focus();
}

function _prodListaFiltrada(termo, idx){
  const t=(termo||'').toLowerCase().trim();
  const tipo = document.getElementById(`item-tipo-${idx}`)?.value || '';
  const todos=DB.produtos.filter(p=>
    p.ativo!==false && !p.deleted &&
    (!tipo || p.categoria===tipo)
  );
  if(!t) return todos;
  return todos.filter(p=>
    p.nome.toLowerCase().includes(t)||
    (p.subcategoria||'').toLowerCase().includes(t)||
    (p.descricao||'').toLowerCase().includes(t)
  );
}

function _buildDropdownHTML(idx, lista){
  if(!lista.length){
    const vazio=DB.produtos.filter(p=>p.ativo!==false&&!p.deleted).length===0;
    return vazio
      ? `<div style="padding:14px 12px;text-align:center">
           <div style="color:#fff;font-size:12px;margin-bottom:8px">📋 Catálogo vazio</div>
           <div style="color:var(--muted);font-size:11px;margin-bottom:10px">Importe a tabela do laboratório para liberar as lentes aqui</div>
           <button class="btn btn-gold btn-sm" onmousedown="closeModal('modal-pedido');nav('config');setCfgTab('tabelas',document.querySelector('[onclick*=tabelas]'))" style="font-size:11px">Ir para Tabelas Lab →</button>
         </div>`
      : '<div style="padding:12px;color:var(--muted);font-size:12px;text-align:center">Nenhum produto encontrado para essa busca</div>';
  }
  // Agrupar por lab → subcategoria (ou apenas categoria para produtos manuais)
  const grupos={};
  lista.forEach(p=>{
    const lab  = p.lab  ? p.lab.toUpperCase() : '';
    const sub  = p.subcategoria || p.categoria || 'Outros';
    const key  = lab ? `${lab} — ${sub}` : sub;
    if(!grupos[key]) grupos[key]=[];
    grupos[key].push(p);
  });
  let html='';
  Object.entries(grupos).forEach(([cat,prods])=>{
    html+=`<div class="prod-cat-header">${cat}</div>`;
    prods.forEach(p=>{
      const precoFmt=p.preco?Number(p.preco).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}):'';
      const preco=precoFmt?`<span style="font-size:11px;font-weight:600;color:var(--gold)">R$ ${precoFmt}</span>`:'';
      const espec=p.descricao?`<div style="font-size:10px;color:var(--muted);margin-top:1px">${p.descricao}</div>`:'';
      html+=`<div class="prod-option" data-idx="${idx}" data-id="${p.id}" data-nome="${p.nome.replace(/"/g,'&quot;')}" data-preco="${p.preco||0}"
        onmousedown="selecionarProd(${idx},'${p.id}',\`${p.nome.replace(/`/g,"'")}\`,${p.preco||0})">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
          <span style="font-size:12px;font-weight:500;color:#fff">${p.nome}</span>${preco}
        </div>${espec}
      </div>`;
    });
  });
  html+=`<div class="prod-avulso" onmousedown="selecionarAvulso(${idx})">✏️ Digitar item manualmente (avulso)</div>`;
  return html;
}

function mostrarDropdownProd(idx){
  if(_nomeItemEditando[idx]) return;
  const termo=document.getElementById(`item-search-${idx}`).value;
  const lista=_prodListaFiltrada(termo,idx);
  const drop=document.getElementById(`item-drop-${idx}`);
  if(!drop) return;
  drop.innerHTML=_buildDropdownHTML(idx,lista);
  drop.style.display='block';
}

function ocultarDropdownProd(idx){
  const drop=document.getElementById(`item-drop-${idx}`);
  if(drop) drop.style.display='none';
}

function filtrarProdutos(idx){
  if(_nomeItemEditando[idx]){calcTotal();return;}
  const editBtn=document.getElementById(`item-edit-nome-${idx}`);
  if(editBtn) editBtn.style.display='none';
  const termo=document.getElementById(`item-search-${idx}`).value;
  const lista=_prodListaFiltrada(termo,idx);
  const drop=document.getElementById(`item-drop-${idx}`);
  if(!drop) return;
  drop.innerHTML=_buildDropdownHTML(idx,lista);
  drop.style.display='block';
  // Limpa seleção anterior quando usuário edita o campo
  document.getElementById(`item-prod-${idx}`).value='';
  calcTotal();
}

function selecionarProd(idx,prodId,nome,preco){
  document.getElementById(`item-search-${idx}`).value=nome;
  document.getElementById(`item-prod-${idx}`).value=prodId;
  document.getElementById(`item-preco-${idx}`).value=preco||'';
  const tabelaEl=document.getElementById(`item-tabela-${idx}`);
  if(tabelaEl) tabelaEl.value=preco||'';
  ocultarDropdownProd(idx);
  const editBtn=document.getElementById(`item-edit-nome-${idx}`);
  if(editBtn) editBtn.style.display='block';
  atualizarDescItem(idx);
  calcTotal();
}

function selecionarAvulso(idx){
  document.getElementById(`item-prod-${idx}`).value='';
  document.getElementById(`item-preco-${idx}`).value='';
  document.getElementById(`item-search-${idx}`).value='';
  document.getElementById(`item-search-${idx}`).placeholder='Descrição do item…';
  _nomeItemEditando[idx]=false;
  const editBtn=document.getElementById(`item-edit-nome-${idx}`);
  if(editBtn) editBtn.style.display='none';
  // Limpa referência de tabela e indicadores
  const tabelaEl=document.getElementById(`item-tabela-${idx}`);
  if(tabelaEl) tabelaEl.value='';
  const descEl=document.getElementById(`item-desc-pct-${idx}`);
  if(descEl){descEl.value='';descEl.disabled=true;}
  const badgeEl=document.getElementById(`item-disc-badge-${idx}`);
  if(badgeEl) badgeEl.innerHTML='';
  const hintEl=document.getElementById(`item-tabela-hint-${idx}`);
  if(hintEl) hintEl.textContent='';
  ocultarDropdownProd(idx);
  document.getElementById(`item-search-${idx}`).focus();
}

function editarNomeItem(idx){
  _nomeItemEditando[idx]=true;
  const inp=document.getElementById(`item-search-${idx}`);
  if(!inp) return;
  ocultarDropdownProd(idx);
  inp.focus();
  inp.select();
  const editBtn=document.getElementById(`item-edit-nome-${idx}`);
  if(editBtn) editBtn.style.display='none';
}

function _sairModoEditarNome(idx){
  if(!_nomeItemEditando[idx]) return;
  setTimeout(()=>{
    _nomeItemEditando[idx]=false;
    const prodId=document.getElementById(`item-prod-${idx}`)?.value;
    const editBtn=document.getElementById(`item-edit-nome-${idx}`);
    if(editBtn) editBtn.style.display=prodId?'block':'none';
    ocultarDropdownProd(idx);
  },150);
}

// Navegação por teclado no dropdown (↑↓ Enter Esc)
function navDropdown(e,idx){
  const drop=document.getElementById(`item-drop-${idx}`);
  if(!drop||drop.style.display==='none'){
    if(e.key==='ArrowDown'||e.key==='Enter') mostrarDropdownProd(idx);
    return;
  }
  const opts=drop.querySelectorAll('.prod-option');
  const cur=drop.querySelector('.prod-option.active');
  if(e.key==='Escape'){ ocultarDropdownProd(idx); return; }
  if(e.key==='ArrowDown'){
    e.preventDefault();
    if(cur) cur.classList.remove('active');
    // Avança até o próximo .prod-option, pulando headers
    let next=cur?cur.nextElementSibling:opts[0];
    while(next&&!next.classList.contains('prod-option')) next=next.nextElementSibling;
    if(!next) next=opts[0]; // wrap around
    if(next){next.classList.add('active');next.scrollIntoView({block:'nearest'});}
  } else if(e.key==='ArrowUp'){
    e.preventDefault();
    if(cur) cur.classList.remove('active');
    // Recua até o .prod-option anterior, pulando headers
    let prev=cur?cur.previousElementSibling:opts[opts.length-1];
    while(prev&&!prev.classList.contains('prod-option')) prev=prev.previousElementSibling;
    if(!prev) prev=opts[opts.length-1]; // wrap around
    if(prev){prev.classList.add('active');prev.scrollIntoView({block:'nearest'});}
  } else if(e.key==='Enter'){
    e.preventDefault();
    if(cur) cur.dispatchEvent(new MouseEvent('mousedown'));
  }
}

// Fechar todos os dropdowns ao clicar fora
document.addEventListener('click',function(e){
  if(!e.target.closest('.prod-dropdown')&&!e.target.classList.contains('item-prod-search')){
    document.querySelectorAll('.prod-dropdown').forEach(d=>d.style.display='none');
  }
});

function getItens(){
  const items=[];
  document.querySelectorAll('[id^="item-search-"]').forEach(inp=>{
    const idx=inp.id.replace('item-search-','');
    const prodId=document.getElementById(`item-prod-${idx}`)?.value||'';
    const desc=inp.value.trim()||'Item avulso';
    const qtd=parseFloat(document.getElementById(`item-qtd-${idx}`)?.value)||1;
    const preco=parseFloat(document.getElementById(`item-preco-${idx}`)?.value)||0;
    if(preco>0||desc.length>1) items.push({prodId:prodId||null,desc,qtd,preco,sub:qtd*preco});
  });
  return items;
}
function calcTotal(){
  const itens=getItens();
  const sub=itens.reduce((s,i)=>s+i.sub,0);
  const desc=parseFloat(document.getElementById('ped-desconto').value)||0;
  const descValor=sub*desc/100;
  const total=sub-descValor;
  document.getElementById('ped-subtotal').textContent=fmtMoney(sub);
  document.getElementById('ped-total').textContent=fmtMoney(total);
  // Exibe valor do desconto geral e economia
  const descValorEl=document.getElementById('ped-desconto-valor');
  const descEconEl=document.getElementById('ped-desconto-economia');
  if(descValorEl) descValorEl.textContent=desc>0?`− ${fmtMoney(descValor)}`:'';
  if(descEconEl)  descEconEl.textContent=desc>0?`Economia de ${desc}% no pedido`:'';
}

// ── INDICADORES DE DESCONTO POR ITEM ─────────────────────────
// Chamada quando o preço é alterado manualmente → atualiza o campo %
function atualizarDescItem(idx){
  const tabela  = parseFloat(document.getElementById(`item-tabela-${idx}`)?.value)||0;
  const preco   = parseFloat(document.getElementById(`item-preco-${idx}`)?.value)||0;
  const descEl  = document.getElementById(`item-desc-pct-${idx}`);
  const badgeEl = document.getElementById(`item-disc-badge-${idx}`);
  const hintEl  = document.getElementById(`item-tabela-hint-${idx}`);
  if(!descEl) return;

  if(!tabela){
    descEl.value=''; descEl.disabled=true;
    if(badgeEl) badgeEl.innerHTML='';
    if(hintEl)  hintEl.textContent='';
    return;
  }

  descEl.disabled=false;
  if(hintEl) hintEl.textContent=`tabela ${fmtMoney(tabela)}`;

  if(!preco){ if(badgeEl) badgeEl.innerHTML=''; return; }

  const pct=((tabela-preco)/tabela*100);
  // Atualiza campo % sem disparar seu próprio oninput
  descEl.value=pct>0?pct.toFixed(1):'0';

  if(badgeEl){
    if(Math.abs(pct)<0.05){
      badgeEl.innerHTML='<span style="color:var(--green)">✓ tabela</span>';
    } else if(pct>0){
      badgeEl.innerHTML=`<span style="color:#e07070">↓ ${pct.toFixed(1)}%</span>`;
    } else {
      badgeEl.innerHTML=`<span style="color:var(--gold)">↑ ${Math.abs(pct).toFixed(1)}%</span>`;
    }
  }
}

// Chamada quando o % de desconto é digitado manualmente → atualiza o preço
function aplicarDescItem(idx){
  const tabela=parseFloat(document.getElementById(`item-tabela-${idx}`)?.value)||0;
  if(!tabela) return;
  const pct   =parseFloat(document.getElementById(`item-desc-pct-${idx}`)?.value)||0;
  const preco =parseFloat((tabela*(1-pct/100)).toFixed(2));
  const precoEl=document.getElementById(`item-preco-${idx}`);
  if(precoEl) precoEl.value=preco;
  const badgeEl=document.getElementById(`item-disc-badge-${idx}`);
  if(badgeEl){
    if(pct<0.05){
      badgeEl.innerHTML='<span style="color:var(--green)">✓ tabela</span>';
    } else {
      badgeEl.innerHTML=`<span style="color:#e07070">↓ ${pct.toFixed(1)}%</span>`;
    }
  }
  calcTotal();
}

// ── PEDIDO RECEITA SELECT ──
function onPedClienteChange(){
  const cliId=document.getElementById('ped-cliente').value;
  const recs=DB.receitas.filter(r=>!r.deleted&&r.clienteId===cliId).sort((a,b)=>(b.dataReceita||'').localeCompare(a.dataReceita||''));
  const sel=document.getElementById('ped-receita');
  sel.innerHTML='<option value="">— sem receita vinculada —</option>'+recs.map(r=>`<option value="${r.id}" ${r.isAtual?'selected':''}>Receita de ${fmtDate(r.dataReceita)}${r.medico?' — '+r.medico:''}</option>`).join('');
  // auto-select receita atual e sugere lentes
  const atual=recs.find(r=>r.isAtual);
  renderSugestaoLentes(atual?atual.id:'');
}

function renderSugestaoLentes(receitaId){
  const panel=document.getElementById('ped-sugestao-lentes');
  if(!panel)return;
  if(!receitaId){panel.style.display='none';panel.innerHTML='';return;}
  const receita=DB.receitas.find(r=>r.id===receitaId);
  if(!receita){panel.style.display='none';return;}
  const lentes=(DB.produtos||[]).filter(p=>!p.deleted&&p.ativo!==false&&p.categoria==='lente');
  if(!lentes.length){panel.style.display='none';return;}
  const temAdicao=receita.odAdi!=null||receita.oeAdi!=null;
  const maxEsf=Math.max(Math.abs(receita.odEsf||0),Math.abs(receita.oeEsf||0));
  const maxCil=Math.max(Math.abs(receita.odCil||0),Math.abs(receita.oeCil||0));
  function scoreLente(p){
    const txt=((p.subcategoria||'')+' '+(p.nome||'')).toUpperCase();
    let s=0;
    if(temAdicao){
      if(txt.includes('PROGRESS')||txt.includes('MULTIFOCAL'))s+=10;
      else if(txt.includes('BIFOCAL'))s+=6;
      else if(txt.includes('OCUP')||txt.includes('INTER'))s+=4;
      else if(txt.includes('SIMPLES')||txt.includes('MONOFOCAL')||txt.includes('ACABADA'))s-=5;
    }else{
      if(txt.includes('SIMPLES')||txt.includes('MONOFOCAL')||txt.includes('ACABADA')||txt.includes('SEMI'))s+=10;
      else if(txt.includes('DIGITAL')&&!txt.includes('PROGRESS'))s+=6;
      else if(txt.includes('PROGRESS')||txt.includes('MULTIFOCAL'))s-=5;
    }
    if(maxEsf>=4.0||maxCil>=2.0){
      if(txt.includes('1.74')||txt.includes('174'))s+=4;
      else if(txt.includes('1.67')||txt.includes('167'))s+=3;
    }else if(maxEsf>=2.0||maxCil>=1.0){
      if(txt.includes('1.67')||txt.includes('167'))s+=2;
    }
    return s;
  }
  const ranked=lentes.map(p=>({p,s:scoreLente(p)})).filter(x=>x.s>0).sort((a,b)=>b.s-a.s).slice(0,8).map(x=>x.p);
  if(!ranked.length){panel.style.display='none';return;}
  const grupos={};
  ranked.forEach(p=>{const k=p.subcategoria||'Outros';if(!grupos[k])grupos[k]=[];grupos[k].push(p);});
  const tipoLabel=temAdicao?'progressiva / multifocal':'visão simples';
  const adi=temAdicao?` + adi. ${fmt(Math.max(receita.odAdi||0,receita.oeAdi||0))}`:'';
  const prescInfo=`OD ${fmtGrau(receita.odEsf,receita.odCil,receita.odEixo)} / OE ${fmtGrau(receita.oeEsf,receita.oeCil,receita.oeEixo)}${adi}`;
  panel.style.display='block';
  panel.innerHTML=`<div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--rad);padding:10px 12px;margin:6px 0 4px">
    <div style="font-size:11px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:4px">
      <span style="font-weight:600;color:var(--text)">Sugestão de lentes</span>
      <span style="color:var(--muted);font-size:10px">${tipoLabel} — ${prescInfo}</span>
    </div>
    ${Object.entries(grupos).map(([sub,prods])=>`
      <div style="font-size:10px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.04em;margin:6px 0 3px">${sub}</div>
      ${prods.map(p=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:5px 8px;background:var(--surface);border-radius:6px;margin-bottom:3px;cursor:pointer;border:1px solid transparent;transition:border-color .15s"
        onmouseover="this.style.borderColor='var(--gold)'" onmouseout="this.style.borderColor='transparent'"
        onclick="adicionarSugestao('${p.id}')">
        <div><span style="font-size:12px;font-weight:500;color:var(--text)">${p.nome}</span>${p.lab?`<span style="font-size:10px;color:var(--muted);margin-left:6px">${p.lab}</span>`:''}</div>
        <span style="font-size:12px;font-family:var(--font-display);font-weight:600;color:var(--gold-deep);white-space:nowrap">${fmtMoney(p.preco)}</span>
      </div>`).join('')}
    `).join('')}
  </div>`;
}

function adicionarSugestao(prodId){
  const prod=DB.produtos.find(p=>p.id===prodId);
  if(!prod)return;
  addItemPedido({prodId:prod.id,desc:prod.nome,preco:prod.preco,qtd:1});
}

// ── SALVAR PEDIDO ──
function salvarPedido(){
  const cliId=document.getElementById('ped-cliente').value;
  if(!cliId){alert('Selecione o cliente');return;}
  const novoStatus=document.getElementById('ped-status').value;
  let motivoPerda=null;
  if(novoStatus==='perdido'){
    const motivo=document.getElementById('ped-motivo').value;
    if(!motivo){alert('Selecione o motivo da perda.');return;}
    if(motivo==='Outro'&&!document.getElementById('ped-motivo-outro').value.trim()){alert('Especifique o motivo.');return;}
    motivoPerda=motivo==='Outro'?document.getElementById('ped-motivo-outro').value.trim():motivo;
  }
  const itens=getItens();
  const sub=itens.reduce((s,i)=>s+i.sub,0);
  const desc=parseFloat(document.getElementById('ped-desconto').value)||0;
  const total=sub*(1-desc/100);
  const existId=document.getElementById('ped-id').value;
  const isNew=!existId;
  const obj={
    id:existId||uid(),numero:isNew?nextNumero():(DB.pedidos.find(p=>p.id===existId)||{}).numero,
    clienteId:cliId,receitaId:document.getElementById('ped-receita').value||null,
    vendedorId:document.getElementById('ped-vendedor').value,
    status:novoStatus,motivoPerda,
    itens,subtotal:sub,desconto:desc,total,
    pagamento:document.getElementById('ped-pgto').value,
    parcelas:document.getElementById('ped-parcelas').value,
    prevLab:document.getElementById('ped-prev-lab').value,
    obs:document.getElementById('ped-obs').value,
    updatedAt:new Date().toISOString()
  };
  if(novoStatus==='entregue'&&!(DB.pedidos.find(p=>p.id===existId)||{}).dataEntrega)obj.dataEntrega=new Date().toISOString();
  if(isNew){obj.createdAt=new Date().toISOString();DB.pedidos.push(obj)}
  else{const i=DB.pedidos.findIndex(p=>p.id===existId);if(i>=0)DB.pedidos[i]=Object.assign(DB.pedidos[i],obj)}
  save();closeModal('modal-pedido');
  renderPedidos();renderPipeline();renderDashboard();renderFinanceiro();renderRelatorios();updateNavCounts();
  toast(`Pedido #${obj.numero} salvo!`);
}

// ── EDITAR PEDIDO ──
function editarPedido(id){
  const p=DB.pedidos.find(x=>x.id===id);if(!p)return;
  openModal('modal-pedido');
  document.getElementById('modal-ped-title').textContent=`Editar Pedido #${p.numero}`;
  document.getElementById('ped-id').value=p.id;
  document.getElementById('ped-status').value=p.status;
  const selMotivoPed=document.getElementById('ped-motivo');
  selMotivoPed.innerHTML='<option value="">— Selecione —</option>'+MOTIVOS_PERDA.map(m=>`<option value="${m}">${m}</option>`).join('');
  selMotivoPed.value=p.motivoPerda&&MOTIVOS_PERDA.includes(p.motivoPerda)?p.motivoPerda:(p.motivoPerda?'Outro':'');
  document.getElementById('ped-motivo-outro').value=p.motivoPerda&&!MOTIVOS_PERDA.includes(p.motivoPerda)?p.motivoPerda:'';
  _toggleMotivoPerdaPed();
  _toggleMotivoOutroPed();
  document.getElementById('ped-pgto').value=p.pagamento||'';
  document.getElementById('ped-parcelas').value=p.parcelas||'1';
  document.getElementById('ped-obs').value=p.obs||'';
  document.getElementById('ped-prev-lab').value=p.prevLab||'';
  document.getElementById('ped-desconto').value=p.desconto||0;
  populateSelects();
  setTimeout(()=>{
    document.getElementById('ped-cliente').value=p.clienteId;
    document.getElementById('ped-vendedor').value=p.vendedorId||'';
    onPedClienteChange();
    setTimeout(()=>{
      document.getElementById('ped-receita').value=p.receitaId||'';
      renderSugestaoLentes(p.receitaId||'');
    },50);
    (p.itens||[]).forEach(i=>addItemPedido({prodId:i.prodId,desc:i.desc||i.descricao||'',preco:i.preco,qtd:i.qtd}));
    calcTotal();
  },50);
}

// ── STATUS PEDIDO ──
function abrirStatus(id){
  const p=DB.pedidos.find(x=>x.id===id);if(!p)return;
  document.getElementById('st-ped-id').value=id;
  document.getElementById('st-novo').value=p.status;
  const selMotivo=document.getElementById('st-motivo');
  selMotivo.innerHTML='<option value="">— Selecione —</option>'+MOTIVOS_PERDA.map(m=>`<option value="${m}">${m}</option>`).join('');
  selMotivo.value=p.motivoPerda&&MOTIVOS_PERDA.includes(p.motivoPerda)?p.motivoPerda:(p.motivoPerda?'Outro':'');
  document.getElementById('st-motivo-outro').value=p.motivoPerda&&!MOTIVOS_PERDA.includes(p.motivoPerda)?p.motivoPerda:'';
  document.getElementById('st-obs').value='';
  _toggleMotivoPerda();
  _toggleMotivoOutro();
  openModal('modal-status');
}
function _toggleMotivoPerda(){
  const wrap=document.getElementById('st-motivo-wrap');
  wrap.style.display=document.getElementById('st-novo').value==='perdido'?'block':'none';
}
function _toggleMotivoOutro(){
  const wrap=document.getElementById('st-motivo-outro-wrap');
  wrap.style.display=document.getElementById('st-motivo').value==='Outro'?'block':'none';
}
function _toggleMotivoPerdaPed(){
  const wrap=document.getElementById('ped-motivo-wrap');
  if(!wrap)return;
  wrap.style.display=document.getElementById('ped-status').value==='perdido'?'block':'none';
}
function _toggleMotivoOutroPed(){
  const wrap=document.getElementById('ped-motivo-outro-wrap');
  if(!wrap)return;
  wrap.style.display=document.getElementById('ped-motivo').value==='Outro'?'block':'none';
}
function confirmarStatus(){
  const id=document.getElementById('st-ped-id').value;
  const novoStatus=document.getElementById('st-novo').value;
  if(novoStatus==='perdido'){
    const motivo=document.getElementById('st-motivo').value;
    if(!motivo){alert('Selecione o motivo da perda.');return;}
    if(motivo==='Outro'&&!document.getElementById('st-motivo-outro').value.trim()){alert('Especifique o motivo.');return;}
  }
  const i=DB.pedidos.findIndex(p=>p.id===id);
  if(i>=0){
    const statusAnterior=DB.pedidos[i].status;
    DB.pedidos[i].status=novoStatus;
    DB.pedidos[i].updatedAt=new Date().toISOString();
    if(novoStatus==='entregue')DB.pedidos[i].dataEntrega=new Date().toISOString();
    if(novoStatus==='perdido'){
      const motivo=document.getElementById('st-motivo').value;
      DB.pedidos[i].motivoPerda=motivo==='Outro'?document.getElementById('st-motivo-outro').value.trim():motivo;
    } else {
      DB.pedidos[i].motivoPerda=null;
    }
    if(novoStatus!==statusAnterior){
      if(!DB.pedidos[i].statusHistory)DB.pedidos[i].statusHistory=[];
      DB.pedidos[i].statusHistory.push({
        status:novoStatus,data:new Date().toISOString().slice(0,10),
        usuarioNome:window.currentUser?.nome||'—',
        obs:document.getElementById('st-obs')?.value||''
      });
    }
  }
  save();closeModal('modal-status');
  renderPipeline();renderPedidos();renderDashboard();renderFinanceiro();renderRelatorios();updateNavCounts();
  toast('Status atualizado!');
  // Oferecer WA quando pedido fica pronto
  if(novoStatus==='pronto'&&i>=0){
    const ped=DB.pedidos[i];
    const cli=DB.clientes.find(c=>c.id===ped.clienteId);
    if(cli&&cli.telefone){
      setTimeout(()=>abrirWA(cli.id,'pronto'),400);
    }
  }
}
function excluirPedido(id){
  if(!confirm('Excluir este pedido?'))return;
  const i=DB.pedidos.findIndex(p=>p.id===id);
  if(i>=0)DB.pedidos[i].deleted=true;
  save();renderPedidos();renderPipeline();renderDashboard();updateNavCounts();toast('Pedido removido.');
}

// ── PRODUTO CATÁLOGO ──
function salvarProduto(){
  const nome=document.getElementById('prod-nome').value.trim();
  const preco=parseFloat(document.getElementById('prod-preco').value);
  if(!nome||isNaN(preco)){alert('Nome e preço são obrigatórios');return;}
  const cat=document.getElementById('prod-cat').value;
  const existId=document.getElementById('prod-id').value;
  const obj={
    id:existId||uid(),categoria:cat,nome,codigo:document.getElementById('prod-codigo').value,
    preco,ativo:true,updatedAt:new Date().toISOString()
  };
  if(cat==='lente'){
    obj.subcategoria=document.getElementById('prod-sub').value;
    obj.material=document.getElementById('prod-material').value;
    obj.tratamento=document.getElementById('prod-trat').value;
    const esEl=document.getElementById('prod-estoque-lente');
    if(esEl)obj.estoque=parseInt(esEl.value)||0;
    const esMinEl=document.getElementById('prod-estoque-min-lente');
    if(esMinEl&&esMinEl.value!=='')obj.estoqueMinimo=parseInt(esMinEl.value)||0;
  }
  if(cat==='armacao'){
    const estoqueEl=document.getElementById('prod-estoque');
    if(estoqueEl)obj.estoque=parseInt(estoqueEl.value)||0;
    const esMinEl=document.getElementById('prod-estoque-min');
    if(esMinEl&&esMinEl.value!=='')obj.estoqueMinimo=parseInt(esMinEl.value)||0;
  }
  if(existId){const i=DB.produtos.findIndex(p=>p.id===existId);if(i>=0)DB.produtos[i]=Object.assign(DB.produtos[i],obj)}
  else{obj.createdAt=new Date().toISOString();DB.produtos.push(obj)}
  save();closeModal('modal-produto');renderCatalogo();populateSelects();toast('Produto salvo!');
}
function editarProduto(id){
  const p=DB.produtos.find(x=>x.id===id);if(!p)return;
  openModal('modal-produto',{cat:p.categoria});
  document.getElementById('prod-id').value=p.id;
  document.getElementById('prod-nome').value=p.nome;
  document.getElementById('prod-codigo').value=p.codigo||'';
  document.getElementById('prod-preco').value=p.preco;
  if(p.categoria==='lente'){
    document.getElementById('prod-sub').value=p.subcategoria||'';
    document.getElementById('prod-material').value=p.material||'';
    document.getElementById('prod-trat').value=p.tratamento||'';
    const esEl=document.getElementById('prod-estoque-lente');
    if(esEl)esEl.value=p.estoque!=null?p.estoque:0;
    const esMinEl=document.getElementById('prod-estoque-min-lente');
    if(esMinEl)esMinEl.value=p.estoqueMinimo!=null?p.estoqueMinimo:'';
  }
  if(p.categoria==='armacao'){
    const estoqueEl=document.getElementById('prod-estoque');
    if(estoqueEl)estoqueEl.value=p.estoque!=null?p.estoque:0;
    const esMinEl=document.getElementById('prod-estoque-min');
    if(esMinEl)esMinEl.value=p.estoqueMinimo!=null?p.estoqueMinimo:'';
  }
}
function toggleProduto(id){
  const i=DB.produtos.findIndex(p=>p.id===id);
  if(i>=0)DB.produtos[i].ativo=!DB.produtos[i].ativo;
  save();renderCatalogo();toast('Produto atualizado!');
}

// ── USUÁRIO — funções de modal ──
function _abrirModalUsuario(){
  const m=document.getElementById('modal-usuario');
  if(!m)return false;
  if(m.parentElement!==document.body)document.body.appendChild(m);
  m.classList.add('open');
  return true;
}

function abrirNovoUsuario(){
  document.getElementById('usr-id').value='';
  document.getElementById('usr-modal-title').textContent='Novo Usuário';
  document.getElementById('usr-pin-label').textContent='PIN (4 dígitos) *';
  document.getElementById('usr-pin-hint').textContent='';
  document.getElementById('usr-nome').value='';
  document.getElementById('usr-email').value='';
  document.getElementById('usr-perfil').value='vendedor';
  document.getElementById('usr-meta').value='';
  document.getElementById('usr-pin').value='';
  document.getElementById('usr-pin2').value='';
  _abrirModalUsuario();
}

function editarUsuario(id){
  const u=DB.usuarios.find(x=>x.id===id);
  if(!u){alert('Usuário "'+id+'" não encontrado.\nRecarregue a página com Ctrl+Shift+R e tente novamente.');return;}
  document.getElementById('usr-id').value=u.id;
  document.getElementById('usr-modal-title').textContent='Editar Usuário — '+u.nome;
  document.getElementById('usr-pin-label').textContent='Novo PIN (4 dígitos)';
  document.getElementById('usr-pin-hint').textContent='Deixe em branco para manter o PIN atual';
  document.getElementById('usr-nome').value=u.nome;
  document.getElementById('usr-email').value=u.email||'';
  document.getElementById('usr-perfil').value=u.perfil||'vendedor';
  document.getElementById('usr-meta').value=u.meta||'';
  const comissaoEl=document.getElementById('usr-comissao');if(comissaoEl)comissaoEl.value=u.comissao!=null?u.comissao:3;
  document.getElementById('usr-pin').value='';
  document.getElementById('usr-pin2').value='';
  _abrirModalUsuario();
}

function toggleUsuario(id){
  const i=DB.usuarios.findIndex(u=>u.id===id);
  if(i<0){toast('❌ Usuário não encontrado');return;}
  const usr=DB.usuarios[i];
  if(usr.perfil==='dono'&&usr.ativo!==false){
    if(DB.usuarios.filter(u=>u.perfil==='dono'&&u.ativo!==false).length<=1){
      toast('❌ Não é possível desativar o único Dono ativo');return;
    }
  }
  DB.usuarios[i].ativo=!(usr.ativo!==false);
  save();renderConfig();toast('Usuário '+(DB.usuarios[i].ativo?'ativado ✅':'desativado 🔴')+'!');
}

function deletarUsuario(id){
  const usr=DB.usuarios.find(u=>u.id===id);
  if(!usr){toast('❌ Usuário não encontrado');return;}
  if(usr.perfil==='dono'&&usr.ativo!==false){
    if(DB.usuarios.filter(u=>u.perfil==='dono'&&u.ativo!==false).length<=1){
      toast('❌ Não é possível excluir o único Dono ativo');return;
    }
  }
  if(usr.id===currentUser.id){toast('❌ Você não pode excluir o próprio usuário');return;}
  if(!confirm('Excluir "'+usr.nome+'" permanentemente?\n\nEsta ação não pode ser desfeita.'))return;
  confirmarDelUsuario(id);
}

async function confirmarDelUsuario(id){
  const usr=DB.usuarios.find(u=>u.id===id);
  const confirmRow=document.getElementById('confirm-del-'+id);
  if(confirmRow)confirmRow.remove();
  if(!usr)return;
  DB.usuarios=DB.usuarios.filter(u=>u.id!==id);
  try{const p=JSON.parse(localStorage.getItem('haw_pins')||'{}');delete p[usr.nome];delete p[usr.id];localStorage.setItem('haw_pins',JSON.stringify(p));}catch(e){}
  save();
  if(window.HAW_SB&&window.HAW_SB.isOnline()&&window.HAW_SB.client){
    try{await window.HAW_SB.client.from('usuarios').delete().eq('id',id);}catch(e){}
  }
  renderConfig();populateSelects();
  toast(`Usuário "${usr.nome}" excluído! ✅`);
}

async function testarConexao(){
  const liveEl=document.getElementById('sb-live-status');
  if(liveEl){liveEl.textContent='🔄 Testando conexão…';liveEl.style.color='var(--gold-deep)';}
  if(!window.HAW_SB||!window.HAW_SB.isOnline()){
    if(liveEl){liveEl.innerHTML='🔴 <strong>Offline</strong> — Supabase não conectado. Verifique as credenciais.';liveEl.style.color='var(--red)';}
    toast('❌ Supabase offline');return;
  }
  try{
    await window.HAW_SB.load();
    if(liveEl){liveEl.innerHTML='🟢 <strong>Conectado!</strong> Dados sincronizados com sucesso.';liveEl.style.color='var(--green)';}
    toast('✅ Supabase conectado e sincronizado!');
  }catch(e){
    if(liveEl){liveEl.innerHTML='🔴 <strong>Erro na conexão:</strong> '+e.message;liveEl.style.color='var(--red)';}
    toast('❌ Erro na conexão Supabase');
  }
}

function salvarUsuario(){
  const nome=document.getElementById('usr-nome').value.trim();
  const email=document.getElementById('usr-email').value.trim();
  const pin=document.getElementById('usr-pin').value.trim();
  const pin2=document.getElementById('usr-pin2').value.trim();
  const existId=document.getElementById('usr-id').value;
  if(!nome||!email){alert('Nome e email são obrigatórios');return;}
  if(existId){
    // Edição
    if(pin&&pin.length<4){alert('PIN deve ter 4 dígitos');return;}
    if(pin&&pin!==pin2){alert('PINs não coincidem');return;}
    const i=DB.usuarios.findIndex(u=>u.id===existId);
    if(i>=0){
      DB.usuarios[i].nome=nome;
      DB.usuarios[i].email=email;
      DB.usuarios[i].perfil=document.getElementById('usr-perfil').value;
      DB.usuarios[i].meta=parseFloat(document.getElementById('usr-meta').value)||0;
      const comEl=document.getElementById('usr-comissao');if(comEl)DB.usuarios[i].comissao=parseFloat(comEl.value)||0;
      if(pin){DB.usuarios[i].senha=pin;try{const p=JSON.parse(localStorage.getItem('haw_pins')||'{}');p[existId]=pin;p[nome]=pin;localStorage.setItem('haw_pins',JSON.stringify(p));}catch(e){}}
    }
    save();closeModal('modal-usuario');renderConfig();populateSelects();toast('Usuário atualizado! ✅');
  } else {
    // Novo
    if(!pin||pin.length<4){alert('PIN deve ter 4 dígitos');return;}
    if(pin!==pin2){alert('PINs não coincidem');return;}
    const novoId=(typeof crypto!=='undefined'&&crypto.randomUUID)?crypto.randomUUID():uid();
    const novoPerf=document.getElementById('usr-perfil').value;
    const novoMeta=parseFloat(document.getElementById('usr-meta').value)||0;
    const novaComissao=parseFloat(document.getElementById('usr-comissao')?.value)||3;
    const novoTs=new Date().toISOString();
    DB.usuarios.push({id:novoId,nome,email,perfil:novoPerf,meta:novoMeta,comissao:novaComissao,ativo:true,senha:pin,createdAt:novoTs});
    // Grava PIN em haw_pins para que doLogin() funcione mesmo sem sync Supabase
    try{const p=JSON.parse(localStorage.getItem('haw_pins')||'{}');p[novoId]=pin;p[nome]=pin;localStorage.setItem('haw_pins',JSON.stringify(p));}catch(e){}
    save();
    // Tenta sync imediato para Supabase (sempre tenta, independente do status offline)
    (async()=>{
      if(window.HAW_SB&&window.HAW_SB.client){
        try{
          const row={id:novoId,nome,email,perfil:novoPerf,meta_mensal:novoMeta,ativo:true,created_at:novoTs};
          const{error}=await window.HAW_SB.client.from('usuarios').upsert(row,{onConflict:'id'});
          if(error)throw error;
          toast('Usuário criado e sincronizado! ✅');
        }catch(e){
          console.warn('[HAW] Falha ao sincronizar novo usuário:', e);
          toast('Usuário criado localmente. ⚠️ Não sincronizou com o banco — ele só aparece neste dispositivo.');
        }
      } else {
        toast('Usuário criado! ✅');
      }
    })();
    closeModal('modal-usuario');renderConfig();populateSelects();populateLoginUsers();
  }
}
function salvarMetas(){
  DB.usuarios.forEach(u=>{
    const el=document.getElementById(`meta-${u.id}`);
    if(el)u.meta=parseFloat(el.value)||0;
  });
  save();toast('Metas salvas!');
}
function _aplicarNomeOtica(){
  const nome=(DB.settings&&DB.settings.empresa&&DB.settings.empresa.nome)||'';
  const el=document.getElementById('store-name-sb');
  if(el)el.textContent=nome&&nome!=='HAW Vision'?nome:'';
  if(nome&&nome!=='HAW Vision')document.title=nome+' · CRM';
}
function salvarEmpresa(){
  const emp=DB.settings.empresa||{};
  DB.settings.empresa={
    ...emp,
    nome:document.getElementById('emp-nome').value.trim()||'HAW Vision',
    cnpj:document.getElementById('emp-cnpj').value.trim(),
    telefone:document.getElementById('emp-tel').value.trim(),
    validade:parseInt(document.getElementById('emp-validade').value)||15,
    cidade:document.getElementById('emp-cidade').value.trim()||'Belém',
    estado:document.getElementById('emp-estado').value.trim().toUpperCase()||'PA',
  };
  save();
  _aplicarNomeOtica();
  toast('Dados da empresa salvos!');
}

function salvarSupabase(){
  DB.settings.supabaseUrl=document.getElementById('cfg-sb-url').value.trim();
  DB.settings.supabaseKey=document.getElementById('cfg-sb-key').value.trim();
  save();
  document.getElementById('sb-status').textContent='✅ Configuração salva (recarregue para conectar)';
  toast('Configuração Supabase salva!');
}

// ── GERAR PDF ORÇAMENTO ──
function _buildPDFHtml(pedido, cli){
  const itens = pedido.itens || [];
  const sub = itens.reduce((s,i)=>s+(i.sub||((i.qtd||1)*(i.preco||0))),0);
  const desc = pedido.desconto||0;
  const total = pedido.total || sub*(1-desc/100);
  const pagMap = {dinheiro:'Dinheiro',cartao_credito:'Cartão de Crédito',cartao_debito:'Cartão de Débito',pix:'PIX',cheque:'Cheque',financiado:'Financiado',outro:'Outro'};
  const pagLabel = pagMap[pedido.pagamento]||pedido.pagamento||'—';
  const hoje = new Date().toLocaleDateString('pt-BR');
  const emp = (DB.settings&&DB.settings.empresa)||{nome:'HAW Vision',cnpj:'32.139.400/0001-79',telefone:'(91) 99801-9092',cidade:'Belém',estado:'PA',validade:15};
  const validade = new Date(Date.now()+(emp.validade||15)*86400000).toLocaleDateString('pt-BR');
  const numPed = pedido.numero || (pedido.id ? pedido.id.toString().slice(-6).toUpperCase() : '------');

  return `<div style="font-family:'Segoe UI',Arial,sans-serif;width:794px;margin:0;padding:0;background:#fff;color:#222;box-sizing:border-box">

    <!-- HEADER navy -->
    <div style="background:#13182C;padding:32px 48px 28px;display:flex;align-items:center;justify-content:space-between">
      <div>
        <img src="logo.png" style="height:60px;display:block" alt="HAW Vision">
      </div>
      <div style="text-align:right">
        <div style="background:#F7CF13;color:#13182C;font-size:10px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;padding:4px 14px;border-radius:20px;display:inline-block;margin-bottom:10px">Orçamento</div>
        <div style="color:#fff;font-size:22px;font-weight:700;letter-spacing:1px">#${numPed}</div>
        <div style="color:rgba(255,255,255,.5);font-size:11px;margin-top:4px">Emitido: ${hoje}</div>
        <div style="color:rgba(255,255,255,.5);font-size:11px">Válido até: ${validade}</div>
      </div>
    </div>

    <!-- YELLOW STRIPE -->
    <div style="background:#F7CF13;height:4px"></div>

    <!-- BODY -->
    <div style="padding:40px 48px">

      <!-- CLIENTE CARD -->
      <div style="background:#f7f8fa;border-left:4px solid #F7CF13;border-radius:0 8px 8px 0;padding:20px 24px;margin-bottom:32px;display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <div style="font-size:10px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#888;margin-bottom:6px">Cliente</div>
          <div style="font-size:20px;font-weight:700;color:#13182C">${cli.nome}</div>
          ${cli.telefone?`<div style="font-size:12px;color:#666;margin-top:4px">📱 ${cli.telefone}</div>`:''}
          ${cli.email?`<div style="font-size:12px;color:#666;margin-top:2px">✉️ ${cli.email}</div>`:''}
        </div>
        <div style="text-align:right">
          <div style="font-size:10px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#888;margin-bottom:6px">Pagamento</div>
          <div style="font-size:13px;font-weight:600;color:#13182C">${pagLabel}</div>
          ${pedido.prevLab?`<div style="font-size:11px;color:#888;margin-top:4px">Previsão lab: ${fmtDate(pedido.prevLab)}</div>`:''}
        </div>
      </div>

      <!-- ITENS TABLE -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <thead>
          <tr style="background:#13182C">
            <th style="padding:12px 16px;text-align:left;font-size:10px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:#F7CF13">Descrição</th>
            <th style="padding:12px 8px;text-align:center;font-size:10px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:#F7CF13;width:50px">Qtd</th>
            <th style="padding:12px 16px;text-align:right;font-size:10px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:#F7CF13;width:110px">Unit.</th>
            <th style="padding:12px 16px;text-align:right;font-size:10px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:#F7CF13;width:120px">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${itens.map((it,i)=>`<tr style="background:${i%2===0?'#fff':'#f7f8fa'};border-bottom:1px solid #eee">
            <td style="padding:13px 16px;font-size:13px;color:#222">${it.desc||it.descricao||'Item'}</td>
            <td style="padding:13px 8px;text-align:center;font-size:13px;color:#555">${it.qtd||1}</td>
            <td style="padding:13px 16px;text-align:right;font-size:13px;color:#555">${fmtMoney(it.preco||0)}</td>
            <td style="padding:13px 16px;text-align:right;font-size:13px;font-weight:600;color:#13182C">${fmtMoney(it.sub||(it.qtd||1)*(it.preco||0))}</td>
          </tr>`).join('')}
        </tbody>
      </table>

      <!-- TOTALS -->
      <div style="display:flex;justify-content:flex-end;margin-bottom:40px">
        <div style="min-width:260px">
          ${desc>0?`
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee;font-size:13px;color:#666">
            <span>Subtotal</span><span>${fmtMoney(sub)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee;font-size:13px;color:#e05">
            <span>Desconto (${desc}%)</span><span>− ${fmtMoney(sub*desc/100)}</span>
          </div>`:''}
          <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;background:#13182C;border-radius:8px;margin-top:8px">
            <span style="font-size:13px;font-weight:600;color:#F7CF13;letter-spacing:.08em;text-transform:uppercase">Total</span>
            <span style="font-size:26px;font-weight:700;color:#F7CF13">${fmtMoney(total)}</span>
          </div>
        </div>
      </div>

      <!-- OBS -->
      ${pedido.obs?`<div style="background:#fffbea;border:1px solid #F7CF13;border-radius:8px;padding:16px 20px;margin-bottom:32px;font-size:12px;color:#555"><strong style="color:#13182C">Observações:</strong> ${pedido.obs}</div>`:''}

      <!-- INFO BOX -->
      <div style="display:flex;gap:16px;margin-bottom:0">
        <div style="flex:1;background:#f7f8fa;border-radius:8px;padding:16px;font-size:11px;color:#666;line-height:1.7">
          <div style="font-weight:700;color:#13182C;margin-bottom:6px">Condições</div>
          <div>• Este orçamento é válido por 15 dias</div>
          <div>• Prazo de entrega conforme acordado</div>
          <div>• Sujeito à disponibilidade em estoque</div>
        </div>
        <div style="flex:1;background:#f7f8fa;border-radius:8px;padding:16px;font-size:11px;color:#666;line-height:1.7">
          <div style="font-weight:700;color:#13182C;margin-bottom:6px">Contato</div>
          <div style="font-weight:600;color:#222">${emp.nome}</div>
          <div>${emp.cidade} – ${emp.estado}</div>
          <div>${emp.telefone}</div>
          <div style="margin-top:4px;color:#13182C;font-weight:600">Obrigado pela preferência! 🙏</div>
        </div>
      </div>

    </div>

    <!-- FOOTER -->
    <div style="background:#13182C;padding:16px 48px">
      <div style="background:#F7CF13;height:2px;border-radius:1px;margin-bottom:14px"></div>
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div>
          <div style="color:#fff;font-size:11px;font-weight:700;letter-spacing:.05em">${emp.nome}</div>
          <div style="color:rgba(255,255,255,.5);font-size:10px;margin-top:2px">CNPJ: ${emp.cnpj} · ${emp.telefone} · ${emp.cidade}, ${emp.estado}</div>
        </div>
        <div style="color:rgba(255,255,255,.4);font-size:10px">Orçamento #${numPed}</div>
      </div>
    </div>

  </div>`;
}

function gerarPDF(){
  const cliId=document.getElementById('ped-cliente').value;
  const cli=DB.clientes.find(c=>c.id===cliId)||{nome:'Cliente'};
  const itens=getItens();
  const sub=itens.reduce((s,i)=>s+i.sub,0);
  const descPct=parseFloat(document.getElementById('ped-desconto').value)||0;
  const total=sub*(1-descPct/100);
  const existId=document.getElementById('ped-id').value||null;
  const existPed=existId?DB.pedidos.find(p=>p.id===existId):null;
  const pedFake={
    itens, desconto:descPct, total,
    pagamento:document.getElementById('ped-pgto')?.value||'',
    prevLab:document.getElementById('ped-prev-lab')?.value||'',
    obs:document.getElementById('ped-obs')?.value||'',
    id:existId,
    numero:existPed?.numero||null,
  };
  _downloadPDF(pedFake, cli);
}

function _downloadPDF(pedido, cli){
  const htmlStr=_buildPDFHtml(pedido,cli);
  const fname=`Orcamento_HAW_${(cli.nome||'Cliente').replace(/\s+/g,'_')}.pdf`;
  html2pdf().set({
    margin:0,
    filename:fname,
    html2canvas:{scale:2,useCORS:true,logging:false,allowTaint:true,backgroundColor:'#ffffff'},
    jsPDF:{unit:'mm',format:'a4',orientation:'portrait'}
  }).from(htmlStr,'string').save().then(()=>{
    // WhatsApp share option
    if(cli.telefone){
      const tel=cli.telefone.replace(/\D/g,'');
      const msg=encodeURIComponent(`Olá ${cli.nome.split(' ')[0]}! Segue o orçamento da HAW Vision. Qualquer dúvida estamos à disposição 😊`);
      const waUrl=`https://wa.me/55${tel}?text=${msg}`;
      if(confirm('PDF gerado! Deseja enviar mensagem ao cliente via WhatsApp?')){
        window.open(waUrl,'_blank');
      }
    }
  });
}

// ── TOAST ──
// ══════════ WHATSAPP ══════════
let _waClienteId=null;
const WA_TEMPLATES=[
  {key:'generico',   label:'Saudação geral',    emoji:'👋', fn:n=>`Olá ${n}! Aqui é a HAW Vision 👓 Podemos te ajudar em algo?`},
  {key:'pronto',     label:'Pedido pronto',      emoji:'🎉', fn:n=>`Olá ${n}! Seu pedido na HAW Vision está pronto para retirada! Pode vir buscar no horário de atendimento 😊`},
  {key:'crediario',  label:'Parcela vencida',    emoji:'💰', fn:n=>`Olá ${n}! Identificamos uma parcela do seu crediário em atraso na HAW Vision. Entre em contato para regularizar 🙏`},
  {key:'retorno',    label:'Lembrete de retorno',emoji:'📅', fn:n=>`Olá ${n}! Faz algum tempo desde sua última visita à HAW Vision 🕶️ Temos novidades esperando por você!`},
  {key:'orcamento',  label:'Envio de orçamento', emoji:'📋', fn:n=>`Olá ${n}! Preparamos um orçamento especial para você na HAW Vision. Posso te enviar os detalhes?`},
];
function abrirWA(clienteId, tipoSugerido){
  const c=DB.clientes.find(x=>x.id===clienteId);
  if(!c){toast('Cliente não encontrado.');return;}
  if(!c.telefone){toast('Cliente sem telefone cadastrado.');return;}
  _waClienteId=clienteId;
  const nome=c.nome.split(' ')[0];
  document.getElementById('wamsg-title').textContent=`📱 WhatsApp — ${c.nome}`;
  document.getElementById('wamsg-cliente-info').textContent=`📞 ${c.telefone}`;
  // Auto-detectar contexto se não informado
  let autoTipo=tipoSugerido||'generico';
  if(!tipoSugerido){
    const temPronto=DB.pedidos.some(p=>!p.deleted&&p.clienteId===clienteId&&p.status==='pronto');
    const hoje=new Date().toISOString().slice(0,10);
    const temAtrasado=(DB.crediarios||[]).filter(cr=>!cr.deleted&&cr.clienteId===clienteId).some(cr=>(cr.parcelas||[]).some(p=>!p.pago&&p.vencimento&&p.vencimento<hoje));
    if(temPronto)autoTipo='pronto';
    else if(temAtrasado)autoTipo='crediario';
  }
  // Renderizar botões de template
  const wrap=document.getElementById('wamsg-templates');
  wrap.innerHTML=WA_TEMPLATES.map(t=>`<button onclick="selecionarTemplatWA('${t.key}')" id="wa-tpl-${t.key}" style="text-align:left;padding:8px 12px;border-radius:6px;border:2px solid ${t.key===autoTipo?'var(--gold)':'var(--border-light)'};background:${t.key===autoTipo?'var(--gold-l,#fff9e0)':'var(--white)'};cursor:pointer;font-size:12px;font-family:inherit;color:var(--black)">${t.emoji} ${t.label}</button>`).join('');
  document.getElementById('wamsg-texto').value=WA_TEMPLATES.find(t=>t.key===autoTipo).fn(nome);
  openModal('modal-wamsg');
}
function selecionarTemplatWA(key){
  const c=DB.clientes.find(x=>x.id===_waClienteId);
  if(!c)return;
  const nome=c.nome.split(' ')[0];
  WA_TEMPLATES.forEach(t=>{
    const btn=document.getElementById(`wa-tpl-${t.key}`);
    if(btn){btn.style.borderColor=t.key===key?'var(--gold)':'var(--border-light)';btn.style.background=t.key===key?'var(--gold-l,#fff9e0)':'var(--white)';}
  });
  document.getElementById('wamsg-texto').value=WA_TEMPLATES.find(t=>t.key===key).fn(nome);
}
function enviarWA(){
  const c=DB.clientes.find(x=>x.id===_waClienteId);
  if(!c||!c.telefone){closeModal('modal-wamsg');toast('Sem telefone.');return;}
  const tel=c.telefone.replace(/\D/g,'');
  const msg=document.getElementById('wamsg-texto').value.trim();
  if(!msg){toast('Mensagem vazia.');return;}
  closeModal('modal-wamsg');
  window.open(`https://wa.me/55${tel}?text=${encodeURIComponent(msg)}`,'_blank');
}
window.abrirWA=abrirWA;window.selecionarTemplatWA=selecionarTemplatWA;window.enviarWA=enviarWA;

function toast(msg){
  let t=document.getElementById('toast-haw');
  if(!t){t=document.createElement('div');t.id='toast-haw';t.style.cssText='position:fixed;bottom:24px;right:24px;background:var(--black);color:var(--gold);padding:12px 20px;border-radius:8px;font-size:13px;font-weight:500;z-index:9999;border:1px solid var(--gold);opacity:0;transition:opacity .3s;box-shadow:0 8px 24px rgba(0,0,0,.3)';document.body.appendChild(t);}
  t.textContent=msg;t.style.opacity='1';
  clearTimeout(t._timer);t._timer=setTimeout(()=>t.style.opacity='0',2500);
}


// ══════════════════════════════════════════════
// RENDER FUNCTIONS
// ══════════════════════════════════════════════

// ── DASHBOARD ──
function renderDashboard(){
  const mes=new Date().toISOString().slice(0,7);
  const hoje=new Date().toISOString().slice(0,10);
  const peds=DB.pedidos.filter(p=>!p.deleted);
  const mesPeds=peds.filter(p=>p.createdAt&&p.createdAt.startsWith(mes));
  const entregues=peds.filter(p=>p.status==='entregue'||p.status==='pos_venda');
  const mesEntregues=mesPeds.filter(p=>p.status==='entregue'||p.status==='pos_venda');
  const fat=mesEntregues.reduce((s,p)=>s+Number(p.total||0),0);
  const ticket=mesEntregues.length?fat/mesEntregues.length:0;
  const aberto=peds.filter(p=>!['entregue','pos_venda','perdido'].includes(p.status)).length;
  const prontos=peds.filter(p=>p.status==='pronto').length;
  document.getElementById('d-fat').textContent=fmtMoney(fat);
  document.getElementById('d-fat-sub').textContent=mesEntregues.length+' pedidos fechados';
  document.getElementById('d-ticket').textContent=fmtMoney(ticket);
  document.getElementById('d-aberto').textContent=aberto;
  document.getElementById('d-prontos').textContent=prontos;

  // FATURAMENTO HOJE
  const hojeEntregues=peds.filter(p=>(p.status==='entregue'||p.status==='pos_venda')&&p.updatedAt&&p.updatedAt.startsWith(hoje));
  const fatHoje=hojeEntregues.reduce((s,p)=>s+Number(p.total||0),0);
  const elFH=document.getElementById('d-fat-hoje');
  const elFHSub=document.getElementById('d-fat-hoje-sub');
  if(elFH)elFH.textContent=fmtMoney(fatHoje);
  if(elFHSub)elFHSub.textContent=hojeEntregues.length+' pedido'+(hojeEntregues.length!==1?'s':'')+' hoje';

  // CREDIÁRIOS VENCIDOS
  const now=new Date();
  let parcelasVencidas=0;
  (DB.crediarios||[]).filter(c=>!c.deleted&&c.status!=='quitado').forEach(c=>{
    (c.parcelas||[]).forEach(p=>{if(!p.pago&&p.dataVenc&&new Date(p.dataVenc)<now)parcelasVencidas++;});
  });
  const elCV=document.getElementById('d-cred-vencidos');
  const elCVSub=document.getElementById('d-cred-vencidos-sub');
  if(elCV)elCV.textContent=parcelasVencidas;
  if(elCVSub)elCVSub.style.color=parcelasVencidas>0?'var(--red)':'var(--muted)';

  // ANIVERSARIANTES DO MÊS
  const mesAtual=now.getMonth();
  const diaAtual=now.getDate();
  const aniversar=DB.clientes.filter(c=>!c.deleted&&c.dataNasc).map(c=>{
    const pts=c.dataNasc.split('-');
    return{nome:c.nome,mes:parseInt(pts[1])-1,dia:parseInt(pts[2]),id:c.id};
  }).filter(a=>a.mes===mesAtual).sort((a,b)=>a.dia-b.dia);
  const elAnvCnt=document.getElementById('cnt-aniversar');
  if(elAnvCnt)elAnvCnt.textContent=aniversar.length;
  const elAnv=document.getElementById('aniversar-list');
  if(elAnv){
    if(aniversar.length){
      elAnv.innerHTML=aniversar.map(a=>{
        const isHoje=a.dia===diaAtual;
        const isBreve=a.dia>diaAtual&&a.dia-diaAtual<=7;
        const tag=isHoje?'<span class="badge badge-gold" style="font-size:10px;margin-left:6px">Hoje!</span>':isBreve?`<span class="badge badge-blue" style="font-size:10px;margin-left:6px">Em ${a.dia-diaAtual}d</span>`:'';
        return`<div class="alert-item">
          <div class="alert-dot ${isHoje?'gold':'blue'}"></div>
          <div><div class="alert-text">${a.nome}${tag}</div></div>
          <div class="alert-time">dia ${String(a.dia).padStart(2,'0')}</div>
        </div>`;
      }).join('');
    }else{
      elAnv.innerHTML='<div class="empty"><div class="empty-text">Nenhum aniversariante este mês</div></div>';
    }
  }

  // ALERTAS
  const alertas=[];
  // Aniversários de hoje nos alertas
  aniversar.filter(a=>a.dia===diaAtual).forEach(a=>{
    alertas.push({dot:'gold',text:`🎂 Aniversário — ${a.nome}`,sub:'Parabéns! Ótima hora para contato',time:'Hoje'});
  });
  peds.filter(p=>p.status==='pronto').sort((a,b)=>(a.updatedAt||'').localeCompare(b.updatedAt||'')).forEach(p=>{
    const cli=DB.clientes.find(c=>c.id===p.clienteId)||{nome:'?'};
    const dias=p.updatedAt?Math.floor((Date.now()-new Date(p.updatedAt))/86400000):0;
    const tempoStr=dias<=0?'Hoje':dias===1?'1 dia':`${dias} dias`;
    const dot=dias>=5?'red':dias>=2?'amber':'gold';
    alertas.push({dot,text:`Pedido #${p.numero} pronto`,sub:`${cli.nome} — aguardando há ${tempoStr}`,time:tempoStr});
  });
  // OS prontas aguardando retirada
  (DB.ordens||[]).filter(o=>!o.deleted&&(o.status||'em_producao')==='pronto').sort((a,b)=>(a.created_at||'').localeCompare(b.created_at||'')).forEach(o=>{
    const dias=o.created_at?Math.floor((Date.now()-new Date(o.created_at))/86400000):0;
    const tempoStr=dias<=0?'Hoje':dias===1?'1 dia':`${dias} dias`;
    const dot=dias>=5?'red':dias>=2?'amber':'gold';
    alertas.push({dot,text:`OS ${o.num} — Pronta`,sub:`${o.paciente||'—'} — aguardando há ${tempoStr}`,time:tempoStr});
  });
  peds.filter(p=>p.status==='em_laboratorio').forEach(p=>{
    const days=p.updatedAt?Math.floor((Date.now()-new Date(p.updatedAt))/86400000):0;
    if(days>10){const cli=DB.clientes.find(c=>c.id===p.clienteId)||{nome:'?'};alertas.push({dot:'red',text:`Pedido #${p.numero} — ${days} dias em lab`,sub:cli.nome,time:`${days}d`});}
  });
  // Crediários vencidos nos alertas
  (DB.crediarios||[]).filter(c=>!c.deleted&&c.status!=='quitado').forEach(c=>{
    const venc=(c.parcelas||[]).filter(p=>!p.pago&&p.dataVenc&&new Date(p.dataVenc)<now);
    if(venc.length){
      const oldest=venc.reduce((a,b)=>new Date(a.dataVenc)<new Date(b.dataVenc)?a:b);
      const dias=Math.floor((now-new Date(oldest.dataVenc))/86400000);
      alertas.push({dot:'red',text:`Crediário — ${c.clienteNome}`,sub:`${venc.length} parcela${venc.length>1?'s':''} vencida${venc.length>1?'s':''}`,time:`${dias}d`});
    }
  });
  // Estoque mínimo
  DB.produtos.filter(p=>!p.deleted&&p.ativo&&p.estoqueMinimo!=null&&p.estoque!=null&&p.estoque<=p.estoqueMinimo).forEach(p=>{
    const critico=p.estoque===0;
    alertas.push({dot:critico?'red':'amber',text:`Estoque baixo — ${p.nome}`,sub:critico?'Sem unidades em estoque':`${p.estoque} un. (mín: ${p.estoqueMinimo})`,time:`${p.estoque}un`});
  });
  // Receitas vencidas (>12 meses)
  DB.clientes.filter(c=>!c.deleted).forEach(c=>{
    const recAtual=(DB.receitas||[]).filter(r=>!r.deleted&&r.clienteId===c.id&&r.isAtual)[0];
    if(recAtual&&recAtual.dataReceita){
      const mesesRec=Math.floor((now-new Date(recAtual.dataReceita))/2592000000);
      if(mesesRec>=12)alertas.push({dot:'amber',text:`Receita vencida — ${c.nome}`,sub:`${mesesRec} meses desde a última receita`,time:`${mesesRec}m`});
    }
  });
  DB.clientes.filter(c=>!c.deleted).forEach(c=>{
    const ultPed=DB.pedidos.filter(p=>!p.deleted&&p.clienteId===c.id&&p.status==='entregue').sort((a,b)=>b.createdAt?.localeCompare(a.createdAt))[0];
    if(ultPed){
      const m=Math.floor((now-new Date(ultPed.createdAt))/2592000000);
      if(m>=11&&m<14)alertas.push({dot:'blue',text:`${c.nome} — retorno`,sub:`${m} meses sem comprar`,time:`${m}m`});
      else if(m>=3&&m<11)alertas.push({dot:'amber',text:`${c.nome} — reativação`,sub:`${m} meses sem comprar`,time:`${m}m`});
    }
  });
  document.getElementById('cnt-alertas').textContent=alertas.length;
  const al=document.getElementById('alert-list');
  if(alertas.length){al.innerHTML=alertas.map(a=>`<div class="alert-item"><div class="alert-dot ${a.dot}"></div><div><div class="alert-text">${a.text}</div><div class="alert-sub">${a.sub}</div></div><div class="alert-time">${a.time}</div></div>`).join('')}
  else{al.innerHTML='<div class="empty"><div class="empty-icon">✅</div><div class="empty-title">Tudo em dia!</div><div class="empty-text">Nenhum alerta</div></div>'}

  // RANKING
  const vendedores=DB.usuarios.filter(u=>['vendedor','gestor','dono'].includes(u.perfil));
  const vendRank=vendedores.map(v=>{
    const vPeds=entregues.filter(p=>p.vendedorId===v.id);
    const totalVend=vPeds.reduce((s,p)=>s+Number(p.total||0),0);
    const com=v.comissao!=null?v.comissao:3;
    return{nome:v.nome,total:totalVend,qtd:vPeds.length,comissao:totalVend*com/100};
  }).sort((a,b)=>b.total-a.total);
  const maxV=vendRank[0]?.total||1;
  const posClass=['p1','p2','p3'];
  document.getElementById('ranking-list').innerHTML=vendRank.length?vendRank.map((v,i)=>`
    <div class="rank-item">
      <div class="rank-pos ${posClass[i]||''}">${i+1}</div>
      <div class="rank-bar-wrap">
        <div class="rank-name">${v.nome}</div>
        <div class="rank-bar"><div class="rank-fill" style="width:${Math.round(v.total/maxV*100)}%"></div></div>
      </div>
      <div style="text-align:right">
        <div class="rank-val">${fmtMoney(v.total)}</div>
        ${v.comissao>0?`<div style="font-size:10px;color:var(--muted)">Com.: ${fmtMoney(v.comissao)}</div>`:''}
      </div>
    </div>`).join(''):'<div class="empty" style="padding:24px"><div class="empty-text">Sem vendas registradas</div></div>';

  // META DO MÊS
  if(typeof renderMetaDashboard==='function')renderMetaDashboard();

  // CHART FATURAMENTO
  renderFatChart();

  // FUNIL
  const funnel=document.getElementById('funnel-grid');
  if(funnel){
    const colors=['#3D4F8A','#3A7A3A','#8A7A3A','#C9A84C','#3A6A8A','#3A8A8A','#8A3A8A','#8A3A3A','#7A2A2A'];
    funnel.innerHTML=PIPELINE_STAGES.map((s,i)=>{
      const cnt=peds.filter(p=>p.status===s.key).length;
      return`<div style="background:var(--white);border:1px solid var(--border-light);border-radius:var(--rad);padding:12px;text-align:center;border-top:3px solid ${colors[i]}">
        <div style="font-size:20px;font-weight:700;font-family:var(--font-display);color:${colors[i]}">${cnt}</div>
        <div style="font-size:10px;color:var(--muted);margin-top:2px">${s.label}</div>
      </div>`;
    }).join('');
  }
}

function renderFatChart(){
  const ctx=document.getElementById('chart-fat');if(!ctx)return;
  const months=[];const vals=[];
  for(let i=5;i>=0;i--){
    const d=new Date();d.setMonth(d.getMonth()-i);
    const m=d.toISOString().slice(0,7);
    const label=d.toLocaleDateString('pt-BR',{month:'short',year:'2-digit'});
    const v=DB.pedidos.filter(p=>!p.deleted&&p.status==='entregue'&&p.createdAt?.startsWith(m)).reduce((s,p)=>s+Number(p.total||0),0);
    months.push(label);vals.push(v);
  }
  if(chartFat)chartFat.destroy();
  chartFat=new Chart(ctx,{type:'bar',data:{labels:months,datasets:[{data:vals,backgroundColor:'rgba(247,207,19,.7)',borderColor:'rgba(247,207,19,1)',borderWidth:1,borderRadius:4}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,ticks:{callback:v=>'R$'+v.toLocaleString('pt-BR')}},x:{grid:{display:false}}}}});
}

// ── PIPELINE ──
function _flagPrevLab(prevLabIso){
  if(!prevLabIso) return '';
  const hoje=new Date();hoje.setHours(0,0,0,0);
  const prev=new Date(prevLabIso+'T00:00:00');
  const dias=Math.round((prev-hoje)/86400000);
  if(dias<0) return `<div class="pc-flag-lab" style="background:var(--red-l);color:var(--red)">⏰ Atrasado ${Math.abs(dias)}d</div>`;
  if(dias===0) return `<div class="pc-flag-lab" style="background:var(--amber-l);color:var(--amber)">⏰ Vence hoje</div>`;
  if(dias<=3) return `<div class="pc-flag-lab" style="background:var(--amber-l);color:var(--amber)">⏰ ${dias}d restantes</div>`;
  return `<div class="pc-flag-lab" style="background:var(--blue-l);color:var(--blue)">⏰ ${dias}d restantes</div>`;
}
function renderPipeline(filtroVendedor='todos'){
  const board=document.getElementById('pipeline-board');
  const peds=DB.pedidos.filter(p=>!p.deleted&&(filtroVendedor==='todos'||p.vendedorId===filtroVendedor));
  board.innerHTML=PIPELINE_STAGES.map(stage=>{
    const cards=peds.filter(p=>p.status===stage.key);
    return`<div class="pipeline-col ${stage.col}">
      <div class="pipeline-col-header">${stage.label}<span style="font-size:11px;opacity:.7">${cards.length}</span></div>
      <div class="pipeline-col-body">
        ${cards.length?cards.map(p=>{
          const cli=DB.clientes.find(c=>c.id===p.clienteId)||{nome:'?'};
          const dias=Math.floor((Date.now()-new Date(p.createdAt))/86400000);
          const primItem=(p.itens||[])[0];
          const flagLab=stage.key==='em_laboratorio'?_flagPrevLab(p.prevLab):'';
          const motivoTag=stage.key==='perdido'&&p.motivoPerda?`<div class="pc-flag-lab" style="background:var(--red-l);color:var(--red)">${p.motivoPerda}</div>`:'';
          return`<div class="pipeline-card" onclick="editarPedido('${p.id}')">
            <div class="pc-name">${cli.nome}</div>
            <div class="pc-produto">${primItem?primItem.desc:'Pedido #'+p.numero}</div>
            <div class="pc-meta"><span class="pc-valor">${fmtMoney(p.total)}</span><span class="pc-dias">${dias}d</span></div>
            ${flagLab}${motivoTag}
          </div>`;}).join(''):`<div style="text-align:center;padding:16px;font-size:11px;color:#555">Vazio</div>`}
        <button style="width:100%;background:transparent;border:1px dashed #333;color:#555;border-radius:var(--rad);padding:8px;font-size:11px;cursor:pointer;margin-top:4px" onclick="addParaStage('${stage.key}')">+ Novo</button>
      </div>
    </div>`;
  }).join('');
  // atualizar filtros vendedor
  const filters=document.getElementById('pipeline-filters');
  const vendedores=DB.usuarios.filter(u=>['vendedor','gestor','dono'].includes(u.perfil));
  filters.innerHTML=`<button class="fb ${filtroVendedor==='todos'?'active':''}" onclick="setPipelineVendedor('todos',this)">Todos</button>`
    +vendedores.map(v=>`<button class="fb ${filtroVendedor===v.id?'active':''}" onclick="setPipelineVendedor('${v.id}',this)">${v.nome.split(' ')[0]}</button>`).join('');
}
function addParaStage(status){
  openModal('modal-pedido');
  setTimeout(()=>{document.getElementById('ped-status').value=status;_toggleMotivoPerdaPed();},50);
}

// ── CLIENTES ──
function renderClientes(filtro='todos'){
  let clis=DB.clientes.filter(c=>!c.deleted);
  if(filtro==='ativo')clis=clis.filter(c=>c.status==='ativo');
  if(filtro==='retorno'){
    const now=new Date();
    clis=clis.filter(c=>{
      const ult=DB.pedidos.filter(p=>!p.deleted&&p.clienteId===c.id&&p.status==='entregue').sort((a,b)=>b.createdAt?.localeCompare(a.createdAt))[0];
      if(!ult)return false;
      const m=Math.floor((now-new Date(ult.createdAt))/2592000000);
      return m>=11;
    });
  }
  renderClientesData(clis);
  document.getElementById('cnt-cli-badge').textContent=clis.length;
}
function renderClientesData(clis){
  const tbody=document.getElementById('clientes-tbody');
  if(!clis.length){tbody.innerHTML=`<tr><td colspan="5"><div class="empty"><div class="empty-icon">👥</div><div class="empty-title">Nenhum cliente encontrado</div></div></td></tr>`;return;}
  const now=new Date();
  tbody.innerHTML=clis.map(c=>{
    const ultPed=DB.pedidos.filter(p=>!p.deleted&&p.clienteId===c.id).sort((a,b)=>b.createdAt?.localeCompare(a.createdAt))[0];
    const meses=ultPed?Math.floor((now-new Date(ultPed.createdAt))/2592000000):null;
    const retornoAlert=meses!=null&&meses>=11?`<span class="badge badge-amber" style="margin-left:4px">Retorno</span>`:'';
    return`<tr>
      <td style="font-weight:500">${c.nome}${retornoAlert}</td>
      <td>${c.telefone||'—'}</td>
      <td>${ultPed?fmtDate(ultPed.createdAt):'—'}</td>
      <td><span class="badge ${c.status==='ativo'?'badge-green':'badge-gray'}">${c.status||'ativo'}</span></td>
      <td>
        <button class="btn btn-ghost btn-sm" onclick="abrirCliente('${c.id}')">👤</button>
        ${c.telefone?`<button class="btn btn-sm btn-ghost" onclick="abrirWA('${c.id}')" title="WhatsApp" style="color:#25D366;border-color:#25D366">📱</button>`:''}
        <button class="btn btn-ghost btn-sm" onclick="editarCliente('${c.id}')">✏️</button>
        <button class="btn btn-ghost btn-sm" onclick="abrirPedidoParaCliente('${c.id}')">🛍️</button>
        <button class="btn btn-danger btn-sm" onclick="excluirCliente('${c.id}')">×</button>
      </td>
    </tr>`;
  }).join('');
}

// ── PEDIDOS ──
let _pedidosView=sessionStorage.getItem('ped_view')||'kanban';
function setPedidosView(mode){
  _pedidosView=mode;
  sessionStorage.setItem('ped_view',mode);
  const kb=document.getElementById('ped-kanban-wrap');
  const li=document.getElementById('ped-list-wrap');
  const lf=document.getElementById('ped-list-filters');
  const bkb=document.getElementById('ped-view-kb');
  const bli=document.getElementById('ped-view-li');
  if(kb)kb.style.display=mode==='kanban'?'block':'none';
  if(li)li.style.display=mode==='lista'?'block':'none';
  if(lf)lf.style.display=mode==='lista'?'flex':'none';
  if(bkb){bkb.classList.toggle('active',mode==='kanban');}
  if(bli){bli.classList.toggle('active',mode==='lista');}
  renderPedidos();
}
function renderPedidos(filtro='todos'){
  const all=DB.pedidos.filter(p=>!p.deleted);
  document.getElementById('cnt-ped-badge').textContent=all.length;
  if(_pedidosView==='kanban'){
    renderPedidosKanbanView(all);
  } else {
    let peds=all;
    if(filtro!=='todos')peds=peds.filter(p=>p.status===filtro);
    peds.sort((a,b)=>b.createdAt?.localeCompare(a.createdAt));
    renderPedidosData(peds);
  }
}
const _KAN_COLORS={
  lead:'#6B7FA3',atendimento:'#3A7ABA',proposta_enviada:'#8A6A3A',
  pedido_feito:'#2E7D52',em_laboratorio:'#3D4F8A',pronto:'#C4A200',
  entregue:'#2E7D52',pos_venda:'#3A8A7A',perdido:'#8B2E2E'
};
function renderPedidosKanbanView(peds){
  const board=document.getElementById('ped-kanban-board');
  if(!board)return;
  board.innerHTML=PIPELINE_STAGES.map(stage=>{
    const cards=peds.filter(p=>p.status===stage.key).sort((a,b)=>b.createdAt?.localeCompare(a.createdAt));
    const color=_KAN_COLORS[stage.key]||'#555';
    const cardHtml=cards.map(p=>{
      const cli=DB.clientes.find(c=>c.id===p.clienteId)||{nome:'?'};
      const dias=Math.floor((Date.now()-new Date(p.createdAt))/86400000);
      const primItem=(p.itens||[])[0];
      const flagLab=stage.key==='em_laboratorio'?_flagPrevLab(p.prevLab):'';
      const motivoTag=stage.key==='perdido'&&p.motivoPerda?`<div style="font-size:10px;color:var(--red);margin-top:4px;font-style:italic">↪ ${p.motivoPerda}</div>`:'';
      const diasCor=dias>14?'var(--red)':dias>7?'var(--amber)':'var(--muted)';
      return`<div class="ped-kcard" onclick="editarPedido('${p.id}')">
        <div style="font-size:12px;font-weight:700;color:var(--black);margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${cli.nome}</div>
        <div style="font-size:11px;color:var(--muted);margin-bottom:7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${primItem?primItem.desc:'Pedido #'+p.numero}</div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:12px;font-weight:800;font-family:var(--font-display);color:${color}">${fmtMoney(p.total)}</span>
          <span style="font-size:10px;font-weight:600;color:${diasCor}">${dias}d</span>
        </div>
        ${flagLab}${motivoTag}
      </div>`;
    }).join('');
    return`<div class="ped-kcol" style="--kc:${color}">
      <div class="ped-kcol-hd">
        <span>${stage.label}</span>
        <span class="ped-kcol-cnt">${cards.length}</span>
      </div>
      <div class="ped-kcol-body">
        ${cardHtml||`<div class="ped-kcol-empty">Vazio</div>`}
        <button class="ped-kcol-add" onclick="addParaStage('${stage.key}')">+ Novo</button>
      </div>
    </div>`;
  }).join('');
}
function renderPedidosData(peds){
  const tbody=document.getElementById('pedidos-tbody');
  if(!peds.length){tbody.innerHTML=`<tr><td colspan="6"><div class="empty"><div class="empty-icon">🛍️</div><div class="empty-title">Nenhum pedido</div></div></td></tr>`;return;}
  tbody.innerHTML=peds.map(p=>{
    const cli=DB.clientes.find(c=>c.id===p.clienteId)||{nome:'?'};
    const sb=STATUS_BADGE[p.status]||{cls:'badge-gray',label:p.status};
    const primItem=(p.itens||[])[0];
    return`<tr>
      <td style="font-weight:700;color:var(--gold-deep)">#${p.numero}</td>
      <td style="font-weight:500">${cli.nome}</td>
      <td style="overflow:hidden;text-overflow:ellipsis">${primItem?primItem.desc:'—'}</td>
      <td style="font-weight:700;font-family:var(--font-display)">${fmtMoney(p.total)}</td>
      <td><span class="badge ${sb.cls}">${sb.label}</span>${p.status==='perdido'&&p.motivoPerda?`<div style="font-size:10px;color:var(--muted);margin-top:2px">${p.motivoPerda}</div>`:''}</td>
      <td>
        <button class="btn btn-ghost btn-sm" onclick="editarPedido('${p.id}')">✏️</button>
        <button class="btn btn-ghost btn-sm" onclick="abrirStatus('${p.id}')">🔄</button>
        <button class="btn btn-ghost btn-sm" onclick="gerarPDFPedido('${p.id}')">📄</button>
        <button class="btn btn-ghost btn-sm" onclick="gerarLinkAprovacao('${p.id}')" title="Gerar link de aprovação de orçamento">🔗</button>
        <button class="btn btn-danger btn-sm" onclick="excluirPedido('${p.id}')">×</button>
      </td>
    </tr>`;
  }).join('');
}
function gerarPDFPedido(id){
  const p=DB.pedidos.find(x=>x.id===id);if(!p)return;
  const cli=DB.clientes.find(c=>c.id===p.clienteId)||{nome:'Cliente'};
  _downloadPDF(p,cli);
}

// ── RECEITAS ──
function renderReceitas(){
  const recs=DB.receitas.filter(r=>!r.deleted).sort((a,b)=>b.dataReceita?.localeCompare(a.dataReceita));
  document.getElementById('cnt-rec-badge').textContent=recs.length;
  const tbody=document.getElementById('receitas-tbody');
  if(!recs.length){tbody.innerHTML=`<tr><td colspan="6"><div class="empty"><div class="empty-icon">👁️</div><div class="empty-title">Nenhuma receita</div></div></td></tr>`;return;}
  tbody.innerHTML=recs.map(r=>{
    const cli=DB.clientes.find(c=>c.id===r.clienteId)||{nome:'?'};
    return`<tr>
      <td style="font-weight:500">${cli.nome}</td>
      <td>${fmtDate(r.dataReceita)}</td>
      <td>${fmtGrau(r.odEsf,r.odCil,r.odEixo)}</td>
      <td>${fmtGrau(r.oeEsf,r.oeCil,r.oeEixo)}</td>
      <td>${r.odAdi!=null?fmt(r.odAdi):'—'}</td>
      <td>${r.isAtual?'<span class="badge badge-green">Atual</span>':'<span class="badge badge-gray">Anterior</span>'}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-ghost btn-sm" onclick="editarReceita('${r.id}')" title="Editar">✏️</button>
        <button class="btn btn-ghost btn-sm" onclick="excluirReceita('${r.id}')" title="Excluir" style="color:var(--red)">🗑</button>
      </td>
    </tr>`;
  }).join('');
}
function fmtGrau(esf,cil,eixo){
  if(esf==null&&cil==null)return'—';
  return`${esf!=null?fmt(esf):'—'} / ${cil!=null?fmt(cil):'—'} / ${eixo!=null?eixo+'°':'—'}`;
}

// ── FINANCEIRO ──
function renderFinanceiro(){
  const mesEl=document.getElementById('fin-mes');
  if(mesEl&&!mesEl.value) mesEl.value=new Date().toISOString().slice(0,7);
  const mes=mesEl?.value||new Date().toISOString().slice(0,7);
  const peds=DB.pedidos.filter(p=>!p.deleted);
  const credPedidoIds=new Set((DB.crediarios||[]).filter(c=>c.status!=='cancelado'&&c.pedidoId).map(c=>c.pedidoId));
  const pedsSemCred=peds.filter(p=>!credPedidoIds.has(p.id));
  const entregues=pedsSemCred.filter(p=>['entregue','pos_venda'].includes(p.status));
  const recMes=entregues.filter(p=>(p.dataEntrega||p.createdAt)?.startsWith(mes));
  let rec=recMes.reduce((s,p)=>s+Number(p.total||0),0);
  let arec=pedsSemCred.filter(p=>!['entregue','pos_venda','perdido'].includes(p.status)).reduce((s,p)=>s+Number(p.total||0),0);
  const ticketBase=peds.filter(p=>['entregue','pos_venda'].includes(p.status)&&(p.dataEntrega||p.createdAt||'').startsWith(mes));
  const ticket=ticketBase.length?ticketBase.reduce((s,p)=>s+Number(p.total||0),0)/ticketBase.length:0;

  let credRecMes=0, credAReceber=0;
  const credLinhas=[];
  const FORMA_L={pix:'PIX',dinheiro:'Dinheiro',cartao_debito:'Débito',cartao_credito:'Crédito',transferencia:'Transf.',cheque:'Cheque'};
  (DB.crediarios||[]).forEach(c=>{
    if(c.status==='cancelado') return;
    if(c.entrada>0 && (c.createdAt||'').startsWith(mes)){
      credRecMes+=Number(c.entrada);
      credLinhas.push({cliente:c.clienteNome,desc:c.descricao||'—',parcela:'Entrada',data:(c.createdAt||'').slice(0,10),forma:'—',valor:Number(c.entrada)});
    }
    (c.parcelas||[]).forEach(p=>{
      if(p.pagamentos&&p.pagamentos.length){
        p.pagamentos.forEach(pg=>{
          if((pg.data||'').startsWith(mes)){
            credRecMes+=Number(pg.valor||0);
            credLinhas.push({cliente:c.clienteNome,desc:c.descricao||'—',parcela:p.numero+'ª',data:pg.data,forma:FORMA_L[pg.forma]||pg.forma||'—',valor:Number(pg.valor||0)});
          }
        });
      } else if((p.valorPago||0)>0 && (p.dataPagamento||'').startsWith(mes)){
        credRecMes+=Number(p.valorPago);
        credLinhas.push({cliente:c.clienteNome,desc:c.descricao||'—',parcela:p.numero+'ª',data:p.dataPagamento,forma:p.formaPagamento||'—',valor:Number(p.valorPago)});
      }
      credAReceber+=Math.max(0,p.valorOriginal-(p.valorPago||0));
    });
  });
  rec+=credRecMes; arec+=credAReceber;

  document.getElementById('fin-recebido').textContent=fmtMoney(rec);
  document.getElementById('fin-areceber').textContent=fmtMoney(arec);
  document.getElementById('fin-ticket').textContent=fmtMoney(ticket);

  const tbody=document.getElementById('fin-tbody');
  const pedsMes=peds.filter(p=>(p.dataEntrega||p.createdAt||'').startsWith(mes)).sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
  tbody.innerHTML=pedsMes.length?pedsMes.map(p=>{
    const cli=DB.clientes.find(c=>c.id===p.clienteId)||{nome:'?'};
    const sb=STATUS_BADGE[p.status]||{cls:'badge-gray',label:p.status};
    return`<tr><td style="font-weight:700;color:var(--gold-deep)">#${p.numero}</td><td>${cli.nome}</td><td>${fmtDate(p.createdAt)}</td><td style="font-weight:700">${fmtMoney(p.total)}</td><td>${p.pagamento||'—'}</td><td><span class="badge ${sb.cls}">${sb.label}</span></td></tr>`;
  }).join(''):'<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:24px">Nenhum pedido no período</td></tr>';

  const credTbody=document.getElementById('fin-cred-tbody');
  if(credTbody){
    credLinhas.sort((a,b)=>(a.data||'').localeCompare(b.data||''));
    credTbody.innerHTML=credLinhas.length?credLinhas.map(l=>`<tr>
      <td style="font-weight:500">${l.cliente}</td><td style="color:var(--muted);font-size:11px">${l.desc}</td>
      <td style="text-align:center">${l.parcela}</td><td>${fmtDate(l.data)}</td>
      <td>${l.forma}</td><td style="text-align:right;font-weight:600;color:var(--green)">${fmtMoney(l.valor)}</td>
    </tr>`).join(''):'<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:24px">Nenhum recebimento de crediário no período</td></tr>';
  }
}

// ── CATÁLOGO ──
function renderCatalogo(){
  ['armacao','acessorio'].forEach(cat=>{
    const id=cat==='armacao'?'cat-armacoes-tbody':'cat-acess-tbody';
    const prods=DB.produtos.filter(p=>!p.deleted&&p.categoria===cat);
    const cols=cat==='armacao'?6:4;
    document.getElementById(id).innerHTML=prods.length?prods.map(p=>{
      const estoqueBaixo=cat==='armacao'&&p.estoque!=null&&p.estoqueMinimo!=null&&p.estoque<=p.estoqueMinimo;
      return`<tr>
      <td><span style="font-weight:500">${p.nome}</span>${p.codigo?`<span style="margin-left:6px;font-size:10px;color:var(--muted)">${p.codigo}</span>`:''}</td>
      <td style="font-weight:700;color:var(--gold-deep)">${fmtMoney(p.preco)}</td>
      ${cat==='armacao'?`
        <td style="text-align:center;font-weight:600;color:${p.estoque>0?'var(--green)':'var(--red)'}">
          ${p.estoque!=null?`<span title="${estoqueBaixo?'⚠️ Abaixo do mínimo':''}">${estoqueBaixo?'⚠️ ':''}${p.estoque}</span>`:'—'}
          <button class="btn btn-ghost btn-sm" style="padding:2px 4px;margin-left:2px" onclick="abrirEntradaEstoque('${p.id}')" title="Entrada de estoque">+</button>
        </td>
        <td style="text-align:center;color:var(--muted)">${p.estoqueMinimo!=null?p.estoqueMinimo:'—'}</td>`:''}
      <td><span class="badge ${p.ativo?'badge-green':'badge-gray'}">${p.ativo?'Ativo':'Inativo'}</span></td>
      <td><button class="btn btn-ghost btn-sm" onclick="editarProduto('${p.id}')">✏️</button><button class="btn btn-ghost btn-sm" onclick="toggleProduto('${p.id}')">${p.ativo?'❌':'✅'}</button></td>
    </tr>`}).join(''):`<tr><td colspan="${cols}"><div class="empty" style="padding:20px"><div class="empty-text">Nenhum cadastrado</div></div></td></tr>`;
  });
  // Popula filtro de laboratório
  const labFiltroEl = document.getElementById('cat-lentes-lab-filter');
  const labsDisp = [...new Set((DB.produtos||[]).filter(p=>!p.deleted&&p.categoria==='lente'&&p.lab).map(p=>p.lab))].sort();
  if(labFiltroEl){
    const labSel = labFiltroEl.value;
    labFiltroEl.innerHTML = '<option value="">Todos os laboratórios</option>' +
      labsDisp.map(l=>`<option value="${l}"${l===labSel?' selected':''}>${l}</option>`).join('');
  }
  const labFiltro = labFiltroEl?.value || '';
  const lentes=DB.produtos.filter(p=>!p.deleted&&p.categoria==='lente'&&(!labFiltro||p.lab===labFiltro));
  document.getElementById('cat-lentes-tbody').innerHTML=lentes.length?lentes.map(p=>{
    const estoqueOk=p.estoque==null||p.estoqueMinimo==null||p.estoque>p.estoqueMinimo;
    const estoqueBaixo=p.estoque!=null&&p.estoqueMinimo!=null&&p.estoque<=p.estoqueMinimo;
    return`<tr>
    <td style="font-weight:500">${p.nome}${p.descricao?`<div style="font-size:10px;color:var(--muted)">${p.descricao}</div>`:''}</td>
    <td style="font-size:11px">${p.subcategoria||'—'}</td>
    <td style="font-size:11px;color:var(--gold)">${p.lab||'—'}</td>
    <td>${p.custo?fmtMoney(p.custo):'—'}</td>
    <td style="font-weight:700;color:var(--gold-deep)">${fmtMoney(p.preco)}</td>
    <td style="text-align:center;font-weight:600;color:${p.estoque>0?'var(--green)':p.estoque===0?'var(--red)':'var(--muted)'}">
      ${p.estoque!=null?`<span title="${estoqueBaixo?'⚠️ Abaixo do mínimo':''}">${estoqueBaixo?'⚠️ ':''}${p.estoque}</span>`:'—'}
      <button class="btn btn-ghost btn-sm" style="padding:2px 4px;margin-left:2px" onclick="abrirEntradaEstoque('${p.id}')" title="Entrada de estoque">+</button>
    </td>
    <td><span class="badge ${p.ativo!==false?'badge-green':'badge-gray'}">${p.ativo!==false?'Ativo':'Inativo'}</span></td>
    <td><button class="btn btn-ghost btn-sm" onclick="editarProduto('${p.id}')">✏️</button><button class="btn btn-ghost btn-sm" onclick="toggleProduto('${p.id}')">${p.ativo!==false?'❌':'✅'}</button></td>
  </tr>`;}).join(''):`<tr><td colspan="8"><div class="empty" style="padding:20px"><div class="empty-text">Nenhuma lente cadastrada</div></div></td></tr>`;
}

// ── RELATÓRIOS ──
function renderRelatorios(){
  const now=new Date();
  const relMesEl=document.getElementById('rel-mes');
  if(relMesEl&&!relMesEl.value)relMesEl.value=now.toISOString().slice(0,7);
  const mes=relMesEl?.value||now.toISOString().slice(0,7);
  const peds=DB.pedidos.filter(p=>!p.deleted);
  const mesPeds=peds.filter(p=>(p.dataEntrega||p.createdAt||'').startsWith(mes)&&['entregue','pos_venda'].includes(p.status));
  const fatMes=mesPeds.reduce((s,p)=>s+Number(p.total||0),0);
  const ticket=mesPeds.length?fatMes/mesPeds.length:0;
  const cliAtivos=DB.clientes.filter(c=>!c.deleted).length;
  // KPI cards
  const kpis=[
    {label:'Faturamento do Mês',val:fmtMoney(fatMes),icon:'💰',color:'var(--gold)'},
    {label:'Pedidos Entregues',val:mesPeds.length,icon:'📦',color:'var(--green)'},
    {label:'Ticket Médio',val:fmtMoney(ticket),icon:'🎯',color:'var(--blue)'},
    {label:'Clientes Ativos',val:cliAtivos,icon:'👤',color:'var(--gold-deep)'},
  ];
  const kpiEl=document.getElementById('rel-kpis');
  if(kpiEl)kpiEl.innerHTML=kpis.map(k=>`<div class="card" style="padding:20px">
    <div style="font-size:22px;margin-bottom:8px">${k.icon}</div>
    <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em">${k.label}</div>
    <div style="font-size:22px;font-weight:700;color:${k.color};margin-top:4px">${k.val}</div>
  </div>`).join('');
  // Produtos mais vendidos
  const prodMap={};
  peds.forEach(p=>(p.itens||[]).forEach(it=>{
    const key=it.desc||it.descricao||'Item';
    if(!prodMap[key])prodMap[key]={qtd:0,fat:0};
    prodMap[key].qtd+=it.qtd||1;
    prodMap[key].fat+=(it.sub||(it.qtd||1)*(it.preco||0));
  }));
  const top5=Object.entries(prodMap).sort((a,b)=>b[1].fat-a[1].fat).slice(0,5);
  const ptbody=document.getElementById('rel-produtos-tbody');
  if(ptbody)ptbody.innerHTML=top5.length?top5.map(([nome,d])=>`<tr>
    <td style="font-weight:500">${nome}</td>
    <td style="text-align:right">${d.qtd}</td>
    <td style="text-align:right;font-weight:600;color:var(--gold-deep)">${fmtMoney(d.fat)}</td>
  </tr>`).join(''):`<tr><td colspan="3"><div class="empty" style="padding:16px"><div class="empty-title">Nenhum produto vendido ainda</div></div></td></tr>`;
  // Clientes para contatar
  const retorno=DB.clientes.filter(c=>!c.deleted).map(c=>{
    const ult=DB.pedidos.filter(p=>!p.deleted&&p.clienteId===c.id&&p.status==='entregue').sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''))[0];
    if(!ult)return null;
    const m=Math.floor((now-new Date(ult.createdAt))/2592000000);
    if(m>=11)return{c,ult,m};
    return null;
  }).filter(Boolean).sort((a,b)=>b.m-a.m);
  const tbody=document.getElementById('rel-retorno-tbody');
  const emp=DB.settings.empresa||{};
  if(tbody)tbody.innerHTML=retorno.length?retorno.map(({c,ult,m})=>`<tr>
    <td style="font-weight:500">${c.nome}</td>
    <td>${fmtDate(ult.createdAt)}</td>
    <td><span class="badge ${m>=13?'badge-red':'badge-amber'}">${m} meses</span></td>
    <td>${c.telefone||'—'}</td>
    <td><a href="https://wa.me/55${(c.telefone||'').replace(/\D/g,'')}?text=${encodeURIComponent('Olá '+c.nome.split(' ')[0]+'! É a HAW Vision. Sua revisão anual está próxima! 👓')}" target="_blank" class="btn btn-ghost btn-sm">📱 WhatsApp</a></td>
  </tr>`).join(''):`<tr><td colspan="5"><div class="empty" style="padding:20px"><div class="empty-icon">✅</div><div class="empty-title">Nenhum cliente para contatar</div></div></td></tr>`;
}
function exportarRelatorioCSV(){
  const relMesEl=document.getElementById('rel-mes');
  const mes=relMesEl?.value||new Date().toISOString().slice(0,7);
  const peds=DB.pedidos.filter(p=>!p.deleted&&(p.dataEntrega||p.createdAt||'').startsWith(mes)&&['entregue','pos_venda'].includes(p.status));
  const rows=[['#Pedido','Cliente','Data','Forma Pgto','Total','Vendedor','Status']];
  peds.forEach(p=>{
    const cli=DB.clientes.find(c=>c.id===p.clienteId)||{nome:'?'};
    const vend=DB.usuarios.find(u=>u.id===p.vendedorId)||{nome:'—'};
    const sb=(STATUS_BADGE[p.status]||{label:p.status}).label;
    rows.push([`#${p.numero}`,cli.nome,(p.dataEntrega||p.createdAt||'').slice(0,10),p.pagamento||'—',Number(p.total||0).toFixed(2).replace('.',','),vend.nome,sb]);
  });
  // Crediários
  rows.push([]);rows.push(['--- CREDIÁRIOS ---']);
  rows.push(['Cliente','Descrição','Parcela','Data Pagamento','Forma','Valor']);
  (DB.crediarios||[]).forEach(c=>{
    if(c.status==='cancelado')return;
    (c.parcelas||[]).forEach(p=>{
      if(p.pagamentos&&p.pagamentos.length){
        p.pagamentos.filter(pg=>(pg.data||'').startsWith(mes)).forEach(pg=>{
          rows.push([c.clienteNome,c.descricao||'—',p.numero+'ª',pg.data,pg.forma||'—',Number(pg.valor||0).toFixed(2).replace('.',',')]);
        });
      } else if((p.valorPago||0)>0&&(p.dataPagamento||'').startsWith(mes)){
        rows.push([c.clienteNome,c.descricao||'—',p.numero+'ª',p.dataPagamento,p.formaPagamento||'—',Number(p.valorPago).toFixed(2).replace('.',',')]);
      }
    });
  });
  const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(';')).join('\n');
  const blob=new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=`relatorio-${mes}.csv`;a.click();
  URL.revokeObjectURL(url);
}
window.exportarRelatorioCSV=exportarRelatorioCSV;

function renderRelatorioCharts(){
  const peds=DB.pedidos.filter(p=>!p.deleted);
  // Faturamento últimos 6 meses
  const ctxFatM=document.getElementById('chart-fat-mensal');
  if(ctxFatM){
    if(chartFatMensal)chartFatMensal.destroy();
    const meses=[];const labels=[];
    for(let i=5;i>=0;i--){const d=new Date();d.setMonth(d.getMonth()-i);meses.push(d.toISOString().slice(0,7));labels.push(d.toLocaleDateString('pt-BR',{month:'short',year:'2-digit'}));}
    const vals=meses.map(m=>peds.filter(p=>p.createdAt&&p.createdAt.startsWith(m)&&['entregue','pos_venda'].includes(p.status)).reduce((s,p)=>s+Number(p.total||0),0));
    chartFatMensal=new Chart(ctxFatM,{type:'line',data:{labels,datasets:[{data:vals,borderColor:'#F7CF13',backgroundColor:'rgba(247,207,19,.12)',borderWidth:2,pointBackgroundColor:'#F7CF13',tension:.35,fill:true}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,ticks:{callback:v=>'R$'+v.toLocaleString('pt-BR')}}}}});
  }
  // Funil
  const ctxFunil=document.getElementById('chart-funil');
  if(ctxFunil){
    if(chartFunil)chartFunil.destroy();
    chartFunil=new Chart(ctxFunil,{type:'bar',data:{
      labels:PIPELINE_STAGES.map(s=>s.label),
      datasets:[{data:PIPELINE_STAGES.map(s=>peds.filter(p=>p.status===s.key).length),backgroundColor:'rgba(247,207,19,.6)',borderColor:'rgba(247,207,19,1)',borderWidth:1,borderRadius:4}]
    },options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{beginAtZero:true,ticks:{stepSize:1}}}}});
  }
  // Vendedor
  const ctxVend=document.getElementById('chart-vendedor');
  if(ctxVend){
    if(chartVendedor)chartVendedor.destroy();
    const vendedores=DB.usuarios.filter(u=>['vendedor','gestor','dono'].includes(u.perfil));
    const vals=vendedores.map(v=>DB.pedidos.filter(p=>!p.deleted&&p.vendedorId===v.id&&['entregue','pos_venda'].includes(p.status)).reduce((s,p)=>s+Number(p.total||0),0));
    chartVendedor=new Chart(ctxVend,{type:'doughnut',data:{
      labels:vendedores.map(v=>v.nome.split(' ')[0]),
      datasets:[{data:vals,backgroundColor:['rgba(247,207,19,.85)','rgba(46,125,82,.75)','rgba(46,92,139,.75)','rgba(139,109,46,.65)'],borderWidth:0}]
    },options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right'}}}});
  }
}

// ── CONFIG ──
function renderConfig(){
  // ── Usuários
  const tbody=document.getElementById('cfg-users-tbody');
  const perfBadge={vendedor:'badge-navy',gestor:'badge-blue',financeiro:'badge-green',dono:'badge-gold'};
  if(tbody){
    tbody.innerHTML='';
    DB.usuarios.forEach(function(u){
      const ini=u.nome.split(' ').map(function(x){return x[0];}).slice(0,2).join('').toUpperCase();
      const ativo=u.ativo!==false;
      const uid=u.id; // capturado no closure abaixo

      // ── linha info (innerHTML seguro pois não tem IDs nem handlers)
      const tr=document.createElement('tr');
      if(!ativo)tr.style.opacity='.55';
      tr.innerHTML=
        '<td><div style="display:flex;align-items:center;gap:10px">'+
          '<div style="width:32px;height:32px;border-radius:50%;background:var(--navy);color:var(--gold);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">'+ini+'</div>'+
          '<span style="font-weight:500">'+u.nome+'</span>'+
        '</div></td>'+
        '<td style="color:var(--muted);font-size:12px">'+(u.email||'—')+'</td>'+
        '<td><span class="badge '+(perfBadge[u.perfil]||'badge-gold')+'">'+u.perfil+'</span></td>'+
        '<td style="text-align:center;font-size:16px" title="'+(u.senha?'PIN configurado':'Sem PIN definido')+'">'+(u.senha?'🔐':'⚠️')+'</td>'+
        '<td style="font-size:12px">'+(u.meta?fmtMoney(u.meta)+'/mês':'—')+'</td>'+
        '<td style="text-align:center"><span class="badge '+(ativo?'badge-green':'badge-gray')+'">'+(ativo?'Ativo':'Inativo')+'</span></td>';

      // ── célula de ações — botões criados por DOM API com handlers diretos
      const tdAcoes=document.createElement('td');
      tdAcoes.style.cssText='text-align:center;white-space:nowrap;overflow:visible';

      const btnEdit=document.createElement('button');
      btnEdit.className='btn btn-ghost btn-sm';
      btnEdit.style.cssText='padding:4px 8px;margin-left:2px';
      btnEdit.title='Editar usuário';
      btnEdit.textContent='✏️';
      btnEdit.onclick=function(){ editarUsuario(uid); };

      const btnToggle=document.createElement('button');
      btnToggle.className='btn btn-ghost btn-sm';
      btnToggle.style.cssText='padding:4px 8px;margin-left:2px';
      btnToggle.title=ativo?'Desativar':'Ativar';
      btnToggle.textContent=ativo?'🔴':'🟢';
      btnToggle.onclick=function(){ toggleUsuario(uid); };

      const btnDel=document.createElement('button');
      btnDel.className='btn btn-ghost btn-sm';
      btnDel.style.cssText='padding:4px 8px;margin-left:2px;color:#e74c3c';
      btnDel.title='Excluir usuário';
      btnDel.textContent='🗑️';
      btnDel.onclick=function(){ deletarUsuario(uid); };

      tdAcoes.appendChild(btnEdit);
      tdAcoes.appendChild(btnToggle);
      tdAcoes.appendChild(btnDel);
      tr.appendChild(tdAcoes);
      tbody.appendChild(tr);
    });
  }

  // ── Metas
  const mf=document.getElementById('metas-form');
  const ml=document.getElementById('metas-mes-label');
  if(ml)ml.textContent=new Date().toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
  if(mf)mf.innerHTML=DB.usuarios.filter(u=>['vendedor','gestor','dono'].includes(u.perfil)&&u.ativo!==false).map(u=>`
    <div class="form-group">
      <label class="form-label">${u.nome} <span class="badge badge-gold" style="font-size:9px;vertical-align:middle">${u.perfil}</span></label>
      <input class="form-input" id="meta-${u.id}" type="number" value="${u.meta||0}" placeholder="Meta em R$">
    </div>`).join('');

  // ── Empresa
  const emp=DB.settings.empresa||{};
  const empNome=document.getElementById('emp-nome');if(empNome)empNome.value=emp.nome||'HAW Vision';
  const empCnpj=document.getElementById('emp-cnpj');if(empCnpj)empCnpj.value=emp.cnpj||'';
  const empTel=document.getElementById('emp-tel');if(empTel)empTel.value=emp.telefone||'';
  const empVal=document.getElementById('emp-validade');if(empVal)empVal.value=emp.validade||15;
  const empCid=document.getElementById('emp-cidade');if(empCid)empCid.value=emp.cidade||'Belém';
  const empEst=document.getElementById('emp-estado');if(empEst)empEst.value=emp.estado||'PA';

  // ── Tabelas Lab
  renderTabelasLab();

  // ── Supabase
  if(DB.settings.supabaseUrl){const el=document.getElementById('cfg-sb-url');if(el)el.value=DB.settings.supabaseUrl;}
  if(DB.settings.supabaseKey){const el=document.getElementById('cfg-sb-key');if(el)el.value=DB.settings.supabaseKey;}
  const liveEl=document.getElementById('sb-live-status');
  if(liveEl){
    const online=window.HAW_SB&&window.HAW_SB.isOnline();
    liveEl.innerHTML=online
      ?'🟢 <strong>Conectado ao Supabase</strong> — dados sincronizados em tempo real entre todos os computadores'
      :'🔴 <strong>Offline</strong> — os dados estão sendo salvos apenas localmente neste computador';
    liveEl.style.color=online?'var(--green)':'var(--red)';
  }
}

// ══════════════════════════════════════════════════════════════
// IMPORTADOR DE TABELA DE LABORATÓRIO
// ══════════════════════════════════════════════════════════════

// ── Dados do parse em progresso ──
let _labDados = null; // { lab, markup, produtos[] }

function abrirImportarLab(labPreFill) {
  _labDados = null;
  // reset step1
  const s1 = document.getElementById('import-lab-step1');
  const s2 = document.getElementById('import-lab-step2');
  if(s1) s1.style.display = '';
  if(s2) s2.style.display = 'none';
  const btnI = document.getElementById('btn-lab-importar');
  const btnV = document.getElementById('btn-lab-voltar');
  if(btnI) btnI.style.display = 'none';
  if(btnV) btnV.style.display = 'none';
  const st = document.getElementById('lab-parse-status');
  if(st) st.textContent = '';
  const inp = document.getElementById('lab-pdf-input');
  if(inp) inp.value = '';
  // Pré-preenche nome do lab se veio do botão "Atualizar"
  const labInp = document.getElementById('lab-nome');
  if(labInp && labPreFill) labInp.value = labPreFill;
  else if(labInp) labInp.value = '';
  openModal('modal-import-lab');
}

function labVoltarStep1() {
  document.getElementById('import-lab-step1').style.display = '';
  document.getElementById('import-lab-step2').style.display = 'none';
  document.getElementById('btn-lab-importar').style.display = 'none';
  document.getElementById('btn-lab-voltar').style.display = 'none';
}

function atualizarPreviewMarkup() {
  const v = parseFloat(document.getElementById('lab-markup').value) || 2.5;
  const pct = Math.round((v - 1) * 100);
  const desc = document.getElementById('lab-markup-desc');
  if(desc) desc.textContent = '= ' + pct + '% de margem';
}

// ── Extrai texto do PDF usando PDF.js ──
async function extrairTextoPDF(file) {
  if(typeof pdfjsLib === 'undefined') {
    throw new Error('PDF.js não carregou. Aguarde a página terminar de carregar e tente novamente.');
  }
  // Worker do mesmo CDN (legacy build inclui worker embutido como fallback)
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://unpkg.com/pdfjs-dist@3.11.174/legacy/build/pdf.worker.min.js';
  } catch(e) { /* ignora se já estiver definido */ }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const allRows = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();

    // Agrupar itens de texto pela posição Y (mesma linha)
    const byY = {};
    for (const item of content.items) {
      if (!item.str.trim()) continue;
      const y = Math.round(item.transform[5]);
      if (!byY[y]) byY[y] = [];
      byY[y].push({ x: item.transform[4], text: item.str.trim() });
    }

    // Ordenar de cima para baixo (Y decrescente), esquerda para direita (X crescente)
    const ys = Object.keys(byY).map(Number).sort((a, b) => b - a);
    for (const y of ys) {
      const sorted = byY[y].sort((a, b) => a.x - b.x);
      allRows.push(sorted.map(i => i.text));
    }
  }
  return allRows;
}

// ── Parser do formato Orfeu/laboratório ──
function parsearLinhasLab(linhas) {
  const produtos = [];
  let categoriaAtual = 'Geral';
  const rePreco = /R\$\s*[\d.,]+/;

  for (let i = 0; i < linhas.length; i++) {
    const col = linhas[i];
    // Juntar textos da mesma linha (PDF.js pode separar)
    const juntas = col.join(' ');
    const col0 = col[0] || '';
    const col1 = col[1] || col[2] || '';
    const col2 = col[2] || col[3] || '';
    const col3 = col[3] || col[4] || '';
    const col4 = col[4] || '';

    // Cabeçalho de seção: linha cujo segundo campo é "PREÇO" (texto, não valor)
    if ((col1 === 'PREÇO' || col2 === 'PREÇO') && !rePreco.test(col0)) {
      categoriaAtual = col0.replace(/^\s*[-–]\s*/, '').trim();
      continue;
    }

    // Detecta produto: começa com "- " e tem preço em R$
    if ((col0.startsWith('-') || col0.startsWith('–')) && rePreco.test(col1 || col2)) {
      const nome = col0.replace(/^[-–]\s*/, '').trim();

      // Linha seguinte pode ser especificação (ESF/CIL/ADD ou BASES)
      const proxLinha = (linhas[i + 1] || []).join(' ').trim();
      const eEspec = proxLinha.startsWith('(') || proxLinha.toUpperCase().startsWith('BASES');
      const especificacao = eEspec ? proxLinha : '';
      if (eEspec) i++; // consumir linha de especificação

      const precoLab  = _parsePreco(col1) || _parsePreco(col2);
      const precoSurf = _parsePreco(col2) || _parsePreco(col3);
      const precoMont = _parsePreco(col3) || _parsePreco(col4);

      // Tenta detectar quais colunas são PREÇO / SURFAÇADO / MONTADO
      // Convenção: se há 3 preços = bruto, surfaçado, montado; se 2 = bruto, montado
      const precos = [col1, col2, col3, col[4]].map(_parsePreco).filter(v => v !== null);

      produtos.push({
        id: uid(),
        nome,
        categoria: categoriaAtual,
        especificacao,
        precoLab:  precos[0] || 0,
        precoSurf: precos.length >= 3 ? precos[1] : null,
        precoMont: precos.length >= 3 ? precos[2] : (precos[1] || null),
        ativo: true,
      });
    }
  }
  return produtos;
}

function _parsePreco(str) {
  if (!str || !String(str).includes('R$')) return null;
  const n = parseFloat(String(str).replace(/R\$\s*/,'').replace(/\./g,'').replace(',','.').trim());
  return isNaN(n) ? null : n;
}

// ── Processar arquivo PDF selecionado ──
async function processarPDFLab(file) {
  if (!file) { toast('❌ Nenhum arquivo selecionado'); return; }
  // Aceita pdf mesmo que o MIME venha como octet-stream (ex: download via WhatsApp)
  const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!isPDF) { toast('❌ Selecione um arquivo PDF (.pdf)'); return; }
  const st = document.getElementById('lab-parse-status');
  if(st) { st.textContent = '⏳ Lendo PDF…'; st.style.color = 'var(--gold)'; }

  try {
    const linhas = await extrairTextoPDF(file);
    const produtos = parsearLinhasLab(linhas);

    if (!produtos.length) {
      if(st) { st.textContent = '❌ Nenhum produto encontrado. O PDF tem texto selecionável?'; st.style.color = 'var(--red)'; }
      return;
    }

    // Detectar nome do lab pelo nome do arquivo
    const labNomeAuto = file.name.replace(/\.pdf$/i,'').replace(/tabela[_\s]?/i,'').trim() || 'Laboratório';
    const labInp = document.getElementById('lab-nome');
    if(labInp && !labInp.value) labInp.value = labNomeAuto;
    const labFinal = (labInp?.value||'').trim() || labNomeAuto;
    if(!labFinal){
      if(st){ st.textContent='❌ Informe o nome do laboratório antes de importar.'; st.style.color='var(--red)'; }
      return;
    }

    const markup = parseFloat(document.getElementById('lab-markup').value) || 2.5;
    _labDados = { lab: labFinal, markup, produtos };

    if(st) { st.textContent = `✅ ${produtos.length} produtos encontrados — revise abaixo`; st.style.color = 'var(--green)'; }

    // Transição para step 2
    setTimeout(() => {
      document.getElementById('import-lab-step1').style.display = 'none';
      document.getElementById('import-lab-step2').style.display = '';
      document.getElementById('btn-lab-importar').style.display = '';
      document.getElementById('btn-lab-voltar').style.display = '';
      renderPreviewLab(produtos, markup);
    }, 600);

  } catch(e) {
    console.error('[HAW] Erro ao ler PDF:', e);
    if(st) { st.textContent = '❌ Erro ao ler PDF: ' + e.message; st.style.color = 'var(--red)'; }
  }
}

// ── Renderizar tabela de preview ──
function renderPreviewLab(produtos, markup) {
  const info = document.getElementById('lab-preview-info');
  const cnt  = document.getElementById('lab-preview-count');
  const inp2 = document.getElementById('lab-markup2');
  const d2   = document.getElementById('lab-markup2-desc');
  if(info) info.textContent = _labDados.lab || 'Tabela';
  if(cnt)  cnt.textContent  = produtos.length + ' produtos';
  if(inp2) inp2.value = markup;
  if(d2)   d2.textContent = '= ' + Math.round((markup-1)*100) + '% de margem';

  const tbody = document.getElementById('lab-preview-tbody');
  if(!tbody) return;

  // Agrupar por categoria para exibir separadores
  let catAtual = '';
  tbody.innerHTML = '';

  produtos.forEach((p, idx) => {
    if(p.categoria !== catAtual) {
      catAtual = p.categoria;
      const trCat = document.createElement('tr');
      trCat.innerHTML = `<td colspan="6" style="background:#1a2240;color:var(--gold);font-size:11px;font-weight:700;padding:6px 12px;text-transform:uppercase;letter-spacing:.5px">${catAtual}</td>`;
      tbody.appendChild(trCat);
    }
    const venda = (p.precoLab * markup).toFixed(2).replace('.',',');
    const custo = p.precoLab ? 'R$ ' + p.precoLab.toFixed(2).replace('.',',') : '—';
    const mont  = p.precoMont ? 'R$ ' + p.precoMont.toFixed(2).replace('.',',') : '—';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="text-align:center"><input type="checkbox" class="lab-sel" data-idx="${idx}" checked></td>
      <td>
        <div style="font-size:12px;font-weight:500">${p.nome}</div>
        ${p.especificacao ? `<div style="font-size:10px;color:var(--muted)">${p.especificacao}</div>` : ''}
      </td>
      <td style="font-size:11px;color:var(--muted)">${p.categoria}</td>
      <td style="text-align:right;font-size:12px">${custo}</td>
      <td style="text-align:right;font-size:12px;color:var(--muted)">${mont}</td>
      <td style="text-align:right;font-size:13px;font-weight:600;color:var(--gold)">R$ ${venda}</td>
    `;
    tbody.appendChild(tr);
  });
}

function reRenderPreviewLab() {
  if(!_labDados) return;
  const markup = parseFloat(document.getElementById('lab-markup2').value) || 2.5;
  _labDados.markup = markup;
  const d2 = document.getElementById('lab-markup2-desc');
  if(d2) d2.textContent = '= ' + Math.round((markup-1)*100) + '% de margem';
  renderPreviewLab(_labDados.produtos, markup);
}

function labToggleAll(checked) {
  document.querySelectorAll('.lab-sel').forEach(cb => cb.checked = checked);
}

// ── Importar selecionados para o catálogo ──
function confirmarImportacaoLab() {
  if(!_labDados) return;
  const markup = parseFloat(document.getElementById('lab-markup2').value) || _labDados.markup || 2.5;

  // Coletar índices selecionados
  const selecionados = [];
  document.querySelectorAll('.lab-sel:checked').forEach(cb => {
    const idx = parseInt(cb.dataset.idx);
    if(!isNaN(idx)) selecionados.push(_labDados.produtos[idx]);
  });

  if(!selecionados.length) { toast('Selecione ao menos um produto'); return; }

  // Importar para DB.produtos
  const labAtual = _labDados.lab;
  let novos = 0, atualizados = 0;
  selecionados.forEach(p => {
    const precoVenda = parseFloat((p.precoLab * markup).toFixed(2));
    // Deduplica por nome + laboratório (produtos do mesmo lab são atualizados,
    // produtos de labs diferentes com o mesmo nome ficam separados)
    const existing = DB.produtos.find(x =>
      x.nome.toLowerCase() === p.nome.toLowerCase() &&
      (x.lab === labAtual || (!x.lab && !labAtual))
    );
    // Categoria do lab (ex: "VISÃO SIMPLES - ACABADA") vai para subcategoria
    // categoria fica 'lente' para aparecer no Catálogo e no filtro do pedido
    const isServico = (p.categoria||'').toUpperCase().includes('SERVI');
    const catSistema = isServico ? 'acessorio' : 'lente';
    if(existing) {
      existing.preco = precoVenda;
      existing.custo = p.precoLab;
      existing.categoria = catSistema;
      existing.subcategoria = existing.subcategoria || p.categoria;
      existing.lab = labAtual;
      atualizados++;
    } else {
      DB.produtos.push({
        id: uid(),
        lab: labAtual,                     // laboratório de origem
        nome: p.nome,
        categoria: catSistema,
        subcategoria: p.categoria,         // ex: "VISÃO SIMPLES - ACABADA"
        descricao: p.especificacao || '',
        preco: precoVenda,
        custo: p.precoLab,
        ativo: true,
      });
      novos++;
    }
  });

  // Salvar referência da tabela importada
  if(!DB.tabelas_lab) DB.tabelas_lab = [];
  const existeIdx = DB.tabelas_lab.findIndex(t => t.lab === _labDados.lab);
  const tabelaReg = {
    id: existeIdx >= 0 ? DB.tabelas_lab[existeIdx].id : uid(),
    lab: _labDados.lab,
    markup,
    importadoEm: new Date().toISOString(),
    totalProdutos: selecionados.length,
  };
  if(existeIdx >= 0) DB.tabelas_lab[existeIdx] = tabelaReg;
  else DB.tabelas_lab.push(tabelaReg);

  save();
  closeModal('modal-import-lab');
  renderConfig();
  renderCatalogo();
  populateSelects();
  toast(`✅ ${novos} novos produtos + ${atualizados} atualizados no catálogo!`);
}

// ── Importar JSON de múltiplos labs (gerado pelo script Python) ──
let _jsonLabsPendente = null;

function importarJSONLabs(file) {
  if(!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    let data;
    try { data = JSON.parse(e.target.result); } catch(err) { toast('❌ JSON inválido'); return; }
    if(!data.version || !Array.isArray(data.labs)) { toast('❌ Formato de JSON não reconhecido'); return; }

    _jsonLabsPendente = data;

    const totalProds = data.labs.reduce((s,l)=>s+l.produtos.length,0);
    const labLines   = data.labs.map(l=>`<li><strong>${l.lab}</strong> — ${l.produtos.length} produtos</li>`).join('');

    const existing = document.getElementById('json-import-preview');
    if(existing) existing.remove();

    const div = document.createElement('div');
    div.id = 'json-import-preview';
    div.style.cssText = 'background:var(--surface2);border:1px solid var(--border);border-radius:var(--rad);padding:14px 16px;margin-top:12px';
    div.innerHTML = `
      <div style="font-weight:600;margin-bottom:8px">📥 ${totalProds} produtos encontrados</div>
      <ul style="margin:0 0 10px 16px;font-size:13px;color:var(--muted)">${labLines}</ul>
      <div style="font-size:12px;color:var(--muted);margin-bottom:10px">
        Os preços importados são PVCs (tabela sugerida ao consumidor). O custo estimado será 40% do PVC — ajuste depois conforme seu contrato com o lab.
      </div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <button class="btn btn-gold btn-sm" onclick="_confirmarJSONLabs()">✅ Confirmar importação</button>
        <button class="btn btn-ghost btn-sm" onclick="document.getElementById('json-import-preview').remove();_jsonLabsPendente=null">Cancelar</button>
      </div>`;

    const lista = document.getElementById('lab-tabelas-lista');
    if(lista) lista.parentNode.insertBefore(div, lista);
  };
  reader.readAsText(file);
}

function _confirmarJSONLabs() {
  const data = _jsonLabsPendente;
  if(!data) return;
  let novos = 0, atualizados = 0;

  for(const labEntry of data.labs) {
    const labNome = labEntry.lab;
    if(!labNome) continue;

    if(!(DB.tabelas_lab||[]).find(t=>t.lab===labNome)) {
      if(!DB.tabelas_lab) DB.tabelas_lab=[];
      DB.tabelas_lab.push({ lab: labNome, markup: 1.0 });
    }

    for(const p of labEntry.produtos) {
      if(!p.nome || !p.preco) continue;
      const custo = p.custo || Math.round(p.preco * 0.4 * 100) / 100;
      const existing = (DB.produtos||[]).find(x =>
        !x.deleted &&
        x.nome.toLowerCase()===p.nome.toLowerCase() &&
        x.lab===labNome
      );
      if(existing) {
        existing.preco        = p.preco;
        existing.custo        = custo;
        existing.subcategoria = p.subcategoria || existing.subcategoria;
        atualizados++;
      } else {
        if(!DB.produtos) DB.produtos=[];
        DB.produtos.push({
          id: uid(), lab: labNome,
          nome: p.nome, categoria: 'lente',
          subcategoria: p.subcategoria || 'Lente',
          descricao: '', preco: p.preco, custo,
          ativo: true,
        });
        novos++;
      }
    }
  }

  _jsonLabsPendente = null;
  save();
  document.getElementById('json-import-preview')?.remove();
  renderTabelasLab();
  renderCatalogo();
  populateSelects();
  toast(`✅ ${novos} novos + ${atualizados} atualizados`);
}

// ── Renderizar lista de tabelas já importadas ──
function renderTabelasLab() {
  const el = document.getElementById('lab-tabelas-lista');
  if(!el) return;
  const lista = DB.tabelas_lab || [];
  if(!lista.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:20px 0;text-align:center">Nenhuma tabela importada ainda.</div>';
    return;
  }
  el.innerHTML = lista.map(t => {
    const qtdNocat = (DB.produtos||[]).filter(p=>p.lab===t.lab&&!p.deleted).length;
    return `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid #1e2a46;flex-wrap:wrap;gap:8px">
      <div>
        <div style="font-weight:600;font-size:14px">${t.lab}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:3px">
          <span style="color:var(--gold)">${qtdNocat} produtos no catálogo</span> ·
          Markup ${t.markup}x (${Math.round((t.markup-1)*100)}%) ·
          Última importação: ${new Date(t.importadoEm).toLocaleDateString('pt-BR')}
        </div>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-ghost btn-sm" onclick="abrirImportarLab('${t.lab}')" title="Atualizar tabela">🔄 Atualizar</button>
        <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="excluirTabelaLab('${t.id}')" title="Remover">🗑️</button>
      </div>
    </div>`;
  }).join('');
}

function excluirTabelaLab(id) {
  const t = (DB.tabelas_lab||[]).find(x => x.id === id);
  if(!t) return;
  if(!confirm(`Remover a tabela "${t.lab}"?\n\n(Os produtos no catálogo NÃO serão excluídos agora — você poderá fazer isso no próximo passo.)`)) return;
  DB.tabelas_lab = (DB.tabelas_lab||[]).filter(x => x.id !== id);
  const qtdProds = (DB.produtos||[]).filter(p => p.lab === t.lab && !p.deleted).length;
  if(qtdProds > 0 && confirm(`Remover também os ${qtdProds} produtos de "${t.lab}" do catálogo?\n\nSe eles já estão em pedidos, o histórico não é afetado.`)) {
    DB.produtos = (DB.produtos||[]).filter(p => p.lab !== t.lab);
    renderCatalogo();
  }
  save();
  renderTabelasLab();
  toast('Tabela removida.');
}

// ══════════════════════════════════════════════
// ── SISTEMA DE BACKUP ──
// ══════════════════════════════════════════════
const _BACKUP_LS_KEY       = 'haw_backups';
const _BACKUP_LAST_AUTO_KEY= 'haw_last_autobackup';
const _BACKUP_MAX_LOCAL    = 10;

function _criarSnapshotDados(){
  return JSON.parse(JSON.stringify({
    clientes:    DB.clientes    || [],
    pedidos:     DB.pedidos     || [],
    receitas:    DB.receitas    || [],
    produtos:    DB.produtos    || [],
    usuarios:    DB.usuarios    || [],
    tabelas_lab: DB.tabelas_lab || [],
    alertas:     DB.alertas     || [],
    settings:    DB.settings    || {},
  }));
}

async function criarBackup(tipo, usuarioNome){
  const bk = {
    id: uid(),
    criadoEm: new Date().toISOString(),
    tipo: tipo || 'manual',
    usuarioNome: usuarioNome || currentUser?.nome || 'Sistema',
    versao: 1,
    dados: _criarSnapshotDados(),
  };

  // Salvar no Supabase (primário)
  if(window.HAW_SB?.isOnline?.() && window.HAW_SB.client){
    try{
      await window.HAW_SB.client.from('backups').insert({
        id: bk.id, created_at: bk.criadoEm, tipo: bk.tipo,
        usuario_nome: bk.usuarioNome, versao: bk.versao, dados: bk.dados,
      });
    }catch(e){ console.warn('[HAW Backup] Falha Supabase:', e?.message); }
  }

  // Salvar no localStorage (fallback — mantém manuais + últimos 5 autos)
  try{
    const lista = JSON.parse(localStorage.getItem(_BACKUP_LS_KEY)||'[]');
    lista.unshift(bk);
    const manuais = lista.filter(b=>b.tipo==='manual');
    const autos   = lista.filter(b=>b.tipo!=='manual').slice(0,5);
    const final   = [...manuais,...autos].sort((a,b)=>b.criadoEm.localeCompare(a.criadoEm)).slice(0,_BACKUP_MAX_LOCAL);
    localStorage.setItem(_BACKUP_LS_KEY, JSON.stringify(final));
  }catch(e){ console.warn('[HAW Backup] Falha localStorage:', e?.message); }

  return bk;
}

async function listarBackups(){
  // Tenta Supabase (metadados — sem `dados` para economizar banda)
  if(window.HAW_SB?.isOnline?.() && window.HAW_SB.client){
    try{
      const {data,error} = await window.HAW_SB.client
        .from('backups')
        .select('id,created_at,tipo,usuario_nome,versao')
        .order('created_at',{ascending:false}).limit(30);
      if(!error && data) return data.map(r=>({
        id:r.id, criadoEm:r.created_at, tipo:r.tipo,
        usuarioNome:r.usuario_nome, versao:r.versao, _fonte:'supabase',
      }));
    }catch(e){}
  }
  // Fallback: localStorage
  try{
    return JSON.parse(localStorage.getItem(_BACKUP_LS_KEY)||'[]')
      .map(b=>({...b, dados:undefined, _fonte:'local'}));
  }catch(e){ return []; }
}

async function restaurarBackup(id){
  if(!confirm('⚠️ Restaurar este backup vai substituir TODOS os dados atuais do sistema.\n\nEsta ação não pode ser desfeita. Tem certeza?')) return;

  let backup = null;

  // Busca dados completos do Supabase
  if(window.HAW_SB?.isOnline?.() && window.HAW_SB.client){
    try{
      const {data,error} = await window.HAW_SB.client
        .from('backups').select('*').eq('id',id).single();
      if(!error && data) backup = {dados:data.dados, criadoEm:data.created_at};
    }catch(e){}
  }
  // Fallback: localStorage
  if(!backup){
    try{
      const lista = JSON.parse(localStorage.getItem(_BACKUP_LS_KEY)||'[]');
      backup = lista.find(b=>b.id===id);
    }catch(e){}
  }

  if(!backup?.dados){ alert('❌ Backup não encontrado ou dados corrompidos.'); return; }

  // Restaura campos normais (exceto usuarios — tem setter guard que bloqueia arrays vazios)
  const {usuarios: usersBackup, ...restoDados} = backup.dados;
  Object.assign(DB, restoDados);

  // Restaura usuarios separadamente para contornar o setter guard
  if(Array.isArray(usersBackup) && usersBackup.length > 0){
    DB.usuarios = usersBackup;
  } else {
    // Backup sem usuários — preserva os atuais e avisa
    console.warn('[HAW Restore] Backup sem lista de usuários — usuários atuais preservados.');
  }

  window.DB = DB;
  save();
  // Re-renderiza tudo
  renderDashboard(); renderPipeline(); renderClientes(); renderPedidos();
  renderReceitas(); renderFinanceiro(); renderCatalogo(); renderRelatorios();
  renderConfig(); populateSelects();
  toast(`✅ Backup de ${new Date(backup.criadoEm).toLocaleDateString('pt-BR')} restaurado!`);
  renderBackups();
}

async function excluirBackup(id){
  if(!confirm('Excluir este backup permanentemente?')) return;
  if(window.HAW_SB?.isOnline?.() && window.HAW_SB.client){
    try{ await window.HAW_SB.client.from('backups').delete().eq('id',id); }catch(e){}
  }
  try{
    const lista = JSON.parse(localStorage.getItem(_BACKUP_LS_KEY)||'[]');
    localStorage.setItem(_BACKUP_LS_KEY, JSON.stringify(lista.filter(b=>b.id!==id)));
  }catch(e){}
  renderBackups();
  toast('Backup excluído.');
}

async function exportarBackupJSON(id){
  let dados = null;
  if(window.HAW_SB?.isOnline?.() && window.HAW_SB.client){
    try{
      const {data,error} = await window.HAW_SB.client
        .from('backups').select('*').eq('id',id).single();
      if(!error && data) dados = data;
    }catch(e){}
  }
  if(!dados){
    try{
      const lista = JSON.parse(localStorage.getItem(_BACKUP_LS_KEY)||'[]');
      dados = lista.find(b=>b.id===id);
    }catch(e){}
  }
  if(!dados){ toast('⚠️ Dados do backup não disponíveis localmente.'); return; }
  const dt = (dados.created_at||dados.criadoEm||'').slice(0,10);
  const blob = new Blob([JSON.stringify(dados,null,2)],{type:'application/json'});
  const url  = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `haw-backup-${dt}-${dados.tipo||'backup'}.json`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function renderBackups(){
  const el = document.getElementById('backup-lista');
  if(!el) return;
  el.innerHTML='<div style="color:var(--muted);text-align:center;padding:20px">Carregando…</div>';

  const lista = await listarBackups();

  // Atualiza status cards
  const autoEl   = document.getElementById('backup-auto-status');
  const manualEl = document.getElementById('backup-manual-status');
  const ultimoAuto   = lista.find(b=>b.tipo==='automatico');
  const ultimoManual = lista.find(b=>b.tipo==='manual');
  if(autoEl)   autoEl.textContent   = ultimoAuto   ? new Date(ultimoAuto.criadoEm).toLocaleString('pt-BR')   : 'Nenhum ainda';
  if(manualEl) manualEl.textContent = ultimoManual ? new Date(ultimoManual.criadoEm).toLocaleString('pt-BR') : 'Nenhum ainda';

  if(!lista.length){
    el.innerHTML='<div style="color:var(--muted);font-size:13px;padding:20px 0;text-align:center">Nenhum backup encontrado.</div>';
    return;
  }

  el.innerHTML = lista.map(b=>{
    const d    = new Date(b.criadoEm);
    const dtBR = d.toLocaleDateString('pt-BR');
    const hora = d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    const tipo = b.tipo==='manual' ? '🖐 Manual' : '🤖 Auto';
    const cls  = b.tipo==='manual' ? 'badge-gold' : 'badge-navy';
    const fnt  = b._fonte==='supabase' ? '☁️' : '💻';
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid #1e2a46;flex-wrap:wrap;gap:8px">
      <div>
        <div style="font-weight:600;font-size:13px">${dtBR} às ${hora} <span style="font-size:11px;color:var(--muted)">${fnt}</span></div>
        <div style="font-size:11px;color:var(--muted);margin-top:3px">
          <span class="badge ${cls}" style="font-size:10px">${tipo}</span>
          <span style="margin-left:8px">por ${b.usuarioNome||'Sistema'}</span>
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" onclick="exportarBackupJSON('${b.id}')" title="Baixar JSON">⬇️ JSON</button>
        <button class="btn btn-ghost btn-sm" style="color:var(--gold)" onclick="restaurarBackup('${b.id}')">🔄 Restaurar</button>
        <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="excluirBackup('${b.id}')">🗑️</button>
      </div>
    </div>`;
  }).join('');
}

async function fazerBackupManual(){
  const btn = document.getElementById('btn-backup-manual');
  if(btn){ btn.disabled=true; btn.textContent='⏳ Salvando…'; }
  try{
    await criarBackup('manual', currentUser?.nome||'Admin');
    toast('✅ Backup manual criado com sucesso!');
    renderBackups();
  } finally {
    if(btn){ btn.disabled=false; btn.textContent='💾 Fazer Backup Agora'; }
  }
}

// ── Scheduler: verifica a cada 30 min se é madrugada e se já houve backup hoje ──
async function _autoBackupSeNecessario(){
  const hoje  = new Date().toISOString().slice(0,10);
  const ultimo= localStorage.getItem(_BACKUP_LAST_AUTO_KEY);
  if(ultimo===hoje) return;
  await criarBackup('automatico','Sistema (auto)');
  localStorage.setItem(_BACKUP_LAST_AUTO_KEY, hoje);
  console.log('[HAW] Backup automático criado:', hoje);
}

function iniciarSchedulerBackup(){
  // Polling a cada 30 min — dispara backup se estiver entre 01h e 04h59
  setInterval(async()=>{
    const h = new Date().getHours();
    if(h >= 1 && h <= 4) await _autoBackupSeNecessario();
  }, 30 * 60 * 1000);

  // Ao abrir o app: se ainda não houve backup hoje (fallback para quando
  // o navegador não fica aberto durante a madrugada)
  setTimeout(async()=>{
    const hoje  = new Date().toISOString().slice(0,10);
    const ultimo= localStorage.getItem(_BACKUP_LAST_AUTO_KEY);
    if(ultimo !== hoje) await _autoBackupSeNecessario();
  }, 6000); // aguarda DB estar carregado
}

// ── GLOBAL EXPORTS (garante acesso de onclick no HTML) ──
window.nav=nav;
window.openModal=openModal;
window.closeModal=closeModal;
window.tbAction=tbAction;
window.salvarCliente=salvarCliente;
window.salvarPedido=salvarPedido;
window.salvarReceita=salvarReceita;
window.editarReceita=editarReceita;
window.excluirReceita=excluirReceita;
window.salvarProduto=salvarProduto;
window.doLogin=doLogin;
window.doLogout=doLogout;
window.salvarUsuario=salvarUsuario;
window.salvarMetas=salvarMetas;
window.salvarEmpresa=salvarEmpresa;
window.salvarSupabase=salvarSupabase;
window.abrirNovoUsuario=abrirNovoUsuario;
window.editarUsuario=editarUsuario;
window.toggleUsuario=toggleUsuario;
window.deletarUsuario=deletarUsuario;
window.confirmarDelUsuario=confirmarDelUsuario;
window.testarConexao=testarConexao;
window.editarCliente=editarCliente;
window.editarPedido=editarPedido;
window.excluirCliente=excluirCliente;
window.excluirPedido=excluirPedido;
window.abrirStatus=abrirStatus;
window.confirmarStatus=confirmarStatus;
window._toggleMotivoPerda=_toggleMotivoPerda;
window._toggleMotivoOutro=_toggleMotivoOutro;
window._toggleMotivoPerdaPed=_toggleMotivoPerdaPed;
window._toggleMotivoOutroPed=_toggleMotivoOutroPed;
window.abrirPedidoParaCliente=abrirPedidoParaCliente;
window.verPerfil=verPerfil;
window.perfilTab=perfilTab;
window.gerarPDF=gerarPDF;
window.gerarPDFPedido=gerarPDFPedido;
window.calcTotal=calcTotal;
window.addItemPedido=addItemPedido;
window.selecionarProd=selecionarProd;
window.selecionarAvulso=selecionarAvulso;
window.filtrarProdutos=filtrarProdutos;
window.editarNomeItem=editarNomeItem;
window._sairModoEditarNome=_sairModoEditarNome;
window.mostrarDropdownProd=mostrarDropdownProd;
window.atualizarDescItem=atualizarDescItem;
window.aplicarDescItem=aplicarDescItem;
window.navDropdown=navDropdown;
window.setTipoItem=setTipoItem;
window.onPedClienteChange=onPedClienteChange;
window.renderSugestaoLentes=renderSugestaoLentes;
window.adicionarSugestao=adicionarSugestao;
window.filterClientes=filterClientes;
window.filterPedidos=filterPedidos;
window.setPedidosView=setPedidosView;
window.setPipelineVendedor=setPipelineVendedor;
window.addParaStage=addParaStage;
window.setCatTab=setCatTab;
window.setCfgTab=setCfgTab;
window.globalSearch=globalSearch;
window.editarProduto=editarProduto;
window.toggleProduto=toggleProduto;
window.maskCPF=maskCPF;
window.maskTel=maskTel;
window.salvarMetas=salvarMetas;
window.abrirImportarLab=abrirImportarLab;
window.processarPDFLab=processarPDFLab;
window.confirmarImportacaoLab=confirmarImportacaoLab;
window.excluirTabelaLab=excluirTabelaLab;
window.reRenderPreviewLab=reRenderPreviewLab;
window.labToggleAll=labToggleAll;
window.labVoltarStep1=labVoltarStep1;
window.atualizarPreviewMarkup=atualizarPreviewMarkup;
window.fazerBackupManual=fazerBackupManual;
window.restaurarBackup=restaurarBackup;
window.excluirBackup=excluirBackup;
window.exportarBackupJSON=exportarBackupJSON;
window.renderBackups=renderBackups;

// ── CREDIÁRIO ─────────────────────────────────────────────────────────────────

let _credFiltro = 'todos';
let _osFiltro = 'todos';
function setOsFiltro(f, btn) {
  _osFiltro = f;
  document.querySelectorAll('.os-filtro').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderOS();
}
window.setOsFiltro = setOsFiltro;

function setCreditFilter(f, btn) {
  _credFiltro = f;
  document.querySelectorAll('.cred-filtro').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderCrediario();
}

function calcJurosMora(p, taxaMoraMensal, multaPct) {
  if (p.pago) return 0;
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const vd = new Date(p.vencimento + 'T00:00:00');
  if (vd >= hoje) return 0;
  const diasAtraso = Math.floor((hoje - vd) / 86400000);
  const saldo = Math.max(0, p.valorOriginal - (p.valorPago || 0));
  if (saldo <= 0) return 0;
  const multa = saldo * ((multaPct || 2) / 100);
  const jurosDia = saldo * (((taxaMoraMensal || 1) / 100) / 30);
  return Math.round((multa + jurosDia * diasAtraso) * 100) / 100;
}

function computeStatusCrediario(c) {
  if (c.status === 'cancelado') return 'cancelado';
  const todas = c.parcelas || [];
  if (todas.length && todas.every(p => p.pago)) return 'quitado';
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  if (todas.some(p => !p.pago && new Date(p.vencimento + 'T00:00:00') < hoje)) return 'atrasado';
  return 'ativo';
}

function saldoDevedorCrediario(c) {
  return (c.parcelas || []).reduce((s, p) => s + Math.max(0, p.valorOriginal - (p.valorPago || 0)), 0);
}

function proxVencimentoCrediario(c) {
  const pendentes = (c.parcelas || []).filter(p => !p.pago);
  if (!pendentes.length) return null;
  return pendentes.reduce((mn, p) => {
    const d = new Date(p.vencimento + 'T00:00:00');
    return (!mn || d < mn) ? d : mn;
  }, null);
}

function renderCrediario() {
  if (!DB.crediarios) DB.crediarios = [];
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const em30 = new Date(hoje); em30.setDate(em30.getDate() + 30);
  const mesAtual = new Date().toISOString().slice(0, 7);

  let totalAReceber = 0, totalVencido = 0, total30d = 0, totalQuitadoMes = 0;
  DB.crediarios.forEach(c => {
    const st = computeStatusCrediario(c);
    if (st === 'quitado') {
      const ultPaga = [...(c.parcelas||[])].filter(p=>p.pago&&p.dataPagamento)
        .sort((a,b)=>b.dataPagamento.localeCompare(a.dataPagamento))[0];
      if (ultPaga && ultPaga.dataPagamento.slice(0,7) === mesAtual) totalQuitadoMes += c.total;
      return;
    }
    if (st === 'cancelado') return;
    (c.parcelas||[]).forEach(p => {
      if (p.pago) return;
      const saldo = Math.max(0, p.valorOriginal - (p.valorPago||0));
      const vd = new Date(p.vencimento + 'T00:00:00');
      totalAReceber += saldo;
      if (vd < hoje) totalVencido += saldo;
      else if (vd <= em30) total30d += saldo;
    });
  });
  const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setEl('cred-stat-areceber', fmtMoney(totalAReceber));
  setEl('cred-stat-vencido', fmtMoney(totalVencido));
  setEl('cred-stat-30d', fmtMoney(total30d));
  setEl('cred-stat-quitados', fmtMoney(totalQuitadoMes));

  const ativos = DB.crediarios.filter(c => {
    const st = computeStatusCrediario(c);
    return st === 'ativo' || st === 'atrasado';
  }).length;
  const countEl = document.getElementById('cnt-crediario');
  if (countEl) { countEl.textContent = ativos; countEl.style.display = ativos ? 'inline-block' : 'none'; }

  const busca = (document.getElementById('cred-busca')?.value || '').toLowerCase();
  let lista = DB.crediarios.filter(c => {
    const st = computeStatusCrediario(c);
    if (_credFiltro !== 'todos' && st !== _credFiltro) return false;
    if (busca && !(c.clienteNome||'').toLowerCase().includes(busca)) return false;
    return true;
  }).sort((a, b) => (b.createdAt||'').localeCompare(a.createdAt||''));

  const tbody = document.getElementById('cred-tbody');
  if (!tbody) return;
  if (!lista.length) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:32px">Nenhum crediário encontrado</td></tr>`;
    return;
  }

  const ST_BADGE = {
    ativo:     {cls:'badge-blue',  label:'Em dia'},
    atrasado:  {cls:'badge-red',   label:'Atrasado'},
    quitado:   {cls:'badge-green', label:'Quitado'},
    cancelado: {cls:'badge-gray',  label:'Cancelado'},
  };

  tbody.innerHTML = lista.map(c => {
    const st = computeStatusCrediario(c);
    const sb = ST_BADGE[st] || {cls:'badge-gray', label:st};
    const saldo = saldoDevedorCrediario(c);
    const proxD = proxVencimentoCrediario(c);
    const proxStr = proxD ? fmtDate(proxD.toISOString().slice(0,10)) : '—';
    const pgPagas = (c.parcelas||[]).filter(p=>p.pago).length;
    const pgTotal = (c.parcelas||[]).length;
    const ped = c.pedidoId ? DB.pedidos.find(p=>p.id===c.pedidoId) : null;
    const pedLabel = ped ? `Pedido #${ped.numero}` : (c.descricao||'—');
    const editBtn = st !== 'cancelado' && st !== 'quitado'
      ? `<button class="btn btn-sm" onclick="event.stopPropagation();abrirEditarCrediario('${c.id}')" title="Editar" style="padding:2px 8px;font-size:11px;margin-right:4px">✏️</button>`
      : '';
    const cancelBtn = st !== 'cancelado' && st !== 'quitado'
      ? `<button class="btn btn-sm" onclick="event.stopPropagation();excluirCrediario('${c.id}')" title="Cancelar" style="padding:2px 8px;font-size:11px;color:var(--red);border-color:var(--red)">✕</button>`
      : '';
    return `<tr style="cursor:pointer" onclick="toggleCrediarioDetalhe('${c.id}')">
      <td><strong>${c.clienteNome||'—'}</strong></td>
      <td style="font-size:12px;color:var(--muted);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${pedLabel}</td>
      <td style="text-align:right;font-weight:600">${fmtMoney(c.total)}</td>
      <td style="text-align:right">${fmtMoney(c.entrada||0)}</td>
      <td style="text-align:center"><span style="font-size:12px">${pgPagas}/${pgTotal}</span></td>
      <td>${proxStr}</td>
      <td style="text-align:right;font-weight:600;color:${saldo>0.01?'var(--gold-deep)':'var(--green)'}">${fmtMoney(saldo)}</td>
      <td style="text-align:center"><span class="badge ${sb.cls}">${sb.label}</span></td>
      <td style="text-align:center;white-space:nowrap">${editBtn}${cancelBtn}</td>
    </tr>
    <tr id="detalhe-cred-${c.id}" style="display:none">
      <td colspan="9" style="padding:0;background:var(--off);border-bottom:2px solid var(--border-light)">${_renderParcelasInline(c)}</td>
    </tr>`;
  }).join('');
}

function _renderParcelasInline(c) {
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const rows = (c.parcelas||[]).map((p, idx) => {
    const vd = new Date(p.vencimento + 'T00:00:00');
    const atrasado = !p.pago && vd < hoje;
    const saldo = p.valorOriginal - (p.valorPago||0);
    const juros = calcJurosMora(p, c.taxaMora||1, c.multaMora||2);
    const totalPagar = Math.max(0, saldo) + juros;
    const efetivamentePago = saldo <= 0.02 && p.pago;
    const rowBg = efetivamentePago ? 'var(--green-l)' : atrasado ? 'var(--red-l)' : 'var(--white)';
    const badge = efetivamentePago
      ? `<span class="badge badge-green">Pago</span>`
      : saldo > 0.02 && (p.valorPago||0) > 0.01
        ? `<span class="badge badge-amber">Parcial</span>`
        : atrasado ? `<span class="badge badge-red">Atrasado</span>`
        : `<span class="badge badge-blue">Pendente</span>`;
    const pagoMeta = efetivamentePago && p.formaPagamento && !(p.pagamentos&&p.pagamentos.length)
      ? `<div style="font-size:10px;color:var(--muted);margin-top:2px">${p.formaPagamento} · ${fmtDate(p.dataPagamento)}</div>` : '';
    const temHistorico = (p.pagamentos && p.pagamentos.length > 0) || (p.pago && p.dataPagamento);
    const cli2=DB.clientes.find(x=>x.id===c.clienteId);
    const btnWA = atrasado && cli2 && cli2.telefone
      ? `<button onclick="abrirWA('${c.clienteId}','crediario')" title="Cobrar via WhatsApp" style="background:none;border:1px solid #25D366;border-radius:4px;cursor:pointer;color:#25D366;font-size:11px;padding:3px 7px;white-space:nowrap">📱</button>`
      : '';
    const btnPagar = saldo > 0.02
      ? `<button class="btn btn-gold btn-sm" onclick="abrirPagarParcela('${c.id}',${idx})" style="font-size:11px;padding:3px 10px;white-space:nowrap">Receber</button>`
      : efetivamentePago && !temHistorico
        ? `<button onclick="resetarParcelaLegacy('${c.id}',${idx})" style="background:none;border:1px solid var(--border-light);border-radius:4px;cursor:pointer;color:var(--muted);font-size:10px;padding:3px 8px;white-space:nowrap" title="Estornar pagamento sem histórico">↩ Estornar</button>`
        : '';
    return `<tr style="background:${rowBg}">
      <td style="padding:7px 12px;font-weight:700">${p.numero}ª</td>
      <td style="padding:7px 12px">${fmtDate(p.vencimento)}</td>
      <td style="padding:7px 12px;text-align:right">${fmtMoney(p.valorOriginal)}</td>
      <td style="padding:7px 12px;text-align:right">${p.valorPago>0?fmtMoney(p.valorPago):'—'}</td>
      <td style="padding:7px 12px;text-align:right;color:var(--red)">${juros>0.01?fmtMoney(juros):'—'}</td>
      <td style="padding:7px 12px;text-align:right;font-weight:700">${p.pago?'<span style="color:var(--green)">—</span>':fmtMoney(totalPagar)}</td>
      <td style="padding:7px 12px">${badge}${pagoMeta}</td>
      <td style="padding:7px 12px;white-space:nowrap;display:flex;gap:4px;align-items:center">${btnPagar}${btnWA}<button onclick="editarParcela('${c.id}',${idx})" title="Editar parcela" style="background:none;border:1px solid var(--border-light);border-radius:4px;cursor:pointer;color:var(--muted);font-size:11px;padding:3px 7px;white-space:nowrap" onmouseover="this.style.borderColor='var(--gold)';this.style.color='var(--gold-deep)'" onmouseout="this.style.borderColor='var(--border-light)';this.style.color='var(--muted)'">✏️</button></td>
    </tr>`;
  }).join('');
  // Histórico consolidado de todos os recebimentos
  const todosPagamentos = [];
  (c.parcelas||[]).forEach((p, pi) => {
    if (p.pagamentos && p.pagamentos.length) {
      p.pagamentos.forEach((pg, pgi) => todosPagamentos.push({ ...pg, parcela: p.numero, _pi: pi, _pgi: pgi, _legacy: false }));
    } else if (p.pago && p.dataPagamento) {
      todosPagamentos.push({ valor: p.valorPago||p.valorOriginal, forma: p.formaPagamento||'—', data: p.dataPagamento, obs: p.observacao||'', parcela: p.numero, _pi: pi, _pgi: -1, _legacy: true });
    }
  });
  todosPagamentos.sort((a,b) => (a.data||'').localeCompare(b.data||''));

  const FORMA_LABEL = { pix:'PIX', dinheiro:'Dinheiro', cartao_debito:'Débito', cartao_credito:'Crédito', transferencia:'Transf.', cheque:'Cheque' };
  const historicoHtml = todosPagamentos.length ? `
    <div style="padding:12px 24px 12px 0;border-top:1px solid var(--border-light)">
      <div style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;padding-left:12px">
        Histórico de Recebimentos
      </div>
      <table style="width:100%;font-size:12px;border-collapse:collapse">
        <thead><tr style="background:var(--off)">
          <th style="padding:5px 12px;text-align:left;font-weight:500;color:var(--muted)">Data</th>
          <th style="padding:5px 12px;text-align:left;font-weight:500;color:var(--muted)">Parcela</th>
          <th style="padding:5px 12px;text-align:left;font-weight:500;color:var(--muted)">Forma</th>
          <th style="padding:5px 12px;text-align:right;font-weight:500;color:var(--muted)">Valor Recebido</th>
          <th style="padding:5px 12px;font-weight:500;color:var(--muted)">Obs.</th>
          <th style="padding:5px 4px"></th>
        </tr></thead>
        <tbody>${todosPagamentos.map(pg => `<tr style="border-top:1px solid var(--border-light)">
          <td style="padding:5px 12px">${fmtDate(pg.data)}</td>
          <td style="padding:5px 12px;color:var(--muted)">${pg.parcela}ª parcela</td>
          <td style="padding:5px 12px">${FORMA_LABEL[pg.forma]||pg.forma||'—'}</td>
          <td style="padding:5px 12px;text-align:right;font-weight:600;color:var(--green)">${fmtMoney(pg.valor)}</td>
          <td style="padding:5px 12px;color:var(--muted);font-size:11px">${pg.obs||'—'}</td>
          <td style="padding:5px 4px;text-align:center">${!pg._legacy
            ? `<button onclick="removerPagamento('${c.id}',${pg._pi},${pg._pgi})" title="Remover este pagamento" style="background:none;border:none;cursor:pointer;color:var(--danger,#e53);font-size:13px;padding:0 4px;opacity:.7" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=.7">×</button>`
            : `<button onclick="resetarParcelaLegacy('${c.id}',${pg._pi})" title="Estornar pagamento e reabrir parcela" style="background:none;border:none;cursor:pointer;color:var(--danger,#e53);font-size:13px;padding:0 4px;opacity:.7" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=.7">×</button>`
          }</td>
        </tr>`).join('')}
        </tbody>
      </table>
    </div>` : '';

  return `<div style="padding:0 0 8px 24px">
    <div style="padding:6px 0 10px;display:flex;justify-content:flex-end">
      <button class="btn btn-ghost btn-sm" onclick="imprimirCrediario('${c.id}')" style="font-size:11px">🖨️ Imprimir crediário</button>
    </div>
    <table style="width:100%;font-size:12px;border-collapse:collapse">
      <thead><tr style="background:var(--off)">
        <th style="padding:6px 12px;text-align:left;font-weight:500;color:var(--muted)">Nº</th>
        <th style="padding:6px 12px;text-align:left;font-weight:500;color:var(--muted)">Vencimento</th>
        <th style="padding:6px 12px;text-align:right;font-weight:500;color:var(--muted)">Valor Orig.</th>
        <th style="padding:6px 12px;text-align:right;font-weight:500;color:var(--muted)">Pago</th>
        <th style="padding:6px 12px;text-align:right;font-weight:500;color:var(--muted)">Juros/Multa</th>
        <th style="padding:6px 12px;text-align:right;font-weight:500;color:var(--muted)">A pagar</th>
        <th style="padding:6px 12px;font-weight:500;color:var(--muted)">Status</th>
        <th style="padding:6px 12px"></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${historicoHtml}
  </div>`;
}

function toggleCrediarioDetalhe(id) {
  const row = document.getElementById(`detalhe-cred-${id}`);
  if (!row) return;
  const showing = row.style.display !== 'none';
  document.querySelectorAll('[id^="detalhe-cred-"]').forEach(r => r.style.display = 'none');
  if (!showing) row.style.display = 'table-row';
}

function imprimirCrediario(id) {
  const c = (DB.crediarios||[]).find(x => x.id === id);
  if (!c) return;
  const emp = (DB.settings&&DB.settings.empresa)||{nome:'HAW Vision',cnpj:'',telefone:''};
  const hoje = new Date().toLocaleDateString('pt-BR');
  const FORMA = {pix:'PIX',dinheiro:'Dinheiro',cartao_debito:'Débito',cartao_credito:'Crédito',transferencia:'Transferência',cheque:'Cheque'};
  const pagas = (c.parcelas||[]).filter(p=>p.pago).length;
  const total = (c.parcelas||[]).length;
  const totalPago = (c.parcelas||[]).reduce((s,p)=>s+(p.valorPago||0),0);
  const saldoRest = (c.total||0) - totalPago - (c.entrada||0);

  const linhas = (c.parcelas||[]).map(p => {
    const vd = new Date(p.vencimento+'T00:00:00');
    const atras = !p.pago && vd < new Date();
    const st = p.pago ? 'PAGO' : atras ? 'ATRASADO' : 'PENDENTE';
    const cor = p.pago ? '#2E7D52' : atras ? '#8B2E2E' : '#555';
    return `<tr style="border-bottom:1px solid #eee">
      <td style="padding:6px 8px">${p.numero}ª</td>
      <td style="padding:6px 8px">${fmtDate(p.vencimento)}</td>
      <td style="padding:6px 8px;text-align:right">R$ ${(p.valorOriginal||0).toFixed(2)}</td>
      <td style="padding:6px 8px;text-align:right">${p.valorPago>0?'R$ '+p.valorPago.toFixed(2):'—'}</td>
      <td style="padding:6px 8px;text-align:center;font-weight:600;color:${cor}">${st}</td>
      <td style="padding:6px 8px;font-size:11px;color:#777">${p.dataPagamento?fmtDate(p.dataPagamento):''}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Crediário — ${c.clienteNome}</title>
    <style>
      body{font-family:Arial,sans-serif;font-size:13px;color:#222;padding:24px;max-width:800px;margin:0 auto}
      h1{font-size:18px;margin:0}h2{font-size:14px;margin:0;color:#555}
      .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:12px;border-bottom:2px solid #222}
      .info-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px;background:#f8f8f8;padding:14px;border-radius:6px}
      .info-item label{font-size:10px;color:#777;text-transform:uppercase;font-weight:600;display:block}
      .info-item span{font-size:14px;font-weight:700}
      table{width:100%;border-collapse:collapse;font-size:12px}
      thead tr{background:#f0f0f0}
      th{padding:7px 8px;text-align:left;font-weight:600;font-size:11px;color:#555}
      .totals{margin-top:16px;text-align:right;font-size:13px}
      .totals div{margin-bottom:4px}
      .totals .grand{font-size:16px;font-weight:700;margin-top:8px}
      .footer{margin-top:32px;border-top:1px solid #ddd;padding-top:12px;font-size:11px;color:#888;display:flex;justify-content:space-between}
      @media print{button{display:none}}
    </style>
  </head><body>
    <div class="header">
      <div><h1>${emp.nome}</h1><h2>${emp.cnpj?'CNPJ: '+emp.cnpj:''}</h2></div>
      <div style="text-align:right"><div style="font-size:16px;font-weight:700">CREDIÁRIO</div><div style="font-size:11px;color:#777">Emitido em ${hoje}</div></div>
    </div>
    <div class="info-grid">
      <div class="info-item"><label>Cliente</label><span>${c.clienteNome}</span></div>
      <div class="info-item"><label>Descrição</label><span>${c.descricao||'—'}</span></div>
      <div class="info-item"><label>Total do contrato</label><span>R$ ${(c.total||0).toFixed(2)}</span></div>
      <div class="info-item"><label>Entrada</label><span>R$ ${(c.entrada||0).toFixed(2)}</span></div>
      <div class="info-item"><label>Parcelas</label><span>${pagas}/${total} pagas</span></div>
      <div class="info-item"><label>Saldo restante</label><span style="color:${saldoRest>0?'#8B2E2E':'#2E7D52'}">R$ ${Math.max(0,saldoRest).toFixed(2)}</span></div>
    </div>
    <table>
      <thead><tr>
        <th>Nº</th><th>Vencimento</th><th style="text-align:right">Valor</th>
        <th style="text-align:right">Pago</th><th style="text-align:center">Status</th><th>Pagamento em</th>
      </tr></thead>
      <tbody>${linhas}</tbody>
    </table>
    <div class="totals">
      <div>Total pago: <strong>R$ ${totalPago.toFixed(2)}</strong></div>
      <div class="grand">Saldo restante: R$ ${Math.max(0,saldoRest).toFixed(2)}</div>
    </div>
    <div class="footer">
      <span>${emp.nome}${emp.telefone?' · '+emp.telefone:''}</span>
      <span>Documento gerado em ${hoje}</span>
    </div>
    <div style="margin-top:16px;text-align:center"><button onclick="window.print()" style="padding:8px 24px;font-size:13px;cursor:pointer">🖨️ Imprimir</button></div>
  </body></html>`;

  const w = window.open('','_blank','width=860,height=700');
  if (w) { w.document.write(html); w.document.close(); }
}

function _credResetFields() {
  ['cred-total','cred-entrada','cred-nparcelas','cred-cliente-id','cred-pedido-id'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.disabled = false; el.style.opacity = ''; }
  });
}

function abrirNovoCrediario() {
  _credResetFields();
  document.getElementById('cred-id').value = '';
  document.getElementById('modal-cred-title').textContent = 'Novo Crediário';
  document.getElementById('cred-descricao').value = '';
  document.getElementById('cred-total').value = '';
  document.getElementById('cred-entrada').value = '0';
  document.getElementById('cred-nparcelas').value = '6';
  document.getElementById('cred-taxa-mora').value = '1';
  document.getElementById('cred-multa').value = '2';
  document.getElementById('cred-preview').style.display = 'none';
  const d = new Date(); d.setMonth(d.getMonth() + 1);
  document.getElementById('cred-data1').value = d.toISOString().slice(0,10);
  const selCli = document.getElementById('cred-cliente-id');
  selCli.innerHTML = '<option value="">— Selecione o cliente —</option>' +
    DB.clientes.filter(c=>!c.deleted).map(c=>`<option value="${c.id}">${c.nome}</option>`).join('');
  document.getElementById('cred-pedido-id').innerHTML = '<option value="">— Nenhum —</option>';
  openModal('modal-crediario');
}

function abrirEditarCrediario(id) {
  const c = DB.crediarios.find(x => x.id === id);
  if (!c) return;
  const temPagas = (c.parcelas||[]).some(p => p.pago);
  // Abrir modal PRIMEIRO (openModal reseta todos os inputs internamente)
  openModal('modal-crediario');
  // Depois preencher os campos
  _credResetFields();
  document.getElementById('cred-id').value = c.id;
  document.getElementById('modal-cred-title').textContent = 'Editar Crediário';
  document.getElementById('cred-descricao').value = c.descricao || '';
  document.getElementById('cred-total').value = c.total != null ? c.total : '';
  document.getElementById('cred-entrada').value = c.entrada != null ? c.entrada : 0;
  document.getElementById('cred-taxa-mora').value = c.taxaMora ?? 1;
  document.getElementById('cred-multa').value = c.multaMora ?? 2;
  const primUnpaid = (c.parcelas||[]).find(p => !p.pago);
  document.getElementById('cred-data1').value = primUnpaid
    ? primUnpaid.vencimento : (c.parcelas?.[0]?.vencimento || '');
  const nParcelas = c.numParcelas || (c.parcelas||[]).length;
  const selN = document.getElementById('cred-nparcelas');
  selN.value = nParcelas;
  if (!selN.value) {
    const opt = document.createElement('option');
    opt.value = nParcelas; opt.textContent = nParcelas + 'x';
    selN.appendChild(opt); selN.value = nParcelas;
  }
  const selCli = document.getElementById('cred-cliente-id');
  selCli.innerHTML = '<option value="">— Selecione o cliente —</option>' +
    DB.clientes.filter(cl=>!cl.deleted).map(cl=>`<option value="${cl.id}">${cl.nome}</option>`).join('');
  selCli.value = c.clienteId || '';
  selCli.disabled = true; selCli.style.opacity = '0.6';
  const peds = DB.pedidos.filter(p=>p.clienteId===c.clienteId&&!p.deleted);
  const selPed = document.getElementById('cred-pedido-id');
  selPed.innerHTML = '<option value="">— Nenhum —</option>' +
    peds.map(p=>`<option value="${p.id}">#${p.numero} — ${fmtMoney(p.total)} — ${fmtDate(p.createdAt)}</option>`).join('');
  selPed.value = c.pedidoId || '';
  selPed.disabled = true; selPed.style.opacity = '0.6';
  if (temPagas) {
    ['cred-total','cred-entrada','cred-nparcelas'].forEach(fid => {
      const el = document.getElementById(fid);
      el.disabled = true; el.style.opacity = '0.6';
    });
  }
  document.getElementById('cred-preview').style.display = 'none';
}

function credOnClienteChange() {
  const cliId = document.getElementById('cred-cliente-id').value;
  const selPed = document.getElementById('cred-pedido-id');
  if (!cliId) { selPed.innerHTML = '<option value="">— Nenhum —</option>'; return; }
  const peds = DB.pedidos.filter(p=>p.clienteId===cliId&&!p.deleted);
  selPed.innerHTML = '<option value="">— Nenhum —</option>' +
    peds.map(p=>`<option value="${p.id}">#${p.numero} — ${fmtMoney(p.total)} — ${fmtDate(p.createdAt)}</option>`).join('');
  credRecalc();
}

function credOnPedidoChange() {
  const pedId = document.getElementById('cred-pedido-id').value;
  if (!pedId) return;
  const ped = DB.pedidos.find(p=>p.id===pedId);
  if (!ped) return;
  document.getElementById('cred-total').value = (ped.total||'');
  document.getElementById('cred-descricao').value = `Pedido #${ped.numero}`;
  credRecalc();
}

function credRecalc() {
  const total = parseFloat(document.getElementById('cred-total').value)||0;
  const entrada = parseFloat(document.getElementById('cred-entrada').value)||0;
  const n = parseInt(document.getElementById('cred-nparcelas').value)||1;
  const data1Str = document.getElementById('cred-data1').value;
  if (!total || !data1Str) { document.getElementById('cred-preview').style.display='none'; return; }
  const valorParcelado = Math.max(0, total - entrada);
  const valorParcela = valorParcelado / n;
  const d = new Date(data1Str + 'T12:00:00');
  const tbody = document.getElementById('cred-preview-tbody');
  tbody.innerHTML = Array.from({length:n}, (_,i) => {
    const vd = new Date(d); vd.setMonth(vd.getMonth()+i);
    return `<tr><td>${i+1}ª</td><td>${fmtDate(vd.toISOString().slice(0,10))}</td><td style="text-align:right;font-weight:600">${fmtMoney(valorParcela)}</td></tr>`;
  }).join('');
  document.getElementById('cred-preview-total').textContent = fmtMoney(valorParcelado);
  document.getElementById('cred-preview').style.display = 'block';
}

function salvarCrediario() {
  const editId = document.getElementById('cred-id').value;
  const data1Str = document.getElementById('cred-data1').value;
  if (!data1Str) { alert('Informe a data da 1ª parcela.'); return; }
  const descricao = document.getElementById('cred-descricao').value.trim();
  const taxaMora = parseFloat(document.getElementById('cred-taxa-mora').value)||1;
  const multaMora = parseFloat(document.getElementById('cred-multa').value)||2;
  const d = new Date(data1Str + 'T12:00:00');

  // ── MODO EDIÇÃO ──────────────────────────────────────────────
  if (editId) {
    const c = DB.crediarios.find(x => x.id === editId);
    if (!c) return;
    const temPagas = (c.parcelas||[]).some(p => p.pago);
    c.descricao = descricao;
    c.taxaMora = taxaMora;
    c.multaMora = multaMora;
    if (!temPagas) {
      // Sem pagamentos: recalcula tudo
      const total = parseFloat(document.getElementById('cred-total').value)||0;
      const entrada = parseFloat(document.getElementById('cred-entrada').value)||0;
      const n = parseInt(document.getElementById('cred-nparcelas').value)||1;
      const valorParcelado = Math.max(0, total - entrada);
      const valorParcela = valorParcelado / n;
      c.total = total; c.entrada = entrada; c.valorParcelado = valorParcelado; c.numParcelas = n;
      c.parcelas = Array.from({length:n}, (_,i) => {
        const vd = new Date(d); vd.setMonth(vd.getMonth()+i);
        return { numero:i+1, vencimento:vd.toISOString().slice(0,10),
          valorOriginal:Math.round(valorParcela*100)/100, valorPago:0,
          pago:false, formaPagamento:null, dataPagamento:null, observacao:'', pagamentos:[] };
      });
    } else {
      // Com pagamentos: só desloca datas das parcelas não pagas
      let unpaidCount = 0;
      c.parcelas = c.parcelas.map(p => {
        if (p.pago) return p;
        const vd = new Date(d); vd.setMonth(vd.getMonth() + unpaidCount++);
        return { ...p, vencimento: vd.toISOString().slice(0,10) };
      });
    }
    c.updatedAt = new Date().toISOString();
    _credResetFields();
    save();
    closeModal('modal-crediario');
    renderCrediario();
    if (typeof renderFinanceiro === 'function') renderFinanceiro();
    setTimeout(() => toggleCrediarioDetalhe(editId), 80);
    toast('Crediário atualizado ✅');
    return;
  }

  // ── MODO CRIAÇÃO ─────────────────────────────────────────────
  const cliId = document.getElementById('cred-cliente-id').value;
  const total = parseFloat(document.getElementById('cred-total').value)||0;
  if (!cliId) { alert('Selecione o cliente.'); return; }
  if (total <= 0) { alert('Informe o valor total.'); return; }
  const cli = DB.clientes.find(c=>c.id===cliId);
  const pedId = document.getElementById('cred-pedido-id').value || null;
  const entrada = parseFloat(document.getElementById('cred-entrada').value)||0;
  const n = parseInt(document.getElementById('cred-nparcelas').value)||1;
  const valorParcelado = Math.max(0, total - entrada);
  const valorParcela = valorParcelado / n;
  const parcelas = Array.from({length:n}, (_,i) => {
    const vd = new Date(d); vd.setMonth(vd.getMonth()+i);
    return { numero:i+1, vencimento:vd.toISOString().slice(0,10),
      valorOriginal:Math.round(valorParcela*100)/100, valorPago:0,
      pago:false, formaPagamento:null, dataPagamento:null, observacao:'', pagamentos:[] };
  });
  if (!DB.crediarios) DB.crediarios = [];
  DB.crediarios.push({
    id: (typeof crypto!=='undefined'&&crypto.randomUUID)?crypto.randomUUID():uid(),
    clienteId:cliId, clienteNome:cli?cli.nome:'', pedidoId:pedId, descricao,
    total, entrada, valorParcelado, numParcelas:n, taxaMora, multaMora,
    parcelas, status:'ativo', createdAt:new Date().toISOString(),
  });
  save();
  closeModal('modal-crediario');
  renderCrediario();
  if (typeof renderFinanceiro === 'function') renderFinanceiro();
  toast(`Crediário criado — ${n}x ${fmtMoney(valorParcela)} ✅`);
}

function excluirCrediario(id) {
  if (!confirm('Cancelar este crediário? O registro será mantido como cancelado.')) return;
  const c = DB.crediarios.find(x=>x.id===id);
  if (!c) return;
  c.status = 'cancelado';
  save();
  renderCrediario();
  if (typeof renderFinanceiro === 'function') renderFinanceiro();
  toast('Crediário cancelado.');
}

function abrirPagarParcela(credId, parcelaIdx) {
  const c = DB.crediarios.find(x=>x.id===credId);
  if (!c) return;
  const p = c.parcelas[parcelaIdx];
  if (!p) return;
  document.getElementById('pp-cred-id').value = credId;
  document.getElementById('pp-parcela-idx').value = parcelaIdx;
  document.getElementById('modal-pp-title').textContent = `Registrar Pagamento — ${c.clienteNome}`;
  document.getElementById('pp-info-num').textContent = `${p.numero}ª de ${c.numParcelas}`;
  document.getElementById('pp-info-venc').textContent = fmtDate(p.vencimento);
  document.getElementById('pp-info-orig').textContent = fmtMoney(p.valorOriginal);
  const jaRecebido = p.valorPago||0;
  const saldoParcela = Math.max(0, p.valorOriginal - jaRecebido);
  const sarEl = document.getElementById('pp-saldo-anterior-row');
  const srEl = document.getElementById('pp-saldo-row');
  if (jaRecebido > 0.01) {
    sarEl.style.display='flex';
    document.getElementById('pp-info-ja-recebido').textContent = fmtMoney(jaRecebido);
    srEl.style.display='flex';
    document.getElementById('pp-info-falta').textContent = fmtMoney(saldoParcela);
  } else { sarEl.style.display='none'; srEl.style.display='none'; }
  const juros = calcJurosMora(p, c.taxaMora||1, c.multaMora||2);
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const vd = new Date(p.vencimento+'T00:00:00');
  const jurosRow = document.getElementById('pp-juros-row');
  if (juros > 0.01) {
    jurosRow.style.display='flex';
    const multa = saldoParcela*((c.multaMora||2)/100);
    document.getElementById('pp-info-multa').textContent = fmtMoney(multa);
    document.getElementById('pp-info-juros').textContent = fmtMoney(juros-multa);
  } else jurosRow.style.display='none';
  const totalPagar = saldoParcela + juros;
  document.getElementById('pp-info-total').textContent = fmtMoney(totalPagar);
  document.getElementById('pp-valor').value = totalPagar.toFixed(2);
  document.getElementById('pp-valor').dataset.totalPagar = totalPagar.toFixed(2);
  document.getElementById('pp-troco-box').style.display='none';
  document.getElementById('pp-deficit-box').style.display='none';
  document.getElementById('pp-forma').value='pix';
  document.getElementById('pp-data').value=new Date().toISOString().slice(0,10);
  document.getElementById('pp-obs').value='';
  openModal('modal-pagar-parcela');
  setTimeout(()=>document.getElementById('pp-valor').focus(),120);
}

function ppCalcTroco() {
  const recebido = parseFloat(document.getElementById('pp-valor').value)||0;
  const total = parseFloat(document.getElementById('pp-valor').dataset.totalPagar)||0;
  const diff = recebido - total;
  const tBox = document.getElementById('pp-troco-box');
  const dBox = document.getElementById('pp-deficit-box');
  if (recebido <= 0) { tBox.style.display='none'; dBox.style.display='none'; return; }
  if (diff > 0.01) {
    tBox.style.display='block'; document.getElementById('pp-troco-val').textContent=fmtMoney(diff); dBox.style.display='none';
  } else if (diff < -0.01) {
    dBox.style.display='block'; document.getElementById('pp-deficit-val').textContent=fmtMoney(Math.abs(diff)); tBox.style.display='none';
  } else { tBox.style.display='none'; dBox.style.display='none'; }
}

function registrarPagamento() {
  const credId = document.getElementById('pp-cred-id').value;
  const idx = parseInt(document.getElementById('pp-parcela-idx').value);
  const recebido = parseFloat(document.getElementById('pp-valor').value)||0;
  const forma = document.getElementById('pp-forma').value;
  const data = document.getElementById('pp-data').value;
  const obs = document.getElementById('pp-obs').value.trim();
  if (recebido <= 0) { alert('Informe o valor recebido.'); return; }
  if (!data) { alert('Informe a data do pagamento.'); return; }
  const c = DB.crediarios.find(x=>x.id===credId);
  if (!c) return;
  const p = c.parcelas[idx];
  if (!p) return;
  if (!p.pagamentos) p.pagamentos = [];
  p.pagamentos.push({ valor: recebido, forma, data, obs });
  p.valorPago = Math.round(((p.valorPago||0) + recebido)*100)/100;
  p.formaPagamento = forma;
  p.dataPagamento = data;
  if (obs) p.observacao = obs;
  const saldoRestante = Math.max(0, p.valorOriginal - p.valorPago);
  p.pago = saldoRestante <= 0.02;
  c.status = computeStatusCrediario(c);
  save();
  closeModal('modal-pagar-parcela');
  renderCrediario();
  if (typeof renderFinanceiro === 'function') renderFinanceiro();
  setTimeout(()=>toggleCrediarioDetalhe(credId), 80);
  toast(p.pago ? `${p.numero}ª parcela quitada ✅` : `Pagamento parcial registrado. Falta ${fmtMoney(Math.max(0,p.valorOriginal-p.valorPago))}`);
}

function removerPagamento(credId, parcelaIdx, pgIdx) {
  if (!confirm('Remover este pagamento do histórico?')) return;
  const c = (DB.crediarios||[]).find(x => x.id === credId);
  if (!c) return;
  const p = c.parcelas[parcelaIdx];
  if (!p || !p.pagamentos || !p.pagamentos[pgIdx]) return;
  p.pagamentos.splice(pgIdx, 1);
  p.valorPago = Math.round(p.pagamentos.reduce((s, pg) => s + Number(pg.valor||0), 0) * 100) / 100;
  if (p.pagamentos.length > 0) {
    const last = p.pagamentos[p.pagamentos.length - 1];
    p.dataPagamento = last.data;
    p.formaPagamento = last.forma;
  } else {
    p.pago = false;
    p.dataPagamento = null;
    p.formaPagamento = null;
    p.valorPago = 0;
  }
  const totalPagar = p.valorOriginal;
  p.pago = p.valorPago >= totalPagar - 0.02;
  c.status = computeStatusCrediario(c);
  save();
  renderCrediario();
  if (typeof renderFinanceiro === 'function') renderFinanceiro();
  setTimeout(() => toggleCrediarioDetalhe(credId), 80);
  toast('Pagamento removido.');
}
window.removerPagamento = removerPagamento;

function resetarParcelaLegacy(credId, parcelaIdx) {
  if (!confirm('Estornar este pagamento e reabrir a parcela?')) return;
  const c = (DB.crediarios||[]).find(x => x.id === credId);
  if (!c) return;
  const p = c.parcelas[parcelaIdx];
  if (!p) return;
  p.pago = false;
  p.valorPago = 0;
  p.dataPagamento = null;
  p.formaPagamento = null;
  p.observacao = null;
  p.pagamentos = [];
  c.status = computeStatusCrediario(c);
  save();
  renderCrediario();
  if (typeof renderFinanceiro === 'function') renderFinanceiro();
  setTimeout(() => toggleCrediarioDetalhe(credId), 80);
  toast('Parcela reaberta. Registre o pagamento correto.');
}
window.resetarParcelaLegacy = resetarParcelaLegacy;
window.renderCrediario=renderCrediario;
window.setCreditFilter=setCreditFilter;
window.abrirNovoCrediario=abrirNovoCrediario;
window.credOnClienteChange=credOnClienteChange;
window.credOnPedidoChange=credOnPedidoChange;
window.credRecalc=credRecalc;
window.salvarCrediario=salvarCrediario;
window.excluirCrediario=excluirCrediario;
window.abrirEditarCrediario=abrirEditarCrediario;
window.abrirPagarParcela=abrirPagarParcela;

function editarParcela(credId, parcelaIdx) {
  const c = (DB.crediarios||[]).find(x => x.id === credId);
  if (!c) return;
  const p = (c.parcelas||[])[parcelaIdx];
  if (!p) return;
  document.getElementById('ep-cred-id').value = credId;
  document.getElementById('ep-parcela-idx').value = parcelaIdx;
  document.getElementById('modal-ep-title').textContent = `Editar ${p.numero}ª Parcela — ${c.clienteNome}`;
  document.getElementById('ep-numero').value = p.numero || (parcelaIdx + 1);
  document.getElementById('ep-vencimento').value = p.vencimento || '';
  document.getElementById('ep-valor-original').value = p.valorOriginal != null ? p.valorOriginal : '';
  // Seção de pagamento: só mostra se há dado de pagamento legado (pago=true sem array pagamentos)
  const temLegacy = p.pago && !(p.pagamentos && p.pagamentos.length);
  const secPago = document.getElementById('ep-pago-section');
  if (secPago) secPago.style.display = temLegacy ? 'block' : 'none';
  if (temLegacy) {
    document.getElementById('ep-valor-pago').value = p.valorPago != null ? p.valorPago : '';
    document.getElementById('ep-data-pgto').value = p.dataPagamento || '';
    document.getElementById('ep-forma-pgto').value = p.formaPagamento || '';
  }
  openModal('modal-editar-parcela');
}
window.editarParcela = editarParcela;

function salvarEdicaoParcela() {
  const credId = document.getElementById('ep-cred-id').value;
  const idx = parseInt(document.getElementById('ep-parcela-idx').value);
  const c = (DB.crediarios||[]).find(x => x.id === credId);
  if (!c || !c.parcelas[idx]) return;
  const p = c.parcelas[idx];
  const novoValorOrig = parseFloat(document.getElementById('ep-valor-original').value);
  if (isNaN(novoValorOrig) || novoValorOrig <= 0) { alert('Informe o valor original da parcela.'); return; }
  p.numero = parseInt(document.getElementById('ep-numero').value) || p.numero;
  p.vencimento = document.getElementById('ep-vencimento').value || p.vencimento;
  p.valorOriginal = Math.round(novoValorOrig * 100) / 100;
  // Dados de pagamento legado
  const secPago = document.getElementById('ep-pago-section');
  if (secPago && secPago.style.display !== 'none') {
    const vPago = parseFloat(document.getElementById('ep-valor-pago').value);
    if (!isNaN(vPago)) p.valorPago = Math.round(vPago * 100) / 100;
    const dataPgto = document.getElementById('ep-data-pgto').value;
    if (dataPgto) p.dataPagamento = dataPgto;
    const formaPgto = document.getElementById('ep-forma-pgto').value;
    if (formaPgto) p.formaPagamento = formaPgto;
    // Reavalia flag pago
    p.pago = p.valorPago >= p.valorOriginal - 0.02;
  }
  c.status = computeStatusCrediario(c);
  save();
  closeModal('modal-editar-parcela');
  renderCrediario();
  if (typeof renderFinanceiro === 'function') renderFinanceiro();
  setTimeout(() => toggleCrediarioDetalhe(credId), 80);
  toast('Parcela atualizada com sucesso!');
}
window.salvarEdicaoParcela = salvarEdicaoParcela;
window.ppCalcTroco=ppCalcTroco;
window.registrarPagamento=registrarPagamento;
window.toggleCrediarioDetalhe=toggleCrediarioDetalhe;

// (delegação de usuários removida — botões usam .onclick direto em renderConfig)

// ── ANOTAÇÕES ──
function salvarAnotacao(clienteId){
  const el=document.getElementById(`anotacao-input-${clienteId}`);
  if(!el)return;
  const texto=el.value.trim();
  if(!texto){toast('Escreva algo antes de salvar.');return;}
  if(!DB.anotacoes)DB.anotacoes=[];
  const obj={id:uid(),clienteId,texto,autor:currentUser.nome||'Vendedor',createdAt:new Date().toISOString()};
  DB.anotacoes.push(obj);
  save();
  if(typeof syncAnotacao==='function')syncAnotacao(obj);
  el.value='';
  renderClienteHub(clienteId);
  setTimeout(()=>{const tab=document.getElementById(`hub-tab-anotacoes-${clienteId}`);if(tab)tab.style.display='block';},10);
  toast('Anotação salva!');
}
function excluirAnotacao(id,clienteId){
  const i=(DB.anotacoes||[]).findIndex(a=>a.id===id);
  if(i>=0){DB.anotacoes[i].deleted=true;save();renderClienteHub(clienteId);
    setTimeout(()=>{const tab=document.getElementById(`hub-tab-anotacoes-${clienteId}`);if(tab)tab.style.display='block';},10);}
}
window.salvarAnotacao=salvarAnotacao;
window.excluirAnotacao=excluirAnotacao;

// ── AGENDAR TAREFA ──
function agendarTarefa(clienteId){
  pedirPermissaoNotificacao();
  const c=DB.clientes.find(x=>x.id===clienteId);
  // Preenche o modal de evento com o cliente e tipo follow_up
  document.getElementById('ev-id').value='';
  document.getElementById('ev-modal-title').textContent='Agendar Tarefa';
  document.getElementById('ev-data').value=new Date().toISOString().slice(0,10);
  document.getElementById('ev-hora').value='09:00';
  document.getElementById('ev-tipo').value='follow_up';
  document.getElementById('ev-titulo').value='';
  document.getElementById('ev-obs').value='';
  document.getElementById('ev-cliente-id').value=clienteId;
  document.getElementById('ev-cliente-nome').value=c?c.nome:'';
  const lb=document.getElementById('ev-lembrete');if(lb)lb.checked=true;
  openModal('modal-evento');
}
window.agendarTarefa=agendarTarefa;

// ── LEMBRETES (Notification API) ──
function pedirPermissaoNotificacao(){
  if(!('Notification' in window))return;
  if(Notification.permission==='default')Notification.requestPermission();
}
function agendarLembretes(){
  if(!('Notification' in window)||Notification.permission!=='granted')return;
  const now=Date.now();
  const limit=now+24*60*60*1000; // próximas 24h
  (DB.eventos||[]).filter(e=>!e.deleted&&e.lembrete&&e.status!=='concluido'&&e.data&&e.hora).forEach(e=>{
    const dt=new Date(`${e.data}T${e.hora}`).getTime();
    if(dt>now&&dt<=limit){
      const delay=dt-now;
      setTimeout(()=>{
        const cli=e.clienteNome?`\nCliente: ${e.clienteNome}`:'';
        new Notification(`📅 ${e.titulo}`,{body:`${e.tipo==='follow_up'?'Follow-up':e.tipo==='visita'?'Visita':e.tipo==='ligacao'?'Ligação':e.tipo}${cli}`,icon:'/haw-crm/icon-192.png'});
      },delay);
    }
  });
}

// ── SIDEBAR MOBILE ──
function toggleSidebar(){
  const sb=document.getElementById('sidebar');
  const ov=document.getElementById('sb-overlay');
  if(!sb)return;
  const open=sb.classList.toggle('open');
  if(ov)ov.classList.toggle('open',open);
}
function closeSidebar(){
  const sb=document.getElementById('sidebar');
  const ov=document.getElementById('sb-overlay');
  if(sb)sb.classList.remove('open');
  if(ov)ov.classList.remove('open');
}

// ── INIT (after all functions defined) ──
document.addEventListener('DOMContentLoaded',()=>{
  if(checkAprovacaoLink()) return; // página de aprovação de orçamento
  // Dark mode persistence
  try{if(localStorage.getItem('haw_dark')==='1'){document.documentElement.setAttribute('data-theme','dark');const b=document.getElementById('btn-dark-mode');if(b)b.textContent='☀️';}}catch(e){}
  loadFromStorage();
  renderDate();
  renderSidebarUser();
  updateNavCounts();
  renderDashboard();
  renderPipeline();
  renderClientes();
  renderPedidos();
  renderReceitas();
  renderFinanceiro();
  renderCatalogo();
  renderRelatorios();
  renderConfig();
  populateSelects();
  checkSession();
  iniciarSchedulerBackup();
  agendarLembretes();
});
