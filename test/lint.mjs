// LiveWire structural check.
//
//   node test/lint.mjs            (from the project root)
//   node test/lint.mjs some.html
//
// The unit tests exercise behaviour. This checks what behaviour tests cannot
// see in a single-file app with no build step and no bundler: a getElementById
// naming an element nobody added, a bindEl on a button that got renamed, an
// unbalanced tag, a function called but never written, a store collection that
// was wired into the app but never into the SQL. Every one of those fails
// silently in a browser.
//
// Exits 0 clean, 1 with findings.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HTML = process.argv[2] || path.join(HERE, '..', 'index.html');
const src = fs.readFileSync(HTML, 'utf8');
const script = (src.match(/<script>([\s\S]*)<\/script>/) || [])[1];
if (!script) { console.error('no inline script found'); process.exit(1); }

const problems = [];
const note = (kind, msg) => problems.push({ kind, msg });

// Markup only. Counting tags across the script block would score every
// `<select>` written in a comment or assembled inside a JS string.
const markup = src.replace(/<script>[\s\S]*<\/script>/, '');

// Code with comments and string literals blanked out, so a word in prose is
// never mistaken for an identifier. Lengths are preserved so line numbers and
// offsets stay meaningful.
const blank = (n) => ' '.repeat(n);
const code = script
  .replace(/\/\*[\s\S]*?\*\//g, (m) => blank(m.length))
  .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, p1) => p1 + blank(m.length - p1.length))
  .replace(/'(?:[^'\\\n]|\\.)*'/g, (m) => blank(m.length))
  .replace(/"(?:[^"\\\n]|\\.)*"/g, (m) => blank(m.length))
  .replace(/`(?:[^`\\]|\\.)*`/g, (m) => blank(m.length));

// ---------------------------------------------------------------- tag balance
for (const tag of ['div', 'section', 'span', 'svg', 'p', 'button', 'select', 'textarea', 'label']) {
  const open = (markup.match(new RegExp('<' + tag + '[\\s>]', 'g')) || []).length;
  const close = (markup.match(new RegExp('</' + tag + '>', 'g')) || []).length;
  if (open !== close) note('tags', `<${tag}> ${open} open vs ${close} close`);
}

// ------------------------------------------------------------------ element ids
const declared = new Set();
for (const m of markup.matchAll(/\bid="([^"]+)"/g)) declared.add(m[1]);

// Ids the script creates at runtime, so they are legitimately absent from the
// markup. Anything listed here is a promise that the code really does build it.
const RUNTIME_IDS = new Set([
  'boot-error',                                                // the error trap injects this
  'dq-reason',                                                 // inside a contestant row
  'ce-name', 'ce-phone', 'ce-handle', 'ce-bigfish', 'ce-err'   // director edit form
]);

const referenced = new Map();
const bump = (id) => referenced.set(id, (referenced.get(id) || 0) + 1);
for (const m of script.matchAll(/getElementById\('([^']+)'\)/g)) bump(m[1]);
for (const m of script.matchAll(/\b(?:bindEl|setText|setHtml)\('([^']+)'/g)) bump(m[1]);
// querySelector('#thing [data-x]') counts as a reference too. Scoped to the
// selector argument, or every CSS hex colour in the file reads as an id.
for (const sel of script.matchAll(/querySelector(?:All)?\('([^']+)'\)/g)) {
  for (const m of sel[1].matchAll(/#([A-Za-z][\w-]*)/g)) bump(m[1]);
}

for (const [id, count] of referenced) {
  if (!declared.has(id) && !RUNTIME_IDS.has(id)) {
    note('missing-id', `#${id} is used ${count}x in the script but never appears in the HTML`);
  }
}

