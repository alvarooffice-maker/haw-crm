function abrirAlterarPin(){
  document.getElementById('mpin-novo').value='';
  document.getElementById('mpin-conf').value='';
  openModal('modal-alterar-pin');
  setTimeout(()=>document.getElementById('mpin-novo').focus(),100);
}
function salvarMeuPin(){
  const pin=document.getElementById('mpin-novo').value.trim();
  const conf=document.getElementById('mpin-conf').value.trim();
  if(!/^\d{4}$/.test(pin)){alert('PIN deve ter exatamente 4 dígitos numéricos.');return;}
  if(pin!==conf){alert('Os PINs não coincidem.');return;}
  // Grava em haw_pins pelo id e nome (igual a _setPinUsuario)
  try{const p=JSON.parse(localStorage.getItem('haw_pins')||'{}');p[currentUser.id]=pin;p[currentUser.nome]=pin;localStorage.setItem('haw_pins',JSON.stringify(p));}catch(e){}
  // Atualiza também DB.usuarios e localStorage principal
  const i=DB.usuarios.findIndex(u=>u.id===currentUser.id);
  if(i>=0){DB.usuarios[i].senha=pin;save();}
  closeModal('modal-alterar-pin');
  toast('PIN alterado com sucesso! ✅');
}
window.abrirAlterarPin=abrirAlterarPin;
window.salvarMeuPin=salvarMeuPin;

// ── ORDEM DE SERVIÇO ────────────────────────────────────────────
async function _nextOsNum(){
  const ano=new Date().getFullYear();
  const prefix=`OS-${ano}-`;
  const localMax=(DB.ordens||[])
    .filter(o=>!o.deleted&&(o.num||'').startsWith(prefix))
    .map(o=>parseInt((o.num||'').slice(prefix.length))||0)
    .reduce((a,b)=>Math.max(a,b),0);
  let sbMax=0;
  const sb=window._hawSB;
  if(sb){
    try{
      const{data}=await sb.from('ordens').select('num').like('num',`OS-${ano}-%`).is('deleted_at',null);
      if(data)sbMax=data.map(r=>parseInt((r.num||'').slice(prefix.length))||0).reduce((a,b)=>Math.max(a,b),0);
    }catch(e){}
  }
  return `OS-${ano}-${String(Math.max(localMax,sbMax)+1).padStart(3,'0')}`;
}

let _editingOsId=null;

async function novaOrdemServico(){
  _editingOsId=null;
  openModal('modal-os');
  document.getElementById('os-num').value='…';
  document.getElementById('os-data').value=new Date().toISOString().slice(0,10);
  const dl=document.getElementById('os-cli-list');
  if(dl)dl.innerHTML=DB.clientes.filter(c=>!c.deleted).map(c=>`<option value="${c.nome}">`).join('');
  ['os-arm-acetato','os-arm-metal','os-arm-tr90','os-arm-titanio','os-arm-nylon','os-arm-parafusada',
   'os-tr-ar','os-tr-azul','os-tr-foto','os-tr-hidro','os-tr-risco','os-tr-uv'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.checked=false;
  });
  document.querySelectorAll('[name="os-arm-cond"]').forEach(r=>r.checked=false);
  document.querySelectorAll('[name="os-clipon"]').forEach(r=>r.checked=(r.value==='nao'));
  ['os-od-prisma','os-oe-prisma','os-env-montagem'].forEach(id=>{const el=document.getElementById(id);if(el)el.checked=false;});
  const m=document.getElementById('os-montagem');if(m)m.value='';
  const idx=document.getElementById('os-indice');if(idx)idx.value='';
  const bn=document.getElementById('os-import-banner');if(bn)bn.style.display='none';
  _nextOsNum().then(num=>{const el=document.getElementById('os-num');if(el)el.value=num;});
}

