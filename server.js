const http = require('http');
const path = require('path');
const fs = require('fs');

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

const portalDir = path.join(__dirname, 'apps', 'portal');
const nextBuildDir = path.join(portalDir, '.next');
const controlApiDist = path.join(__dirname, 'apps', 'control-api', 'dist', 'index.js');

let nextHandler = null;
let controlApiApp = null;
let d1Database = null;

// Initialize native SQLite with D1-compatible interface for standalone container
function initDatabase() {
  try {
    const { DatabaseSync } = require('node:sqlite');
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const dbPath = path.join(dataDir, 'zalo_baas.sqlite');
    const db = new DatabaseSync(dbPath);

    // Run schema migrations if not present
    const m1Path = path.join(__dirname, 'migrations', '0001_init_schema.sql');
    const m2Path = path.join(__dirname, 'migrations', '0002_seed_plans.sql');
    if (fs.existsSync(m1Path)) {
      db.exec(fs.readFileSync(m1Path, 'utf8'));
    }
    if (fs.existsSync(m2Path)) {
      db.exec(fs.readFileSync(m2Path, 'utf8'));
    }

    // Auto-migrate schema for CRM, billing, and flexible bot_id
    try {
      // Ensure tenant_settings table exists
      db.exec(`
        CREATE TABLE IF NOT EXISTS tenant_settings (
          tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
          gemini_api_key TEXT,
          updated_at INTEGER
        );
      `);

      // Ensure invoices table exists
      db.exec(`
        CREATE TABLE IF NOT EXISTS invoices (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          plan_id TEXT NOT NULL REFERENCES plans(id),
          amount_vnd INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          payment_method TEXT NOT NULL DEFAULT 'vietqr',
          transfer_content TEXT NOT NULL,
          qr_url TEXT,
          created_at INTEGER NOT NULL,
          paid_at INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id, status);
      `);

      // Ensure conversations table has CRM columns
      const convCols = db.prepare('PRAGMA table_info(conversations)').all();
      const colNames = convCols.map((c) => c.name);
      if (!colNames.includes('phone')) {
        db.exec('ALTER TABLE conversations ADD COLUMN phone TEXT;');
      }
      if (!colNames.includes('tags')) {
        db.exec("ALTER TABLE conversations ADD COLUMN tags TEXT DEFAULT '[]';");
      }
      if (!colNames.includes('notes')) {
        db.exec('ALTER TABLE conversations ADD COLUMN notes TEXT;');
      }
      if (!colNames.includes('total_messages')) {
        db.exec('ALTER TABLE conversations ADD COLUMN total_messages INTEGER DEFAULT 1;');
      }

      const docCols = db.prepare('PRAGMA table_info(documents)').all();
      const botCol = docCols.find((c) => c.name === 'bot_id');
      if (botCol && botCol.notnull === 1) {
        db.exec('PRAGMA foreign_keys = OFF;');
        db.exec(`
          CREATE TABLE documents_temp (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            bot_id TEXT REFERENCES bots(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            source_type TEXT NOT NULL DEFAULT 'upload',
            r2_key TEXT NOT NULL,
            size_bytes INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            chunk_count INTEGER NOT NULL DEFAULT 0,
            error TEXT,
            created_at INTEGER NOT NULL
          );
          INSERT INTO documents_temp SELECT * FROM documents;
          DROP TABLE documents;
          ALTER TABLE documents_temp RENAME TO documents;
          CREATE INDEX IF NOT EXISTS idx_docs_bot ON documents(tenant_id, bot_id);
        `);
        db.exec('PRAGMA foreign_keys = ON;');
        console.log('[Zalo-BaaS] Migrated documents table to support flexible bot_id (global/bot-specific)');
      }

      // Ensure documents table has raw_content column to prevent duplicate overlap on RAG edit
      const docCols2 = db.prepare('PRAGMA table_info(documents)').all();
      const rawContentCol = docCols2.find((c) => c.name === 'raw_content');
      if (!rawContentCol) {
        db.exec('ALTER TABLE documents ADD COLUMN raw_content TEXT;');
        console.log('[Zalo-BaaS] Added raw_content column to documents table');
      }

      // Ensure tenants table has subscription_started_at, subscription_expires_at and payment_status columns
      const tenantCols = db.prepare('PRAGMA table_info(tenants)').all().map((c) => c.name);
      if (!tenantCols.includes('subscription_started_at')) {
        db.exec('ALTER TABLE tenants ADD COLUMN subscription_started_at INTEGER;');
      }
      if (!tenantCols.includes('subscription_expires_at')) {
        db.exec('ALTER TABLE tenants ADD COLUMN subscription_expires_at INTEGER;');
      }
      if (!tenantCols.includes('payment_status')) {
        db.exec("ALTER TABLE tenants ADD COLUMN payment_status TEXT DEFAULT 'paid';");
      }

      // Backfill missing subscription_expires_at for existing tenants
      db.exec(`
        UPDATE tenants
        SET subscription_started_at = COALESCE(subscription_started_at, created_at),
            subscription_expires_at = COALESCE(
              subscription_expires_at,
              CASE
                WHEN id = 'tenant_system' THEN created_at + 315360000000
                WHEN LOWER(plan_id) = 'trial' THEN created_at + 604800000
                ELSE created_at + 2592000000
              END
            ),
            payment_status = COALESCE(payment_status, CASE WHEN LOWER(plan_id) = 'trial' THEN 'trial' ELSE 'paid' END)
        WHERE subscription_expires_at IS NULL OR payment_status IS NULL;
      `);

      // Upsert latest commercial plans (Trial 7 days, Starter 99k, Pro 299k, Enterprise 499k)
      db.exec(`
        INSERT OR REPLACE INTO plans (id, name, price_vnd, max_bots, monthly_ai_messages, max_documents, max_doc_mb, features)
        VALUES
          ('trial', 'Dùng thử 7 ngày', 0, 1, 1000, 3, 5, '{"rag": true, "markdown": true, "typing_action": true, "handover": true, "trial_days": 7}'),
          ('starter', 'Starter', 99000, 1, 3000, 10, 15, '{"rag": true, "markdown": true, "typing_action": true, "handover": true, "drive_rag": false, "strict_grounding": false, "custom_tools": false}'),
          ('pro', 'Pro', 299000, 3, 15000, 30, 50, '{"rag": true, "markdown": true, "typing_action": true, "handover": true, "drive_rag": true, "strict_grounding": false, "custom_tools": true, "crm": true}'),
          ('enterprise', 'Enterprise', 499000, 5, 50000, 100, 200, '{"rag": true, "markdown": true, "typing_action": true, "handover": true, "drive_rag": true, "strict_grounding": true, "custom_tools": true, "dedicated_support": true, "crm": true}');
      `);

      // Ensure System Tenant exists for Platform Owner
      db.exec(`
        INSERT OR IGNORE INTO tenants (id, name, plan_id, status, contact_email, created_at)
        VALUES ('tenant_system', 'Hệ thống Quản trị Zalo BaaS', 'enterprise', 'active', 'admin@zalobaas.com', 1700000000000);
      `);

      // Seed Platform Owner (Super Admin) account
      const crypto = require('crypto');
      const adminEmail = (process.env.ADMIN_EMAIL || 'admin@zalobaas.com').toLowerCase().trim();
      const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123456';
      const salt = crypto.randomBytes(16);
      const derived = crypto.pbkdf2Sync(adminPassword, salt, 100000, 32, 'sha256');
      const passwordHash = salt.toString('hex') + ':' + derived.toString('hex');
      const now = Date.now();

      const existingAdmin = db.prepare('SELECT id, email, role FROM users WHERE email = ?').get(adminEmail);
      if (!existingAdmin) {
        db.prepare(`
          INSERT INTO users (id, tenant_id, email, password_hash, role, status, created_at)
          VALUES (?, 'tenant_system', ?, ?, 'platform_owner', 'active', ?)
        `).run(`usr_admin_${now}`, adminEmail, passwordHash, now);
        console.log(`[Zalo-BaaS] Seeded Platform Owner account: ${adminEmail}`);
      } else if (existingAdmin.role !== 'platform_owner') {
        db.prepare("UPDATE users SET role = 'platform_owner' WHERE id = ?").run(existingAdmin.id);
        console.log(`[Zalo-BaaS] Upgraded ${adminEmail} to platform_owner`);
      }

      // Ensure system_settings and email_logs tables exist
      db.exec(`
        CREATE TABLE IF NOT EXISTS system_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS email_logs (
          id TEXT PRIMARY KEY,
          to_email TEXT NOT NULL,
          from_email TEXT NOT NULL DEFAULT 'congtykynangmem@gmail.com',
          subject TEXT NOT NULL,
          content_html TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'sent',
          error TEXT,
          metadata TEXT,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_email_logs_to ON email_logs(to_email, created_at);
      `);

      // Seed initial default system settings if not exists
      const defaultContact = JSON.stringify({
        company_name: 'CÔNG TY TNHH KỸ NĂNG MỀM',
        brand_name: 'Zalo BaaS',
        hotline: '0986.000.797',
        contact_email: 'congtykynangmem@gmail.com',
        address: 'Số 41 Trần Phú, Phường Phước Hậu, TP. Vĩnh Long, Tỉnh Vĩnh Long',
        working_hours: '08:00 – 21:00 hàng ngày (Hỗ trợ 24/7)',
        website_url: 'https://bot.knm.asia',
        zalo_oa_url: 'https://zalo.me/0986000797',
      });

      const defaultBank = JSON.stringify({
        bank_id: 'MB',
        bank_name: 'Ngân hàng Quân Đội (MBBank)',
        account_no: '0986000797',
        account_name: 'CONG TY KY NANG MEM',
      });

      const defaultEmailConfig = JSON.stringify({
        sender_email: 'congtykynangmem@gmail.com',
        sender_name: 'Zalo BaaS - Kỹ Năng Mềm',
        smtp_host: 'smtp.gmail.com',
        smtp_port: 465,
        smtp_user: 'congtykynangmem@gmail.com',
        smtp_pass: '',
        auto_send_on_payment: true,
      });

      db.prepare("INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('website_contact', ?, ?)")
        .run(defaultContact, Date.now());
      db.prepare("INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('bank_account', ?, ?)")
        .run(defaultBank, Date.now());
      db.prepare("INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES ('email_config', ?, ?)")
        .run(defaultEmailConfig, Date.now());

      // Ensure registered enterprise user fivestarkimky@gmail.com is present with an active tenant
      try {
        const fivestarUser = db.prepare("SELECT id, tenant_id FROM users WHERE email = 'fivestarkimky@gmail.com'").get();
        if (fivestarUser) {
          const tenantExists = db.prepare("SELECT id FROM tenants WHERE id = ?").get(fivestarUser.tenant_id);
          if (!tenantExists) {
            const tId = fivestarUser.tenant_id || `tenant_fivestar_${now}`;
            db.prepare(`
              INSERT OR IGNORE INTO tenants (id, name, plan_id, status, contact_email, created_at)
              VALUES (?, 'Gà rán Five Star Kim Kỳ', 'starter', 'active', 'fivestarkimky@gmail.com', ?)
            `).run(tId, now);
            if (!fivestarUser.tenant_id) {
              db.prepare('UPDATE users SET tenant_id = ? WHERE id = ?').run(tId, fivestarUser.id);
            }
          }
          db.prepare("UPDATE tenants SET name = 'Gà rán Five Star Kim Kỳ' WHERE id = ?").run(fivestarUser.tenant_id);
        } else {
          // If not registered yet, seed both tenant and user so platform owner can manage right away
          const tId = 'tenant_fivestar_kimky';
          db.prepare(`
            INSERT OR IGNORE INTO tenants (id, name, plan_id, status, contact_email, created_at)
            VALUES (?, 'Gà rán Five Star Kim Kỳ', 'starter', 'active', 'fivestarkimky@gmail.com', ?)
          `).run(tId, now);
          db.prepare("UPDATE tenants SET name = 'Gà rán Five Star Kim Kỳ' WHERE contact_email = 'fivestarkimky@gmail.com'").run();

          const salt = crypto.randomBytes(16);
          const derived = crypto.pbkdf2Sync('FiveStar@123', salt, 100000, 32, 'sha256');
          const pHash = salt.toString('hex') + ':' + derived.toString('hex');
          db.prepare(`
            INSERT OR IGNORE INTO users (id, tenant_id, email, password_hash, role, status, created_at)
            VALUES (?, ?, 'fivestarkimky@gmail.com', ?, 'tenant_admin', 'active', ?)
          `).run(`usr_fivestar_${now}`, tId, pHash, now);
          console.log('[Zalo-BaaS] Initialized registered tenant & user fivestarkimky@gmail.com');
        }
      } catch (seedErr) {
        console.warn('[Zalo-BaaS] Tenant seeding check notice:', seedErr.message);
      }

      // Auto-heal any orphan users without tenants
      try {
        const orphanUsers = db.prepare(`SELECT id, email, tenant_id, created_at FROM users WHERE tenant_id NOT IN (SELECT id FROM tenants)`).all();
        for (const u of orphanUsers) {
          const tId = u.tenant_id || `tenant_${Date.now()}`;
          const brandName = u.email ? u.email.split('@')[0] : 'Doanh nghiệp mới';
          db.prepare(`
            INSERT OR IGNORE INTO tenants (id, name, plan_id, status, contact_email, created_at)
            VALUES (?, ?, 'starter', 'active', ?, ?)
          `).run(tId, brandName, u.email, u.created_at || Date.now());
          if (!u.tenant_id) {
            db.prepare('UPDATE users SET tenant_id = ? WHERE id = ?').run(tId, u.id);
          }
        }
      } catch {}

      // Also ensure existing admin accounts (like testbot@gmail.com) have platform_owner role
      try {
        db.prepare("UPDATE users SET role = 'platform_owner' WHERE email = 'testbot@gmail.com'").run();
      } catch {}
    } catch (migErr) {
      console.warn('[Zalo-BaaS] Migration check notice:', migErr.message);
    }

    // D1 interface wrapper with full Cloudflare D1 compatibility
    d1Database = {
      prepare(sql) {
        function createStatement(boundParams = []) {
          return {
            bind(...newParams) {
              return createStatement(newParams);
            },
            async run(...extraParams) {
              const params = extraParams.length > 0 ? extraParams : boundParams;
              const stmt = db.prepare(sql);
              const info = stmt.run(...params);
              return { success: true, meta: info };
            },
            async first(col) {
              const stmt = db.prepare(sql);
              const row = stmt.get(...boundParams);
              if (!row) return null;
              if (col && typeof col === 'string') return row[col];
              return row;
            },
            async all() {
              const stmt = db.prepare(sql);
              return { results: stmt.all(...boundParams) };
            },
            async raw() {
              const stmt = db.prepare(sql);
              return stmt.all(...boundParams);
            }
          };
        }
        return createStatement();
      }
    };
    console.log(`[Zalo-BaaS] SQLite Database initialized at ${dbPath}`);
  } catch (err) {
    console.warn(`[Zalo-BaaS] SQLite init warning:`, err.message);
  }
}

