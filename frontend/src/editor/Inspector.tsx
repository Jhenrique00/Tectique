import {useState} from 'react';
import {Icon} from '../components/Icon';
import type {BlockInfo,RunStep} from '../api';
import {BLOCK_UI,coerce,isCondition,show,type Def,type Field,type Node} from './model';

function VarPicker({options,onPick,disabled}:{options:{label:string;value:string}[];onPick:(v:string)=>void;disabled?:boolean}){
  if(options.length===0)return null;
  return <select className="var-pick" aria-label="Inserir variável" disabled={disabled} value="" onChange={e=>{if(e.target.value)onPick(e.target.value);}}>
    <option value="">{'{ } variável'}</option>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>;
}
function Pairs({value,onChange,disabled,help}:{value:Record<string,unknown>;onChange:(v:Record<string,unknown>)=>void;disabled?:boolean;help?:string}){
  const [rows,setRows]=useState<[string,string][]>(()=>Object.entries(value??{}).map(([k,v])=>[k,show(v)]));
  const push=(next:[string,string][])=>{setRows(next);onChange(Object.fromEntries(next.filter(([k])=>k.trim()).map(([k,v])=>[k.trim(),coerce(v)])));};
  return <div className="pairs">{rows.map(([k,v],i)=><div className="pair" key={i}>
    <input aria-label="Nome" placeholder="nome" value={k} disabled={disabled} maxLength={64} onChange={e=>push(rows.map((r,j)=>j===i?[e.target.value,r[1]]:r))}/>
    <input aria-label="Valor" placeholder="valor" value={v} disabled={disabled} onChange={e=>push(rows.map((r,j)=>j===i?[r[0],e.target.value]:r))}/>
    <button type="button" className="btn subtle small" aria-label="Remover linha" disabled={disabled} onClick={()=>push(rows.filter((_,j)=>j!==i))}><Icon name="trash-2"/></button></div>)}
    <button type="button" className="btn secondary small" disabled={disabled} onClick={()=>push([...rows,['','']])}><Icon name="plus"/> Adicionar</button>
    {help&&<small className="muted-note">{help}</small>}</div>;
}
export function Inspector({def,node,edgeIndex,blocks,canEdit,variables,step,onConfig,onName,onDelete,onConnect,onRemoveEdge,onRemoveSelectedEdge}:{
  def:Def;node?:Node;edgeIndex?:number;blocks:BlockInfo[];canEdit:boolean;variables:{label:string;value:string}[];step?:RunStep;
  onConfig:(c:Record<string,any>)=>void;onName:(n:string)=>void;onDelete:()=>void;onConnect:(to:string,branch?:'true'|'false')=>void;onRemoveEdge:(i:number)=>void;onRemoveSelectedEdge:()=>void}){
  const [target,setTarget]=useState('');const [branch,setBranch]=useState<'true'|'false'>('true');
  if(edgeIndex!==undefined&&def.edges[edgeIndex]){
    const e=def.edges[edgeIndex],nm=(id:string)=>def.nodes.find(n=>n.id===id)?.name||id;
    return <aside className="inspector" aria-label="Propriedades da conexão"><strong>Conexão</strong>
      <p className="muted-note">{nm(e.from)} → {nm(e.to)}{e.branch&&<> · caminho <b>{e.branch==='true'?'SIM':'NÃO'}</b></>}</p>
      <button className="btn secondary small" disabled={!canEdit} onClick={onRemoveSelectedEdge}><Icon name="trash-2"/> Remover conexão</button></aside>;
  }
  if(!node)return <aside className="inspector" aria-label="Propriedades"><strong>Propriedades</strong>
    <p className="muted-note">Selecione um bloco para configurá-lo. Para conectar, arraste do círculo à direita de um bloco até outro bloco, ou use “Conexões” aqui.</p>
    <p className="muted-note"><b>Atalhos:</b> Delete remove a seleção · Ctrl+Z desfaz · Ctrl+Shift+Z refaz · Ctrl+S salva.</p></aside>;
  const ui=BLOCK_UI[node.type],info=blocks.find(b=>b.type===node.type);
  const set=(key:string,value:unknown)=>onConfig({...node.config,[key]:value});
  const out=def.edges.map((e,i)=>({e,i})).filter(x=>x.e.from===node.id);
  const targets=def.nodes.filter(n=>n.id!==node.id&&!n.type.startsWith('trigger.'));
  const nm=(id:string)=>def.nodes.find(n=>n.id===id)?.name||id;
  const op=String(node.config.operator??'');
  return <aside className="inspector" aria-label="Propriedades do bloco" key={node.id}>
    <strong>{info?.label??node.type}</strong><small className="muted-note">{info?.description}</small>
    <label>Nome do bloco<input value={node.name??''} placeholder={node.id} maxLength={80} disabled={!canEdit} onChange={e=>onName(e.target.value)}/></label>
    <small className="muted-note">Identificador: <code>{node.id}</code></small>
    {ui?ui.fields.map((f:Field)=>{
      if(f.key==='right'&&op==='exists')return null;
      return <div className="field" key={f.key}>
        {f.kind==='text'&&<label>{f.label}<span className="with-var"><input value={show(node.config[f.key])} placeholder={f.placeholder} disabled={!canEdit} onChange={e=>set(f.key,coerce(e.target.value))}/>
          <VarPicker options={variables} disabled={!canEdit} onPick={v=>set(f.key,show(node.config[f.key])?`${show(node.config[f.key])}${v}`:v)}/></span></label>}
        {f.kind==='textarea'&&<label>{f.label}<textarea rows={6} value={show(node.config[f.key])} disabled={!canEdit} onChange={e=>set(f.key,e.target.value)}/><VarPicker options={variables} disabled={!canEdit} onPick={v=>set(f.key,show(node.config[f.key])+v)}/></label>}
        {f.kind==='select'&&<label>{f.label}<select value={String(node.config[f.key]??'')} disabled={!canEdit} onChange={e=>set(f.key,typeof f.options[0].value==='number'?Number(e.target.value):e.target.value)}>{f.options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>}
        {f.kind==='pairs'&&<><span className="lbl">{f.label}</span><Pairs value={(node.config[f.key]??{}) as Record<string,unknown>} disabled={!canEdit} help={f.help} onChange={v=>set(f.key,v)}/></>}
      </div>;}):<label>Configuração (JSON)<textarea rows={6} defaultValue={JSON.stringify(node.config,null,2)} disabled={!canEdit} onBlur={e=>{try{onConfig(JSON.parse(e.target.value));}catch{/* mantém o anterior */}}}/></label>}
    <h4>CONEXÕES DE SAÍDA</h4>
    {out.length===0&&<p className="muted-note">Nenhuma. Arraste do círculo do bloco ou use o formulário abaixo.</p>}
    {out.map(({e,i})=><div className="rowline" key={i}><span>{e.branch&&<span className={'pill '+(e.branch==='true'?'ok':'bad')}>{e.branch==='true'?'SIM':'NÃO'}</span>} {nm(e.to)}</span><button className="btn subtle small" aria-label={`Remover conexão para ${nm(e.to)}`} disabled={!canEdit} onClick={()=>onRemoveEdge(i)}><Icon name="trash-2"/></button></div>)}
    {canEdit&&targets.length>0&&<div className="connect-form"><select aria-label="Conectar a" value={target} onChange={e=>setTarget(e.target.value)}><option value="">Conectar a…</option>{targets.map(n=><option key={n.id} value={n.id}>{n.name||n.id}</option>)}</select>
      {isCondition(node.type)&&<select aria-label="Caminho" value={branch} onChange={e=>setBranch(e.target.value as 'true'|'false')}><option value="true">SIM</option><option value="false">NÃO</option></select>}
      <button className="btn secondary small" disabled={!target} onClick={()=>{onConnect(target,isCondition(node.type)?branch:undefined);setTarget('');}}>Conectar</button></div>}
    {step&&<><h4>ÚLTIMA EXECUÇÃO</h4><span className={'run-status '+step.status}>{({running:'Executando',succeeded:'Concluída',failed:'Falhou',skipped:'Ignorada',reused:'Reaproveitada'})[step.status]}</span>
      {step.error&&<p className="run-error">{step.error}</p>}{step.output!==null&&step.output!==undefined&&<pre>{JSON.stringify(step.output,null,2)}</pre>}</>}
    <button className="btn subtle small" disabled={!canEdit} onClick={onDelete} style={{justifySelf:'start',marginTop:8}}><Icon name="trash-2"/> Excluir bloco</button>
  </aside>;
}
