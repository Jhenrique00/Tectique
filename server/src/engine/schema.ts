import type pg from 'pg';
// Migração aditiva (versão 3): só CRIA tabelas. Nada do que existe é alterado ou apagado.
export async function migrateEngine(c:pg.PoolClient){
  const q=(sql:string)=>c.query(sql);
  await q(`CREATE TABLE IF NOT EXISTS tectique_workspaces (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
    created_by uuid REFERENCES tectique_users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now())`);
  await q(`CREATE TABLE IF NOT EXISTS tectique_workspace_members (
    workspace_id uuid NOT NULL REFERENCES tectique_workspaces(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES tectique_users(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN ('owner','admin','member','viewer')),
    created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (workspace_id,user_id))`);
  await q('CREATE INDEX IF NOT EXISTS tectique_members_by_user ON tectique_workspace_members(user_id)');
  // Cada conta já existente recebe um workspace pessoal (idempotente).
  await q(`WITH missing AS (SELECT u.id,u.name FROM tectique_users u WHERE NOT EXISTS
      (SELECT 1 FROM tectique_workspace_members m WHERE m.user_id=u.id)),
    created AS (INSERT INTO tectique_workspaces(name,created_by) SELECT 'Workspace de '||name,id FROM missing RETURNING id,created_by)
    INSERT INTO tectique_workspace_members(workspace_id,user_id,role) SELECT id,created_by,'owner' FROM created`);
  await q(`CREATE TABLE IF NOT EXISTS tectique_flows (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES tectique_workspaces(id) ON DELETE CASCADE,
    name text NOT NULL, description text NOT NULL DEFAULT '', definition jsonb NOT NULL, version integer NOT NULL DEFAULT 1,
    trigger_type text NOT NULL CHECK (trigger_type IN ('manual','schedule')), schedule_hours integer,
    enabled boolean NOT NULL DEFAULT false, next_run_at timestamptz,
    created_by uuid REFERENCES tectique_users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`);
  await q('CREATE INDEX IF NOT EXISTS tectique_flows_by_workspace ON tectique_flows(workspace_id,created_at DESC)');
  await q("CREATE INDEX IF NOT EXISTS tectique_flows_due ON tectique_flows(next_run_at) WHERE enabled AND trigger_type='schedule'");
  await q(`CREATE TABLE IF NOT EXISTS tectique_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES tectique_workspaces(id) ON DELETE CASCADE,
    flow_id uuid REFERENCES tectique_flows(id) ON DELETE SET NULL, flow_name text NOT NULL, flow_version integer NOT NULL,
    definition jsonb NOT NULL, trigger_type text NOT NULL CHECK (trigger_type IN ('manual','schedule','retry')),
    trigger_payload jsonb NOT NULL DEFAULT '{}', seed jsonb, retry_of uuid,
    status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed','cancelled')),
    error text, created_by uuid REFERENCES tectique_users(id) ON DELETE SET NULL,
    queued_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz, finished_at timestamptz, lease_until timestamptz)`);
  await q("CREATE INDEX IF NOT EXISTS tectique_runs_queue ON tectique_runs(queued_at,id) WHERE status='queued'");
  await q('CREATE INDEX IF NOT EXISTS tectique_runs_by_workspace ON tectique_runs(workspace_id,queued_at DESC)');
  await q('CREATE INDEX IF NOT EXISTS tectique_runs_by_flow ON tectique_runs(flow_id,queued_at DESC)');
  await q(`CREATE TABLE IF NOT EXISTS tectique_run_steps (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid NOT NULL REFERENCES tectique_runs(id) ON DELETE CASCADE,
    node_id text NOT NULL, node_type text NOT NULL,
    status text NOT NULL CHECK (status IN ('running','succeeded','failed','skipped','reused')),
    input jsonb, output jsonb, branch text, error text,
    started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz)`);
  await q('CREATE INDEX IF NOT EXISTS tectique_steps_by_run ON tectique_run_steps(run_id,started_at)');
  await q(`CREATE TABLE IF NOT EXISTS tectique_credentials (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES tectique_workspaces(id) ON DELETE CASCADE,
    name text NOT NULL, kind text NOT NULL, ciphertext text NOT NULL,
    created_by uuid REFERENCES tectique_users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id,name))`);
  await q(`CREATE TABLE IF NOT EXISTS tectique_audit (
    id bigserial PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES tectique_workspaces(id) ON DELETE CASCADE,
    user_id uuid REFERENCES tectique_users(id) ON DELETE SET NULL, action text NOT NULL, target text, detail jsonb,
    created_at timestamptz NOT NULL DEFAULT now())`);
  await q('CREATE INDEX IF NOT EXISTS tectique_audit_by_workspace ON tectique_audit(workspace_id,created_at DESC)');
  await q('INSERT INTO tectique_schema_versions(version) VALUES(3) ON CONFLICT DO NOTHING');
  await q('ALTER TABLE tectique_flows ADD COLUMN IF NOT EXISTS webhook_hash text');
  await q('ALTER TABLE tectique_flows DROP CONSTRAINT IF EXISTS tectique_flows_trigger_type_check');
  await q("ALTER TABLE tectique_flows ADD CONSTRAINT tectique_flows_trigger_type_check CHECK(trigger_type IN ('manual','schedule','webhook'))");
  await q('ALTER TABLE tectique_runs DROP CONSTRAINT IF EXISTS tectique_runs_trigger_type_check');
  await q("ALTER TABLE tectique_runs ADD CONSTRAINT tectique_runs_trigger_type_check CHECK(trigger_type IN ('manual','schedule','retry','webhook'))");
  await q(`CREATE TABLE IF NOT EXISTS tectique_webhook_events (
    flow_id uuid NOT NULL REFERENCES tectique_flows(id) ON DELETE CASCADE,event_id text NOT NULL,
    run_id uuid NOT NULL REFERENCES tectique_runs(id) ON DELETE CASCADE,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(flow_id,event_id))`);
  await q('CREATE INDEX IF NOT EXISTS tectique_webhook_events_run ON tectique_webhook_events(run_id)');
  await q('INSERT INTO tectique_schema_versions(version) VALUES(4) ON CONFLICT DO NOTHING');
}