// Ids in the markup that nothing ever touches. Not necessarily wrong - plenty
// are CSS hooks or label targets - but a renamed handler surfaces here first.
const LABEL_TARGETS = new Set([...markup.matchAll(/\bfor="([^"]+)"/g)].map(m => m[1]));
const STYLE_ONLY = /^(app|screen-|home-event|reg-event|vf-guide|vf-fish|nohatch)/;
// Reached by building the string: getElementById('admin-tool-' + tool)
const BUILT = [...script.matchAll(/getElementById\('([a-z-]+-)'\s*\+/g)].map(m => m[1]);
const isBuilt = (id) => BUILT.some((pre) => id.startsWith(pre));

const orphans = [...declared].filter((id) =>
  !referenced.has(id) && !LABEL_TARGETS.has(id) && !STYLE_ONLY.test(id) && !isBuilt(id) &&
  !markup.includes(`data-goto="${id}"`) &&
  !script.includes(`'${id}'`) && !script.includes(`"${id}"`));
if (orphans.length) note('unused-id', `declared but never referenced: ${orphans.join(', ')}`);

// -------------------------------------------------------------- calls vs defs
const defined = new Set();
for (const m of code.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)/g)) defined.add(m[1]);
for (const m of code.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) defined.add(m[1]);
// Object-literal methods, which the storage backends are built from.
for (const m of code.matchAll(/^\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^()]*\)\s*\{/gm)) defined.add(m[1]);
// Parameter names, from both `function f(a, b)` and `(a, b) =>`. Without these
// a Promise executor's resolve/reject, or any callback argument, reads as an
// undefined call the moment it is invoked.
for (const m of code.matchAll(/\bfunction\s*[\w$]*\s*\(([^()]*)\)/g)) {
  for (const part of m[1].split(',')) {
    const n = part.trim().replace(/[={].*$/, '').replace(/^\.\.\./, '').trim();
    if (/^[A-Za-z_$][\w$]*$/.test(n)) defined.add(n);
  }
}
for (const m of code.matchAll(/\(([^()]*)\)\s*=>/g)) {
  for (const part of m[1].split(',')) {
    const n = part.trim().replace(/[={].*$/, '').replace(/^\.\.\./, '').trim();
    if (/^[A-Za-z_$][\w$]*$/.test(n)) defined.add(n);
  }
}
for (const m of code.matchAll(/(?:^|[^.\w$])([A-Za-z_$][\w$]*)\s*=>/g)) defined.add(m[1]);

const AMBIENT = new Set([
  // keywords that look like calls
  'if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'function', 'await', 'new', 'do',
  'else', 'try', 'delete', 'void', 'in', 'of', 'case', 'yield', 'async',
  // platform
  'console', 'document', 'window', 'navigator', 'localStorage', 'sessionStorage', 'JSON', 'Math',
  'Date', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Set', 'Map', 'WeakMap', 'Promise',
  'parseInt', 'parseFloat', 'isFinite', 'isNaN', 'setTimeout', 'setInterval', 'clearTimeout',
  'clearInterval', 'fetch', 'alert', 'confirm', 'prompt', 'encodeURIComponent',
  'decodeURIComponent', 'Intl', 'Image', 'FileReader', 'Blob', 'File', 'URL', 'atob', 'btoa',
  'requestAnimationFrame', 'cancelAnimationFrame', 'Error', 'RegExp', 'Uint8Array', 'Uint8ClampedArray',
  // third party globals, both allowed to be missing at runtime
  'L', 'supabase', 'claude'
]);

const calls = new Set();
for (const m of code.matchAll(/(?:^|[^.\w$])([a-z_$][\w$]*)\s*\(/g)) calls.add(m[1]);
const undef = [...calls].filter((n) => !defined.has(n) && !AMBIENT.has(n));
if (undef.length) note('undefined-call', `called but never defined: ${undef.join(', ')}`);

// ------------------------------------------------------------- store wiring
// A collection wired into SHARED_COLLECTIONS but missed anywhere else simply
// never syncs, with no error to notice.
const shared = (script.match(/const SHARED_COLLECTIONS = \[([^\]]+)\]/) || [])[1] || '';
const collections = [...shared.matchAll(/'([^']+)'/g)].map((m) => m[1]);
if (collections.length === 0) note('store', 'SHARED_COLLECTIONS could not be read');

const liveCacheDecl = (script.match(/const liveCache = \{[^}]*\}/) || [''])[0];
const loadedIdsDecl = (script.match(/const loadedIds = \{[^}]*\}/) || [''])[0];
const tablesDecl = (script.match(/const TABLES = \{[\s\S]*?\}/) || [''])[0];
for (const c of collections) {
  if (!new RegExp(`\\b${c}:`).test(liveCacheDecl)) note('store', `${c} is missing from liveCache`);
  if (!new RegExp(`\\b${c}:`).test(loadedIdsDecl)) note('store', `${c} is missing from loadedIds`);
  if (!new RegExp(`\\b${c}:`).test(tablesDecl)) note('store', `${c} is missing from the Supabase TABLES map`);
  if (!new RegExp(`function load${c[0].toUpperCase()}${c.slice(1)}\\b`).test(script)) {
    note('store', `${c} has no load${c[0].toUpperCase()}${c.slice(1)}() helper`);
  }
}

