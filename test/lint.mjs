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
const NL = String.fromCharCode(10);
const note = (kind, msg) => problems.push({ kind, msg });

// Markup only. Counting tags across the script block would score every
// `<select>` written in a comment or assembled inside a JS string.
const markup = src.replace(/<script>[\s\S]*<\/script>/, '');

// Code with comments and string literals blanked out, so a word in prose is
// never mistaken for an identifier. Lengths are preserved so line numbers and
// offsets stay meaningful.
const blank = (n) => ' '.repeat(n);
const blank2 = (m) => ' '.repeat(m.length);
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
  'sw-update', 'sw-update-go',                                 // the update banner builds itself
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

// A selector held in a variable and concatenated later - ['#a','#b'].forEach(
// sel => document.querySelectorAll(sel + ' label')) - is a real reference the
// scan above cannot see, because there is no querySelector call with the id in
// it. Checking for the quoted selector is safe in a way widening that scan is
// not: this can only ever clear an id the markup already declares, so it can
// never invent a missing-id finding out of a hex colour.
const selectorLiteral = (id) => script.includes(`'#${id}'`) || script.includes(`"#${id}"`);

const orphans = [...declared].filter((id) =>
  !referenced.has(id) && !LABEL_TARGETS.has(id) && !STYLE_ONLY.test(id) && !isBuilt(id) &&
  !markup.includes(`data-goto="${id}"`) && !selectorLiteral(id) &&
  !script.includes(`'${id}'`) && !script.includes(`"${id}"`));
if (orphans.length) note('unused-id', `declared but never referenced: ${orphans.join(', ')}`);

// ------------------------------------------------------- redefined functions
// Two top-level `function foo(){}` declarations in one script is not an error
// in JavaScript: the later one wins, silently, everywhere - including in code
// written above it that was reading the first. Every call still works, so
// nothing throws and nothing is undefined; the app just quietly runs the wrong
// version. One file with 8,000 lines in it makes this easy to do by accident,
// and it happened while the FWP report was being written.
const declaredFns = new Map();
for (const m of code.matchAll(/^function\s+([A-Za-z_$][\w$]*)/gm)) {
  declaredFns.set(m[1], (declaredFns.get(m[1]) || 0) + 1);
}
for (const [name, count] of declaredFns) {
  if (count > 1) note('redefined', `function ${name}() is declared ${count}x — the last one silently wins`);
}

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
  const p = path.join(HERE, '..', 'sql', file);
  if (!fs.existsSync(p)) { note('sql', `${file} is missing`); continue; }
  const sql = fs.readFileSync(p, 'utf8');
  for (const c of collections) {
    if (!sql.includes('public.' + c)) note('sql', `${file} never mentions public.${c}`);
  }
}