// In-memory KV Cache
const inMemoryKv = new Map();
const kvCache = {
  async get(key) {
    const item = inMemoryKv.get(key);
    if (!item) return null;
    if (item.expires && Date.now() > item.expires) {
      inMemoryKv.delete(key);
      return null;
    }
    return item.value;
  },
  async put(key, value, options) {
    const expires = options?.expirationTtl ? Date.now() + options.expirationTtl * 1000 : undefined;
    inMemoryKv.set(key, { value, expires });
  },
  async delete(key) {
    inMemoryKv.delete(key);
  }
};

// In-Memory Vector Store with Cosine Similarity for standalone container
const memoryVectors = new Map();

function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

const vectorIndex = {
  async upsert(records) {
    if (Array.isArray(records)) {
      for (const rec of records) {
        if (rec && rec.id && rec.values) {
          memoryVectors.set(rec.id, { values: rec.values, metadata: rec.metadata || {} });
        }
      }
    }
  },
  async insert(records) {
    return this.upsert(records);
  },
  async query(queryVector, options = {}) {
    const topK = options.topK || 5;
    const matches = [];
    for (const [id, rec] of memoryVectors.entries()) {
      const score = cosineSimilarity(queryVector, rec.values);
      matches.push({ id, score, metadata: rec.metadata });
    }
    matches.sort((a, b) => b.score - a.score);
    return { matches: matches.slice(0, topK) };
  }
};

