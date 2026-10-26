import {randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash} from 'node:crypto';
import {promisify} from 'node:util';
import type pg from 'pg';
import type {Request,Response,NextFunction} from 'express';
import {AppError} from './security.js';
const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = 'tectique_session';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
export type Account = {id:string;name:string;email:string};
declare global {namespace Express {interface Request {account?:Account}}}
function sha(text:string){return createHash('sha256').update(text).digest('hex');}
export async function hashPassword(password:string){const salt=randomBytes(16).toString('hex');const key=await scrypt(password,salt,64) as Buffer;return `scrypt:${salt}:${key.toString('hex')}`;}
export async function verifyPassword(password:string,encoded:string){
  const [name,salt,hex]=encoded.split(':');if(name!=='scrypt'||!salt||!hex||!(/^[0-9a-f]{128}$/).test(hex))return false;
  const actual=await scrypt(password,salt,64) as Buffer;return timingSafeEqual(actual,Buffer.from(hex,'hex'));
}
function cookieValue(req:Request){const raw=req.headers.cookie||'';const part=raw.split(';').map(s=>s.trim()).find(s=>s.startsWith(SESSION_COOKIE+'='));return part?.slice(SESSION_COOKIE.length+1);}
export async function issueSession(pool:pg.Pool,res:Response,userId:string){
  const token=randomBytes(32).toString('hex');
  await pool.query('INSERT INTO tectique_sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)',[sha(token),userId,new Date(Date.now()+SESSION_MS)]);
  res.cookie(SESSION_COOKIE,token,{httpOnly:true,sameSite:'strict',secure:false,path:'/',maxAge:SESSION_MS});
}
export function revokeCookie(res:Response){res.clearCookie(SESSION_COOKIE,{httpOnly:true,sameSite:'strict',secure:false,path:'/'});}
export async function deleteSession(pool:pg.Pool,req:Request){const token=cookieValue(req);if(token)await pool.query('DELETE FROM tectique_sessions WHERE token_hash=$1',[sha(token)]);}
export function requireAuth(pool:pg.Pool){return async(req:Request,_res:Response,next:NextFunction)=>{
  try {const token=cookieValue(req);if(!token)throw new AppError(401,'Entre na sua conta para continuar.');
    const {rows}=await pool.query(`SELECT u.id,u.name,u.email FROM tectique_sessions s JOIN tectique_users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.expires_at>now()`,[sha(token)]);
    if(!rows.length)throw new AppError(401,'Sessao expirada. Entre novamente.');
    req.account=rows[0];next();
  } catch(e){next(e);}
};}