// --------------------------------------------------------- service worker
// Registering a worker that is not there fails quietly - the promise rejects
// into a console nobody is reading, and the app simply never works offline.
for (const m of script.matchAll(/serviceWorker\.register\('([^']+)'\)/g)) {
  const file = m[1].replace(/^\.?\//, '');
  if (!fs.existsSync(path.join(HERE, '..', file))) {
    note('sw', `the page registers ${m[1]} but there is no ${file} to register`);
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

// --------------------------------------------------- print vs the page view
// The page view exists to answer "how many sheets of paper is this", and it can
// only answer it while it measures the form at the same size the printer does.
// Those sizes live once, as --fwp-* custom properties on #report-sheet, and the
// print block deliberately sets none of them.
//
// Redefining one inside @media print is the failure this catches: the printed
// copy changes, the page view does not, and it goes on cheerfully reporting a
// fit for a form that now spills. Nothing visible breaks, so nothing else would
// notice.
const printBlock = (() => {
  const at = style.indexOf('@media print{');
  if (at === -1) return '';
  // Brace-matched rather than regex'd: the block has nested rules in it.
  let depth = 0;
  for (let i = style.indexOf('{', at); i < style.length; i++) {
    if (style[i] === '{') depth++;
    else if (style[i] === '}' && --depth === 0) return style.slice(at, i + 1);
  }
  return style.slice(at);
})();

if (style.includes('@media print{') && !printBlock) {
  note('css', 'the @media print block never closes');
}
for (const m of printBlock.matchAll(/(--fwp-[\w-]+)\s*:/g)) {
  note('print-drift',
    `@media print redefines ${m[1]} — the page view reads the base value, so the ` +
    `two would disagree about what fits on a page`);
}
// And the base has to actually be there to be read.
const FWP_TOKENS = ['--fwp-base', '--fwp-grid', '--fwp-size', '--fwp-title',
                    '--fwp-head', '--fwp-foot', '--fwp-cell-pad', '--fwp-size-pad'];
const sheetBase = (style.match(/#report-sheet\{([^}]*)\}/) || ['', ''])[1];
for (const token of FWP_TOKENS) {
  if (!sheetBase.includes(token + ':')) {
    note('css', `#report-sheet does not set ${token}, so the printed form has no size for it`);
  }
}

// ----------------------------------------------------------- hosting headers
// vercel.json carries the security headers and the cache rules. The one that
// rots is the CSP: add a CDN or an API to the page and the policy silently
// stops covering it, so this checks every external origin the page names is
// actually allowed by the policy. JSON takes no comments, which is why the
// reasoning lives here.
const VJ = path.join(HERE, '..', 'vercel.json');
if (!fs.existsSync(VJ)) {
  note('hosting', 'vercel.json is missing - the deploy would go out with no ' +
    'security headers and no cache rules for sw.js');
} else {
  let vercel = null;
  try { vercel = JSON.parse(fs.readFileSync(VJ, 'utf8')); }
  catch (e) { note('hosting', 'vercel.json is not valid JSON: ' + e.message); }
  if (vercel) {
    // Read the actual key names, not the file as a string: a substring match
    // would be satisfied by a misspelt or disabled entry that no browser will
    // ever act on.
    const setHeaders = new Map();
    for (const rule of vercel.headers || []) {
      for (const h of rule.headers || []) {
        if (h && h.key && String(h.value || '').trim()) setHeaders.set(String(h.key), String(h.value));
      }
    }
    for (const [key, why] of [
      ['X-Content-Type-Options', 'lets a browser sniff a response into something executable'],
      ['Referrer-Policy', 'leaks the full URL to every third party the page touches'],
      ['Permissions-Policy', 'leaves camera and location open to any embedded frame'],
      ['Strict-Transport-Security', 'allows a downgrade to plain http']
    ]) {
      if (!setHeaders.has(key)) note('hosting', `vercel.json sets no ${key}, which ${why}`);
    }
    // The camera and GPS are the whole app on the water - a policy that forgot
    // to allow them would break catch submission rather than just tighten it.
    const perms = setHeaders.get('Permissions-Policy') || '';
    for (const feature of ['camera', 'geolocation']) {
      if (perms && !new RegExp(feature + '=\\(self\\)').test(perms)) {
        note('hosting', `Permissions-Policy does not grant ${feature} to the page ` +
          `itself - submitting a catch needs it`);
      }
    }
    // sw.js must never be cached hard, or a bad worker outlives its fix.
    const sw = (vercel.headers || []).find((h) => String(h.source).includes('sw.js'));
    const swCache = sw && (sw.headers || []).find((x) => x.key === 'Cache-Control');
    if (!swCache || !/max-age=0|no-cache|no-store/.test(swCache.value)) {
      note('hosting', 'sw.js is not served must-revalidate - a bad service worker ' +
        'would keep serving the old app until its cache happened to turn over');
    }
    // Every external origin the page names has to appear in the policy.
    const enforced = setHeaders.get('Content-Security-Policy');
    const reportOnly = setHeaders.get('Content-Security-Policy-Report-Only');
    const policy = enforced || reportOnly || '';
    // The rollout is finished: the walkthrough was done on a real browser,
    // every screen, and the only thing the console had to say was that
    // upgrade-insecure-requests does nothing in report-only mode - which was
    // the point of flipping. Going back to report-only would leave a policy
    // that reads like protection and blocks nothing, which is the state this
    // was deliberately moved OUT of.
    if (!enforced && reportOnly) {
      note('hosting', 'the CSP is back to Content-Security-Policy-Report-Only, which ' +
        'reports violations and blocks none of them - the walkthrough that justified ' +
        'enforcing it has already been done');
    }
    if (policy && !/frame-ancestors/.test(policy)) {
      note('hosting', 'the CSP sets no frame-ancestors, so the app can be framed ' +
        'and clickjacked');
    }
    if (!policy) {
      note('hosting', 'vercel.json carries no Content-Security-Policy');
    } else {
      const origins = new Set();
      for (const m of src.matchAll(/https:\/\/([a-z0-9.-]+)/g)) origins.add(m[1]);
      for (const host of origins) {
        if (host.endsWith('.invalid') || host.includes('abcdefghijkl')) continue;  // examples
        if (host.endsWith('supabase.co') && policy.includes('*.supabase.co')) continue;
        if (host.endsWith('openapi.vercel.sh')) continue;
        if (!policy.includes(host)) {
          note('hosting', `the page loads from ${host} but the CSP does not allow it - ` +
            `the policy has fallen behind the code`);
        }
      }
    }
  }
}

// ------------------------------------------------------- external resources
// Anything loaded off a CDN runs on every angler's phone with the same
// privileges as the app itself, so it has to be pinned to an exact version AND
// checked against a hash. A floating range like "@2" means the newest release
// upstream reaches the field unread, and the first anyone knows of a bad one is
// on the water.
for (const m of src.matchAll(/<(script|link)\b[^>]*?(?:src|href)="(https:\/\/[^"]+)"[^>]*>/g)) {
  const [tag, kind, url] = [m[0], m[1], m[2]];
  // Connection hints fetch nothing, so there is nothing to pin or hash.
  if (/rel="(preconnect|dns-prefetch|preload)"/.test(tag)) continue;
  // Google Fonts serves CSS whose content is negotiated per browser, so it has
  // no stable hash to pin. It ships no script, and the CSP confines it.
  if (/fonts\.(googleapis|gstatic)\.com/.test(url)) continue;
  const version = url.match(/@(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!version || version[2] === undefined || version[3] === undefined) {
    note('cdn', `${url} is not pinned to an exact version - a floating range ` +
      `ships whatever upstream released last, to every phone, untested`);
  }
  if (!/\bintegrity="sha(256|384|512)-/.test(tag)) {
    note('cdn', `${url} has no integrity hash, so a CDN serving different bytes ` +
      `would be run rather than refused`);
  }
  if (!/\bcrossorigin=/.test(tag)) {
    note('cdn', `${url} has an integrity hash but no crossorigin attribute - ` +
      `the browser ignores the hash without it`);
  }
}

// -------------------------------------------------------------- the reel
// Two of the reel's rules cannot be reached from a test in Node - one needs a
// real canvas, the other a browser that has captureStream but no MediaRecorder
// (Safari 11 to 14.0, which is a real window). Both are load-bearing.
const reelImg = (script.match(/async function reelImage\([^)]*\)\{([\s\S]*?)\n\}/) || ['', ''])[1];
if (!reelImg) {
  note('reel', 'cannot find reelImage - the canvas-taint guard cannot be checked');
} else {
  // Drawing a cross-origin image onto a canvas taints it, and captureStream()
  // on a tainted canvas throws SecurityError - so every remote photo has to be
  // fetched to a blob first. Without this the reel dies on the one path that
  // matters: photos that reached object storage.
  if (!/fetch\(/.test(reelImg) || !/createObjectURL/.test(reelImg)) {
    note('reel', 'reelImage no longer fetches a remote photo to a blob before ' +
      'drawing it - a cross-origin image taints the canvas and captureStream() ' +
      'then throws, so the reel would fail on every uploaded photo');
  }
}
const reelSup = (script.match(/function reelSupported\(\)\{([\s\S]*?)\n\}/) || ['', ''])[1];
if (!reelSup) {
  note('reel', 'cannot find reelSupported - the recorder check cannot be verified');
} else {
  for (const [needle, what] of [
    ['MediaRecorder', 'the MediaRecorder check (Safari 11-14.0 has captureStream without it)'],
    ['captureStream', 'the captureStream check']
  ]) {
    if (!reelSup.includes(needle)) {
      note('reel', `reelSupported has lost ${what}, so the button would be offered ` +
        `to a browser that cannot record`);
    }
  }
}
// The reel is the angler's OWN fish. A wall inside the app is one thing; a file
// about to be posted is another, and only one of those did the field agree to.
const reelRowsFn = (script.match(/function reelRows\([^)]*\)\{([\s\S]*?)\n\}/) || ['', ''])[1];
if (reelRowsFn && !/r\.mine/.test(reelRowsFn)) {
  note('reel', 'reelRows no longer filters to the angler\'s own fish - somebody ' +
    'else\'s photo would end up in a file being posted to social media');
}

// ------------------------------------------------------------- the public wall
// The gallery is the whole field looking at each other's fish, so the angler
// there is a handle. galleryOrder() enforces that by returning a PROJECTION
// rather than the catch records - the real name is not in the object, so there
// is nothing to leak. These keep the rest of the path honest, in the places a
// test cannot reach: a wiring table and two render functions.
const galleryFns = ['galleryOrder', 'galleryTileHtml', 'renderGallery'];
for (const fn of galleryFns) {
  const body = (script.match(new RegExp(
    '(?:async )?function ' + fn + '\\([^)]*\\)\\{([\\s\\S]*?)\\n\\}')) || ['', ''])[1];
  if (!body) {
    note('gallery', `cannot find ${fn} - the public wall cannot be checked`);
  } else if (/anglerName/.test(body)) {
    note('gallery', `${fn} mentions anglerName - the gallery is public and the ` +
      `angler there is their handle`);
  }
}
// The mode travels with the host in the lightbox wiring table. Pairing the
// gallery with the director's mode would publish real names to the field.
const wiring = (script.match(/\[\['admin-pending'[\s\S]*?\]\]\.forEach/) || [''])[0];
if (!wiring) {
  note('gallery', 'cannot find the lightbox wiring table - the gallery mode is unchecked');
} else if (!/\['gallery-grid',\s*LIGHTBOX_PUBLIC\]/.test(wiring)) {
  note('gallery', 'the gallery grid is not wired to LIGHTBOX_PUBLIC, so the wall ' +
    'would open fish with a real name on them');
}
// The gallery tile carries a caption and a marker over its photo. Painting the
// image into the tile itself rather than into .photo-target wipes both.
const hydrate = (script.match(/function hydratePhotos\([^)]*\)\{([\s\S]*?)\n\}/) || ['', ''])[1];
if (hydrate && !hydrate.includes('.photo-target')) {
  note('gallery', 'hydratePhotos no longer paints into .photo-target, so a photo ' +
    'arriving wipes the caption off every gallery tile');
}

// ------------------------------------------------------------ acting for others
// Two write paths decide whether THIS device may change somebody else's
// record. Both are inside render functions, so there is no unit test that can
// see them - these keep the check from being quietly dropped.
//
// The pickers and the delete button are filtered to the right set already, but
// both are markup in a page anyone can open the inspector on. The list being
// right is not the same as the write being guarded.
for (const [fn, guard, why] of [
  ['renderManageList', 'canActFor',
   'lets any angler re-measure or withdraw a catch that is not theirs'],
  ['wireChatActions', 'canDeleteMessage',
   'lets any angler delete anybody\'s message']
]) {
  const body = (script.match(new RegExp(
    '(?:async )?function ' + fn + '\\([^)]*\\)\\{([\\s\\S]*?)\\n\\}')) || ['', ''])[1];
  if (!body) {
    note('ownership', `cannot find ${fn} - its ownership check cannot be verified`);
  } else if (!body.includes(guard + '(')) {
    note('ownership', `${fn} no longer calls ${guard}(), which ${why}`);
  }
}

// -------------------------------------------------------- writing for others
// The two write paths that file something against a NAMED entry. Both live in
// click handlers built inside render functions, so no unit test reaches them,
// and both shipped without the check: the picker was scoped, the write was not.
//
// actionGuard is what closes the gap that let a catch be filed under another
// angler's name, and under an angler who was never registered at all.
for (const [needle, guard, why] of [
  ["bindEl('sub-submit'", 'actionGuard',
   'lets a catch be filed under an entry this device may not act for, or one that is on no roster'],
  ['function renderCheckinBody', 'actionGuard',
   'lets this device check somebody else in or out']
]) {
  const at = script.indexOf(needle);
  if (at === -1) {
    note('ownership', `cannot find ${needle} - its write guard cannot be verified`);
  } else {
    const body = script.slice(at, at + 4000);
    if (!body.includes(guard + '(')) {
      note('ownership', `the code at ${needle} no longer calls ${guard}(), which ${why}`);
    } else if (!/if\(!guard\.ok\)\{[^}]*return;/.test(body)) {
      // Calling it is not obeying it. An empty or fall-through failure branch
      // reads as guarded and is not.
      note('ownership', `the code at ${needle} calls ${guard}() but does not return on ` +
        'a refusal, so the write happens anyway');
    }
  }
}

// The submit screen has to actually paint the notice that says whose catch is
// about to be filed. The function can be perfect and never called.
{
  const body = (script.match(/async function renderSubmitScreen\([^)]*\)\{([\s\S]*?)\n\}/) || ['', ''])[1];
  if (!body) note('ownership', 'renderSubmitScreen is gone');
  else if (!body.includes('renderFilingNotice(')) {
    note('ownership', 'the submit screen no longer paints the filing notice, so a catch ' +
      'about to be filed under another angler’s name says nothing on the way in');
  }
}

// The audit trail is its own line and could be dropped on its own. A director
// filing for an angler whose phone died is legitimate; it being invisible
// afterwards is not.
{
  const at = script.indexOf("bindEl('sub-submit'");
  if (at !== -1 && !/filedBy:\s*filedByFor\(/.test(script.slice(at, at + 4000))) {
    note('ownership', 'a catch no longer records which device filed it, so a submission ' +
      'made under another angler’s name leaves no trace on the record');
  }
}

// A catch was written with `anglerName: angler ? angler.name : 'Unknown'`, so
// an id that matched nobody on the roster was filed anyway with a placeholder
// name. That IS the "submitted while not registered" bug: the record exists,
// scores nothing, and belongs to no one. actionGuard now refuses first, and
// this makes sure the fallback does not creep back in.
if (/anglerName:\s*angler\s*\?/.test(script)) {
  note('ownership', "the submit handler still falls back to a placeholder anglerName - " +
    'a catch filed against an unregistered entry would be saved rather than refused');
}

// Order matters inside actionGuard: canActFor answers true for ANY id once
// director access is unlocked, so membership has to be tested first or a
// director can file a catch for a person who never entered.
{
  const body = (script.match(/function actionGuard\([^)]*\)\{([\s\S]*?)\n\}/) || ['', ''])[1];
  if (!body) {
    note('ownership', 'actionGuard is gone - nothing checks who a write is for');
  } else {
    const member = body.indexOf('not-registered');
    const perm = body.indexOf('canActFor');
    if (member === -1) note('ownership', 'actionGuard no longer checks roster membership');
    else if (perm === -1) note('ownership', 'actionGuard no longer checks canActFor');
    else if (perm < member) {
      note('ownership', 'actionGuard checks canActFor BEFORE roster membership, so an ' +
        'unlocked director can file against an id that is on no roster');
    }
  }
}

// ------------------------------------------------------- duplicate photos
// A dHash covers the whole frame, so cropping in defeats it outright. The
// windowed comparison is the fix, and every part of it is reachable only
// through a real <canvas>, which the unit tests do not have.
{
  const analyze = (script.match(/function analyzePhoto\([^)]*\)\{([\s\S]*?)\n\}/) || ['', ''])[1];
  if (!analyze) {
    note('duplicates', 'analyzePhoto is gone - nothing hashes a photo');
  } else if (!/hashes:/.test(analyze)) {
    note('duplicates', 'analyzePhoto stores only a whole-frame hash, so a cropped ' +
      'reuse of the photo cannot be recognised later');
  }
  // Every window has to actually be taken. Returning one hash from photoHashes
  // leaves the whole windowed comparison in place and inert.
  const hashes = (script.match(/function photoHashes\([^)]*\)\{([\s\S]*?)\n\}/) || ['', ''])[1];
  if (!hashes) {
    note('duplicates', 'photoHashes is gone - nothing takes the crop windows');
  } else if (!hashes.includes('PRECHECK_HASH_WINDOWS')) {
    note('duplicates', 'photoHashes no longer walks PRECHECK_HASH_WINDOWS, so only the ' +
      'whole frame is hashed and a crop is invisible again');
  }
  // And the window has to reach the canvas. drawImage with no source rect
  // silently hashes the whole frame for every window, which makes all eight
  // identical and the comparison useless.
  const grey = (script.match(/function greyscaleFrom\([^)]*\)\{([\s\S]*?)\n\}/) || ['', ''])[1];
  if (!grey) {
    note('duplicates', 'greyscaleFrom is gone');
  } else if (!/const r = win \|\|/.test(grey) || !/img\.width \* r\[0\]/.test(grey)) {
    note('duplicates', 'greyscaleFrom no longer crops to the window it was handed, so ' +
      'every window hashes the whole frame and they all come out identical');
  }

  const verdict = (script.match(/function evaluateFirstPass\([^)]*\)\{([\s\S]*?)\n\}/) || ['', ''])[1];
  if (!verdict) {
    note('duplicates', 'evaluateFirstPass is gone');
  } else if (!verdict.includes('photoHashDistance(')) {
    note('duplicates', 'evaluateFirstPass no longer compares through photoHashDistance(), ' +
      'so it is back to whole-frame-only matching and a crop walks past it');
  }
  // Index 0 of the window list is load-bearing: it is what gets stored as
  // .hash, and photoHashDistance uses it as "the whole photo" on both sides.
  const wins = (script.match(/const PRECHECK_HASH_WINDOWS = \[([\s\S]*?)\];/) || ['', ''])[1];
  if (!wins) note('duplicates', 'PRECHECK_HASH_WINDOWS is gone - nothing to compare crops through');
  else {
    const first = (wins.match(/\[([^\]]*)\]/) || ['', ''])[1].split(',').map((x) => parseFloat(x));
    if (first.join() !== '0,0,1,1') {
      note('duplicates', `the first hash window is [${first.join(', ')}] and must be the ` +
        'whole frame [0, 0, 1, 1] - it is the one stored as .hash');
    }
    if ((wins.match(/\[/g) || []).length < 4) {
      note('duplicates', 'too few hash windows to catch a crop of any depth');
    }
  }
}