// Control API Environment
const controlEnv = {
  get DB() { return d1Database; },
  JWT_SECRET: process.env.JWT_SECRET || 'zalo_baas_default_secret_jwt_key_2026',
  KEK_V1: process.env.KEK_V1 || 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  WEBHOOK_BASE_URL: process.env.WEBHOOK_BASE_URL || 'https://bot.knm.asia/v1/webhook/bot',
  KV_CACHE: kvCache,
  VECTORS: vectorIndex
};

// Initialize Control API
function initControlApi() {
  try {
    if (fs.existsSync(controlApiDist)) {
      const { app } = require(controlApiDist);
      controlApiApp = app;
      console.log(`[Zalo-BaaS] Control API initialized successfully.`);
    }
  } catch (err) {
    console.warn(`[Zalo-BaaS] Control API init warning:`, err.message);
  }
}

// Initialize Next.js handler
function initNext() {
  try {
    const nextPkg = require.resolve('next', { paths: [__dirname, portalDir] });
    const next = require(nextPkg);
    const hasBuild = fs.existsSync(nextBuildDir);
    const dev = process.env.NODE_ENV !== 'production' && !hasBuild;

    const app = next({ dev, dir: portalDir });
    const handle = app.getRequestHandler();

    app.prepare().then(() => {
      nextHandler = handle;
      console.log(`[Zalo-BaaS] Next.js portal initialized successfully.`);
    }).catch(err => {
      console.error(`[Zalo-BaaS] Next.js prepare warning:`, err.message);
    });
  } catch (err) {
    console.warn(`[Zalo-BaaS] Running in standalone health mode (Next.js not bundled directly):`, err.message);
  }
}

