// A stand-in for Supabase, used only by the sync tests.
// The database side is real: PostgreSQL with our migrations, served by PostgREST (what Supabase uses).
// The Auth side is a small fake that supports guests, email links (PKCE), refresh and sign-out.
//
// Needs: a running PostgreSQL (PGHOST/PGPORT/PGUSER) and the PostgREST binary (POSTGREST_BIN).
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const PORT = 54321;
const PGRST_PORT = 54322;
const SECRET = process.env.FAKE_JWT_SECRET;
if (!SECRET) throw new Error('FAKE_JWT_SECRET is required');
const PG = { host: process.env.PGHOST || 'localhost', port: Number(process.env.PGPORT || 5432), user: process.env.PGUSER || 'postgres', database: 'postgres' };
const DB = 'studybuddy_e2e';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const b64 = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
const sign = (payload) => {
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}`;
  return `${body}.${crypto.createHmac('sha256', SECRET).update(body).digest('base64url')}`;
};
const verify = (tok) => {
  const [h, p, s] = String(tok || '').split('.');
  if (!s || crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url') !== s) return null;
  return JSON.parse(Buffer.from(p, 'base64url').toString());
};

/* ---------- database: fresh copy with our migrations ---------- */
const admin = new pg.Client(PG);
await admin.connect();
await admin.query(`drop database if exists ${DB} with (force)`);
await admin.query(`create database ${DB}`);
await admin.end();
const db = new pg.Pool({ ...PG, database: DB });
await db.query(fs.readFileSync(path.join(root, 'tests/db/supabase-stub.sql'), 'utf8'));
// FAKE_MIGRATIONS=1 applies only the first migration (to test an account that hasn't run later updates).
const migrations = fs.readdirSync(path.join(root, 'supabase/migrations')).sort().slice(0, Number(process.env.FAKE_MIGRATIONS) || undefined);
for (const f of migrations) {
  await db.query(fs.readFileSync(path.join(root, 'supabase/migrations', f), 'utf8'));
}

const pgrst = spawn(process.env.POSTGREST_BIN || 'postgrest', [], {
  stdio: ['ignore', 'ignore', 'inherit'],
  env: {
    ...process.env,
    PGRST_DB_URI: `postgres://authenticator:postgres@${PG.host}:${PG.port}/${DB}`,
    PGRST_DB_SCHEMAS: 'public',
    PGRST_DB_ANON_ROLE: 'anon',
    PGRST_JWT_SECRET: SECRET,
    PGRST_SERVER_PORT: String(PGRST_PORT),
  },
});
process.on('exit', () => pgrst.kill());
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { pgrst.kill(); process.exit(0); });

/* ---------- fake auth ---------- */
const users = new Map();     // id -> user
const refresh = new Map();   // refresh token -> user id
const codes = new Map();     // auth code -> { userId } | { email }
const links = new Map();     // email -> last link sent

async function createUser(email, anonymous) {
  const now = new Date().toISOString();
  const u = {
    id: crypto.randomUUID(), aud: 'authenticated', role: 'authenticated', email: email || '', phone: '',
    is_anonymous: anonymous, app_metadata: { provider: anonymous ? 'anonymous' : 'email', providers: anonymous ? [] : ['email'] },
    user_metadata: {}, identities: [], created_at: now, updated_at: now,
  };
  await db.query('insert into auth.users (id, email, is_anonymous) values ($1, $2, $3)', [u.id, email || null, anonymous]);
  users.set(u.id, u);
  return u;
}
const byEmail = (email) => [...users.values()].find((u) => u.email === email);
function session(u) {
  const now = Math.floor(Date.now() / 1000);
  const rt = crypto.randomBytes(16).toString('hex');
  refresh.set(rt, u.id);
  return {
    access_token: sign({ sub: u.id, role: 'authenticated', aud: 'authenticated', email: u.email, is_anonymous: u.is_anonymous, iat: now, exp: now + 3600 }),
    token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: rt, user: u,
  };
}
function userFrom(req) {
  const claims = verify((req.headers.authorization || '').replace(/^Bearer /i, ''));
  return claims?.sub ? users.get(claims.sub) : undefined;
}
function makeLink(redirectTo, payload, email) {
  const code = crypto.randomUUID();
  codes.set(code, payload);
  const url = new URL(redirectTo || 'http://localhost:3101/auth/callback');
  url.searchParams.set('code', code);
  links.set(email, url.toString());
}

/* ---------- http ---------- */
const readBody = (req) => new Promise((res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { try { res(b ? JSON.parse(b) : {}); } catch { res({}); } }); });

function cors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD');
  res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || 'authorization,apikey,content-type,prefer');
  res.setHeader('Access-Control-Expose-Headers', 'content-range,x-supabase-api-version');
}
const send = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(body === undefined ? '' : JSON.stringify(body)); };