// --------------------------------------------------------------- sync loop
// The polling loop runs on real timers, so there is no unit test around its
// mechanics - these are the guards it must not lose. Each one was a live bug:
//
//   inFlight     setInterval does not wait for an async callback, so slow ticks
//                overlapped and piled up, and the extra concurrent fetches made
//                a weak link weaker. A spiral, on the water, with one bar.
//   document.hidden   a phone in a pocket polled all day.
//   backoff      an unreachable server was retried every 5s forever.
//   no setInterval(tick)   the loop must reschedule itself AFTER each pass
//                finishes, which setInterval cannot do.
const startBody = (script.match(/start\(onRows\)\{([\s\S]*?)\n    \},/) || ['', ''])[1];
if (!startBody) {
  note('sync', 'cannot find start(onRows) - the polling loop guards cannot be checked');
} else {
  const GUARDS = [
    [/if\(inFlight\) return;/, 'the in-flight guard, so slow ticks can overlap and pile up'],
    // Pinned to the guard's ROLE, not just the words: document.hidden also
    // appears in the visibilitychange handler a few lines below, and
    // `failures = 0` appears in both wake-up handlers. Matching those would
    // let the guard be cut out of the tick itself and still pass.
    [/document\.hidden\)\{\s*schedule\(\);\s*return;/,
     'the hidden-page early return, so a phone in a pocket polls all day'],
    [/SYNC_BACKOFF_MAX_MS/, 'its backoff, so an unreachable server is retried every 5s forever'],
    [/failures\s*\+\+/, 'its failure counter, so the backoff can never grow'],
    [/failures = 0;\s*\n\s*if\(syncState/,
     'the failure reset on a good pass, so the backoff never recovers after one blip']
  ];
  for (const [re, what] of GUARDS) {
    if (!re.test(startBody)) note('sync', `the polling loop has lost ${what}`);
  }
  if (/setInterval\s*\(\s*tick/.test(startBody)) {
    note('sync', 'the polling loop is back on setInterval, which does not wait for ' +
      'an async tick - passes will overlap on a slow link');
  }
}
// Every table read has to page. A bare select with no limit is a silent
// truncation waiting for the catches table to outgrow one response.
for (const m of script.matchAll(/'\/rest\/v1\/'\s*\+\s*[A-Za-z]+(?:\[[^\]]*\])?\s*\+\s*'\?select=[^']*'/g)) {
  if (!m[0].includes('limit=')) {
    const line = script.slice(0, m.index).split(NL).length;
    note('sync', `line ${line}: reads a whole table with no limit - Supabase caps ` +
      `the response silently, so this truncates as the table grows`);
  }
}

// ------------------------------------------------------------ ranking ties
// Every ranking of fish has to go through byLengthThenEarliest(). A bare
// `b.length - a.length` leaves ties to the order rows arrived in, and that
// order changes whenever a row is updated - so a tie could silently reorder
// itself, and two phones could show different boards from the same data.
// renderBigFish() is a render function with no test around it, so this is the
// only thing standing between it and a quiet regression.
for (const m of script.matchAll(/\.sort\(\s*\([^)]*\)\s*=>\s*[a-z]\.length\s*-\s*[a-z]\.length\s*\)/g)) {
  const line = script.slice(0, m.index).split(NL).length;
  note('ties', `line ${line}: ranks fish on length alone, so ties fall back to row ` +
    `order - sort with byLengthThenEarliest instead`);
}
// The comparator itself must keep all three rungs, or it stops being total.
const cmpBody = (script.match(/function byLengthThenEarliest\(a, b\)\{([\s\S]*?)\n\}/) || ['', ''])[1];
if (cmpBody) {
  for (const [needle, what] of [['b.length', 'length'], ['catchTime', 'the timestamp'],
                                ['localeCompare', 'the id fallback']]) {
    if (!cmpBody.includes(needle)) {
      note('ties', `byLengthThenEarliest no longer compares ${what}, so ties are not fully ordered`);
    }
  }
} else {
  note('ties', 'byLengthThenEarliest is gone - every fish ranking depends on it');
}