// Convert Node.js IncomingMessage to Web Standard Request
async function nodeToWebRequest(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = req.method !== 'GET' && req.method !== 'HEAD' && chunks.length > 0 ? Buffer.concat(chunks) : undefined;
  const protocol = req.headers['x-forwarded-proto'] || (req.socket?.encrypted ? 'https' : 'http');
  const host = req.headers.host || `localhost:${PORT}`;
  const url = `${protocol}://${host}${req.url}`;

  const headers = new Headers();
  for (const [key, val] of Object.entries(req.headers)) {
    if (val !== undefined && key.toLowerCase() !== 'host') {
      if (Array.isArray(val)) {
        for (const v of val) headers.append(key, v);
      } else {
        headers.set(key, val);
      }
    }
  }

  return new Request(url, {
    method: req.method,
    headers,
    body
  });
}

// Send Web Standard Response to Node.js ServerResponse
async function sendWebResponse(webRes, res) {
  try {
    const arrayBuffer = await webRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    for (const [key, value] of webRes.headers.entries()) {
      const lower = key.toLowerCase();
      if (lower !== 'transfer-encoding' && lower !== 'content-length') {
        res.setHeader(key, value);
      }
    }
    res.setHeader('Content-Length', buffer.length);
    res.statusCode = webRes.status;
    res.end(buffer);
  } catch (err) {
    console.error('[Zalo-BaaS] sendWebResponse error:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err.message || 'Error writing response' }));
    }
  }
}

