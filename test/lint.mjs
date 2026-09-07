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
    const policy = setHeaders.get('Content-Security-Policy')
      || setHeaders.get('Content-Security-Policy-Report-Only') || '';
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
