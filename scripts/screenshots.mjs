import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { extname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', 'dist');
const outDir = join(__dirname, '..', 'docs', 'screenshots');
mkdirSync(outDir, { recursive: true });

const mime = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = createServer((req, res) => {
  let url = req.url?.split('?')[0] || '/';
  let filePath = join(root, url === '/' ? 'index.html' : url);
  if (!existsSync(filePath) || (existsSync(filePath) && statSync(filePath).isDirectory())) {
    filePath = join(root, 'index.html');
  }
  try {
    const data = readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': mime[extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});

await new Promise((r) => server.listen(4177, r));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

await page.goto('http://127.0.0.1:4177/', { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
await page.screenshot({ path: join(outDir, '01-login.png'), fullPage: true });

await page.getByRole('button', { name: /Ada Admin/i }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: join(outDir, '02-dashboard.png'), fullPage: true });

await page.getByRole('link', { name: /Confirmación Masiva/i }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: join(outDir, '03-confirmacion.png'), fullPage: true });

await page.getByRole('link', { name: /Pendientes/i }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: join(outDir, '04-pendientes.png'), fullPage: true });

await page.getByRole('link', { name: /Reportes/i }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: join(outDir, '05-reportes.png'), fullPage: true });

await browser.close();
server.close();
console.log('Screenshots written to', outDir);
