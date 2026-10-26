import { AppError } from './security.js';
export function normalizeRepository(input: string) {
  let v = input.trim().replace(/\/$/, '');
  if(v.startsWith('https://')) {
    const u = new URL(v);
    if(u.host !== 'github.com' || u.search || u.hash || u.username || u.password) throw new AppError(422, 'Use uma URL pública do GitHub.');
    v = u.pathname.slice(1);
  }
  v = v.replace(/\.git$/, '');
  if(!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/.test(v) || ['.','..'].includes(v.split('/')[1])) throw new AppError(422, 'Informe usuario/repositorio.');
  return v;
}
export function createGitHubService(fetcher: typeof fetch = fetch) {
  const cache = new Map<string, {until: number; report: any}>();
  async function get(path: string, empty = false) {
    let url = new URL(path, 'https://api.github.com');
    const headers: Record<string,string> = {'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'Tectique'};
    if(process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    for(let i=0;i<4;i++) {
      let res: Response;
      try { res = await fetcher(url, {headers, redirect:'manual', signal:AbortSignal.timeout(15000)}); }
      catch { throw new AppError(502,'Não foi possível conectar ao GitHub. Tente novamente.'); }
      if([301,302,307,308].includes(res.status)) {
        const next = res.headers.get('location');
        if(!next) throw new AppError(502,'Redirecionamento inválido.');
        url = new URL(next,url);
        if(url.origin !== 'https://api.github.com' || url.username || url.password) throw new AppError(502,'Redirecionamento externo bloqueado.');
        continue;
      }
      if(res.status===404) throw new AppError(404,'Repositório público não encontrado.');
      if([403,429].includes(res.status)) throw new AppError(429,'Limite ou restrição do GitHub. Aguarde antes de tentar novamente.');
      const data = await res.json().catch(()=>null) as any;
      if(empty && res.status===409 && data?.message==='Git Repository is empty.') return {data:[],more:false};
      if(!res.ok || data===null) throw new AppError(502,'O GitHub não concluiu a consulta. Confira também o token do servidor, se configurado.');
      return {data,more:/rel="next"/.test(res.headers.get('link')||'')};
    }
    throw new AppError(502,'Muitos redirecionamentos do GitHub.');
  }
  async function pages(path:string, empty=false) {
    const items:any[]=[]; let more=false;
    for(let page=1;page<=3;page++) { const r=await get(`${path}&per_page=100&page=${page}`,empty); if(!Array.isArray(r.data)) throw new AppError(502,'Resposta inesperada do GitHub.'); items.push(...r.data); more=r.more; if(!more) break; }
    return {items,more};
  }
  return async (input:string, days:number) => {
    let name=normalizeRepository(input);
    if(![7,30,90].includes(days)) throw new AppError(422,'Período inválido.');
    const key=`${name.toLowerCase()}:${days}`;
    const cached=cache.get(key); if(cached && cached.until>Date.now()) return cached.report;
    const meta=(await get(`/repos/${name}`)).data;
    if(meta.private!==false) throw new AppError(403,'Somente repositórios públicos.');
    name=normalizeRepository(meta.full_name || name);
    const since=new Date(Date.now()-days*86400000).toISOString();
    const commits=await pages(`/repos/${name}/commits?since=${since}`,true);
    const issues=await pages(`/repos/${name}/issues?state=all&sort=updated&direction=desc&since=${since}`);
    const base=`https://github.com/${name}`;
    const mapIssue=(x:any)=>({id:String(x.number),title:x.title,url:`${base}/${x.pull_request?'pull':'issues'}/${x.number}`,author:x.user?.login||'Desconhecido',date:x.updated_at,state:x.state});
    const report={repository:name,repository_url:base,description:meta.description,default_branch:meta.default_branch,days,since,generated_at:new Date().toISOString(),commits:commits.items.map(c=>({id:c.sha,title:c.commit.message.split('\n')[0],url:`${base}/commit/${c.sha}`,author:c.author?.login||c.commit.author?.name||'Desconhecido',date:c.commit.committer?.date||c.commit.author.date,state:null})),issues:issues.items.filter(x=>!x.pull_request).map(mapIssue),pull_requests:issues.items.filter(x=>x.pull_request).map(mapIssue),partial:commits.more||issues.more,notes:['Commits da branch padrão. Issues e PRs atualizados no período, com estado atual.','Até 300 commits e 300 itens combinados de issues/PRs. Contagens parciais são identificadas.','Resumo calculado, sem IA generativa. Cache de cinco minutos.'],summary:''};
    report.summary=`${report.partial?'Amostra parcial':'No período'}: ${report.commits.length} commits, ${report.issues.length} issues e ${report.pull_requests.length} pull requests atualizados nos últimos ${days} dias.`;
    if(cache.size>=100) cache.delete(cache.keys().next().value!);
    cache.set(key,{until:Date.now()+300000,report}); return report;
  };
}
export const githubReport=createGitHubService();
