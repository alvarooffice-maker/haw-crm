// ══════════════════ FINANCEIRO — INNER TABS ══════════════════
function setFinTab(tab,btn){
  document.querySelectorAll('#fin-inner-tabs .inner-tab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  ['movimento','caixa','despesas','dre'].forEach(t=>{
    const el=document.getElementById('fin-panel-'+t);
    if(el) el.style.display=t===tab?'':'none';
  });
  if(tab==='caixa') renderCaixa();
  if(tab==='despesas') renderDespesas();
  if(tab==='dre') renderDRE();
}
window.setFinTab=setFinTab;

// ══════════════════ CAIXA DIÁRIO ══════════════════
const CAIXA_BADGE={
  abertura:{cls:'badge-green',label:'Abertura'},
  fechamento:{cls:'badge-gray',label:'Fechamento'},
  sangria:{cls:'badge-red',label:'Sangria'},
  suprimento:{cls:'badge-blue',label:'Suprimento'},
};
const CAIXA_ENTRADA=new Set(['abertura','suprimento']);

function renderCaixa(){
  const mes=document.getElementById('fin-mes')?.value||new Date().toISOString().slice(0,7);
  const movs=(DB.caixa||[]).filter(c=>c.data&&c.data.startsWith(mes)).sort((a,b)=>a.data.localeCompare(b.data));
  const tbody=document.getElementById('caixa-tbody');
  if(!tbody) return;
  tbody.innerHTML=movs.length?movs.map(c=>{
    const entrada=CAIXA_ENTRADA.has(c.tipo);
    const b=CAIXA_BADGE[c.tipo]||{cls:'badge-gray',label:c.tipo};
    return`<tr>
      <td>${fmtDate(c.data)}</td>
      <td><span class="badge ${b.cls}">${b.label}</span></td>
      <td style="color:var(--muted);font-size:12px">${c.descricao||'—'}</td>
      <td style="text-align:right;font-weight:600;color:${entrada?'var(--green)':'var(--red)'}">${entrada?'+':'-'}${fmtMoney(c.valor)}</td>
    </tr>`;
  }).join(''):'<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:24px">Nenhum movimento de caixa no período</td></tr>';
  const saldo=movs.reduce((s,c)=>s+(CAIXA_ENTRADA.has(c.tipo)?Number(c.valor):-Number(c.valor)),0);
  const el=document.getElementById('caixa-saldo');
  if(el){el.textContent=fmtMoney(saldo);el.style.color=saldo>=0?'var(--green)':'var(--red)';}
}
window.renderCaixa=renderCaixa;

function abrirMovimentoCaixa(tipo){
  const titles={abertura:'Abertura de Caixa',fechamento:'Fechamento de Caixa',sangria:'Sangria',suprimento:'Suprimento'};
  document.getElementById('caixa-tipo').value=tipo;
  document.getElementById('caixa-modal-title').textContent=titles[tipo]||'Movimento de Caixa';
  document.getElementById('caixa-data').value=new Date().toISOString().slice(0,10);
  document.getElementById('caixa-valor').value='';
  document.getElementById('caixa-descricao').value='';
  openModal('modal-caixa');
}
window.abrirMovimentoCaixa=abrirMovimentoCaixa;

function salvarMovimentoCaixa(){
  const tipo=document.getElementById('caixa-tipo').value;
  const valor=parseFloat(document.getElementById('caixa-valor').value);
  const data=document.getElementById('caixa-data').value;
  if(!valor||valor<=0){alert('Informe um valor válido');return;}
  if(!data){alert('Informe a data');return;}
  if(!DB.caixa)DB.caixa=[];
  DB.caixa.push({id:uid(),tipo,valor,data,descricao:document.getElementById('caixa-descricao').value.trim(),createdAt:new Date().toISOString()});
  save();closeModal('modal-caixa');renderCaixa();toast('Movimento de caixa registrado!');
}
window.salvarMovimentoCaixa=salvarMovimentoCaixa;

// ══════════════════ CONTAS A PAGAR ══════════════════
function renderDespesas(){
  const mes=document.getElementById('fin-mes')?.value||new Date().toISOString().slice(0,7);
  const hoje=new Date().toISOString().slice(0,10);
  const desp=(DB.despesas||[]).filter(d=>!d.deleted&&d.vencimento&&d.vencimento.startsWith(mes))
    .sort((a,b)=>a.vencimento.localeCompare(b.vencimento));
  const tbody=document.getElementById('desp-tbody');
  if(!tbody) return;
  tbody.innerHTML=desp.length?desp.map(d=>{
    const pago=!!d.pago;
    const vencida=!pago&&d.vencimento<hoje;
    return`<tr>
      <td style="font-weight:500">${d.descricao}</td>
      <td style="font-size:11px;color:var(--muted)">${d.categoria||'—'}</td>
      <td style="${vencida?'color:var(--red);font-weight:600':''}">${fmtDate(d.vencimento)}</td>
      <td style="font-weight:600;text-align:right">${fmtMoney(d.valor)}</td>
      <td><span class="badge ${pago?'badge-green':vencida?'badge-red':'badge-amber'}">${pago?'Pago':vencida?'Vencida':'A Pagar'}</span></td>
      <td>
        ${!pago?`<button class="btn btn-ghost btn-sm" onclick="pagarDespesa('${d.id}')" title="Marcar pago">✅</button>`:''}
        <button class="btn btn-ghost btn-sm" onclick="editarDespesa('${d.id}')" title="Editar">✏️</button>
        <button class="btn btn-ghost btn-sm" onclick="excluirDespesa('${d.id}')" title="Excluir">🗑️</button>
      </td>
    </tr>`;
  }).join(''):'<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:24px">Nenhuma conta a pagar no período</td></tr>';
  const total=desp.reduce((s,d)=>s+Number(d.valor||0),0);
  const pago=desp.filter(d=>d.pago).reduce((s,d)=>s+Number(d.valor||0),0);
  const elT=document.getElementById('desp-total');if(elT)elT.textContent=fmtMoney(total);
  const elP=document.getElementById('desp-pago');if(elP)elP.textContent=fmtMoney(pago);
  const elA=document.getElementById('desp-apagar');if(elA)elA.textContent=fmtMoney(total-pago);
}
window.renderDespesas=renderDespesas;

function abrirNovaDespesa(){
  document.getElementById('desp-id').value='';
  document.getElementById('desp-modal-title').textContent='Nova Conta a Pagar';
  document.getElementById('desp-descricao').value='';
  document.getElementById('desp-valor').value='';
  document.getElementById('desp-vencimento').value='';
  document.getElementById('desp-categoria').value='';
  document.getElementById('desp-pago-check').checked=false;
  openModal('modal-despesa');
}
window.abrirNovaDespesa=abrirNovaDespesa;

function editarDespesa(id){
  const d=(DB.despesas||[]).find(x=>x.id===id);if(!d)return;
  document.getElementById('desp-id').value=d.id;
  document.getElementById('desp-modal-title').textContent='Editar Conta';
  document.getElementById('desp-descricao').value=d.descricao||'';
  document.getElementById('desp-valor').value=d.valor||'';
  document.getElementById('desp-vencimento').value=d.vencimento||'';
  document.getElementById('desp-categoria').value=d.categoria||'';
  document.getElementById('desp-pago-check').checked=!!d.pago;
  openModal('modal-despesa');
}
window.editarDespesa=editarDespesa;

function salvarDespesa(){
  const id=document.getElementById('desp-id').value;
  const descricao=document.getElementById('desp-descricao').value.trim();
  const valor=parseFloat(document.getElementById('desp-valor').value);
  if(!descricao||isNaN(valor)||valor<=0){alert('Descrição e valor são obrigatórios');return;}
  if(!DB.despesas)DB.despesas=[];
  const pago=document.getElementById('desp-pago-check').checked;
  const obj={id:id||uid(),descricao,valor,vencimento:document.getElementById('desp-vencimento').value,categoria:document.getElementById('desp-categoria').value,pago,dataPagamento:pago?new Date().toISOString().slice(0,10):undefined};
  if(id){const i=DB.despesas.findIndex(d=>d.id===id);if(i>=0)DB.despesas[i]=Object.assign(DB.despesas[i],obj);}
  else{obj.createdAt=new Date().toISOString();DB.despesas.push(obj);}
  save();closeModal('modal-despesa');renderDespesas();toast('Conta salva!');
}
window.salvarDespesa=salvarDespesa;

function pagarDespesa(id){
  const d=(DB.despesas||[]).find(x=>x.id===id);if(!d)return;
  d.pago=true;d.dataPagamento=new Date().toISOString().slice(0,10);
  save();renderDespesas();toast('Conta marcada como paga! ✅');
}
window.pagarDespesa=pagarDespesa;

function excluirDespesa(id){
  if(!confirm('Excluir esta conta?'))return;
  const i=(DB.despesas||[]).findIndex(x=>x.id===id);if(i<0)return;
  DB.despesas[i].deleted=true;
  save();renderDespesas();toast('Conta excluída');
}
window.excluirDespesa=excluirDespesa;