function osImportarReceita(nomeOuId){
  const banner=document.getElementById('os-import-banner');
  const bannerInfo=document.getElementById('os-import-info');
  if(banner){banner.style.display='none';}
  const cli=DB.clientes.find(c=>!c.deleted&&c.nome===nomeOuId);
  if(!cli)return;
  const telEl=document.getElementById('os-tel');
  if(telEl&&!telEl.value&&cli.telefone)telEl.value=cli.telefone;
  const recsClient=(DB.receitas||[]).filter(r=>!r.deleted&&r.clienteId===cli.id);
  const rec=recsClient.find(r=>r.isAtual)||recsClient.sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''))[0];
  if(!rec)return;
  const setHL=(id,val)=>{
    const el=document.getElementById(id);
    if(!el||val==null)return;
    el.value=val;
    el.style.background='#fffbe6';
    el.addEventListener('input',()=>{el.style.background='';},{once:true});
  };
  setHL('os-od-esf', rec.odEsf??'');
  setHL('os-od-cil', rec.odCil??'');
  setHL('os-od-eix', rec.odEixo??'');
  setHL('os-od-dnp', rec.odDnp??rec.dnp??'');
  setHL('os-od-alt', rec.odAlt??'');
  setHL('os-oe-esf', rec.oeEsf??'');
  setHL('os-oe-cil', rec.oeCil??'');
  setHL('os-oe-eix', rec.oeEixo??'');
  setHL('os-oe-dnp', rec.oeDnp??rec.dnp??'');
  setHL('os-oe-alt', rec.oeAlt??'');
  if(rec.odAdi!=null){setHL('os-pp-od-adc',rec.odAdi);setHL('os-pp-od-esf',rec.odEsfPerto??'');}
  if(rec.oeAdi!=null){setHL('os-pp-oe-adc',rec.oeAdi);setHL('os-pp-oe-esf',rec.oeEsfPerto??'');}
  setHL('os-od-base', rec.odBase??''); setHL('os-oe-base', rec.oeBase??'');
  setHL('os-od-desc', rec.odDesc??''); setHL('os-oe-desc', rec.oeDesc??'');
  if(banner&&bannerInfo){
    const dtStr=rec.dataReceita?rec.dataReceita.split('-').reverse().join('/'):'';
    bannerInfo.textContent='Receita'+(dtStr?' de '+dtStr:'')+ ' importada automaticamente';
    banner.style.display='flex';
  }
}

function _coletarDadosOS(){
  const v=id=>document.getElementById(id)?.value||'';
  const ck=id=>document.getElementById(id)?.checked;
  const armCbs=['os-arm-acetato','os-arm-metal','os-arm-tr90','os-arm-titanio','os-arm-nylon','os-arm-parafusada'];
  const tratCbs=['os-tr-ar','os-tr-azul','os-tr-foto','os-tr-hidro','os-tr-risco','os-tr-uv'];
  const armLabels=['Acetato','Metal / Aço','TR-90 / Grilamid','Titânio','Nylon (Fio)','Parafusada'];
  const tratLabels=['Antirreflexo','Filtro Luz Azul','Fotossensível','Hidrofóbico','Anti-risco','Proteção UV 400'];
  return {
    id:'os-'+Date.now(),
    usuarioId:window.currentUser?.id||'',usuarioNome:window.currentUser?.nome||'',
    num:v('os-num'),paciente:v('os-paciente'),tel:v('os-tel'),data:v('os-data'),
    longe_od:{esf:v('os-od-esf'),cil:v('os-od-cil'),eix:v('os-od-eix'),dnp:v('os-od-dnp'),alt:v('os-od-alt'),base:v('os-od-base'),desc:v('os-od-desc'),descanso:v('os-od-descanso'),prisma:document.getElementById('os-od-prisma')?.checked||false},
    longe_oe:{esf:v('os-oe-esf'),cil:v('os-oe-cil'),eix:v('os-oe-eix'),dnp:v('os-oe-dnp'),alt:v('os-oe-alt'),base:v('os-oe-base'),desc:v('os-oe-desc'),descanso:v('os-oe-descanso'),prisma:document.getElementById('os-oe-prisma')?.checked||false},
    ponte:v('os-ponte'),
    perto_od:{adc:v('os-pp-od-adc'),esf:v('os-pp-od-esf')},
    perto_oe:{adc:v('os-pp-oe-adc'),esf:v('os-pp-oe-esf')},
    horz:v('os-horz'),vert:v('os-vert'),diag:v('os-diag'),dpa:v('os-dpa'),
    diamOd:v('os-diam-od'),diamOe:v('os-diam-oe'),
    clipon:document.querySelector('[name="os-clipon"]:checked')?.value||'nao',
    envMontagem:document.getElementById('os-env-montagem')?.checked||false,
    armCond:document.querySelector('[name="os-arm-cond"]:checked')?.value||'',
    montagem:v('os-montagem'),indice:v('os-indice'),
    armacao:armCbs.map((id,i)=>ck(id)?armLabels[i]:null).filter(Boolean),
    tratamentos:tratCbs.map((id,i)=>ck(id)?tratLabels[i]:null).filter(Boolean),
    obs:v('os-obs'),entrega:v('os-entrega'),
    valor:parseFloat(v('os-valor'))||0,pagamento:v('os-pagamento'),
    status:v('os-status')||'em_producao',
    created_at:new Date().toISOString()
  };
}

