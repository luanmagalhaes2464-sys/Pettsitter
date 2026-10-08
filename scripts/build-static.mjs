import { copyFileSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const publicDir = join(root, 'public');
const outputDir = join(root, 'dist-static');
const OLD_SITE = 'https://casal-pet-sitter.onrender.com';

function parseOrigin(raw, key) {
  let url;
  try { url = new URL(raw); }
  catch { throw new Error(key + ' precisa ser uma URL completa (https://...).'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(key + ' deve conter somente a origem: protocolo + domínio, sem caminhos ou parâmetros.');
  }
  return url.origin;
}

const backendOrigin = parseOrigin(process.env.CPS_API_BASE || OLD_SITE, 'CPS_API_BASE');
const siteOrigin = parseOrigin(process.env.PUBLIC_SITE_ORIGIN || 'https://casal-pet-sitter-site.onrender.com', 'PUBLIC_SITE_ORIGIN');
if (backendOrigin === siteOrigin) throw new Error('Site público e backend precisam usar domínios diferentes.');

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });

// Publique somente os arquivos públicos. NUNCA publique admin, login ou setup em um site sem backend.
const files = ['index.html', 'app.js', 'styles.css', 'favicon.svg', 'privacy.html', 'robots.txt', 'sitemap.xml'];
for (const file of files) copyFileSync(join(publicDir, file), join(outputDir, file));
cpSync(join(publicDir, 'images'), join(outputDir, 'images'), { recursive: true });

let html = readFileSync(join(outputDir, 'index.html'), 'utf8');
const scriptTag = '<script src="/app.js" defer></script>';
if (!html.includes(scriptTag) || !html.includes('href="/login"') || !html.includes('href="/privacidade"')) {
  throw new Error('index.html mudou: revise os pontos de integração do build estático.');
}
html = html.replaceAll(OLD_SITE, siteOrigin)
  .replace('href="/login"', 'href="' + backendOrigin + '/login"')
  .replace('href="/privacidade"', 'href="/privacy.html"')
  .replace(scriptTag, '<script src="/config.js"></script>\n  ' + scriptTag);
writeFileSync(join(outputDir, 'index.html'), html);
writeFileSync(join(outputDir, 'config.js'), 'window.CPS_API_BASE = ' + JSON.stringify(backendOrigin) + ';\n');
for (const file of ['robots.txt', 'sitemap.xml']) {
  const dest = join(outputDir, file);
  writeFileSync(dest, readFileSync(dest, 'utf8').replaceAll(OLD_SITE, siteOrigin));
}
console.log('Site público gerado:', outputDir);
console.log('Frontend:', siteOrigin, '| Agendamentos e painel:', backendOrigin);