// ══════════════════ DRE ══════════════════
function renderDRE(){
  const mes=document.getElementById('fin-mes')?.value||new Date().toISOString().slice(0,7);
  const peds=DB.pedidos.filter(p=>!p.deleted);
  const credPedIds=new Set((DB.crediarios||[]).filter(c=>c.status!=='cancelado'&&c.pedidoId).map(c=>c.pedidoId));
  const entregues=peds.filter(p=>!credPedIds.has(p.id)&&['entregue','pos_venda'].includes(p.status)&&(p.dataEntrega||p.createdAt||'').startsWith(mes));
  const recPedidos=entregues.reduce((s,p)=>s+Number(p.total||0),0);
  let recCred=0;
  (DB.crediarios||[]).forEach(c=>{
    if(c.status==='cancelado')return;
    if(c.entrada>0&&(c.createdAt||'').startsWith(mes))recCred+=Number(c.entrada);
    (c.parcelas||[]).forEach(p=>{
      if(p.pagamentos?.length)p.pagamentos.forEach(pg=>{if((pg.data||'').startsWith(mes))recCred+=Number(pg.valor||0);});
      else if((p.valorPago||0)>0&&(p.dataPagamento||'').startsWith(mes))recCred+=Number(p.valorPago);
    });
  });
  const recTotal=recPedidos+recCred;
  const despaspagas=(DB.despesas||[]).filter(d=>!d.deleted&&d.pago&&(d.dataPagamento||d.vencimento||'').startsWith(mes));
  const despTotal=despaspagas.reduce((s,d)=>s+Number(d.valor||0),0);
  const resultado=recTotal-despTotal;
  const despByCat={};
  despaspagas.forEach(d=>{const c=d.categoria||'Outros';despByCat[c]=(despByCat[c]||0)+Number(d.valor||0);});
  const el=document.getElementById('dre-content');
  if(!el)return;
  el.innerHTML=`<div style="max-width:600px">
    <div class="card" style="margin-bottom:16px">
      <div class="ch"><span class="ct" style="color:var(--green)">📈 RECEITAS — ${mes}</span></div>
      <div style="padding:0 16px 16px">
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)"><span>Pedidos entregues</span><span style="font-weight:600">${fmtMoney(recPedidos)}</span></div>
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)"><span>Recebimentos crediário</span><span style="font-weight:600">${fmtMoney(recCred)}</span></div>
        <div style="display:flex;justify-content:space-between;padding:10px 0;font-weight:700;font-size:15px"><span>Total Receitas</span><span style="color:var(--green)">${fmtMoney(recTotal)}</span></div>
      </div>
    </div>
    <div class="card" style="margin-bottom:16px">
      <div class="ch"><span class="ct" style="color:var(--red)">📉 DESPESAS PAGAS — ${mes}</span></div>
      <div style="padding:0 16px 16px">
        ${Object.entries(despByCat).map(([cat,val])=>`<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border)"><span style="color:var(--muted)">${cat}</span><span>${fmtMoney(val)}</span></div>`).join('')||'<div style="padding:12px 0;color:var(--muted);text-align:center">Nenhuma despesa paga registrada no período</div>'}
        <div style="display:flex;justify-content:space-between;padding:10px 0;font-weight:700;font-size:15px"><span>Total Despesas</span><span style="color:var(--red)">${fmtMoney(despTotal)}</span></div>
      </div>
    </div>
    <div class="card" style="border-top:3px solid ${resultado>=0?'var(--green)':'var(--red)'}">
      <div style="padding:20px">
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em">Resultado Líquido</div>
        <div style="font-size:32px;font-weight:900;color:${resultado>=0?'var(--green)':'var(--red)'};margin-top:8px">${fmtMoney(resultado)}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:4px">${resultado>=0?'✅ Período positivo':'⚠️ Período negativo'}</div>
      </div>
    </div>
  </div>`;
}
window.renderDRE=renderDRE;

// ══════════════════ ENTRADA DE ESTOQUE ══════════════════
function abrirEntradaEstoque(prodId){
  const p=DB.produtos.find(x=>x.id===prodId);if(!p)return;
  document.getElementById('estoque-prod-id').value=prodId;
  document.getElementById('estoque-prod-nome').textContent=p.nome;
  document.getElementById('estoque-prod-atual').textContent=p.estoque!=null?p.estoque:0;
  document.getElementById('estoque-quantidade').value='';
  document.getElementById('estoque-obs').value='';
  openModal('modal-estoque-entrada');
}
window.abrirEntradaEstoque=abrirEntradaEstoque;

function abrirEntradaEstoqueLista(categoria){
  const prods=DB.produtos.filter(p=>!p.deleted&&p.ativo&&p.categoria===categoria);
  if(!prods.length){toast('Nenhum produto ativo nesta categoria');return;}
  if(prods.length===1){abrirEntradaEstoque(prods[0].id);return;}
  // Mostrar lista para seleção
  const sel=prompt('Selecione o produto pelo número:\n'+prods.map((p,i)=>`${i+1}. ${p.nome} (estoque: ${p.estoque!=null?p.estoque:'—'})`).join('\n'));
  const idx=parseInt(sel)-1;
  if(isNaN(idx)||idx<0||idx>=prods.length){return;}
  abrirEntradaEstoque(prods[idx].id);
}
window.abrirEntradaEstoqueLista=abrirEntradaEstoqueLista;

function salvarEntradaEstoque(){
  const prodId=document.getElementById('estoque-prod-id').value;
  const qtd=parseInt(document.getElementById('estoque-quantidade').value);
  if(!prodId||isNaN(qtd)||qtd<=0){alert('Informe uma quantidade válida');return;}
  const i=DB.produtos.findIndex(p=>p.id===prodId);if(i<0)return;
  DB.produtos[i].estoque=(DB.produtos[i].estoque||0)+qtd;
  DB.produtos[i].updatedAt=new Date().toISOString();
  save();closeModal('modal-estoque-entrada');renderCatalogo();toast(`+${qtd} unidade${qtd!==1?'s':''} adicionada${qtd!==1?'s':''} ao estoque!`);
}
window.salvarEntradaEstoque=salvarEntradaEstoque;

// ══════════════════ IMPORTAR CLIENTES CSV ══════════════════
function importarClientesCSV(file){
  if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{
    const text=e.target.result;
    const lines=text.split('\n').map(l=>l.trim()).filter(l=>l);
    if(!lines.length){alert('Arquivo vazio');return;}
    const sep=lines[0].includes(';')?';':',';
    const header=lines[0].split(sep).map(h=>h.replace(/["\r]/g,'').toLowerCase().trim());
    const findCol=(aliases)=>{for(const a of aliases){const i=header.findIndex(h=>h.includes(a));if(i>=0)return i;}return -1;};
    const idxNome=findCol(['nome','name','cliente','razao social','razão social']);
    if(idxNome<0){alert('Coluna "Nome" não encontrada.\n\nColunas: '+header.join(', '));return;}
    const idxTel=findCol(['telefone','tel','phone','celular','whatsapp']);
    const idxEmail=findCol(['email','e-mail']);
    const idxCpf=findCol(['cpf','documento']);
    const idxNasc=findCol(['nascimento','nasc','dob','aniversar']);
    const existentes=new Set(DB.clientes.filter(c=>!c.deleted).map(c=>c.nome.toLowerCase().trim()));
    let importados=0,duplicados=0;
    lines.slice(1).forEach(line=>{
      const cols=line.split(sep).map(c=>c.replace(/["\r]/g,'').trim());
      const nome=cols[idxNome];if(!nome)return;
      if(existentes.has(nome.toLowerCase())){duplicados++;return;}
      DB.clientes.push({id:uid(),nome,telefone:idxTel>=0?(cols[idxTel]||''):'',email:idxEmail>=0?(cols[idxEmail]||''):'',cpf:idxCpf>=0?(cols[idxCpf]||''):'',dataNasc:idxNasc>=0?(cols[idxNasc]||''):'',status:'ativo',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
      existentes.add(nome.toLowerCase());importados++;
    });
    save();renderClientes();updateNavCounts();
    toast(`✅ ${importados} cliente${importados!==1?'s':''} importado${importados!==1?'s':''}${duplicados?` (${duplicados} duplicado${duplicados!==1?'s':''} ignorado${duplicados!==1?'s':''})`:''}`);
  };
  reader.readAsText(file,'UTF-8');
}
window.importarClientesCSV=importarClientesCSV;

// ══════════════════ RELATÓRIO DE COMISSÕES PDF ══════════════════
function gerarComissoesPDF(){
  const mes=(document.getElementById('rel-mes')?.value)||new Date().toISOString().slice(0,7);
  const peds=DB.pedidos.filter(p=>!p.deleted&&['entregue','pos_venda'].includes(p.status)&&(p.dataEntrega||p.createdAt||'').startsWith(mes));
  const vendedores=DB.usuarios.filter(u=>!u.deleted&&['vendedor','gestor','dono'].includes(u.perfil));
  const rows=vendedores.map(v=>{
    const vp=peds.filter(p=>p.vendedorId===v.id);
    const total=vp.reduce((s,p)=>s+Number(p.total||0),0);
    const pct=v.comissao!=null?v.comissao:3;
    return{nome:v.nome,qtd:vp.length,total,pct,com:total*pct/100,peds:vp};
  }).filter(r=>r.qtd>0);
  if(!rows.length){toast('Nenhuma venda no período para gerar relatório');return;}
  const emp=(DB.settings&&DB.settings.empresa)||{nome:'HAW Vision',cnpj:''};
  const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Comissões ${mes}</title>
  <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;background:#fff;padding:20px;color:#111}
  @page{size:A4;margin:14mm 16mm}@media print{.np{display:none!important}}
  h1{font-size:20px;font-weight:900;color:#13182C;border-bottom:3px solid #F7CF13;padding-bottom:8px;margin-bottom:4px}
  .sub{font-size:11px;color:#888;margin-bottom:20px}
  .vc{margin-bottom:20px;border:1px solid #ddd;border-radius:4px;overflow:hidden}
  .vh{background:#13182C;color:#fff;padding:10px 16px;display:flex;justify-content:space-between}
  .vn{font-size:14px;font-weight:700}.vm{font-size:11px;color:#F7CF13}
  table{width:100%;border-collapse:collapse}
  th{background:#f0f2f5;font-size:10px;padding:6px 8px;text-align:left;border-bottom:2px solid #ddd;font-weight:700;text-transform:uppercase}
  td{padding:6px 8px;font-size:11px;border-bottom:1px solid #eee}
  .tr{background:#f7f8fb;font-weight:700}.hi{color:#13182C;font-size:14px}.go{color:#b8960a}
  .btn{background:#13182C;color:#F7CF13;border:none;padding:9px 22px;font-size:13px;font-weight:700;border-radius:4px;cursor:pointer;margin:14px auto;display:block}
  </style></head><body>
  <h1>Relatório de Comissões</h1>
  <div class="sub">${emp.nome} · Período: ${mes} · Gerado em: ${new Date().toLocaleDateString('pt-BR')}</div>
  ${rows.map(r=>`<div class="vc">
    <div class="vh"><div class="vn">${r.nome}</div><div class="vm">${r.qtd} venda${r.qtd!==1?'s':''} · Taxa: ${r.pct}%</div></div>
    <table><thead><tr><th>#</th><th>Cliente</th><th>Data</th><th style="text-align:right">Valor</th></tr></thead><tbody>
    ${r.peds.map(p=>{const cli=DB.clientes.find(c=>c.id===p.clienteId)||{nome:'?'};return`<tr><td>#${p.numero}</td><td>${cli.nome}</td><td>${fmtDate(p.dataEntrega||p.createdAt)}</td><td style="text-align:right">${fmtMoney(p.total)}</td></tr>`;}).join('')}
    <tr class="tr"><td colspan="3">Total de Vendas</td><td style="text-align:right" class="hi">${fmtMoney(r.total)}</td></tr>
    <tr class="tr"><td colspan="3" class="go">Comissão (${r.pct}%)</td><td style="text-align:right" class="hi go">${fmtMoney(r.com)}</td></tr>
    </tbody></table></div>`).join('')}
  <div class="vc" style="border-color:#F7CF13">
    <div class="vh"><div class="vn">RESUMO GERAL</div></div>
    <table><tbody>
    <tr><td>Total de Vendas</td><td class="hi">${fmtMoney(rows.reduce((s,r)=>s+r.total,0))}</td></tr>
    <tr><td class="go">Total de Comissões</td><td class="hi go">${fmtMoney(rows.reduce((s,r)=>s+r.com,0))}</td></tr>
    ${rows.map(r=>`<tr><td>${r.nome}</td><td class="go">${fmtMoney(r.com)}</td></tr>`).join('')}
    </tbody></table></div>
  <button class="btn np" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>
  <script>window.onload=()=>setTimeout(()=>window.print(),400)<\/script>
  </body></html>`;
  const w=window.open('','_blank','width=800,height=900');
  if(!w){toast('Permita pop-ups para gerar o PDF.');return;}
  w.document.write(html);w.document.close();
}
window.gerarComissoesPDF=gerarComissoesPDF;