function salvarOS(fechar=true){
  const os=_coletarDadosOS();
  if(!os.paciente){toast('Informe o nome do paciente.');return null;}
  if(!DB.ordens)DB.ordens=[];
  if(_editingOsId){
    const idx=DB.ordens.findIndex(o=>o.id===_editingOsId);
    if(idx>=0){
      os.id=_editingOsId;
      os.created_at=DB.ordens[idx].created_at;
      os.usuarioId=DB.ordens[idx].usuarioId||os.usuarioId;
      os.usuarioNome=DB.ordens[idx].usuarioNome||os.usuarioNome;
      DB.ordens[idx]=os;
    }
    _editingOsId=null;
  } else {
    DB.ordens.push(os);
  }
  save();
  _atualizarCntOS();
  if(fechar){closeModal('modal-os');renderOS();}
  toast('OS salva com sucesso!');
  return os;
}

function _atualizarCntOS(){
  const cnt=document.getElementById('cnt-os');
  if(cnt)cnt.textContent=(DB.ordens||[]).filter(o=>!o.deleted).length||0;
}

const OS_STATUS_BADGE={em_producao:{cls:'badge-amber',label:'Em Produção'},pronto:{cls:'badge-green',label:'Pronto'},entregue:{cls:'badge-gray',label:'Entregue'}};
function renderOS(){
  const q=(document.getElementById('os-list-search')?.value||'').toLowerCase();
  const mesFiltroEl=document.getElementById('os-list-mes');
  const mesFiltro=mesFiltroEl?.value||'';
  const perfil=window.currentUser?.perfil||'';
  const podeVerTodos=['dono','gestor'].includes(perfil);
  let list=(DB.ordens||[])
    .filter(o=>!o.deleted)
    .filter(o=>podeVerTodos||!o.usuarioId||o.usuarioId===window.currentUser?.id)
    .filter(o=>(o.paciente||'').toLowerCase().includes(q)||(o.num||'').toLowerCase().includes(q));
  if(_osFiltro&&_osFiltro!=='todos')list=list.filter(o=>(o.status||'em_producao')===_osFiltro);
  if(mesFiltro)list=list.filter(o=>(o.created_at||o.data||'').startsWith(mesFiltro));
  list=list.sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||''));
  const el=document.getElementById('os-list-wrap');
  if(!el)return;
  if(!list.length){el.innerHTML='<div style="text-align:center;padding:40px;color:var(--muted)">Nenhuma OS encontrada.</div>';return;}
  el.innerHTML=`<table><thead><tr>
    <th>Nº OS</th><th>Paciente</th><th>Data</th><th>Entrega</th><th>Valor</th><th>Status</th><th>Índice</th><th>Montagem</th>
    ${podeVerTodos?'<th>Criado por</th>':''}
    <th></th>
  </tr></thead><tbody>${list.map(o=>{
    const sb=OS_STATUS_BADGE[o.status||'em_producao']||{cls:'badge-amber',label:o.status||'Em Produção'};
    return`<tr>
    <td style="font-weight:700;color:var(--navy)">${o.num}</td>
    <td>${o.paciente}</td>
    <td>${o.data?.split('-').reverse().join('/')||'—'}</td>
    <td>${o.entrega?.split('-').reverse().join('/')||'—'}</td>
    <td>${o.valor?'R$ '+Number(o.valor).toLocaleString('pt-BR',{minimumFractionDigits:2}):'—'}</td>
    <td><span class="badge ${sb.cls}">${sb.label}</span></td>
    <td>${o.indice||'—'}</td>
    <td>${o.montagem||'—'}</td>
    ${podeVerTodos?`<td style="font-size:11px;color:var(--muted)">${o.usuarioNome||'—'}</td>`:''}
    <td style="white-space:nowrap">
      <button class="btn btn-ghost" style="padding:3px 10px;font-size:11px" title="Editar" onclick="editarOS('${o.id}')">✏️</button>
      <button class="btn btn-ghost" style="padding:3px 10px;font-size:11px" title="Visualizar PDF" onclick="reimprimirOS('${o.id}')">👁️</button>
      <button class="btn btn-ghost" style="padding:3px 10px;font-size:11px;color:var(--danger,#e53)" title="Excluir" onclick="excluirOS('${o.id}')">✕</button>
    </td>
  </tr>`;}).join('')}</tbody></table>`;
}