// ---------------------------------------------------- the cost of a status line
// Fish-I is a director tool, and asking whether it is ready costs a round trip
// to the server - which, on the server, used to cost real Gemini requests out
// of a free daily allowance. Running that on load ran it on every angler's
// phone, to paint a status line on a panel they cannot open.
// Nothing in the script block sits at column 0 except module-level statements,
// so this finds the call being put back on the load path.
if (/^initFishI\(\);/m.test(code)) {
  note('quota', 'initFishI() runs at load again, so every angler’s page probes the ' +
    'review endpoint - which is how the free Gemini quota got spent before the ' +
    'first catch was reviewed');
}
// And the once-only guard, without which every repaint of the director's panel
// asks again - worse than asking on load.
{
  const body = (script.match(/function ensureFishI\([^)]*\)\{([\s\S]*?)\n\}/) || ['', ''])[1];
  if (!body) note('quota', 'ensureFishI is gone - nothing starts the Fish-I probe lazily');
  else if (!/if\(fishIStarted\) return;/.test(body)) {
    note('quota', 'ensureFishI has lost its once-only guard, so every repaint of the ' +
      'director panel probes the endpoint again');
  }
}
{
  const body = (script.match(/async function renderAdmin\([^)]*\)\{([\s\S]*?)\n\}/) || ['', ''])[1];
  if (!body) note('quota', 'renderAdmin is gone - nothing starts Fish-I');
  else if (!body.includes('ensureFishI(')) {
    note('quota', 'renderAdmin no longer calls ensureFishI(), so a director opening the ' +
      'panel never finds out whether the vision pass is available');
  }
}

