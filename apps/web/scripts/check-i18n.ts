// i18n + RTL hygiene for Laptop A's code (Spec A §6). Run: npm run test:i18n
//  1. No hardcoded UI strings: JSX text and aria-label/placeholder/title/alt/label literals with letters.
//  2. Logical Tailwind utilities only (ms-/me-/ps-/pe-/start-/end-/text-start), no ml-/mr-/pl-/pr-/left-/right-/text-left…
//  3. Directional icons (ArrowLeft/Right, ChevronLeft/Right) carry `rtl-flip`.
//  4. Dates/numbers through Intl (useLangFormat), not toLocale*String().
//  5. en/te/hi/ur key parity and {{placeholder}} parity for common/landing/citizen.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const SRC = path.resolve(import.meta.dirname, '../src');
const DIRS = ['app', 'design', 'lib', 'portals/landing', 'portals/citizen'].map((d) => path.join(SRC, d));
// Brand/product names, symbols and developer-only text that are not translatable UI copy.
const ALLOWED_TEXT =
  /^(JanaVaani|MOCK|AI|OK|PIN|SLA|GPS|QR|PDF|ID|×|·|—|–|•|\/|:|\+|-|#|%|★|☆|\d+|[A-Z]{2,4}-?\d*)$/;
const TEXT_ATTRS = new Set(['aria-label', 'placeholder', 'title', 'alt', 'label', 'aria-description']);
const PHYSICAL =
  /(?:^|\s|:)(-?m[lr]-|-?p[lr]-|left-(?!1\/2)|right-(?!1\/2)|text-left|text-right|rounded-[lr]-|rounded-[tb][lr]-|border-[lr]-?|float-left|float-right|scroll-m[lr]-|scroll-p[lr]-)/;
// Reading-direction icons only (a trend arrow like ArrowUpRight means "increase" in any script, so it is not mirrored).
const DIRECTIONAL_ICONS =
  /^(ArrowLeft|ArrowRight|ChevronLeft|ChevronRight|ChevronsLeft|ChevronsRight|MoveRight|MoveLeft)$/;
// Files that intentionally contain non-UI literals (dev tooling, mock badge, print-only CSS).
const SKIP_FILES = [/\.test\./, /DemoRoleSwitcher/, /ApiModeBadge/, /design[\\/]ui[\\/]/];

const problems: string[] = [];
const rel = (f: string) => path.relative(SRC, f).replaceAll('\\', '/');

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

function classStrings(node: ts.Node, out: string[]) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) out.push(node.text);
  else if (ts.isTemplateExpression(node))
    out.push(node.head.text, ...node.templateSpans.map((s) => s.literal.text));
  node.forEachChild((c) => classStrings(c, out));
}

for (const file of DIRS.flatMap(walk)) {
  if (SKIP_FILES.some((r) => r.test(file))) continue;
  const text = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const at = (n: ts.Node) => `${rel(file)}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
  const lines = text.split(/\r?\n/);
  // `{/* i18n-ignore: reason */}` (or `// i18n-ignore`) on the line above, or on the same line, exempts intentional
  // literals such as sample tickets, multilingual showcase text and proper nouns.
  const ignored = (n: ts.Node) => {
    const line = sf.getLineAndCharacterOfPosition(n.getStart()).line;
    return [lines[line], lines[line - 1]].some((l) => l?.includes('i18n-ignore'));
  };
  const visit = (n: ts.Node) => {
    if (ignored(n)) return;
    // 1. JSX text
    if (ts.isJsxText(n)) {
      const t = n.text.replace(/\s+/g, ' ').trim();
      if (t && /\p{L}/u.test(t) && !ALLOWED_TEXT.test(t))
        problems.push(`${at(n)} hardcoded text: "${t.slice(0, 60)}"`);
    }
    if (ts.isJsxAttribute(n)) {
      const name = n.name.getText();
      const init = n.initializer;
      const lit =
        init && ts.isStringLiteral(init)
          ? init.text
          : init && ts.isJsxExpression(init) && init.expression && ts.isStringLiteral(init.expression)
            ? init.expression.text
            : null;
      // 1b. text attributes
      if (TEXT_ATTRS.has(name) && lit && /\p{L}/u.test(lit) && !ALLOWED_TEXT.test(lit))
        problems.push(`${at(n)} hardcoded ${name}: "${lit}"`);
      // 2. physical utilities in className
      if (name === 'className' && init) {
        const strs: string[] = [];
        classStrings(init, strs);
        for (const s of strs) {
          const m = s.match(PHYSICAL);
          if (m)
            problems.push(`${at(n)} physical utility "${m[1]}" (use ms-/me-/ps-/pe-/start-/end-/text-start)`);
        }
      }
    }
    // 3. directional icons
    if (
      (ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) &&
      DIRECTIONAL_ICONS.test(n.tagName.getText())
    ) {
      const cls = n.attributes.properties.find(
        (p) => ts.isJsxAttribute(p) && p.name.getText() === 'className',
      );
      if (!cls || !cls.getText().includes('rtl-flip'))
        problems.push(`${at(n)} <${n.tagName.getText()}> without rtl-flip`);
    }
    // 4. locale formatting outside Intl helpers
    if (
      ts.isPropertyAccessExpression(n) &&
      /^toLocale(Date|Time)?String$/.test(n.name.text) &&
      !rel(file).startsWith('lib/i18n/')
    ) {
      problems.push(`${at(n)} ${n.name.text}() — use useLangFormat() (Intl, Asia/Kolkata)`);
    }
    n.forEachChild(visit);
  };
  visit(sf);
}

// 5. parity
const LOC = path.join(SRC, 'i18n/locales');
const flat = (o: Record<string, unknown>, p = ''): [string, string][] =>
  Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === 'object'
      ? flat(v as Record<string, unknown>, `${p}${k}.`)
      : [[`${p}${k}`, String(v)] as [string, string]],
  );
const vars = (s: string) =>
  [...s.matchAll(/\{\{\s*(\w+)/g)]
    .map((m) => m[1])
    .sort()
    .join(',');
const base = (k: string) => k.replace(/_(zero|one|two|few|many|other)$/, '');
for (const ns of ['common', 'landing', 'citizen']) {
  const en = new Map(flat(JSON.parse(fs.readFileSync(path.join(LOC, 'en', `${ns}.json`), 'utf8'))));
  for (const lang of ['te', 'hi', 'ur']) {
    const other = new Map(flat(JSON.parse(fs.readFileSync(path.join(LOC, lang, `${ns}.json`), 'utf8'))));
    const otherBases = new Set([...other.keys()].map(base));
    for (const [k, v] of en) {
      if (!other.has(k) && !otherBases.has(base(k))) problems.push(`${lang}/${ns}.json missing "${k}"`);
      else if (other.has(k) && vars(v) !== vars(other.get(k)!))
        problems.push(`${lang}/${ns}.json "${k}" placeholders {${vars(other.get(k)!)}} ≠ en {${vars(v)}}`);
    }
  }
}

if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`\n✗ ${problems.length} i18n/RTL problem(s)`);
  process.exit(1);
}
console.log('✓ i18n/RTL hygiene OK');