function excluirOS(id){
  if(!confirm('Excluir esta OS?'))return;
  const o=(DB.ordens||[]).find(o=>o.id===id);
  if(o){o.deleted=true;save();_atualizarCntOS();renderOS();}
}

function reimprimirOS(id){
  const os=(DB.ordens||[]).find(o=>o.id===id);
  if(!os){toast('OS não encontrada.');return;}
  _abrirPDFdaOS(os);
}

function editarOS(id){
  const os=(DB.ordens||[]).find(o=>o.id===id);
  if(!os){toast('OS não encontrada.');return;}
  _editingOsId=id;
  openModal('modal-os');
  const set=(eid,val)=>{const el=document.getElementById(eid);if(el&&val!=null)el.value=val;};
  const dl=document.getElementById('os-cli-list');
  if(dl)dl.innerHTML=DB.clientes.filter(c=>!c.deleted).map(c=>`<option value="${c.nome}">`).join('');
  set('os-num',os.num);set('os-paciente',os.paciente);set('os-tel',os.tel);set('os-data',os.data);
  set('os-od-esf',os.longe_od?.esf);set('os-od-cil',os.longe_od?.cil);set('os-od-eix',os.longe_od?.eix);
  set('os-od-dnp',os.longe_od?.dnp);set('os-od-alt',os.longe_od?.alt);
  set('os-od-base',os.longe_od?.base);set('os-od-desc',os.longe_od?.desc);set('os-od-descanso',os.longe_od?.descanso);
  if(document.getElementById('os-od-prisma'))document.getElementById('os-od-prisma').checked=!!os.longe_od?.prisma;
  set('os-oe-esf',os.longe_oe?.esf);set('os-oe-cil',os.longe_oe?.cil);set('os-oe-eix',os.longe_oe?.eix);
  set('os-oe-dnp',os.longe_oe?.dnp);set('os-oe-alt',os.longe_oe?.alt);
  set('os-oe-base',os.longe_oe?.base);set('os-oe-desc',os.longe_oe?.desc);set('os-oe-descanso',os.longe_oe?.descanso);
  if(document.getElementById('os-oe-prisma'))document.getElementById('os-oe-prisma').checked=!!os.longe_oe?.prisma;
  set('os-pp-od-adc',os.perto_od?.adc);set('os-pp-od-esf',os.perto_od?.esf);
  set('os-pp-oe-adc',os.perto_oe?.adc);set('os-pp-oe-esf',os.perto_oe?.esf);
  set('os-ponte',os.ponte);set('os-horz',os.horz);set('os-vert',os.vert);set('os-diag',os.diag);
  set('os-dpa',os.dpa);set('os-diam-od',os.diamOd);set('os-diam-oe',os.diamOe);
  document.querySelectorAll('[name="os-clipon"]').forEach(r=>{r.checked=(r.value===(os.clipon||'nao'));});
  if(document.getElementById('os-env-montagem'))document.getElementById('os-env-montagem').checked=!!os.envMontagem;
  document.querySelectorAll('[name="os-arm-cond"]').forEach(r=>{r.checked=(r.value===os.armCond);});
  set('os-montagem',os.montagem);set('os-indice',os.indice);
  const armCbs=['os-arm-acetato','os-arm-metal','os-arm-tr90','os-arm-titanio','os-arm-nylon','os-arm-parafusada'];
  const armLabels=['Acetato','Metal / Aço','TR-90 / Grilamid','Titânio','Nylon (Fio)','Parafusada'];
  armCbs.forEach((cbid,i)=>{const el=document.getElementById(cbid);if(el)el.checked=(os.armacao||[]).includes(armLabels[i]);});
  const tratCbs=['os-tr-ar','os-tr-azul','os-tr-foto','os-tr-hidro','os-tr-risco','os-tr-uv'];
  const tratLabels=['Antirreflexo','Filtro Luz Azul','Fotossensível','Hidrofóbico','Anti-risco','Proteção UV 400'];
  tratCbs.forEach((cbid,i)=>{const el=document.getElementById(cbid);if(el)el.checked=(os.tratamentos||[]).includes(tratLabels[i]);});
  set('os-obs',os.obs);set('os-entrega',os.entrega);set('os-valor',os.valor||'');set('os-pagamento',os.pagamento);
  const osStatusEl=document.getElementById('os-status');if(osStatusEl)osStatusEl.value=os.status||'em_producao';
  const bn=document.getElementById('os-import-banner');if(bn)bn.style.display='none';
}