// ------------------------------------------------- only the director asks Fish-I
// The endpoint refuses anybody else now, so both calls out of the page have to
// carry the session. Dropping the header does not break anything visibly at
// build time - it just makes Fish-I stop working, and read as a server fault.
for (const [needle, why] of [
  ['async function probeFishIEndpoint', 'the health check'],
  ['const endpoint = aiReviewEndpoint();', 'the review request']
]) {
  const at = script.indexOf(needle);
  if (at === -1) note('quota', `cannot find ${needle} - its auth header cannot be verified`);
  else if (!script.slice(at, at + 2500).includes('fishIAuthHeaders(')) {
    note('quota', `${why} no longer sends fishIAuthHeaders(), so the endpoint will ` +
      'refuse it as not coming from the director');
  }
}

// ------------------------------------------------------- photo integrity
// The hash lives on the catch record and the pixels live in object storage.
// Nothing but this check joins them, and all of it runs against a decoded
// <img>, which the unit tests do not have.
{
  const at = script.indexOf('hydratePhotos(pendEl');
  if (at === -1) note('integrity', 'cannot find the review lists to verify');
  else if (!/verify:\s*true/.test(script.slice(at, at + 400))) {
    note('integrity', 'the director review lists no longer re-check the stored photo, ' +
      'so a photo swapped after filing would pass without comment');
  }
  const hy = (script.match(/function hydratePhotos\([^)]*\)\{([\s\S]*?)\n\}/) || ['', ''])[1];
  if (!hy) note('integrity', 'hydratePhotos is gone');
  else if (!hy.includes('flagPhotoMismatch(')) {
    note('integrity', 'hydratePhotos never calls flagPhotoMismatch(), so opts.verify ' +
      'is accepted and ignored');
  }
  const fl = (script.match(/function flagPhotoMismatch\([^)]*\)\{([\s\S]*?)\n\}/) || ['', ''])[1];
  if (!fl) note('integrity', 'flagPhotoMismatch is gone');
  else {
    if (!fl.includes('photoIntegrity(')) {
      note('integrity', 'flagPhotoMismatch no longer compares against the recorded hash');
    }
    // A cross-origin photo taints the canvas and getImageData throws. A check
    // that cannot RUN must never be reported as a check that FAILED.
    // Appending is not idempotent: without this the warning stacks every time
    // the same host is hydrated again, and the card grows a paragraph per
    // repaint.
    if (!/dataset\.tamperDone\) return;/.test(fl)) {
      note('integrity', 'flagPhotoMismatch has lost its once-only guard, so the ' +
        'warning stacks up on the card every time the photo is re-hydrated');
    }
    // WHERE it lands is not cosmetic. .catchcard is a flex ROW, so appending
    // the warning to the card itself made it a third flex item: min-content
    // width, one word per line, and a row thousands of pixels tall. It has to
    // go in the .info column, which lays its children out as blocks.
    if (!fl.includes(".querySelector('.info')")) {
      note('integrity', 'the photo warning is no longer placed inside the card’s ' +
        '.info column - appended to .catchcard itself it becomes a third flex item ' +
        'and smears down the screen instead of reading as a sentence');
    }
    if (!/try\{/.test(fl) || !/catch\(/.test(fl)) {
      note('integrity', 'flagPhotoMismatch has lost its try/catch - a tainted canvas ' +
        'would throw inside an onload handler rather than simply not checking');
    }
  }
  // The lightbox is where the director is told to judge, so it is where this
  // has to be said - and the panel is reused between fish, so a warning left
  // behind would sit under a photo it has nothing to do with.
  const lb = (script.match(/async function openLightbox\([^)]*\)\{([\s\S]*?)\n\}/) || ['', ''])[1];
  if (!lb) note('integrity', 'openLightbox is gone');
  else {
    if (!lb.includes('photoTamperHtml(')) {
      note('integrity', 'the lightbox no longer reports a swapped photo, which is the ' +
        'screen the director is told to judge on');
    }
    if (!/tamperEl\.hidden = true;/.test(lb)) {
      note('integrity', 'the lightbox no longer clears the previous fish’s warning, so ' +
        'it would be shown against a photo it has nothing to do with');
    }
  }
}