const server = http.createServer(async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;
  try {
    if (p.startsWith('/rest/v1')) {
      const headers = { ...req.headers };
      delete headers.host; delete headers.origin;
      const up = http.request({ host: 'localhost', port: PGRST_PORT, method: req.method, path: url.pathname.slice('/rest/v1'.length) + url.search, headers }, (r) => {
        const out = { ...r.headers };
        delete out['access-control-allow-origin'];
        res.writeHead(r.statusCode, out);
        r.pipe(res);
      });
      up.on('error', (e) => send(res, 502, { message: String(e) }));
      req.pipe(up);
      return;
    }
    if (p === '/health') {
      const ok = await fetch(`http://localhost:${PGRST_PORT}/`).then((r) => r.status < 500).catch(() => false);
      return send(res, ok ? 200 : 503, { ok });
    }
    if (p === '/test/link') return send(res, 200, { url: links.get(url.searchParams.get('email')) || null });
    if (p === '/test/rows') {
      const table = url.searchParams.get('table');
      if (!['tasks', 'study_sessions', 'quiz_attempts', 'profiles', 'documents', 'document_pages', 'progress_events'].includes(table)) return send(res, 400, {});
      const { rows } = await db.query(`select * from public.${table}`);
      return send(res, 200, rows);
    }
    // The SQL the site owner runs in the Supabase SQL Editor to give someone a cosmetic (see docs/SETUP.md).
    if (p === '/test/gift') {
      const { rowCount } = await db.query(`update public.profiles p
        set app_state = jsonb_set(coalesce(p.app_state, '{}'::jsonb), '{gifts}',
          to_jsonb(array(select distinct g from jsonb_array_elements_text(coalesce(p.app_state->'gifts', '[]'::jsonb) || jsonb_build_array($2::text)) g)))
        where p.id = (select id from auth.users where email = $1)`, [url.searchParams.get('email'), url.searchParams.get('item')]);
      return send(res, 200, { updated: rowCount });
    }

    const body = req.method === 'GET' ? {} : await readBody(req);
    const redirectTo = url.searchParams.get('redirect_to');

    if (p === '/auth/v1/signup' && req.method === 'POST') {
      if (body.email) return send(res, 400, { code: 400, error_code: 'not_supported', msg: 'Only guests in this fake' });
      return send(res, 200, session(await createUser('', true)));
    }
    if (p === '/auth/v1/token' && req.method === 'POST') {
      const grant = url.searchParams.get('grant_type');
      if (grant === 'refresh_token') {
        const id = refresh.get(body.refresh_token);
        if (!id) return send(res, 400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' });
        return send(res, 200, session(users.get(id)));
      }
      if (grant === 'pkce') {
        const c = codes.get(body.auth_code);
        if (!c) return send(res, 400, { code: 400, error_code: 'flow_state_not_found', msg: 'Invalid or expired code' });
        codes.delete(body.auth_code);
        let u;
        if (c.userId) { // a guest confirming their email: same user, now permanent
          u = users.get(c.userId);
          Object.assign(u, { email: c.newEmail, is_anonymous: false, updated_at: new Date().toISOString(), app_metadata: { provider: 'email', providers: ['email'] } });
          await db.query('update auth.users set email = $2, is_anonymous = false where id = $1', [u.id, c.newEmail]);
        } else {
          u = byEmail(c.email) || (await createUser(c.email, false));
        }
        return send(res, 200, session(u));
      }
      return send(res, 400, { code: 400, error_code: 'unsupported_grant_type', msg: grant });
    }
    if (p === '/auth/v1/user') {
      const u = userFrom(req);
      if (!u) return send(res, 401, { code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' });
      if (req.method === 'GET') return send(res, 200, u);
      if (req.method === 'PUT') {
        if (body.email) {
          const other = byEmail(body.email);
          if (other && other.id !== u.id) return send(res, 422, { code: 422, error_code: 'email_exists', msg: 'A user with this email address has already been registered' });
          makeLink(redirectTo, { userId: u.id, newEmail: body.email }, body.email);
          return send(res, 200, { ...u, new_email: body.email });
        }
        return send(res, 200, u);
      }
    }
    if (p === '/auth/v1/otp' && req.method === 'POST') {
      makeLink(redirectTo, { email: body.email }, body.email);
      return send(res, 200, {});
    }
    if (p === '/auth/v1/logout') { res.writeHead(204); res.end(); return; }
    if (p.startsWith('/storage/v1/object/documents/') && req.method === 'POST') {
      if (!userFrom(req)) return send(res, 403, { statusCode: '403', error: 'Unauthorized', message: 'no user' });
      return send(res, 200, { Key: p.replace('/storage/v1/object/', ''), Id: crypto.randomUUID() });
    }
    if (p === '/storage/v1/object/documents' && req.method === 'DELETE') return send(res, 200, []);
    return send(res, 404, { msg: `fake supabase: no route for ${req.method} ${p}` });
  } catch (e) {
    console.error(e);
    return send(res, 500, { msg: String(e) });
  }
});
server.listen(PORT, () => console.log(`fake supabase on :${PORT}`));