window.osImportarReceita=osImportarReceita;
window.salvarOS=salvarOS;
window.renderOS=renderOS;
window.excluirOS=excluirOS;
window.reimprimirOS=reimprimirOS;
window.editarOS=editarOS;

function gerarOsPDF(){
  // Salva antes de imprimir (sem fechar modal)
  const os=salvarOS(false);
  if(!os)return;
  closeModal('modal-os');
  renderOS();
  _abrirPDFdaOS(os);
}

function _abrirPDFdaOS(os){
  const emp=(DB.settings&&DB.settings.empresa)||{nome:'HAW Vision',cnpj:'32.139.400/0001-79',telefone:'(91) 99801-9092',cidade:'Belém / PA'};
  const nomeOtica=emp.nome||'HAW Vision';
  const valorFmt=os.valor?'R$ '+Number(os.valor).toLocaleString('pt-BR',{minimumFractionDigits:2}):'';
  const fmtData=d=>(d||'').split('-').reverse().join('/')||'—';

  const cellStyle=`border:1px solid #13182C;padding:5px 4px;text-align:center;font-size:11px;min-width:42px`;
  const hStyle=`background:#13182C;color:#F7CF13;font-weight:700;font-size:10px;padding:5px 3px;text-align:center;border:1px solid #13182C`;

  function rxTable(title,headers,rows){
    const [od,oe]=rows;
    return `<div style="margin-bottom:6px">
      <div style="font-size:11px;font-weight:700;color:#13182C;border-bottom:2px solid #F7CF13;padding-bottom:2px;margin-bottom:4px;text-transform:uppercase">${title}</div>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr>
          <th style="${hStyle};width:50px">OLHO</th>
          ${headers.map(h=>`<th style="${hStyle}">${h}</th>`).join('')}
        </tr></thead>
        <tbody>
          <tr><td style="${cellStyle};font-weight:800;background:#f0f4fb">O.D.</td>${od.map(val=>`<td style="${cellStyle}">${val||''}</td>`).join('')}</tr>
          <tr style="background:#f9fafc"><td style="${cellStyle};font-weight:800">O.E.</td>${oe.map(val=>`<td style="${cellStyle}">${val||''}</td>`).join('')}</tr>
        </tbody>
      </table></div>`;
  }

  const sharedArmacao=`<div style="display:flex;gap:18px;margin-bottom:6px;font-size:11px;flex-wrap:wrap">
    <span><b>MHA:</b> ${os.horz||'—'}</span>
    <span><b>MVA:</b> ${os.vert||'—'}</span>
    <span><b>DMA:</b> ${os.diag||'—'}</span>
    <span><b>Ponte:</b> ${os.ponte||'—'}</span>
    <span><b>DPA:</b> ${os.dpa||'—'}</span>
    <span><b>Diâm. O.D.:</b> ${os.diamOd||'—'}</span>
    <span><b>Diâm. O.E.:</b> ${os.diamOe||'—'}</span>
    ${os.clipon&&os.clipon!=='nao'?`<span><b>Clipon:</b> ${os.clipon==='sim'?'Sim':'Não Informado'}</span>`:''}
    ${os.envMontagem?`<span style="color:#13182C;font-weight:700">✔ Enviada para montagem</span>`:''}
  </div>`;

  const longe=rxTable('PARA LONGE',['ESFÉRICO','CILÍND.','EIXO','DNP','ALTURA'],[
    [os.longe_od?.esf,os.longe_od?.cil,os.longe_od?.eix,os.longe_od?.dnp,os.longe_od?.alt],
    [os.longe_oe?.esf,os.longe_oe?.cil,os.longe_oe?.eix,os.longe_oe?.dnp,os.longe_oe?.alt]
  ]);
  const perto=rxTable('PARA PERTO / ADIÇÃO',['ADIÇÃO','ESF. PERTO'],[
    [os.perto_od?.adc,os.perto_od?.esf],
    [os.perto_oe?.adc,os.perto_oe?.esf]
  ]);
  const temOutros=(f)=>f.base||f.desc||f.descanso||f.prisma;
  const outrosPdf=(temOutros(os.longe_od||{})||temOutros(os.longe_oe||{}))?rxTable('OUTROS DADOS',['BASE','DESC.','DESCANSO','PRISMA'],[
    [os.longe_od?.base,os.longe_od?.desc,os.longe_od?.descanso,os.longe_od?.prisma?'Sim':''],
    [os.longe_oe?.base,os.longe_oe?.desc,os.longe_oe?.descanso,os.longe_oe?.prisma?'Sim':'']
  ]):'';

  const cbRow=(items)=>items.map(lbl=>`<div style="display:flex;align-items:center;gap:5px;font-size:11px"><span style="display:inline-block;width:12px;height:12px;border:1px solid #555;text-align:center;line-height:12px;font-size:9px"></span>${lbl}</div>`).join('');
  const ckRow=(items,checked)=>items.map(lbl=>`<div style="display:flex;align-items:center;gap:5px;font-size:11px"><span style="display:inline-block;width:12px;height:12px;border:1px solid #555;text-align:center;line-height:12px;font-size:9px;background:${checked.includes(lbl)?'#13182C':''};color:#F7CF13">${checked.includes(lbl)?'✓':''}</span>${lbl}</div>`).join('');

  const logoEl=document.querySelector('#haw-pdf-logo img');
  const logoSrc=logoEl?logoEl.src:'';

  const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>OS ${os.num}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;background:#fff;color:#000;padding:16px 20px}
    @page{size:A4;margin:14mm 16mm}
    @media print{.no-print{display:none!important}.cut-line{border-top:1px dashed #aaa;margin:14px 0;text-align:center;font-size:9px;color:#888;padding-top:4px}}
    .os-wrap{max-width:720px;margin:0 auto}
    .hdr{background:#13182C;color:#fff;padding:10px 16px;display:flex;justify-content:space-between;align-items:center;border-radius:4px 4px 0 0}
    .hdr-title{font-size:20px;font-weight:900;letter-spacing:.04em;color:#fff}
    .hdr-sub{font-size:9px;color:#F7CF13;font-weight:700;margin-top:2px}
    .gold-bar{background:#F7CF13;height:4px;margin-bottom:12px;border-radius:0 0 2px 2px}
    .field-row{display:grid;gap:8px;margin-bottom:8px}
    .field-item label{font-size:9px;font-weight:700;color:#13182C;text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:2px}
    .field-item .fval{border-bottom:1.5px solid #13182C;padding:2px 0 3px;font-size:12px;min-height:20px}
    .sec-title{font-size:11px;font-weight:700;color:#13182C;border-bottom:2px solid #F7CF13;padding-bottom:2px;margin:10px 0 4px;text-transform:uppercase}
    .cb-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:4px 14px;margin-bottom:8px}
    .obs-box{border:1px solid #ccc;background:#f7f8fb;min-height:52px;padding:7px;font-size:11px;border-radius:3px;white-space:pre-wrap}
    .footer-row{display:flex;justify-content:space-between;align-items:flex-end;margin-top:14px;padding-top:8px;border-top:1px solid #ddd;font-size:9px;color:#555}
    .sign-line{border-top:1px solid #000;width:200px;text-align:center;padding-top:2px;font-size:9px}
    .btn-print{background:#13182C;color:#F7CF13;border:none;padding:9px 22px;font-size:13px;font-weight:700;border-radius:4px;cursor:pointer;margin:14px auto;display:block}
    .btn-print:hover{background:#1e2a45}
  </style></head><body>
  <div class="os-wrap">
    <div class="hdr">
      ${logoSrc?`<img src="${logoSrc}" style="height:45px;filter:brightness(0) invert(1)" onerror="this.style.display='none'">`:''}
      <div>
        <div style="font-size:10px;color:#F7CF13;font-weight:700">${nomeOtica.toUpperCase()}</div>
        <div style="font-size:8px;color:#fff;opacity:.8">${emp.telefone||''} &nbsp;|&nbsp; ${emp.cidade||'Belém / PA'}</div>
      </div>
      <div style="text-align:right;display:flex;align-items:center;gap:10px">
        <div>
          <div class="hdr-title">ORDEM DE SERVIÇO</div>
          <div class="hdr-sub">Nº ${os.num}</div>
        </div>
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=70x70&data=${encodeURIComponent('OS-'+os.num+'-'+os.paciente)}" style="width:70px;height:70px;border-radius:4px;background:#fff;padding:2px" alt="QR OS">
      </div>
    </div>
    <div class="gold-bar"></div>

    <div class="field-row" style="grid-template-columns:3fr 1fr 2fr 1fr">
      <div class="field-item"><label>Paciente</label><div class="fval">${os.paciente}</div></div>
      <div class="field-item"><label>Nº OS</label><div class="fval" style="font-weight:800">${os.num}</div></div>
      <div class="field-item"><label>Telefone</label><div class="fval">${os.tel}</div></div>
      <div class="field-item"><label>Data</label><div class="fval">${fmtData(os.data)}</div></div>
    </div>

    ${longe}${perto}${outrosPdf}${sharedArmacao}

    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:10px;font-size:11px">
      <div><b>Armação:</b> ${os.armCond||'—'}</div>
      <div><b>Montagem:</b> ${os.montagem||'—'}</div>
      <div><b>Índice:</b> ${os.indice||'—'}</div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div>
        <div class="sec-title">Tipo de Armação</div>
        <div class="cb-grid">
          ${ckRow(['Acetato','Metal / Aço','TR-90 / Grilamid','Titânio','Nylon (Fio)','Parafusada'],os.armacao||[])}
        </div>
      </div>
      <div>
        <div class="sec-title">Tratamentos</div>
        <div class="cb-grid">
          ${ckRow(['Antirreflexo','Filtro Luz Azul','Fotossensível','Hidrofóbico','Anti-risco','Proteção UV 400'],os.tratamentos||[])}
        </div>
      </div>
    </div>

    <div class="sec-title">Observações Técnicas</div>
    <div class="obs-box">${os.obs||'&nbsp;'}</div>

    <div class="field-row" style="grid-template-columns:1fr 1fr 2fr;margin-top:10px">
      <div class="field-item"><label>Data de Entrega</label><div class="fval">${fmtData(os.entrega)}</div></div>
      <div class="field-item"><label>Valor Total</label><div class="fval" style="font-weight:700;font-size:14px">${valorFmt}</div></div>
      <div class="field-item"><label>Forma de Pagamento</label><div class="fval">${os.pagamento}</div></div>
    </div>

    <div class="footer-row">
      <div>
        <div class="sign-line">Assinatura do Cliente</div>
      </div>
      <div style="text-align:right">
        <div style="margin-bottom:16px">_________________________________</div>
        <div>Responsável Técnico &nbsp;|&nbsp; CRO: ___________</div>
      </div>
    </div>

    <div style="text-align:center;font-size:8px;color:#aaa;margin-top:12px">
      ${nomeOtica} &nbsp;·&nbsp; CNPJ: ${emp.cnpj||''} &nbsp;·&nbsp; Validade recomendada: 6 meses
    </div>

    <button class="btn-print no-print" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>
  </div>
  <script>window.onload=()=>setTimeout(()=>window.print(),400)<\/script>
  </body></html>`;

  const w=window.open('','_blank','width=800,height=900');
  if(!w){toast('Permita pop-ups para gerar o PDF.');return;}
  w.document.write(html);
  w.document.close();
}

function calcularDiametroOS(){
  const dma=parseFloat(document.getElementById('os-diag')?.value)||0;
  const dnpOd=parseFloat(document.getElementById('os-od-dnp')?.value)||0;
  const dnpOe=parseFloat(document.getElementById('os-oe-dnp')?.value)||0;
  const dpa=parseFloat(document.getElementById('os-dpa')?.value)||0;
  const mva=parseFloat(document.getElementById('os-vert')?.value)||0;
  const calc=(dnp)=>{
    if(dma>0)return dma;
    if(dnp>0&&mva>0)return Math.ceil(Math.sqrt(Math.pow(dnp,2)+Math.pow(mva,2)));
    return '';
  };
  const od=document.getElementById('os-diam-od');const oe=document.getElementById('os-diam-oe');
  if(od)od.value=calc(dpa?Math.abs(dnpOd-dpa/2):dnpOd)||dma||'';
  if(oe)oe.value=calc(dpa?Math.abs(dnpOe-dpa/2):dnpOe)||dma||'';
}
window.calcularDiametroOS=calcularDiametroOS;
window.novaOrdemServico=novaOrdemServico;
window.gerarOsPDF=gerarOsPDF;
