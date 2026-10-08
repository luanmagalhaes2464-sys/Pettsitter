import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

async function unusedPort() {
  const server = createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

const port = await unusedPort();
const base = 'http://127.0.0.1:' + port;
const origin = 'https://casal-pet-sitter-site.onrender.com';
const child = spawn(process.execPath, ['server.js'], {
  env: { ...process.env, PORT: String(port), DATABASE_URL: '', NODE_ENV: 'test' },
  stdio: ['ignore', 'ignore', 'pipe']
});
let stderr = '';
child.stderr.on('data', chunk => { stderr += chunk.toString(); });

try {
  let healthy = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (child.exitCode !== null) throw new Error('Servidor encerrou: ' + stderr);
    try {
      const response = await fetch(base + '/api/health');
      if (response.ok) { healthy = true; break; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  assert.ok(healthy, 'Servidor não iniciou: ' + stderr);

  const preflight = await fetch(base + '/api/bookings', {
    method: 'OPTIONS',
    headers: { origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' }
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
  assert.match(preflight.headers.get('access-control-allow-headers') || '', /Content-Type/i);

  const unknown = await fetch(base + '/api/bookings', {
    method: 'OPTIONS',
    headers: { origin: 'https://origem-nao-autorizada.example', 'Access-Control-Request-Method': 'POST' }
  });
  assert.equal(unknown.status, 403);
  assert.equal(unknown.headers.get('access-control-allow-origin'), null);

  const auth = await fetch(base + '/api/auth/me', { headers: { origin } });
  assert.equal(auth.headers.get('access-control-allow-origin'), null);

  console.log('Validação CORS passou: reservas liberadas apenas para o domínio autorizado; autenticação isolada.');
} finally {
  child.kill('SIGTERM');
}
