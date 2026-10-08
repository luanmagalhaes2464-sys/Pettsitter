import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('../dist-static/', import.meta.url));
const read = file => readFileSync(join(out, file), 'utf8');
const html = read('index.html');
const config = read('config.js');
const app = read('app.js');
assert.match(html, /<script src="\/config\.js"><\/script>/);
assert.match(html, /https:\/\/casal-pet-sitter\.onrender\.com\/login/);
assert.match(html, /href="\/privacy\.html"/);
assert.match(html, /src="\/images\/casal-pet-sitter\.jpeg"/);
assert.doesNotMatch(html, /href="\/login"/);
assert.match(config, /window\.CPS_API_BASE = "https:\/\/casal-pet-sitter\.onrender\.com";/);
assert.match(app, /bookingApiBase \+ '\/api\/bookings'/);
assert.match(read('sitemap.xml'), /casal-pet-sitter-site\.onrender\.com\/privacy\.html/);
for (const name of ['admin.html', 'admin.js', 'setup.html', 'setup.js', 'login.html', 'login.js', '.env.example', 'server.js']) {
  assert.equal(existsSync(join(out, name)), false, name + ' não deve ser publicado no site estático');
}
for (const name of ['styles.css', 'privacy.html', 'favicon.svg', 'images/casal-pet-sitter.jpeg']) {
  assert.equal(existsSync(join(out, name)), true, name + ' ausente do pacote público');
}
console.log('Validação do build estático passou: navegação, API, SEO e isolamento administrativo.');
