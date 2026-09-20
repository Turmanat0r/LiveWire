// Where LiveWire's source actually lives, for the two test files that read it.
//
// WHY THIS FILE EXISTS
// It used to be one file. Both test files pulled the application out of
// index.html with `src.match(/<script>([\s\S]*)<\/script>/)`, and the stylesheet
// the same way, because there was nothing else to do in a single-file app.
//
// The Content-Security-Policy ended that. A browser cannot tell an inline block
// from one injected through a chat message or an angler's handle, so keeping
// `script-src 'unsafe-inline'` meant the policy blocked nothing worth blocking.
// The stylesheet and the whole application moved to /app/ and the regexes had
// nothing left to match.
//
// This is the one place that knows where they went. Two copies of that
// knowledge, one per test file, is exactly the kind of thing that goes stale on
// one side only and is never noticed.
//
// IT FOLLOWS THE PAGE RATHER THAN ASSUMING THE PATHS. The filenames are read
// out of the actual <script src> and <link href> in index.html, so renaming a
// file and forgetting a test fails here, loudly, naming the file. The
// alternative - hardcoding './app/livewire.js' - would hand the tests an empty
// string and let 1,394 assertions pass against nothing, which is the failure
// this project has already had once.
import fs from 'fs';
import path from 'path';

function read(dir, ref, what) {
  const file = path.join(dir, ref.replace(/^\//, ''));
  if (!fs.existsSync(file)) {
    throw new Error(`index.html loads ${ref} but ${file} does not exist`);
  }
  return fs.readFileSync(file, 'utf8');
}

// Everything a test might want to read, loaded from one page.
export function loadSource(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const dir = path.dirname(htmlPath);
  // src/ sits beside the page rather than inside the folder it is served from.
  const root = path.dirname(htmlPath);

  // Every script of ours the page loads, in document order.
  //
  // THE ORDER MATTERS AND IT IS NOT ARBITRARY. app/boot-guard.js is deliberately
  // loaded before the application, because it exists to notice when the
  // application never arrives - every error handler LiveWire has lives inside
  // livewire.js, which makes livewire.js the one file that cannot report its own
  // failure. So the guard is always first and the application is always last.
  //
  // Taking the FIRST match here is what this file did for about ten minutes,
  // and it handed every check the guard instead of the app: thirty-six findings
  // saying the entire application was gone. Loud, which is the point, but the
  // rule is the last one.
  const refs = [...html.matchAll(/<script src="(\/app\/[^"]+\.js)"><\/script>/g)].map((m) => m[1]);
  if (!refs.length) {
    throw new Error('index.html loads no script from /app/ - the tests are reading ' +
      'a page that does not load the code they are about to check');
  }
  const appRef = refs[refs.length - 1];

  const styleRef = (html.match(/<link rel="stylesheet" href="(\/app\/[^"]+\.css)">/) || [])[1];
  if (!styleRef) {
    throw new Error('index.html no longer links a stylesheet from /app/');
  }

  // What ships, and what a person wrote. They are not the same file any more.
  //
  // The compiler re-prints the whole thing from its own syntax tree, so the
  // served JavaScript is reindented and reshaped: `function(){` comes out as
  // `function () {`. That is cosmetic, but it matters here, because the two
  // test files want different halves of it.
  //
  // events.test.mjs EXECUTES the app, so it has to be handed the build output.
  // Running the .ts would be testing something no phone will ever run.
  //
  // lint.mjs GREPS the app for structure, so it has to be handed the source.
  // Its patterns are written against the formatting a person chose, and
  // pointing them at the compiler's formatting made twenty-seven of them
  // report that the functions they check had been deleted.
  const compiled = read(dir, appRef, 'the application');
  const written = read(root, 'src/' + appRef.slice('/app/'.length).replace(/\.js$/, '.ts'),
    'the application source');
  const style = read(dir, styleRef, 'the stylesheet');
  // The guard and anything else alongside it. Not part of the application,
  // because a function the guard happens to define is not the app having it.
  const others = refs.slice(0, -1).map((r) => read(dir, r, 'a script')).join('\n');

  return {
    html,                    // the page: markup, and nothing executable
    script: compiled,        // the application as it ships and actually runs
    written,                 // the TypeScript it is built from
    style,                   // the application's stylesheet
    others,                  // every other script of ours the page loads
    refs,                    // their paths, in load order
    // Everything together, for the checks that ask "does this appear anywhere
    // in the source at all" - a palette colour, a remote origin - and do not
    // care which file it turned up in.
    all: [html, style, others, written].join('\n')
  };
}
