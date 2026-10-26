import type pg from 'pg';
import {githubReport} from './github.js';
import {saveReport} from './db.js';
export type ReportService=(repository:string,days:number)=>ReturnType<typeof githubReport>;
export function startScheduler(pool:pg.Pool, reportService:ReportService=githubReport){
  let closed=false, busy=false;
  async function tick(){
    if(closed||busy)return;busy=true;
    try {
      // Atomic claim prevents duplicate executions, including with multiple server instances.
      const {rows}=await pool.query(`WITH due AS (
        SELECT id FROM tectique_routines WHERE enabled AND next_run_at <= now()
        AND (running_until IS NULL OR running_until < now())
        ORDER BY next_run_at,id FOR UPDATE SKIP LOCKED LIMIT 3
      ) UPDATE tectique_routines r SET running_until=now()+interval '5 minutes',status='running',updated_at=now()
        FROM due WHERE r.id=due.id RETURNING r.id,r.user_id,r.repository,r.days,r.interval_hours`);
      for(const task of rows){
        if(closed)break;
        try {
          const report=await reportService(task.repository,task.days);
          await saveReport(pool,report,task.user_id);
          await pool.query(`UPDATE tectique_routines SET running_until=NULL,status='success',last_error=NULL,
            last_run_at=now(),next_run_at=now()+($2::integer * interval '1 hour'),updated_at=now()
            WHERE id=$1 AND enabled=true`,[task.id,task.interval_hours]);
        }catch(e){
          const message=e instanceof Error?e.message:'Falha desconhecida';
          await pool.query(`UPDATE tectique_routines SET running_until=NULL,status='error',last_error=$2,
            last_run_at=now(),next_run_at=now()+($3::integer * interval '1 hour'),updated_at=now()
            WHERE id=$1 AND enabled=true`,[task.id,message.slice(0,500),task.interval_hours]);
          console.error('Rotina falhou:',task.id,message);
        }
      }
    }catch(e){if(!closed)console.error('Agendador:',e instanceof Error?e.message:'falha inesperada');}
    finally{busy=false;}
  }
  const timer=setInterval(()=>void tick(),20_000);timer.unref();
  void tick();
  return async()=>{closed=true;clearInterval(timer);while(busy)await new Promise(resolve=>setTimeout(resolve,100));};
}