// ══════════════════ APROVAÇÃO DE ORÇAMENTO VIA LINK ══════════════════
function gerarLinkAprovacao(pedidoId){
  const p=DB.pedidos.find(x=>x.id===pedidoId);if(!p){toast('Pedido não encontrado');return;}
  const cli=DB.clientes.find(c=>c.id===p.clienteId)||{nome:'Cliente'};
  const emp=(DB.settings&&DB.settings.empresa)||{nome:'HAW Vision'};
  const dados={t:'orca',num:p.numero,cli:cli.nome,tel:cli.telefone||'',itens:(p.itens||[]).map(it=>({n:it.nome||it.descricao||'Item',q:it.quantidade||1,v:Number(it.valor||it.preco||0)})),total:p.total,emp:emp.nome,pagamento:p.pagamento||''};
  const b64=btoa(unescape(encodeURIComponent(JSON.stringify(dados))));
  const base=window.location.origin+window.location.pathname;
  const link=`${base}?aprova=${b64}`;
  navigator.clipboard.writeText(link).then(()=>toast('🔗 Link copiado! Envie ao cliente.')).catch(()=>prompt('Link de aprovação:',link));
}
window.gerarLinkAprovacao=gerarLinkAprovacao;

function checkAprovacaoLink(){
  const params=new URLSearchParams(window.location.search);
  const aprova=params.get('aprova');
  if(!aprova)return false;
  try{
    const d=JSON.parse(decodeURIComponent(escape(atob(aprova))));
    if(d.t!=='orca')return false;
    const itensHtml=(d.itens||[]).map(it=>`<tr><td>${it.n}</td><td style="text-align:center">${it.q}</td><td style="text-align:right;font-weight:600">R$ ${(it.v*it.q).toFixed(2).replace('.',',')}</td></tr>`).join('');
    document.body.innerHTML=`<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;background:#f4f6fa;color:#222;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
    .card{background:#fff;border-radius:12px;padding:24px;max-width:480px;width:100%;box-shadow:0 2px 20px rgba(0,0,0,.1)}
    .logo{background:#13182C;color:#F7CF13;padding:14px 20px;border-radius:8px 8px 0 0;text-align:center;font-size:18px;font-weight:900;margin:-24px -24px 20px}
    h2{font-size:16px;margin-bottom:4px;color:#13182C}.sub{font-size:12px;color:#888;margin-bottom:16px}
    table{width:100%;border-collapse:collapse;margin-bottom:16px}
    th{background:#f0f2f5;font-size:11px;padding:7px;text-align:left}td{padding:7px;border-bottom:1px solid #eee;font-size:13px}
    .tot{background:#f7f8fb;font-weight:700;font-size:16px;padding:12px;border-radius:8px;display:flex;justify-content:space-between;margin-bottom:20px}
    .tv{color:#13182C;font-size:20px}.btns{display:grid;gap:10px}
    .ba{padding:14px;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer}
    .ok{background:#22c55e;color:#fff}.wa{background:#25D366;color:#fff}
    .msg{text-align:center;padding:16px;border-radius:8px;margin-top:10px;font-size:14px}
    </style>
    <div class="card">
      <div class="logo">${d.emp}</div>
      <h2>Orçamento #${d.num}</h2>
      <div class="sub">Olá, ${d.cli}! Confira e aprove o orçamento abaixo.</div>
      ${itensHtml?`<table><thead><tr><th>Produto</th><th>Qtd</th><th>Valor</th></tr></thead><tbody>${itensHtml}</tbody></table>`:''}
      <div class="tot"><span>Total</span><span class="tv">R$ ${Number(d.total||0).toFixed(2).replace('.',',')}</span></div>
      ${d.pagamento?`<div style="font-size:12px;color:#888;margin-bottom:16px">Forma de pagamento: ${d.pagamento}</div>`:''}
      <div class="btns">
        <button class="ba ok" onclick="this.textContent='✅ Aprovado!';this.disabled=true;document.getElementById('msg').style.display='block'">✅ Aprovar Orçamento</button>
        ${d.tel?`<button class="ba wa" onclick="window.open('https://wa.me/55${(d.tel||'').replace(/\D/g,'')}?text='+encodeURIComponent('Olá! Aprovei o orçamento #${d.num} da ${d.emp}.'),'_blank')">💬 Falar no WhatsApp</button>`:''}
      </div>
      <div id="msg" class="msg" style="display:none;background:#dcfce7">Orçamento aprovado! Entraremos em contato em breve.</div>
    </div>`;
    history.replaceState({},'',window.location.pathname);
    return true;
  }catch(e){return false;}
}
window.checkAprovacaoLink=checkAprovacaoLink;

