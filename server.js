const http = require('http');
const path = require('path');
const fs = require('fs');

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

const portalDir = path.join(__dirname, 'apps', 'portal');
const nextBuildDir = path.join(portalDir, '.next');

let nextHandler = null;

// Initialize Next.js handler if available
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

// Start HTTP server
const server = http.createServer((req, res) => {
  const url = req.url || '/';

  // 1. Health check endpoints (Always return 200 OK for Docker/Kubernetes/PaaS health checks)
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

  // 2. Delegate to Next.js portal if ready
  if (nextHandler) {
    return nextHandler(req, res);
  }

  // 3. Fallback response if Next.js is still preparing or in headless mode
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
    <p>Hệ thống Edge Cloudflare Serverless sẵn sàng tiếp nhận Webhook Zalo Platform tại <code>bot.knm.asia</code>.</p>
  </div>
</body>
</html>`);
});

server.listen(PORT, HOST, () => {
  console.log(`[Zalo-BaaS] Server listening on http://${HOST}:${PORT}`);
  console.log(`[Zalo-BaaS] Health check available at http://${HOST}:${PORT}/health`);
  initNext();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Zalo-BaaS] Received SIGTERM, shutting down gracefully...');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('[Zalo-BaaS] Received SIGINT, shutting down gracefully...');
  server.close(() => process.exit(0));
});