// Start HTTP server
const server = http.createServer(async (req, res) => {
  const url = req.url || '/';

  // 1. Health check endpoints
  if (
    url === '/health' ||
    url === '/healthz' ||
    url === '/api/health' ||
    url === '/ping' ||
    url === '/v1/webhook/bot/health'
  ) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      service: 'zalo-baas',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // 2. Control API routes (/v1/*)
  if (url.startsWith('/v1/')) {
    // If external CONTROL_API_URL is configured, proxy to it
    const remoteApiUrl = process.env.CONTROL_API_URL;
    if (remoteApiUrl) {
      try {
        const targetUrl = `${remoteApiUrl.replace(/\/$/, '')}${url}`;
        const webReq = await nodeToWebRequest(req);
        const proxyRes = await fetch(targetUrl, {
          method: webReq.method,
          headers: webReq.headers,
          body: webReq.body,
          duplex: 'half'
        });
        return sendWebResponse(proxyRes, res);
      } catch (proxyErr) {
        console.error(`[Zalo-BaaS] Proxy error:`, proxyErr.message);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Bad Gateway: ${proxyErr.message}` }));
        return;
      }
    }

    // Otherwise handle with local Control API
    if (controlApiApp) {
      try {
        const webReq = await nodeToWebRequest(req);
        const webRes = await controlApiApp.fetch(webReq, controlEnv);
        return sendWebResponse(webRes, res);
      } catch (apiErr) {
        console.error(`[Zalo-BaaS] API Error:`, apiErr);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: apiErr.message || 'Internal Server Error' }));
        return;
      }
    } else {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Control API chưa sẵn sàng. Vui lòng kiểm tra lại quá trình khởi động máy chủ.' }));
      return;
    }
  }

  // 3. Delegate all other requests to Next.js portal
  if (nextHandler) {
    return nextHandler(req, res);
  }

  // 4. Fallback response
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!DOCTYPE html>
<html>
<head>
  <title>Zalo Bot-as-a-Service (BaaS)</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0f172a; color: #f8fafc; }
    .card { background: #1e293b; padding: 2rem; border-radius: 1rem; box-shadow: 0 10px 25px rgba(0,0,0,0.5); max-width: 500px; text-align: center; }
    h1 { color: #38bdf8; margin-top: 0; }
    .badge { display: inline-block; padding: 0.25rem 0.75rem; background: #059669; color: white; border-radius: 9999px; font-weight: 600; font-size: 0.875rem; margin-bottom: 1rem; }
    p { color: #94a3b8; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">● Online</div>
    <h1>Zalo Bot-as-a-Service (BaaS)</h1>
    <p>Container đang hoạt động bình thường trên cổng <strong>${PORT}</strong>.</p>
  </div>
</body>
</html>`);
});

server.listen(PORT, HOST, () => {
  console.log(`[Zalo-BaaS] Server listening on http://${HOST}:${PORT}`);
  console.log(`[Zalo-BaaS] Health check: http://${HOST}:${PORT}/health`);
  initDatabase();
  initControlApi();
  initNext();
});

process.on('SIGTERM', () => {
  console.log('[Zalo-BaaS] Received SIGTERM, shutting down...');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('[Zalo-BaaS] Received SIGINT, shutting down...');
  server.close(() => process.exit(0));
});