// ══════════════════ DARK MODE ══════════════════
function toggleDarkMode(){
  const dark=document.documentElement.getAttribute('data-theme')==='dark';
  document.documentElement.setAttribute('data-theme',dark?'light':'dark');
  document.getElementById('btn-dark-mode').textContent=dark?'🌙':'☀️';
  try{localStorage.setItem('haw_dark',dark?'0':'1');}catch(e){}
}
(function(){
  try{if(localStorage.getItem('haw_dark')==='1'){document.documentElement.setAttribute('data-theme','dark');}}catch(e){}
})();

// ══════════════════ AGENDA ══════════════════
function renderAgenda(){
  const sel=document.getElementById('agenda-data').value;
  if(!sel)return;
  const d=new Date(sel+'T00:00:00');
  const opts={weekday:'long',day:'numeric',month:'long'};
  document.getElementById('agenda-dia-label').textContent=d.toLocaleDateString('pt-BR',opts);
  const eventos=(DB.eventos||[]).filter(e=>!e.deleted);
  // Dia selecionado
  const diaEvs=eventos.filter(e=>e.data===sel).sort((a,b)=>(a.hora||'').localeCompare(b.hora||''));
  document.getElementById('cnt-agenda-dia').textContent=diaEvs.length;
  document.getElementById('agenda-dia-lista').innerHTML=diaEvs.length?diaEvs.map(e=>evItemHtml(e)).join(''):'<div class="empty" style="padding:20px"><div class="empty-text">Nenhum evento neste dia</div></div>';
  // Próximos 7 dias
  const amanha=new Date(d);amanha.setDate(amanha.getDate()+1);
  const fim7=new Date(d);fim7.setDate(fim7.getDate()+7);
  const fim7str=fim7.toISOString().slice(0,10);
  const amanhaStr=amanha.toISOString().slice(0,10);
  const semanaEvs=eventos.filter(e=>e.data>=amanhaStr&&e.data<=fim7str).sort((a,b)=>a.data.localeCompare(b.data)||(a.hora||'').localeCompare(b.hora||''));
  document.getElementById('agenda-semana-lista').innerHTML=semanaEvs.length?semanaEvs.map(e=>evItemHtml(e,true)).join(''):'<div class="empty" style="padding:20px"><div class="empty-text">Sem eventos nos próximos 7 dias</div></div>';
  // Tabela completa
  const todos=eventos.sort((a,b)=>b.data.localeCompare(a.data)||(b.hora||'').localeCompare(a.hora||''));
  document.getElementById('agenda-all-tbody').innerHTML=todos.length?todos.map(e=>{
    const cli=DB.clientes.find(c=>c.id===e.clienteId);
    const passado=e.data<new Date().toISOString().slice(0,10)&&e.status!=='concluido';
    return`<tr>
      <td>${e.data.split('-').reverse().join('/')} ${e.hora||''}</td>
      <td><span class="badge badge-blue">${evTipoLabel(e.tipo)}</span></td>
      <td>${e.titulo}</td>
      <td>${cli?cli.nome:e.clienteNome||'—'}</td>
      <td><span class="badge ${e.status==='concluido'?'badge-green':passado?'badge-red':'badge-gold'}">${e.status==='concluido'?'Concluído':passado?'Atrasado':'Agendado'}</span></td>
      <td style="white-space:nowrap">
        <button class="btn btn-ghost btn-sm" onclick="editarEvento('${e.id}')">✏️</button>
        ${e.status!=='concluido'?`<button class="btn btn-ghost btn-sm" onclick="concluirEvento('${e.id}')" title="Marcar concluído">✅</button>`:''}
        ${cli&&cli.telefone?`<button class="btn btn-ghost btn-sm" onclick="abrirWA('${cli.id}')" title="WhatsApp">💬</button>`:''}
        <button class="btn btn-danger btn-sm" onclick="excluirEvento('${e.id}')">🗑</button>
      </td></tr>`;
  }).join(''):'<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:24px">Nenhum evento cadastrado</td></tr>';
  // Atualizar count sidebar
  const hoje=new Date().toISOString().slice(0,10);
  const cntEl=document.getElementById('cnt-agenda');
  if(cntEl)cntEl.textContent=eventos.filter(e=>e.data===hoje&&e.status!=='concluido').length;
}
function evItemHtml(e,showDate=false){
  const cli=DB.clientes.find(c=>c.id===e.clienteId);
  const hoje=new Date().toISOString().slice(0,10);
  const passado=e.data<hoje&&e.status!=='concluido';
  const cor=e.status==='concluido'?'var(--green)':passado?'var(--red)':'var(--gold)';
  return`<div class="ev-item" onclick="editarEvento('${e.id}')">
    <div class="ev-dot" style="background:${cor}"></div>
    <div class="ev-time">${showDate?e.data.slice(5).replace('-','/'):''}${e.hora||'—'}</div>
    <div class="ev-body"><div class="ev-title">${e.titulo}</div><div class="ev-sub">${evTipoLabel(e.tipo)}${cli?' · '+cli.nome:''}</div></div>
  </div>`;
}
function evTipoLabel(t){const m={consulta:'👁️ Consulta',retorno:'🔄 Retorno',entrega:'📦 Entrega',pagamento:'💰 Pagamento',outro:'📌 Outro'};return m[t]||t;}
function agendaNavDia(delta){
  const el=document.getElementById('agenda-data');
  const d=new Date((el.value||new Date().toISOString().slice(0,10))+'T00:00:00');
  d.setDate(d.getDate()+delta);
  el.value=d.toISOString().slice(0,10);
  renderAgenda();
}
function filtrarClientesEv(q){_filtrarCliDrop(q,'ev-cliente-nome','ev-cliente-id','ev-clientes-drop');}
function _filtrarCliDrop(q,inputId,hidId,dropId){
  const drop=document.getElementById(dropId);
  if(!q||q.length<2){drop.style.display='none';return;}
  const res=DB.clientes.filter(c=>!c.deleted&&c.nome&&c.nome.toLowerCase().includes(q.toLowerCase())).slice(0,8);
  if(!res.length){drop.style.display='none';return;}
  drop.style.display='block';
  drop.innerHTML=res.map(c=>`<div style="padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--border-light);font-size:13px" onmousedown="document.getElementById('${inputId}').value='${c.nome.replace(/'/g,"\\'")}';document.getElementById('${hidId}').value='${c.id}';document.getElementById('${dropId}').style.display='none'">${c.nome}<span style="font-size:11px;color:var(--muted);margin-left:8px">${c.telefone||''}</span></div>`).join('');
}
function abrirNovoEvento(){
  document.getElementById('ev-id').value='';
  document.getElementById('ev-modal-title').textContent='Novo Evento';
  document.getElementById('ev-data').value=new Date().toISOString().slice(0,10);
  document.getElementById('ev-hora').value='';
  document.getElementById('ev-tipo').value='consulta';
  document.getElementById('ev-titulo').value='';
  document.getElementById('ev-cliente-nome').value='';
  document.getElementById('ev-cliente-id').value='';
  document.getElementById('ev-obs').value='';
  openModal('modal-evento');
}
function editarEvento(id){
  const e=(DB.eventos||[]).find(x=>x.id===id);if(!e)return;
  document.getElementById('ev-id').value=e.id;
  document.getElementById('ev-modal-title').textContent='Editar Evento';
  document.getElementById('ev-data').value=e.data;
  document.getElementById('ev-hora').value=e.hora||'';
  document.getElementById('ev-tipo').value=e.tipo||'outro';
  document.getElementById('ev-titulo').value=e.titulo;
  const cli=DB.clientes.find(c=>c.id===e.clienteId);
  document.getElementById('ev-cliente-nome').value=cli?cli.nome:e.clienteNome||'';
  document.getElementById('ev-cliente-id').value=e.clienteId||'';
  document.getElementById('ev-obs').value=e.obs||'';
  openModal('modal-evento');
}
function salvarEvento(){
  const titulo=document.getElementById('ev-titulo').value.trim();
  const data=document.getElementById('ev-data').value;
  if(!titulo||!data){toast('Preencha título e data.');return;}
  if(!DB.eventos)DB.eventos=[];
  const id=document.getElementById('ev-id').value;
  const lembreteEl=document.getElementById('ev-lembrete');
  const obj={titulo,data,hora:document.getElementById('ev-hora').value,tipo:document.getElementById('ev-tipo').value,
    clienteId:document.getElementById('ev-cliente-id').value,clienteNome:document.getElementById('ev-cliente-nome').value,
    obs:document.getElementById('ev-obs').value,lembrete:lembreteEl?lembreteEl.checked:false,status:'agendado'};
  const clienteId=obj.clienteId;
  if(id){const i=DB.eventos.findIndex(x=>x.id===id);if(i>=0)Object.assign(DB.eventos[i],obj);}
  else{obj.id=uid();obj.createdAt=new Date().toISOString();DB.eventos.push(obj);}
  save();closeModal('modal-evento');renderAgenda();
  if(typeof agendarLembretes==='function')agendarLembretes();
  // Se veio do hub do cliente, re-renderiza
  if(clienteId&&typeof renderClienteHub==='function'){renderClienteHub(clienteId);}
  const isTarefa=['follow_up','visita','ligacao'].includes(obj.tipo);
  toast(isTarefa?'Tarefa agendada!':'Evento salvo!');
}
function concluirEvento(id){
  const e=(DB.eventos||[]).find(x=>x.id===id);if(!e)return;
  e.status='concluido';save();renderAgenda();toast('Evento marcado como concluído!');
}
function excluirEvento(id){
  if(!confirm('Excluir este evento?'))return;
  const i=(DB.eventos||[]).findIndex(x=>x.id===id);if(i>=0){DB.eventos[i].deleted=true;save();renderAgenda();toast('Evento excluído.');}
}

