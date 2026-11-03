// P6: dependency-free bundle report (a text "visualizer"). Builds with sourcemaps into dist-analyze/, then prints
// every JS chunk with its gzip size and the packages/sources that make it up, plus the critical (entry +
// modulepreload) total against the master §11 budget of 250 KB gzipped.
//   npm run analyze -w apps/web            (or: node scripts/bundle-report.mjs --no-build)
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const web = path.resolve(import.meta.dirname, '..');
const out = path.join(web, 'dist-analyze');
if (!process.argv.includes('--no-build')) {
  execSync(`npx vite build --sourcemap --outDir ${out} --emptyOutDir`, { cwd: web, stdio: 'inherit' });
}
const assets = path.join(out, 'assets');
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const gz = (buf) => zlib.gzipSync(buf, { level: 9 }).length;

// Critical path = what index.html loads up front (the deferBootAssets loader lists them as JSON).
const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
const boot = /\}\)\((\{"e":[^<]+\})\);<\/script>/.exec(html);
const critical = new Set();
if (boot) {
  const a = JSON.parse(boot[1]);
  [a.e, ...a.m].forEach((f) => critical.add(path.basename(f)));
}

const rows = [];
for (const f of fs.readdirSync(assets).filter((x) => x.endsWith('.js'))) {
  const code = fs.readFileSync(path.join(assets, f));
  const mapFile = path.join(assets, `${f}.map`);
  const parts = new Map();
  if (fs.existsSync(mapFile)) {
    const map = JSON.parse(fs.readFileSync(mapFile, 'utf8'));
    map.sources.forEach((s, i) => {
      const pkg = /node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(s)?.[1] ?? s.replace(/^(\.\.\/)+/, '').replace(/^.*\/src\//, 'src/');
      parts.set(pkg, (parts.get(pkg) ?? 0) + (map.sourcesContent?.[i]?.length ?? 0));
    });
  }
  rows.push({ f, gz: gz(code), parts: [...parts].sort((a, b) => b[1] - a[1]).slice(0, 6) });
}
rows.sort((a, b) => b.gz - a.gz);

let crit = 0;
console.log('\nJS chunks (gzip) — * = loaded up front on every page\n');
for (const r of rows) {
  const star = critical.has(r.f) ? '*' : ' ';
  if (star === '*') crit += r.gz;
  if (r.gz < 2048 && star !== '*') continue;
  console.log(`${star} ${kb(r.gz).padStart(9)}  ${r.f}`);
  console.log(`              ${r.parts.map(([p, n]) => `${p} (${Math.round(n / 1024)}k src)`).join(', ')}`);
}
console.log(`\nCritical JS: ${kb(crit)} gzipped (budget 250 KB, master §11; route chunks are lazy and come on top)\n`);
