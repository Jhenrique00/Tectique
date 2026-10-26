import {useEffect,useState} from 'react';
import {api,type Role} from '../api';
export function WebhookPanel({wid,fid,role,dirty}:{wid:string;fid:string;role?:Role;dirty:boolean}){
  const [state,setState]=useState<{path:string;enabled:boolean;token?:string}|null>(null);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  const canManage=role==='owner'||role==='admin';
  const endpoint=`/workspaces/${wid}/flows/${fid}/webhook`;
  useEffect(()=>{if(fid&&canManage)api<{path:string;enabled:boolean}>(endpoint).then(setState).catch(e=>setError(e.message));},[endpoint,fid,canManage]);
  async function change(method:'POST'|'DELETE'){
    if(method==='POST'&&state?.enabled&&!confirm('Gerar outro token invalida imediatamente o anterior. Continuar?'))return;
    setBusy(true);setError('');try{
      if(method==='DELETE'){await api(endpoint,{method});setState(s=>s?{path:s.path,enabled:false}:null);}
      else setState(await api(endpoint,{method}));
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <div className="box" style={{marginBottom:16}}><h3>Entrada por webhook</h3>
    <p className="muted-note">Envie JSON com POST, Authorization: Bearer TOKEN e X-Tectique-Event-Id: identificador-único. Repetir o mesmo identificador não cria outra execução. Os campos ficam disponíveis como {'{{ trigger.campo }}'}.</p>
    {!fid?<p>Salve o fluxo para configurar o endereço.</p>:!canManage?<p>Peça a um administrador para ativar a entrada e gerar o token.</p>:<>
      {state&&<p>Estado: <b>{state.enabled?'Ativo':'Desativado'}</b> · <code>{location.origin+state.path}</code></p>}
      <button className="btn secondary small" disabled={busy||dirty} onClick={()=>void change('POST')}>{state?.enabled?'Gerar novo token':'Ativar e gerar token'}</button>{' '}
      <button className="btn secondary small" disabled={busy||!state?.enabled} onClick={()=>void change('DELETE')}>Revogar acesso</button>
      {dirty&&<p className="muted-note">Salve suas alterações antes de ativar.</p>}
      {state?.token&&<label>Token — copie agora; não será exibido novamente<input readOnly type="password" value={state.token} onFocus={e=>e.target.select()}/><button className="btn secondary small" onClick={()=>navigator.clipboard.writeText(state.token!).catch(()=>setError('Selecione o campo do token e copie com Ctrl+C.'))}>Copiar token</button></label>}
    </>}
    {error&&<p role="alert">{error}</p>}
    <p className="muted-note">No computador, o endereço recebe chamadas locais enquanto a Tectique estiver aberta. Serviços externos precisarão de hospedagem com HTTPS, em uma etapa futura. Não envie senhas no corpo: campos sensíveis são ocultados antes de entrar no fluxo.</p>
  </div>;
}
