-- F7: Postgres role split. Run ONCE by the migration runner connected as the RDS
-- master (from ttd/<env>/db/master), BEFORE the first migration. Passwords are
-- injected from Secrets Manager at run time (psql \set from env) - NEVER literal
-- here, NEVER committed. This file is DDL structure only; no secret values.
--
--   app_migrator : owns/creates schema (DDL). Used only by the migration runner.
--   app_runtime  : DML only (SELECT/INSERT/UPDATE/DELETE on app tables), NOT the
--                  table owner, NOT superuser, NOT BYPASSRLS -> FORCE ROW LEVEL
--                  SECURITY (S2) actually binds it. This is the API's connection.
--
-- Usage (runner):
--   psql "$MASTER_URL" \
--     -v migrator_pw="$APP_MIGRATOR_PW" -v runtime_pw="$APP_RUNTIME_PW" \
--     -f bootstrap-db-roles.sql

CREATE ROLE app_migrator WITH LOGIN PASSWORD :'migrator_pw' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE app_runtime  WITH LOGIN PASSWORD :'runtime_pw'  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

-- app_migrator owns the application schema and objects it creates.
ALTER SCHEMA public OWNER TO app_migrator;
GRANT USAGE ON SCHEMA public TO app_runtime;

-- app_runtime gets DML on current + FUTURE tables (default privileges), no DDL.
ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_runtime;

-- Explicitly deny the runtime role anything DDL-shaped.
REVOKE CREATE ON SCHEMA public FROM app_runtime;

-- Sanity: app_runtime must report rolbypassrls = false (RLS backstop is void otherwise).
--   SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname IN ('app_runtime','app_migrator');