// ══════════════════ ORÇAMENTOS ══════════════════
let _orcItens=[];
function filtrarClientesOrc(q){_filtrarCliDrop(q,'orc-cliente-nome','orc-cliente-id','orc-clientes-drop');}
function abrirNovoOrcamento(){
  _orcItens=[{nome:'',qty:1,valor:0}];
  document.getElementById('orc-id').value='';
  document.getElementById('orc-modal-title').textContent='Novo Orçamento';
  document.getElementById('orc-cliente-nome').value='';
  document.getElementById('orc-cliente-id').value='';
  document.getElementById('orc-validade').value=DB.settings.empresa&&DB.settings.empresa.validade?DB.settings.empresa.validade:15;
  document.getElementById('orc-pagamento').value='À vista';
  document.getElementById('orc-desconto').value=0;
  document.getElementById('orc-obs').value='';
  renderItensOrc();
  openModal('modal-orcamento');
}
function editarOrcamento(id){
  const o=(DB.orcamentos||[]).find(x=>x.id===id);if(!o)return;
  _orcItens=(o.itens||[]).map(it=>({...it}));
  if(!_orcItens.length)_orcItens=[{nome:'',qty:1,valor:0}];
  document.getElementById('orc-id').value=o.id;
  document.getElementById('orc-modal-title').textContent='Editar Orçamento';
  const cli=DB.clientes.find(c=>c.id===o.clienteId);
  document.getElementById('orc-cliente-nome').value=cli?cli.nome:o.clienteNome||'';
  document.getElementById('orc-cliente-id').value=o.clienteId||'';
  document.getElementById('orc-validade').value=o.validade||15;
  document.getElementById('orc-pagamento').value=o.pagamento||'À vista';
  document.getElementById('orc-desconto').value=o.desconto||0;
  document.getElementById('orc-obs').value=o.obs||'';
  renderItensOrc();
  openModal('modal-orcamento');
}
function addItemOrc(){_orcItens.push({nome:'',qty:1,valor:0});renderItensOrc();}
function renderItensOrc(){
  const w=document.getElementById('orc-itens-wrap');
  w.innerHTML=_orcItens.map((it,i)=>`
    <div class="orcamento-item" style="gap:8px;align-items:flex-start;padding:8px 0">
      <div style="flex:2"><input class="form-input" placeholder="Produto/serviço" value="${it.nome||''}" oninput="_orcItens[${i}].nome=this.value"></div>
      <div style="width:60px"><input class="form-input" type="number" min="1" value="${it.qty||1}" oninput="_orcItens[${i}].qty=parseInt(this.value)||1;calcTotalOrc()"></div>
      <div style="width:100px"><input class="form-input" type="number" min="0" step="0.01" value="${it.valor||0}" oninput="_orcItens[${i}].valor=parseFloat(this.value)||0;calcTotalOrc()" placeholder="R$"></div>
      <button class="btn btn-danger btn-sm" onclick="_orcItens.splice(${i},1);renderItensOrc()" style="flex-shrink:0">🗑</button>
    </div>`).join('');
  calcTotalOrc();
}
function calcTotalOrc(){
  const sub=_orcItens.reduce((s,it)=>s+(it.qty||1)*(it.valor||0),0);
  const desc=parseFloat(document.getElementById('orc-desconto')?.value||0)||0;
  const total=Math.max(0,sub-desc);
  const el=document.getElementById('orc-total-display');
  if(el)el.textContent='R$ '+total.toFixed(2).replace('.',',');
  return total;
}
function salvarOrcamento(){
  const clienteNome=document.getElementById('orc-cliente-nome').value.trim();
  if(!clienteNome){toast('Informe o cliente.');return;}
  const itensValidos=_orcItens.filter(it=>it.nome);
  if(!itensValidos.length){toast('Adicione pelo menos 1 item.');return;}
  if(!DB.orcamentos)DB.orcamentos=[];
  const id=document.getElementById('orc-id').value;
  const desc=parseFloat(document.getElementById('orc-desconto').value)||0;
  const total=calcTotalOrc();
  const obj={clienteId:document.getElementById('orc-cliente-id').value,clienteNome,
    validade:parseInt(document.getElementById('orc-validade').value)||15,
    pagamento:document.getElementById('orc-pagamento').value,
    desconto:desc,itens:itensValidos,total,obs:document.getElementById('orc-obs').value,status:'rascunho'};
  if(id){const i=DB.orcamentos.findIndex(x=>x.id===id);if(i>=0)Object.assign(DB.orcamentos[i],obj);}
  else{obj.id=uid();obj.numero=(_maxOrcNum()+1);obj.createdAt=new Date().toISOString();DB.orcamentos.push(obj);}
  save();closeModal('modal-orcamento');renderOrcamentos();toast('Orçamento salvo!');
}
function _maxOrcNum(){return(DB.orcamentos||[]).reduce((m,o)=>Math.max(m,o.numero||0),0);}
function renderOrcamentos(){
  const orcs=(DB.orcamentos||[]).filter(o=>!o.deleted);
  const q=(document.getElementById('orc-search')?.value||'').toLowerCase();
  const sf=document.getElementById('orc-status-filter')?.value||'';
  const filtered=orcs.filter(o=>{
    const m=!q||(o.clienteNome||'').toLowerCase().includes(q)||(o.numero+'').includes(q);
    const s=!sf||o.status===sf;
    return m&&s;
  }).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  const total=orcs.reduce((s,o)=>s+o.total,0);
  const aprov=orcs.filter(o=>o.status==='aprovado');
  const metrEl=document.getElementById('orc-metrics');
  if(metrEl)metrEl.innerHTML=`
    <div class="metric ma"><div class="metric-icon">📝</div><div class="ml">Total de Orçamentos</div><div class="mv">${orcs.length}</div></div>
    <div class="metric mg"><div class="metric-icon">✅</div><div class="ml">Aprovados</div><div class="mv">${aprov.length}</div><div class="ms">${fmtMoney(aprov.reduce((s,o)=>s+o.total,0))}</div></div>
    <div class="metric mb"><div class="metric-icon">💰</div><div class="ml">Volume Total</div><div class="mv">${fmtMoney(total)}</div></div>`;
  const tbody=document.getElementById('orc-tbody');
  const hoje=new Date().toISOString().slice(0,10);
  if(tbody)tbody.innerHTML=filtered.length?filtered.map(o=>{
    const venc=new Date(o.createdAt.slice(0,10));venc.setDate(venc.getDate()+(o.validade||15));
    const vencStr=venc.toISOString().slice(0,10);
    const expirado=vencStr<hoje&&o.status==='rascunho'||o.status==='enviado';
    const statusMap={rascunho:'<span class="badge badge-gray">Rascunho</span>',enviado:'<span class="badge badge-blue">Enviado</span>',aprovado:'<span class="badge badge-green">Aprovado</span>',recusado:'<span class="badge badge-red">Recusado</span>',convertido:'<span class="badge badge-amber">Convertido</span>'};
    return`<tr>
      <td>#${o.numero}</td>
      <td>${o.clienteNome}</td>
      <td>${fmtMoney(o.total)}</td>
      <td>${o.createdAt.slice(0,10).split('-').reverse().join('/')}</td>
      <td style="color:${expirado?'var(--red)':'inherit'}">${vencStr.split('-').reverse().join('/')}</td>
      <td>${statusMap[o.status]||o.status}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-ghost btn-sm" onclick="editarOrcamento('${o.id}')">✏️</button>
        <button class="btn btn-ghost btn-sm" onclick="enviarLinkOrcamento('${o.id}')" title="Enviar link ao cliente">🔗</button>
        <button class="btn btn-ghost btn-sm" onclick="alterarStatusOrc('${o.id}')" title="Alterar status">🔄</button>
        <button class="btn btn-danger btn-sm" onclick="excluirOrcamento('${o.id}')">🗑</button>
      </td></tr>`;
  }).join(''):'<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:24px">Nenhum orçamento</td></tr>';
  const cntEl=document.getElementById('cnt-orcamentos');
  if(cntEl)cntEl.textContent=orcs.filter(o=>o.status==='rascunho'||o.status==='enviado').length;
}
function enviarLinkOrcamento(id){
  const o=(DB.orcamentos||[]).find(x=>x.id===id);if(!o)return;
  const emp=(DB.settings&&DB.settings.empresa)||{nome:'HAW Vision'};
  const dados={t:'orca',num:o.numero,cli:o.clienteNome,tel:(DB.clientes.find(c=>c.id===o.clienteId)||{}).telefone||'',itens:o.itens.map(it=>({n:it.nome,q:it.qty||1,v:it.valor||0})),total:o.total,emp:emp.nome,pagamento:o.pagamento||''};
  const b64=btoa(unescape(encodeURIComponent(JSON.stringify(dados))));
  const base=window.location.origin+window.location.pathname;
  const link=`${base}?aprova=${b64}`;
  navigator.clipboard.writeText(link).then(()=>toast('🔗 Link copiado! Envie ao cliente.')).catch(()=>prompt('Link do orçamento:',link));
  if(o.status==='rascunho'){o.status='enviado';save();renderOrcamentos();}
}
function alterarStatusOrc(id){
  const o=(DB.orcamentos||[]).find(x=>x.id===id);if(!o)return;
  const opts=['rascunho','enviado','aprovado','recusado','convertido'];
  const labels={rascunho:'Rascunho',enviado:'Enviado',aprovado:'Aprovado',recusado:'Recusado',convertido:'Convertido em OS'};
  const novo=prompt(`Status atual: ${labels[o.status]||o.status}\n\nEscolha:\n0 rascunho\n1 enviado\n2 aprovado\n3 recusado\n4 convertido`);
  if(novo===null)return;
  const idx=parseInt(novo);
  if(isNaN(idx)||!opts[idx]){toast('Opção inválida.');return;}
  o.status=opts[idx];save();renderOrcamentos();toast('Status atualizado!');
}
function excluirOrcamento(id){
  if(!confirm('Excluir este orçamento?'))return;
  const i=(DB.orcamentos||[]).findIndex(x=>x.id===id);if(i>=0){DB.orcamentos[i].deleted=true;save();renderOrcamentos();toast('Excluído.');}
}

