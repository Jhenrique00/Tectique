import {useState,type FormEvent} from 'react';
import {authApi,type User} from '../api';
import {Icon} from './Icon';
export function AuthScreen({onAuthenticated}:{onAuthenticated:(user:User)=>void}){
  const [mode,setMode]=useState<'login'|'register'>('login');
  const [name,setName]=useState('');const [email,setEmail]=useState('');const [password,setPassword]=useState('');
  const [error,setError]=useState('');const [loading,setLoading]=useState(false);
  async function submit(e:FormEvent){
    e.preventDefault();setError('');setLoading(true);
    try{const result=mode==='login'?await authApi.login(email,password):await authApi.register(name,email,password);onAuthenticated(result.user);}
    catch(e){setError(e instanceof Error?e.message:'Erro de autenticação.');}
    finally{setLoading(false);}
  }
  return <div className="auth-layout">
    <div className="auth-info">
      <a href="#/" className="brand"><Icon name="zap"/> Tectique <span className="beta">WORKSPACE</span></a>
      <div className="auth-blurb"><span className="eyebrow">SEU ESPAÇO DE AUTOMAÇÃO</span><h1>Mais controle.<br/><span>Menos trabalho.</span></h1>
        <p>Seus relatórios, histórico e rotinas do GitHub organizados em um único lugar, com acesso protegido por conta.</p>
        <div className="auth-benefits"><span><Icon name="shield-check"/> Dados separados por usuário</span><span><Icon name="list-checks"/> Relatórios salvos no PostgreSQL</span><span><Icon name="calendar-clock"/> Rotinas automáticas programadas</span></div>
      </div>
      <small>Funciona localmente no seu computador.</small>
    </div>
    <div className="auth-panel"><div className="auth-card">
      <span className="eyebrow">TECTIQUE ANALYTICS</span><h2>{mode==='login'?'Bem-vindo de volta':'Crie seu espaço'}</h2>
      <p>{mode==='login'?'Entre na sua conta para acessar seus relatórios.':'Cadastre-se para salvar suas análises e criar rotinas.'}</p>
      <div className="auth-tabs"><button type="button" className={mode==='login'?'selected':''} onClick={()=>{setMode('login');setError('');}}>Entrar</button><button type="button" className={mode==='register'?'selected':''} onClick={()=>{setMode('register');setError('');}}>Criar conta</button></div>
      <form onSubmit={submit} className="auth-form">
        {mode==='register'&&<label>Nome<input required minLength={2} maxLength={70} autoComplete="name" value={name} onChange={e=>setName(e.target.value)} placeholder="Como podemos chamar você?"/></label>}
        <label>E-mail<input required type="email" maxLength={254} autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="voce@exemplo.com"/></label>
        <label>Senha<input required type="password" minLength={8} maxLength={128} autoComplete={mode==='login'?'current-password':'new-password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Mínimo de 8 caracteres"/></label>
        {error&&<div role="alert" className="alert error">{error}</div>}
        <button type="submit" disabled={loading} className="btn primary auth-submit">{loading?'Processando…':mode==='login'?'Entrar na Tectique':'Criar minha conta'} <Icon name="arrow-right"/></button>
      </form><p className="auth-foot">Os dados são armazenados no PostgreSQL local da Tectique.</p>
    </div></div>
  </div>;
}
