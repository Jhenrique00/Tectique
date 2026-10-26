import {useCallback,useEffect,useMemo,useRef,useState,type DragEvent,type KeyboardEvent as RKeyboardEvent,type PointerEvent as RPointerEvent} from 'react';
import {Icon} from '../components/Icon';
import {flowApi,workspaceApi,type BlockInfo,type Flow,type Role,type RunStatus,type RunStep} from '../api';
import {WebhookPanel} from '../editor/WebhookPanel';
import {Inspector} from '../editor/Inspector';
import * as M from '../editor/model';
import {Head,Soon,fail} from './common';
const PLANNED=['WhatsApp','Inteligência artificial','Espera','Repetição','Banco de dados','Calendário','Arquivos e documentos','Notificações'];
const CAT:Record<string,string>={trigger:'GATILHOS',action:'AÇÕES',logic:'LÓGICA'};
const MARK:Record<string,string>={succeeded:'✓',failed:'✕',skipped:'–',reused:'↻',running:'…'};
type Msg={kind:'ok'|'error';text:string;errors?:string[]}|null;
export function Builder({wid,role,initialFlow}:{wid:string;role?:Role;initialFlow?:string}){
  const canEdit=role==='owner'||role==='admin'||role==='member';
  const [flows,setFlows]=useState<Flow[]>([]);const [blocks,setBlocks]=useState<BlockInfo[]>([]);
  const [fid,setFid]=useState(initialFlow??'');const [name,setName]=useState('Novo fluxo');const [def,setDef]=useState<M.Def>(M.newFlow());
  const [saved,setSaved]=useState(()=>JSON.stringify({name:'Novo fluxo',def:M.newFlow()}));
  const [sel,setSel]=useState<{kind:'node'|'edge';id:string|number}|null>(null);
  const [past,setPast]=useState<M.Def[]>([]);const [future,setFuture]=useState<M.Def[]>([]);
  const [check,setCheck]=useState<{ok:boolean;errors:string[]}|null>(null);const [msg,setMsg]=useState<Msg>(null);const [busy,setBusy]=useState(false);
  const [run,setRun]=useState<{id:string;status:RunStatus;steps:RunStep[];error:string|null}|null>(null);
  const [link,setLink]=useState<{from:string;branch?:'true'|'false';x:number;y:number}|null>(null);
  const defRef=useRef(def);defRef.current=def;const canvas=useRef<HTMLDivElement>(null);const loaded=useRef('');const fileRef=useRef<HTMLInputElement>(null);
  const dirty=JSON.stringify({name,def})!==saved;

  useEffect(()=>{workspaceApi.blocks().then(r=>setBlocks(r.items)).catch(e=>setMsg({kind:'error',text:fail(e)}));},[]);
  const loadFlows=useCallback(()=>flowApi.flows(wid).then(r=>setFlows(r.items)),[wid]);
  useEffect(()=>{if(wid)void loadFlows().catch(e=>setMsg({kind:'error',text:fail(e)}));},[wid,loadFlows]);
  useEffect(()=>{ // carrega o fluxo escolhido
    if(!wid||!fid||loaded.current===fid)return;loaded.current=fid;
    workspaceApi.flow(wid,fid).then(({flow})=>{const d=M.ensurePositions(flow.definition);setName(flow.name);setDef(d);setSaved(JSON.stringify({name:flow.name,def:d}));setPast([]);setFuture([]);setSel(null);setRun(null);setMsg(null);})
      .catch(e=>{setMsg({kind:'error',text:fail(e)});loaded.current='';});
  },[wid,fid]);
  useEffect(()=>{ // validação ao vivo, com pequeno atraso
    if(!wid)return;const t=setTimeout(()=>{workspaceApi.validate(wid,def).then(setCheck).catch(()=>setCheck(null));},500);return()=>clearTimeout(t);
  },[wid,def]);
  useEffect(()=>{ // acompanha a execução em tempo real
    if(!run||['succeeded','failed','cancelled'].includes(run.status))return;
    const t=setInterval(()=>{flowApi.runDetail(wid,run.id).then(r=>setRun({id:run.id,status:r.run.status,steps:r.steps,error:r.run.error})).catch(()=>{});},1200);return()=>clearInterval(t);
  },[run,wid]);

  const apply=useCallback((next:M.Def,from:M.Def=defRef.current)=>{setPast(p=>[...p.slice(-59),from]);setFuture([]);setDef(next);},[]);
  const undo=()=>setPast(p=>{if(!p.length)return p;setFuture(f=>[def,...f]);setDef(p[p.length-1]);setSel(null);return p.slice(0,-1);});
  const redo=()=>setFuture(f=>{if(!f.length)return f;setPast(p=>[...p,def]);setDef(f[0]);setSel(null);return f.slice(1);});
  const guard=(fn:()=>void)=>{try{fn();setMsg(null);}catch(e){setMsg({kind:'error',text:fail(e)});}};
  const switchFlow=(id:string)=>{if(dirty&&!confirm('Há alterações não salvas. Descartar?'))return;loaded.current='';if(!id){const d=M.newFlow();setFid('');setName('Novo fluxo');setDef(d);setSaved(JSON.stringify({name:'Novo fluxo',def:d}));setPast([]);setFuture([]);setSel(null);setRun(null);setMsg(null);}else setFid(id);};
  const add=(type:string,pos?:{x:number;y:number})=>guard(()=>{const r=M.addNode(def,type,pos);apply(r.def);setSel({kind:'node',id:r.id});});
  const tryConnect=(from:string,to:string,branch?:'true'|'false')=>guard(()=>apply(M.connect(defRef.current,from,to,branch)));
  const removeSel=()=>{if(!sel||!canEdit)return;if(sel.kind==='node'){if(sel.id==='gatilho'&&!confirm('Remover o gatilho? O fluxo precisará de outro para ser válido.'))return;apply(M.removeNode(def,String(sel.id)));}else apply(M.removeEdge(def,Number(sel.id)));setSel(null);};

  const toCanvas=(cx:number,cy:number)=>{const el=canvas.current!,r=el.getBoundingClientRect();return {x:cx-r.left+el.scrollLeft,y:cy-r.top+el.scrollTop};};
  // Rola o mapa sozinho quando o ponteiro fica perto da borda durante um arraste.
  function edgeScroll(tick:()=>void){
    let last:{x:number;y:number}|null=null;
    const t=setInterval(()=>{const el=canvas.current;if(!el||!last)return;const r=el.getBoundingClientRect(),m=48,sp=18,b=[el.scrollLeft,el.scrollTop];
      if(last.x>r.right-m)el.scrollLeft+=sp;else if(last.x<r.left+m)el.scrollLeft-=sp;
      if(last.y>r.bottom-m)el.scrollTop+=sp;else if(last.y<r.top+m)el.scrollTop-=sp;
      if(b[0]!==el.scrollLeft||b[1]!==el.scrollTop)tick();},30);
    return {track:(x:number,y:number)=>{last={x,y};},stop:()=>clearInterval(t)};
  }
  function startDrag(e:RPointerEvent,n:M.Node){
    if(e.button!==0)return;setSel({kind:'node',id:n.id});if(!canEdit)return;
    const base=defRef.current,start=toCanvas(e.clientX,e.clientY),orig={...(n.position??{x:0,y:0})};let moved=false;
    let cx=e.clientX,cy=e.clientY;
    const apply2=()=>{const p=toCanvas(cx,cy),dx=p.x-start.x,dy=p.y-start.y;if(!moved&&Math.hypot(dx,dy)<4)return;moved=true;setDef(M.moveNode(base,n.id,orig.x+dx,orig.y+dy));};
    const es=edgeScroll(apply2);
    const move=(ev:PointerEvent)=>{cx=ev.clientX;cy=ev.clientY;es.track(cx,cy);apply2();};
    const up=()=>{es.stop();removeEventListener('pointermove',move);removeEventListener('pointerup',up);if(moved){setPast(p=>[...p.slice(-59),base]);setFuture([]);}};
    addEventListener('pointermove',move);addEventListener('pointerup',up);
  }
  function startLink(e:RPointerEvent,n:M.Node,branch?:'true'|'false'){
    if(!canEdit)return;e.stopPropagation();e.preventDefault();
    let cx=e.clientX,cy=e.clientY;
    const upd=()=>{const p=toCanvas(cx,cy);setLink({from:n.id,branch,x:p.x,y:p.y});};upd();
    const es=edgeScroll(upd);
    const move=(ev:PointerEvent)=>{cx=ev.clientX;cy=ev.clientY;es.track(cx,cy);upd();};
    const up=(ev:PointerEvent)=>{es.stop();removeEventListener('pointermove',move);removeEventListener('pointerup',up);setLink(null);
      const to=(document.elementFromPoint(ev.clientX,ev.clientY)?.closest('[data-node-id]') as HTMLElement|null)?.dataset.nodeId;if(to&&to!==n.id)tryConnect(n.id,to,branch);};
    addEventListener('pointermove',move);addEventListener('pointerup',up);
  }
  const onDrop=(e:DragEvent)=>{e.preventDefault();const type=e.dataTransfer.getData('text/block');if(!type||!canEdit)return;const p=toCanvas(e.clientX,e.clientY);add(type,{x:p.x-M.NODE_W/2,y:p.y-M.NODE_H/2});};
  const onKey=(e:RKeyboardEvent)=>{
    const typing=['INPUT','SELECT','TEXTAREA'].includes((e.target as HTMLElement).tagName);
    if((e.key==='Delete'||e.key==='Backspace')&&!typing){e.preventDefault();removeSel();}
    else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();}
    else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo();}
    else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();if(canEdit)void save();}
  };

  async function save():Promise<string|null>{
    setBusy(true);setMsg(null);
    try{
      let id=fid;
      if(id)await workspaceApi.updateFlow(wid,id,name.trim()||'Fluxo sem nome',def);
      else{const r=await workspaceApi.createFlow(wid,name.trim()||'Fluxo sem nome',def);id=r.flow.id;loaded.current=id;setFid(id);}
      setSaved(JSON.stringify({name,def}));await loadFlows();setMsg({kind:'ok',text:'Fluxo salvo.'});return id;
    }catch(e){setMsg({kind:'error',text:fail(e),errors:(e as {errors?:string[]}).errors});return null;}finally{setBusy(false);}
  }
  async function saveAndRun(){
    const id=await save();if(!id)return;setBusy(true);
    try{const r=await flowApi.run(wid,id);setRun({id:r.run.id,status:'queued',steps:[],error:null});setSel(null);}catch(e){setMsg({kind:'error',text:fail(e)});}finally{setBusy(false);}
  }
  function exportJson(){const blob=new Blob([JSON.stringify({name,definition:def},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${name.replace(/[^\w-]+/g,'-')||'fluxo'}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
  async function importJson(file:File){
    try{const data=JSON.parse(await file.text());const d=data.definition??data;if(!Array.isArray(d?.nodes)||!Array.isArray(d?.edges))throw new Error('Arquivo inválido: esperado um fluxo com "nodes" e "edges".');
      const next=M.ensurePositions(d);loaded.current='';setFid('');setName(String(data.name??file.name.replace(/\.json$/i,'')).slice(0,80));setDef(next);setSaved('');setPast([]);setFuture([]);setSel(null);setRun(null);setMsg({kind:'ok',text:'Fluxo importado. Revise e salve para guardá-lo.'});
    }catch(e){setMsg({kind:'error',text:fail(e)});}
  }

  const stepOf=useMemo(()=>Object.fromEntries((run?.steps??[]).map(s=>[s.node_id,s])),[run]);
  const badNodes=useMemo(()=>M.errorNodes(check?.errors??[]),[check]);
  const selNode=sel?.kind==='node'?def.nodes.find(n=>n.id===sel.id):undefined;
  const info=(t:string)=>blocks.find(b=>b.type===t);
  const hasTrigger=def.nodes.some(n=>M.isTrigger(n.type));
  const size={w:Math.max(900,...def.nodes.map(n=>(n.position?.x??0)+M.NODE_W+260)),h:Math.max(440,...def.nodes.map(n=>(n.position?.y??0)+M.NODE_H+200))};
  const finished=run&&['succeeded','failed','cancelled'].includes(run.status);

  return <section className="dashboard-panel">
    <Head eyebrow="EDITOR VISUAL" title="Criador de fluxos">Monte automações arrastando blocos, conectando etapas e configurando cada uma no painel lateral. O mesmo motor executa os modelos prontos e os seus fluxos.</Head>
    {!canEdit&&<div className="alert warning" role="status">Seu papel neste workspace permite apenas visualizar. Peça a um administrador para ser membro e poder editar.</div>}
    <div className="toolbar">
      <label>Fluxo<select value={fid} onChange={e=>switchFlow(e.target.value)}><option value="">Novo fluxo (não salvo)</option>{flows.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
      <label>Nome<input value={name} maxLength={80} disabled={!canEdit} onChange={e=>setName(e.target.value)}/></label>
      <button className="btn secondary small" disabled={!canEdit||busy||!dirty} onClick={()=>void save()}><Icon name="check"/> Salvar</button>
      <button className="btn primary small" disabled={!canEdit||busy||!!check&&!check.ok} onClick={()=>void saveAndRun()} title={check&&!check.ok?'Corrija os problemas do fluxo antes de executar':undefined}><Icon name="circle-play"/> Salvar e executar</button>
      <button className="btn secondary small" disabled={!canEdit||past.length===0} onClick={undo}>Desfazer</button>
      <button className="btn secondary small" disabled={!canEdit||future.length===0} onClick={redo}>Refazer</button>
      <button className="btn secondary small" disabled={!canEdit} onClick={()=>apply(M.autoLayout(def))}>Organizar</button>
      <button className="btn secondary small" disabled={!canEdit||!fid} onClick={()=>{loaded.current='';setFid('');setName(n=>`${n} (cópia)`.slice(0,80));setSaved('');setRun(null);setMsg({kind:'ok',text:'Cópia criada. Salve para guardá-la.'});}}>Duplicar</button>
      <button className="btn secondary small" onClick={exportJson}><Icon name="download"/> Exportar</button>
      <button className="btn secondary small" disabled={!canEdit} onClick={()=>fileRef.current?.click()}><Icon name="upload"/> Importar</button>
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={e=>{const f=e.target.files?.[0];if(f)void importJson(f);e.target.value='';}}/>
      <Soon icon="circle-play">Testar bloco</Soon>
    </div>
    <div className="statusbar" role="status">
      <span className={'pill '+(dirty?'warn':'ok')}>{dirty?'Alterações não salvas':'Salvo'}</span>
      {check&&<span className={'pill '+(check.ok?'ok':'bad')}>{check.ok?'Fluxo válido':`${check.errors.length} problema${check.errors.length===1?'':'s'}`}</span>}
      {run&&<span className={'run-status '+run.status}>Execução: {({queued:'na fila',running:'executando',succeeded:'concluída',failed:'falhou',cancelled:'cancelada'})[run.status]}</span>}
    </div>
    {msg&&<div className={'alert '+(msg.kind==='ok'?'':'error')} role={msg.kind==='ok'?'status':'alert'}>{msg.text}{msg.errors&&<ul>{msg.errors.map((x,i)=><li key={i}>{x}</li>)}</ul>}</div>}
    {check&&!check.ok&&<details className="alert warning problems" open><summary>Problemas encontrados ({check.errors.length})</summary><ul>{check.errors.map((x,i)=><li key={i}>{x}</li>)}</ul></details>}
    {finished&&run.error&&<div className="alert error" role="alert">{run.error}</div>}
    {def.nodes.some(n=>n.type==='trigger.webhook')&&<WebhookPanel key={wid+fid} wid={wid} fid={fid} role={role} dirty={dirty}/> }
    <div className="builder">
      <aside className="palette" aria-label="Blocos"><strong>Blocos</strong><small className="muted-note">Clique ou arraste para o mapa.</small>
        {(['trigger','action','logic'] as const).map(c=><div key={c} style={{display:'grid',gap:8}}><h4>{CAT[c]}</h4>{blocks.filter(b=>b.category===c).map(b=>{
          const off=!canEdit||!M.BLOCK_UI[b.type]||(M.isTrigger(b.type)&&hasTrigger);
          return <button type="button" key={b.type} className={'pal-item'+(off?' off':'')} draggable={!off} disabled={off} onDragStart={e=>e.dataTransfer.setData('text/block',b.type)} onClick={()=>add(b.type)} title={M.isTrigger(b.type)&&hasTrigger?'O fluxo já tem um gatilho':b.description}>{b.label}<small>{b.description}</small></button>;})}</div>)}
        <h4>PLANEJADOS</h4>{PLANNED.map(p=><div className="pal-item soon" key={p}>{p}</div>)}
      </aside>
      <div className="canvas" ref={canvas} tabIndex={0} onKeyDown={onKey} onDragOver={e=>e.preventDefault()} onDrop={onDrop} onPointerDown={e=>{if(e.target===e.currentTarget||(e.target as HTMLElement).classList.contains('canvas-inner'))setSel(null);}} aria-label="Mapa do fluxo (editável)">
        <div className="canvas-inner" style={{width:size.w,height:size.h}}>
          <svg width={size.w} height={size.h} style={{width:size.w,height:size.h,overflow:'visible'}} aria-hidden="true">
            <defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#ff713c"/></marker></defs>
            {def.edges.map((e,i)=>{const a=def.nodes.find(n=>n.id===e.from),b=def.nodes.find(n=>n.id===e.to);if(!a||!b)return null;
              const p1=M.outPort(a,e.branch),p2=M.inPort(b),mx=(p1.x+p2.x)/2,d=`M${p1.x} ${p1.y} C${mx} ${p1.y} ${mx} ${p2.y} ${p2.x-2} ${p2.y}`,on=sel?.kind==='edge'&&sel.id===i;
              return <g key={i}><path d={d} fill="none" stroke={on?'#ffae57':e.branch==='true'?'#35c486':e.branch==='false'?'#f26975':'#ff713c'} strokeWidth={on?2.6:1.6} markerEnd="url(#arr)"/>
                <path d={d} fill="none" stroke="transparent" strokeWidth="16" style={{pointerEvents:'stroke',cursor:'pointer'}} onClick={()=>setSel({kind:'edge',id:i})}/>
                {e.branch&&<text x={mx} y={(p1.y+p2.y)/2-6} textAnchor="middle" fill={e.branch==='true'?'#7be4b3':'#f26975'} stroke="#0e0f14" strokeWidth="3" paintOrder="stroke" fontSize="10" fontWeight="700">{e.branch==='true'?'SIM':'NÃO'}</text>}</g>;})}
            {link&&(()=>{const a=def.nodes.find(n=>n.id===link.from);if(!a)return null;const p1=M.outPort(a,link.branch);return <path d={`M${p1.x} ${p1.y} L${link.x} ${link.y}`} stroke="#ffae57" strokeWidth="1.6" strokeDasharray="5 4" fill="none"/>;})()}
          </svg>
          {def.nodes.map(n=>{const st=stepOf[n.id],cat=info(n.type)?.category??'action',p=n.position??{x:0,y:0};
            return <div key={n.id} data-node-id={n.id} className={`fnode ${cat}${sel?.kind==='node'&&sel.id===n.id?' sel':''}${st?' st-'+st.status:''}${badNodes.has(n.id)?' has-error':''}`} style={{left:p.x,top:p.y,cursor:canEdit?'grab':'pointer'}} onPointerDown={e=>startDrag(e,n)}>
              {!M.isTrigger(n.type)&&<span className="handle in" aria-hidden="true"/>}
              <small>{info(n.type)?.label??n.type}{st&&<b className={'mark '+st.status}> {MARK[st.status]}</b>}</small><strong>{n.name||n.id}</strong>
              {M.isCondition(n.type)?<><span className="handle out yes" title="Arraste para o caminho SIM" onPointerDown={e=>startLink(e,n,'true')}/><span className="handle out no" title="Arraste para o caminho NÃO" onPointerDown={e=>startLink(e,n,'false')}/><em className="hl yes">SIM</em><em className="hl no">NÃO</em></>
                :<span className="handle out" title="Arraste até outro bloco para conectar" onPointerDown={e=>startLink(e,n)}/>}
            </div>;})}
        </div>
      </div>
      <Inspector def={def} node={selNode} edgeIndex={sel?.kind==='edge'?Number(sel.id):undefined} blocks={blocks} canEdit={canEdit} variables={selNode?M.variableOptions(def,selNode.id):[]} step={selNode?stepOf[selNode.id]:undefined}
        onConfig={c=>selNode&&setDef(M.updateNode(def,selNode.id,{config:c}))} onName={v=>selNode&&setDef(M.updateNode(def,selNode.id,{name:v}))}
        onDelete={removeSel} onConnect={(to,br)=>selNode&&tryConnect(selNode.id,to,br)} onRemoveEdge={i=>apply(M.removeEdge(def,i))} onRemoveSelectedEdge={removeSel}/>
    </div>
  </section>;
}