// ══════════════════ LABORATÓRIO ══════════════════
let _labFiltro='todos';
function setLabFiltro(f,btn){
  _labFiltro=f;
  document.querySelectorAll('#lab-filters .fb').forEach(b=>b.classList.remove('active'));
  if(btn)btn.classList.add('active');
  renderLab();
}
function renderLab(){
  const hoje=new Date().toISOString().slice(0,10);
  // Pedidos que tenham dados de lab (status !== entregue/cancelado OU com lab tracking)
  const todos=(DB.pedidos||[]).filter(p=>!p.deleted&&(p.labNome||p.status==='lab'||p.status==='pronto'||p.labDataEnvio));
  const metrEl=document.getElementById('lab-metrics');
  const aguardando=todos.filter(p=>!p.labDataEnvio);
  const enviados=todos.filter(p=>p.labDataEnvio&&p.labStatus!=='recebido');
  const atrasados=enviados.filter(p=>p.labDataPrevisao&&p.labDataPrevisao<hoje);
  const recebidos=todos.filter(p=>p.labStatus==='recebido');
  if(metrEl)metrEl.innerHTML=`
    <div class="metric mr"><div class="metric-icon">⏳</div><div class="ml">Aguardando envio</div><div class="mv">${aguardando.length}</div></div>
    <div class="metric mb"><div class="metric-icon">📤</div><div class="ml">No laboratório</div><div class="mv">${enviados.length}</div><div class="ms">${atrasados.length>0?atrasados.length+' atrasado(s)':''}</div></div>
    <div class="metric mg"><div class="metric-icon">✅</div><div class="ml">Recebidos</div><div class="mv">${recebidos.length}</div></div>`;
  let filtrados=todos;
  if(_labFiltro==='aguardando')filtrados=aguardando;
  else if(_labFiltro==='enviado')filtrados=enviados.filter(p=>!atrasados.includes(p));
  else if(_labFiltro==='atrasado')filtrados=atrasados;
  else if(_labFiltro==='recebido')filtrados=recebidos;
  const tbody=document.getElementById('lab-tbody');
  if(tbody)tbody.innerHTML=filtrados.length?filtrados.map(p=>{
    const cli=DB.clientes.find(c=>c.id===p.clienteId);
    const atrasado=p.labDataEnvio&&p.labDataPrevisao&&p.labDataPrevisao<hoje&&p.labStatus!=='recebido';
    const statusBadge=p.labStatus==='recebido'?'<span class="badge badge-green">✅ Recebido</span>':p.labDataEnvio?atrasado?'<span class="badge badge-red">🔴 Atrasado</span>':'<span class="badge badge-blue">📤 Enviado</span>':'<span class="badge badge-amber">⏳ Aguardando</span>';
    return`<tr>
      <td><span class="badge badge-gray">OS #${p.num||p.numero||p.id.slice(-4)}</span></td>
      <td>${cli?cli.nome:p.clienteNome||'—'}</td>
      <td>${p.labNome||'—'}</td>
      <td>${p.labDataEnvio?p.labDataEnvio.split('-').reverse().join('/'):'—'}</td>
      <td style="color:${atrasado?'var(--red)':'inherit'}">${p.labDataPrevisao?p.labDataPrevisao.split('-').reverse().join('/'):'—'}</td>
      <td>${statusBadge}</td>
      <td style="white-space:nowrap">
        ${!p.labDataEnvio?`<button class="btn btn-gold btn-sm" onclick="abrirEnvioLab('${p.id}')">📤 Enviar</button>`:''}
        ${p.labDataEnvio&&p.labStatus!=='recebido'?`<button class="btn btn-ghost btn-sm" onclick="marcarLabRecebido('${p.id}')">✅ Recebido</button>`:''}
        ${cli&&cli.telefone?`<button class="btn btn-ghost btn-sm" onclick="abrirWA('${cli.id}')">💬</button>`:''}
      </td></tr>`;
  }).join(''):'<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:24px">Nenhum pedido no laboratório</td></tr>';
  const cntEl=document.getElementById('cnt-lab');
  if(cntEl)cntEl.textContent=enviados.length+aguardando.length;
}
function abrirEnvioLab(pedidoId){
  document.getElementById('lab-pedido-id').value=pedidoId;
  document.getElementById('lab-nome-input').value='';
  document.getElementById('lab-data-envio').value=new Date().toISOString().slice(0,10);
  document.getElementById('lab-data-previsao').value='';
  document.getElementById('lab-obs-input').value='';
  openModal('modal-lab-envio');
}
function salvarEnvioLab(){
  const pid=document.getElementById('lab-pedido-id').value;
  const nome=document.getElementById('lab-nome-input').value.trim();
  const envio=document.getElementById('lab-data-envio').value;
  if(!nome||!envio){toast('Informe o laboratório e a data de envio.');return;}
  const p=(DB.pedidos||[]).find(x=>x.id===pid);if(!p){toast('Pedido não encontrado.');return;}
  p.labNome=nome;p.labDataEnvio=envio;p.labDataPrevisao=document.getElementById('lab-data-previsao').value;p.labObs=document.getElementById('lab-obs-input').value;p.labStatus='enviado';
  save();closeModal('modal-lab-envio');renderLab();toast(`📤 Enviado ao lab ${nome}!`);
}
function marcarLabRecebido(pedidoId){
  const p=(DB.pedidos||[]).find(x=>x.id===pedidoId);if(!p)return;
  p.labStatus='recebido';p.labDataRecebimento=new Date().toISOString().slice(0,10);
  save();renderLab();toast('✅ Lentes recebidas do laboratório!');
}