// ...and in every SQL file, or the table never exists on the server.
const SQL = ['supabase-setup.sql', 'supabase-rollback-open-access.sql',
             'supabase-step2a-ownership-columns.sql', 'supabase-step2b-enforce-policies.sql',
             'reset-test-data.sql'];
for (const file of SQL) {
  const p = path.join(HERE, '..', file);
  if (!fs.existsSync(p)) { note('sql', `${file} is missing`); continue; }
  const sql = fs.readFileSync(p, 'utf8');
  for (const c of collections) {
    if (!sql.includes('public.' + c)) note('sql', `${file} never mentions public.${c}`);
  }
}

// ------------------------------------------------------------- input zoom
// iOS Safari zooms the entire page in whenever a focused field's text is
// smaller than 16px, and nothing zooms it back - the reader has to pinch out,
// and until they do, scrolling and the fixed nav are both wrong. It is a
// platform rule with no warning attached, and it cost a round of "why do I
// have to zoom out" before it was found, so it is checked here.
const style = (src.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
if (!style) note('css', 'no <style> block found');

// Classes that sit on a real field somewhere in the file, markup or JS-built.
// Without these, a rule like `.edit-len { font-size: 13px }` reads as ordinary
// text styling because its selector never says "input".
const fieldClasses = new Set();
for (const m of src.matchAll(/<(?:input|select|textarea)\b[^>]*class="([^"]+)"/g)) {
  for (const c of m[1].split(/\s+/)) if (c) fieldClasses.add(c);
}

for (const rule of style.split('}')) {
  const selector = (rule.split('{')[0] || '').trim().replace(/\s+/g, ' ');
  const body = rule.split('{')[1];
  if (!selector || !body) continue;
  const size = /font-size:\s*(\d+(?:\.\d+)?)px/.exec(body);
  if (!size) continue;

  const namesAField = /\b(?:input|select|textarea)\b/.test(selector) ||
    [...fieldClasses].some((c) => selector.includes('.' + c));
  if (!namesAField) continue;
  // A hidden field cannot be focused, so it cannot trigger the zoom.
  if (/display:\s*none/.test(body)) continue;

  if (Number(size[1]) < 16) {
    note('input-zoom', `${selector} sets font-size:${size[1]}px — under 16px, so iOS zooms the page when it is focused`);
  }
}

// ------------------------------------------------------- serverless functions
// A relative endpoint the page calls has to exist as a file in api/, or the
// deploy goes out and the feature 404s with nothing in the console to explain
// it. This is the failure that left Fish-I dead on the hosted site.
for (const m of script.matchAll(/'(\/api\/[a-z0-9-]+)'/g)) {
  const name = m[1].replace('/api/', '');
  const candidates = ['js', 'mjs', 'ts'].map((ext) => path.join(HERE, '..', 'api', name + '.' + ext));
  if (!candidates.some((p) => fs.existsSync(p))) {
    note('api', `the page calls ${m[1]} but there is no api/${name}.js to answer it`);
  }
}

// ------------------------------------------------------------------- report
if (problems.length === 0) { console.log('lint: clean'); process.exit(0); }
const byKind = {};
for (const p of problems) (byKind[p.kind] = byKind[p.kind] || []).push(p.msg);
for (const kind of Object.keys(byKind)) {
  console.log('\n' + kind + ':');
  for (const msg of byKind[kind]) console.log('  - ' + msg);
}
console.log('\n' + problems.length + ' finding(s)');
process.exit(1);
