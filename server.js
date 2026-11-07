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

    // D1 interface wrapper
    d1Database = {
      prepare(sql) {
        return {
          bind(...params) {
            return {
              async run() {
                const stmt = db.prepare(sql);
                const info = stmt.run(...params);
                return { success: true, meta: info };
              },
              async first() {
                const stmt = db.prepare(sql);
                return stmt.get(...params) || null;
              },
              async all() {
                const stmt = db.prepare(sql);
                return { results: stmt.all(...params) };
              }
            };
          }
        };
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

// Fallback Vectorize
const vectorIndex = {
  async query() {
    return { matches: [] };
  },
  async insert() {},
  async upsert() {}
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
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers.host || `localhost:${PORT}`;
  const url = `${protocol}://${host}${req.url}`;
  return new Request(url, {
    method: req.method,
    headers: req.headers,
    body
  });
}

// Send Web Standard Response to Node.js ServerResponse
async function sendWebResponse(webRes, res) {
  const headers = Object.fromEntries(webRes.headers.entries());
  res.writeHead(webRes.status, headers);
  if (webRes.body) {
    const reader = webRes.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
  }
  res.end();
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
        res.end(JSON.stringify({ error: 'Internal Server Error' }));
        return;
      }
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
