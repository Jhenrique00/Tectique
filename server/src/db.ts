import pg from 'pg';
import {migrateEngine} from './engine/schema.js';
import {migrateCrm} from './crm.js';
export function createPool(connectionString: string) {
  const pool = new pg.Pool({connectionString, max: 8, connectionTimeoutMillis: 10000});
  // An idle client can lose its connection when PostgreSQL shuts down.
  pool.on('error', (err) => console.error('Conexao PostgreSQL interrompida:', err.message));
  return pool;
}
export async function migrate(pool: pg.Pool) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT pg_advisory_xact_lock(18422003)');
    await c.query('CREATE TABLE IF NOT EXISTS tectique_schema_versions(version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    await c.query(`CREATE TABLE IF NOT EXISTS tectique_reports (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), repository text NOT NULL, days integer NOT NULL CHECK (days IN (7,30,90)),
      generated_at timestamptz NOT NULL, report jsonb NOT NULL, saved_at timestamptz NOT NULL DEFAULT now()
    )`);
    await c.query('CREATE INDEX IF NOT EXISTS tectique_reports_recent ON tectique_reports(saved_at DESC)');
    await c.query('INSERT INTO tectique_schema_versions(version) VALUES(1) ON CONFLICT DO NOTHING');
    // Existing local reports remain intact, but cannot be assigned to a newly created account automatically.
    await c.query(`CREATE TABLE IF NOT EXISTS tectique_users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, email text NOT NULL UNIQUE,
      password_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await c.query(`CREATE TABLE IF NOT EXISTS tectique_sessions (
      token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES tectique_users(id) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await c.query('CREATE INDEX IF NOT EXISTS tectique_sessions_expiry ON tectique_sessions(expires_at)');
    await c.query('ALTER TABLE tectique_reports ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES tectique_users(id) ON DELETE CASCADE');
    // Earlier builds defined a global unique key which prevented two accounts sharing a cached report.
    await c.query('ALTER TABLE tectique_reports DROP CONSTRAINT IF EXISTS tectique_reports_repository_days_generated_at_key');
    await c.query('CREATE UNIQUE INDEX IF NOT EXISTS tectique_reports_user_unique ON tectique_reports(user_id,repository,days,generated_at) WHERE user_id IS NOT NULL');
    await c.query('CREATE INDEX IF NOT EXISTS tectique_reports_by_user ON tectique_reports(user_id,saved_at DESC)');
    await c.query(`CREATE TABLE IF NOT EXISTS tectique_routines (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES tectique_users(id) ON DELETE CASCADE,
      repository text NOT NULL, days integer NOT NULL CHECK (days IN (7,30,90)),
      interval_hours integer NOT NULL CHECK (interval_hours IN (1,6,12,24)),
      enabled boolean NOT NULL DEFAULT true, status text NOT NULL DEFAULT 'waiting',
      next_run_at timestamptz, last_run_at timestamptz, last_error text,
      running_until timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await c.query('CREATE INDEX IF NOT EXISTS tectique_routines_due ON tectique_routines(next_run_at) WHERE enabled');
    await c.query('INSERT INTO tectique_schema_versions(version) VALUES(2) ON CONFLICT DO NOTHING');
    await migrateEngine(c);
    await migrateCrm(c);
    await c.query('COMMIT');
  } catch(e) {await c.query('ROLLBACK'); throw e;} finally {c.release();}
}
export async function saveReport(pool: pg.Pool, report: any, userId: string) {
  await pool.query(`INSERT INTO tectique_reports(repository,days,generated_at,report,user_id)
    VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
    [report.repository,report.days,report.generated_at,report,userId]);
}