// ══════════════════ ETIQUETAS DE ARMAÇÕES ══════════════════
function gerarEtiquetasArmacoes(){
  const prods=(DB.produtos||[]).filter(p=>!p.deleted&&p.ativo&&p.categoria==='armacao');
  if(!prods.length){toast('Nenhuma armação no catálogo.');return;}
  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Etiquetas — HAW Vision</title>
  <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;background:#fff;padding:10px}
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
  .etiq{border:1px solid #333;border-radius:4px;padding:8px 10px;text-align:center;page-break-inside:avoid}
  .nome{font-weight:700;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
  .cod{font-size:10px;color:#555;margin:2px 0}.preco{font-size:18px;font-weight:900}
  .marca{font-size:10px;color:#888}
  @media print{body{padding:0}button{display:none}}
  </style></head><body>
  <button onclick="window.print()" style="margin-bottom:10px;padding:8px 18px;background:#F7CF13;border:none;border-radius:6px;font-weight:700;cursor:pointer;font-size:14px">🖨️ Imprimir Etiquetas</button>
  <div class="grid">
  ${prods.map(p=>`<div class="etiq">
    <div class="marca">${p.marca||'HAW Vision'}</div>
    <div class="nome">${p.nome}</div>
    <div class="cod">Cód: ${p.codigo||p.id.slice(-6).toUpperCase()}</div>
    <div class="preco">R$ ${Number(p.preco||0).toFixed(2).replace('.',',')}</div>
    ${p.estoque!=null?`<div class="cod">Estoque: ${p.estoque} un.</div>`:''}
  </div>`).join('')}
  </div>
  <script>window.onload=()=>setTimeout(window.print,400)<\/script>
  </body></html>`;
  const w=window.open('','_blank','width=800,height=900');
  if(!w){toast('Permita pop-ups para gerar as etiquetas.');return;}
  w.document.write(html);w.document.close();
}
window.gerarEtiquetasArmacoes=gerarEtiquetasArmacoes;

// ══════════════════ BACKUP — RESTAURAR ══════════════════
function restaurarBackup(file){
  if(!file)return;
  if(!confirm('⚠️ ATENÇÃO: Restaurar um backup irá sobrescrever TODOS os dados atuais do sistema. Esta ação não pode ser desfeita.\n\nDeseja continuar?'))return;
  const reader=new FileReader();
  reader.onload=function(e){
    try{
      let dados=JSON.parse(e.target.result);
      // Suporte a dois formatos: backup completo {id,dados:{DB}} ou DB direto
      if(dados.dados&&typeof dados.dados==='object')dados=dados.dados;
      const camposEsperados=['clientes','pedidos','produtos','usuarios'];
      if(!camposEsperados.some(k=>k in dados)){toast('❌ Arquivo inválido: não parece ser um backup do HAW Vision.');return;}
      // Restaurar
      Object.keys(dados).forEach(k=>{if(k in DB)DB[k]=dados[k];});
      save();toast('✅ Backup restaurado com sucesso! Recarregando…');
      setTimeout(()=>location.reload(),1200);
    }catch(err){toast('❌ Erro ao ler o arquivo JSON: '+err.message);}
  };
  reader.readAsText(file);
}
window.restaurarBackup=restaurarBackup;

// ══════════════════ META NO DASHBOARD ══════════════════
function renderMetaDashboard(){
  const mesAtual=DB.settings.mesAtual||new Date().toISOString().slice(0,7);
  // Total faturado no mês
  const fat=(DB.pedidos||[]).filter(p=>!p.deleted&&(p.status==='entregue'||p.status==='pos')&&p.dataEntrega&&p.dataEntrega.startsWith(mesAtual)).reduce((s,p)=>s+Number(p.total||0),0);
  // Meta: soma das metas dos usuários ativos, ou meta global em settings
  const metaGlobal=Number((DB.settings&&DB.settings.metaMensal)||0);
  const metaUsuarios=(DB.usuarios||[]).filter(u=>!u.deleted&&u.ativo&&u.meta).reduce((s,u)=>s+Number(u.meta||0),0);
  const meta=metaGlobal||metaUsuarios;
  const card=document.getElementById('meta-dashboard-card');
  if(!card)return;
  if(!meta){card.style.display='none';return;}
  card.style.display='';
  const pct=Math.min(100,Math.round(fat/meta*100));
  const fill=document.getElementById('meta-bar-fill');
  if(fill){fill.style.width=pct+'%';fill.style.background=pct>=100?'var(--green)':pct>=70?'var(--gold)':'var(--red)';}
  const label=document.getElementById('meta-dash-label');
  if(label)label.textContent=`${pct}% atingido`;
  const nums=document.getElementById('meta-bar-nums');
  if(nums)nums.innerHTML=`<span>${fmtMoney(fat)} realizado</span><span>Meta: ${fmtMoney(meta)}</span>`;
}
window.renderMetaDashboard=renderMetaDashboard;

// ── AGENDA: VISTA CALENDÁRIO ──
let _agendaView='list';
let _calMes=new Date().toISOString().slice(0,7);

function toggleAgendaView(v){
  _agendaView=v;
  document.getElementById('agenda-view-list').style.display=v==='list'?'block':'none';
  document.getElementById('agenda-view-cal').style.display=v==='cal'?'block':'none';
  document.getElementById('btn-ag-lista').style.borderColor=v==='list'?'var(--gold)':'';
  document.getElementById('btn-ag-lista').style.color=v==='list'?'var(--gold-deep)':'';
  document.getElementById('btn-ag-cal').style.borderColor=v==='cal'?'var(--gold)':'';
  document.getElementById('btn-ag-cal').style.color=v==='cal'?'var(--gold-deep)':'';
  if(v==='cal') renderCalendarioMes();
}

function calNavMes(d){
  const [y,m]=_calMes.split('-').map(Number);
  const nd=new Date(y,m-1+d,1);
  _calMes=nd.toISOString().slice(0,7);
  renderCalendarioMes();
}

function renderCalendarioMes(){
  const wrap=document.getElementById('cal-grid-wrap');if(!wrap)return;
  const label=document.getElementById('cal-mes-label');
  const [y,m]=_calMes.split('-').map(Number);
  const first=new Date(y,m-1,1);
  const last=new Date(y,m,0);
  if(label)label.textContent=first.toLocaleString('pt-BR',{month:'long',year:'numeric'});
  const dias=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  let html='<div class="cal-grid">';
  dias.forEach(d=>{html+=`<div class="cal-head">${d}</div>`;});
  const startWd=first.getDay();
  const today=new Date().toISOString().slice(0,10);
  for(let i=0;i<startWd;i++){
    const prev=new Date(y,m-1,-startWd+i+1);
    html+=`<div class="cal-cell cal-other"><div class="cal-num">${prev.getDate()}</div></div>`;
  }
  for(let d=1;d<=last.getDate();d++){
    const iso=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const evts=(DB.eventos||[]).filter(e=>!e.deleted&&e.data===iso);
    const isToday=iso===today;
    html+=`<div class="cal-cell${isToday?' cal-today':''}" onclick="document.getElementById('agenda-data').value='${iso}';toggleAgendaView('list');renderAgenda()">
      <div class="cal-num">${d}</div>
      ${evts.slice(0,3).map(e=>`<div class="cal-ev" title="${e.titulo||''}">${e.titulo||'evento'}</div>`).join('')}
      ${evts.length>3?`<div style="font-size:9px;color:var(--muted)">+${evts.length-3} mais</div>`:''}
    </div>`;
  }
  const endWd=last.getDay();
  for(let i=1;i<7-endWd;i++){
    html+=`<div class="cal-cell cal-other"><div class="cal-num">${i}</div></div>`;
  }
  html+='</div>';
  wrap.innerHTML=html;
}

function agendaNavDia(d){
  const el=document.getElementById('agenda-data');
  const base=el.value||new Date().toISOString().slice(0,10);
  const nd=new Date(base+'T12:00:00');
  nd.setDate(nd.getDate()+d);
  el.value=nd.toISOString().slice(0,10);
  if(_agendaView==='list') renderAgenda(); else renderCalendarioMes();
}

// ── CONSIGNADO ──
function renderConsignados(){
  const filtro=(document.getElementById('csg-filtro')||{}).value||'';
  let items=(DB.consignados||[]).filter(c=>!c.deleted&&(!filtro||c.status===filtro));
  // métricas
  const all=(DB.consignados||[]).filter(c=>!c.deleted);
  const ativos=all.filter(c=>c.status==='ativo');
  const totalRec=all.reduce((s,c)=>s+(+c.recebido||0),0);
  const totalComp=all.reduce((s,c)=>s+(+c.comprado||0),0);
  const el=document.getElementById('csg-metrics');
  if(el)el.innerHTML=`
    <div class="metric-card"><div class="mc-val">${ativos.length}</div><div class="mc-label">Em aberto</div></div>
    <div class="metric-card"><div class="mc-val">${totalRec}</div><div class="mc-label">Total recebido</div></div>
    <div class="metric-card"><div class="mc-val">${totalComp}</div><div class="mc-label">Total comprado</div></div>`;
  const tbody=document.getElementById('csg-tbody');
  if(!tbody)return;
  if(!items.length){tbody.innerHTML=`<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:24px">Nenhum registro</td></tr>`;return;}
  tbody.innerHTML=items.map(c=>{
    const saldo=(+c.recebido||0)-(+c.devolvido||0)-(+c.comprado||0);
    const venc=c.prazoDevol&&new Date(c.prazoDevol)<new Date();
    const statusCls=c.status==='devolvido'?'badge-green':c.status==='comprado'?'badge-blue':venc?'badge-red':'badge-gray';
    return`<tr>
      <td>${c.fornecedor||'—'}</td><td>${c.produto||'—'}</td>
      <td style="text-align:center">${c.recebido||0}</td>
      <td style="text-align:center">${c.devolvido||0}</td>
      <td style="text-align:center">${c.comprado||0}</td>
      <td style="text-align:center;font-weight:700;color:${saldo>0?'var(--amber)':'var(--green)'}">${saldo}</td>
      <td>${c.prazoDevol?fmtDate(c.prazoDevol):'—'}</td>
      <td><span class="badge ${statusCls}">${c.status||'ativo'}</span></td>
      <td><div style="display:flex;gap:4px">
        <button class="btn btn-ghost btn-sm" onclick="editarConsignado('${c.id}')">✏️</button>
        <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="excluirConsignado('${c.id}')">🗑</button>
      </div></td>
    </tr>`;
  }).join('');
}

function editarConsignado(id){
  const c=(DB.consignados||[]).find(x=>x.id===id);if(!c)return;
  openModal('modal-consignado');
  setTimeout(()=>{
    document.getElementById('csg-id').value=c.id;
    document.getElementById('csg-fornecedor').value=c.fornecedor||'';
    document.getElementById('csg-produto').value=c.produto||'';
    document.getElementById('csg-recebido').value=c.recebido||1;
    document.getElementById('csg-data-receb').value=c.dataReceb||'';
    document.getElementById('csg-prazo-dev').value=c.prazoDevol||'';
    document.getElementById('csg-devolvido').value=c.devolvido||0;
    document.getElementById('csg-comprado').value=c.comprado||0;
    document.getElementById('csg-obs').value=c.obs||'';
  },50);
}

function salvarConsignado(){
  const forn=document.getElementById('csg-fornecedor').value.trim();
  const prod=document.getElementById('csg-produto').value.trim();
  if(!forn||!prod){toast('Preencha fornecedor e produto','error');return;}
  const rec=+document.getElementById('csg-recebido').value||1;
  const dev=+document.getElementById('csg-devolvido').value||0;
  const comp=+document.getElementById('csg-comprado').value||0;
  const saldo=rec-dev-comp;
  const existId=document.getElementById('csg-id').value;
  if(existId){
    const idx=(DB.consignados||[]).findIndex(c=>c.id===existId);
    if(idx>=0){
      Object.assign(DB.consignados[idx],{fornecedor:forn,produto:prod,recebido:rec,devolvido:dev,comprado:comp,
        dataReceb:document.getElementById('csg-data-receb').value,
        prazoDevol:document.getElementById('csg-prazo-dev').value,
        obs:document.getElementById('csg-obs').value.trim(),
        status:saldo<=0?(comp>0?'comprado':'devolvido'):'ativo',updatedAt:new Date().toISOString()});
    }
  } else {
    if(!DB.consignados) DB.consignados=[];
    DB.consignados.push({id:uid(),fornecedor:forn,produto:prod,recebido:rec,devolvido:dev,comprado:comp,
      dataReceb:document.getElementById('csg-data-receb').value,
      prazoDevol:document.getElementById('csg-prazo-dev').value,
      obs:document.getElementById('csg-obs').value.trim(),
      status:saldo<=0?(comp>0?'comprado':'devolvido'):'ativo',createdAt:new Date().toISOString()});
  }
  save();closeModal('modal-consignado');renderConsignados();toast('Consignado salvo!');
}

function excluirConsignado(id){
  if(!confirm('Excluir este consignado?'))return;
  const c=(DB.consignados||[]).find(x=>x.id===id);
  if(c){c.deleted=true;save();renderConsignados();toast('Removido.');}
}
window.renderConsignados=renderConsignados;
window.salvarConsignado=salvarConsignado;
window.excluirConsignado=excluirConsignado;
window.editarConsignado=editarConsignado;

// ── IMPORTAÇÃO CSV DE CLIENTES ──
function importarClientesCSV(file){
  if(!file)return;
  const r=new FileReader();
  r.onload=function(e){
    const lines=e.target.result.split(/\r?\n/).filter(l=>l.trim());
    if(!lines.length){toast('CSV vazio','error');return;}
    const header=lines[0].split(/[,;]/).map(h=>h.trim().toLowerCase().replace(/[^a-záàâãéêíóôõúç0-9]/gi,''));
    const find=(headers,keys)=>{const i=headers.findIndex(h=>keys.some(k=>h.includes(k)));return i>=0?i:-1;};
    const iNome=find(header,['nome','name','cliente']);
    const iTel=find(header,['tel','fone','phone','celular','whats']);
    const iEmail=find(header,['email','mail']);
    const iCpf=find(header,['cpf']);
    if(iNome<0){toast('Coluna "nome" não encontrada no CSV','error');return;}
    let added=0,skipped=0;
    for(let i=1;i<lines.length;i++){
      const cols=lines[i].split(/[,;]/);
      const nome=(cols[iNome]||'').trim().replace(/^"|"$/g,'');
      if(!nome){skipped++;continue;}
      const jaExiste=DB.clientes.some(c=>!c.deleted&&c.nome.toLowerCase()===nome.toLowerCase());
      if(jaExiste){skipped++;continue;}
      DB.clientes.push({id:uid(),nome,
        telefone:iTel>=0?(cols[iTel]||'').trim().replace(/^"|"$/g,''):'',
        email:iEmail>=0?(cols[iEmail]||'').trim().replace(/^"|"$/g,''):'',
        cpf:iCpf>=0?(cols[iCpf]||'').trim().replace(/^"|"$/g,''):'',
        status:'ativo',createdAt:new Date().toISOString()});
      added++;
    }
    save();renderClientes();
    toast(`${added} cliente(s) importado(s)${skipped?' · '+skipped+' ignorado(s)':''}`);
  };
  r.readAsText(file,'utf-8');
}
window.importarClientesCSV=importarClientesCSV;

// ── COMISSÕES EM TABELA ──
function renderComissoesTabela(){
  const sel=document.getElementById('comis-mes');
  // popula opções se necessário
  if(sel&&!sel.options.length){
    const meses=[...new Set(DB.pedidos.filter(p=>!p.deleted&&p.createdAt).map(p=>p.createdAt.slice(0,7)))].sort().reverse();
    const atual=new Date().toISOString().slice(0,7);
    const lista=[...new Set([atual,...meses])];
    lista.forEach(m=>{const o=document.createElement('option');o.value=m;o.textContent=new Date(m+'-15').toLocaleString('pt-BR',{month:'long',year:'numeric'});sel.appendChild(o);});
  }
  const mes=sel?sel.value:new Date().toISOString().slice(0,7);
  const peds=DB.pedidos.filter(p=>!p.deleted&&(p.status==='entregue'||p.status==='pos_venda')&&p.createdAt&&p.createdAt.slice(0,7)===mes);
  const tbody=document.getElementById('comis-tbody');if(!tbody)return;
  const usByName={};
  peds.forEach(p=>{
    const nome=p.vendedorNome||(DB.usuarios.find(u=>u.id===p.vendedorId)||{nome:'Sem vendedor'}).nome||'Sem vendedor';
    if(!usByName[nome])usByName[nome]={nome,pedidos:0,fat:0,pct:0};
    usByName[nome].pedidos++;usByName[nome].fat+=Number(p.total||0);
  });
  // pega % de comissão do usuário (campo comissao)
  Object.keys(usByName).forEach(nome=>{
    const u=DB.usuarios.find(u=>u.nome===nome);
    usByName[nome].pct=u&&u.comissao?Number(u.comissao):0;
  });
  const rows=Object.values(usByName).sort((a,b)=>b.fat-a.fat);
  if(!rows.length){tbody.innerHTML=`<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:20px">Sem pedidos entregues neste mês</td></tr>`;return;}
  tbody.innerHTML=rows.map(r=>{
    const com=r.fat*(r.pct/100);
    return`<tr>
      <td style="font-weight:600">${r.nome}</td>
      <td style="text-align:right">${r.pedidos}</td>
      <td style="text-align:right">${fmtMoney(r.fat)}</td>
      <td style="text-align:right">${r.pct.toFixed(1)}%</td>
      <td style="text-align:right;font-weight:700;color:var(--green)">${fmtMoney(com)}</td>
    </tr>`;
  }).join('');
}
window.renderComissoesTabela=renderComissoesTabela;

// ── GARANTIA ──
function _garantiaBadge(ped){
  if(!ped.garantiaMeses||!ped.createdAt)return'—';
  const venc=new Date(new Date(ped.createdAt).setMonth(new Date(ped.createdAt).getMonth()+ped.garantiaMeses));
  const hoje=new Date();const diff=Math.round((venc-hoje)/(86400000));
  if(diff<0)return'<span class="gar-badge gar-exp">Expirada</span>';
  if(diff<=30)return`<span class="gar-badge gar-warn">Vence em ${diff}d</span>`;
  return`<span class="gar-badge gar-ok">Válida (${diff}d)</span>`;
}
function setGarantia(pedidoId,meses){
  const p=DB.pedidos.find(x=>x.id===pedidoId);if(!p)return;
  p.garantiaMeses=meses;save();toast(`Garantia de ${meses} meses definida!`);
}
window._garantiaBadge=_garantiaBadge;
window.setGarantia=setGarantia;

// ── INIT EXTRAS ──
(function(){
  // popula comissões ao carregar a aba relatórios
  const origNav=window.nav;
  window.nav=function(tab){origNav&&origNav(tab);if(tab==='relatorios')setTimeout(renderComissoesTabela,100);};
})();
