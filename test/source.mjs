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

// Pull one local asset out of the page by the tag that loads it.
function follow(html, dir, re, what) {
  const m = html.match(re);
  if (!m) {
    throw new Error(`index.html no longer has ${what} - the tests are reading a ` +
      `page that does not load the code they are about to check`);
  }
  const file = path.join(dir, m[1].replace(/^\//, ''));
  if (!fs.existsSync(file)) {
    throw new Error(`index.html loads ${m[1]} but ${file} does not exist`);
  }
  return fs.readFileSync(file, 'utf8');
}

// Everything a test might want to read, loaded from one page.
export function loadSource(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const dir = path.dirname(htmlPath);

  const script = follow(html, dir, /<script src="(\/app\/[^"]+\.js)"><\/script>/,
    'a <script src="/app/...js"> tag');
  const style = follow(html, dir, /<link rel="stylesheet" href="(\/app\/[^"]+\.css)">/,
    'a <link> to /app/...css');

  return {
    html,                    // the page: markup, and nothing executable
    script,                  // the application
    style,                   // the application's stylesheet
    // Both together, for the checks that ask "does this appear anywhere in the
    // source at all" - a palette colour, a remote origin - and do not care
    // which of the three files it turned up in.
    all: html + '\n' + style + '\n' + script
  };
}