// The lightbox is a flex column and its stage grows; every fixed bar in it has
// to say so or it gets squeezed to nothing on a short screen.
if (!/#lightbox-tamper\{[^}]*flex:0 0 auto/.test(src)) {
  note('integrity', 'the lightbox photo warning no longer declares flex:0 0 auto, so ' +
    'the growing photo stage can squeeze it to nothing exactly when it matters');
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

// -------------------------------------------------- the review endpoint's quota
// api/fish-i.js is not in the page, so nothing above this reaches it, and its
// unit tests cannot see the request-shaped parts. Both findings below were live
// bugs that spent a whole day's free allowance.
{
  const apiPath = path.join(HERE, '..', 'api', 'fish-i.js');
  if (fs.existsSync(apiPath)) {
    const api = fs.readFileSync(apiPath, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, blank2)
      .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));

    // The health check must not GENERATE. It ran on every cold instance and
    // verified up to five candidate models by generating with each one.
    const getAt = api.indexOf("req.method === 'GET'");
    const postAt = api.indexOf("req.method !== 'POST'");
    const resolve = (api.match(/async function resolveModel\([^)]*\)\s*\{([\s\S]*?)\n\}/) || ['', ''])[1];
    if (!resolve) {
      note('quota', 'api/fish-i.js has no resolveModel - the health check cannot be verified');
    } else if (/generateContent/.test(resolve)) {
      note('quota', 'resolveModel() calls generateContent, so answering "is Fish-I ready" ' +
        'spends real Gemini requests - on every cold instance, for every page that asks');
    }
    if (getAt !== -1 && postAt > getAt) {
      const getPath = api.slice(getAt, postAt);
      if (/generateContent/.test(getPath)) {
        note('quota', 'the GET health-check path in api/fish-i.js reaches generateContent, ' +
          'which is the only thing that costs quota');
      }
    }

    // The authorization control itself. An endpoint that quietly passes
    // everything when it is misconfigured is worse than none, because it reads
    // as protection - so this checks it fails CLOSED.
    const post = postAt === -1 ? '' : api.slice(postAt);
    if (!post) {
      note('quota', 'cannot find the POST path in api/fish-i.js to verify its auth check');
    } else {
      if (!post.includes('directorFromToken(')) {
        note('quota', 'the POST path in api/fish-i.js no longer checks who is asking - ' +
          'the endpoint is open again, and its path ships in index.html');
      }
      if (!/if \(!authConfigured\(\)\) \{[\s\S]{0,400}?send\(res, 503/.test(post)) {
        note('quota', 'api/fish-i.js no longer fails closed when it cannot check who is ' +
          'asking, so a missing env var silently reopens the endpoint');
      }
      if (!/who\.ok/.test(post)) {
        note('quota', 'api/fish-i.js calls directorFromToken but does not act on the answer');
      }
    }
    // authConfigured is what every refusal above hangs off. Hard-coding it true
    // is the only shape in this file that could plausibly reopen the endpoint,
    // so it is checked structurally: nothing else can see inside it.
    const cfg = (api.match(/function authConfigured\(\)\s*\{([\s\S]*?)\n\}/) || ['', ''])[1];
    if (!cfg) {
      note('quota', 'authConfigured is gone from api/fish-i.js');
    } else if (!cfg.includes('AUTH_URL') || !cfg.includes('AUTH_KEY')) {
      note('quota', 'authConfigured no longer checks for both SUPABASE_URL and ' +
        'SUPABASE_ANON_KEY, so an unconfigured server would report itself able to ' +
        'check callers it has no way to check');
    }

    // app_metadata is the only place the claim may be read from: a client can
    // write its own user_metadata, so reading that would let anyone declare
    // themselves the director.
    const claim = (api.match(/function directorClaim\([^)]*\)\s*\{([\s\S]*?)\n\}/) || ['', ''])[1];
    if (!claim) {
      note('quota', 'directorClaim is gone from api/fish-i.js');
    } else {
      if (!claim.includes('app_metadata')) {
        note('quota', 'directorClaim no longer reads app_metadata');
      }
      if (claim.includes('user_metadata')) {
        note('quota', 'directorClaim reads user_metadata, which a client can write - ' +
          'anyone could declare themselves the director');
      }
    }

    // Free-tier quotas are per MODEL. Treating one spent model as the whole
    // key turns "the newest model is busy" into "Fish-I is down until
    // tomorrow" with four untouched models sitting there.
    const retry = (api.match(/function isRetryableModelStatus\([^)]*\)\s*\{([\s\S]*?)\n\}/) || ['', ''])[1];
    if (!retry) {
      note('quota', 'api/fish-i.js has no isRetryableModelStatus');
    } else if (!/\b429\b/.test(retry)) {
      note('quota', 'a 429 no longer moves to the next model in api/fish-i.js, but Gemini ' +
        'free-tier quotas are per model - one model’s spent allowance is not the key’s');
    }
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
