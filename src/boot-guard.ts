// The one failure the app cannot report about itself.
//
// WHY THIS FILE EXISTS
// Every error handler LiveWire has - the boot-error banner, the window 'error'
// and 'unhandledrejection' catchers - lives inside app/livewire.js. That was
// fine while the application was an inline block in index.html, because the
// reporter and the page arrived together or not at all.
//
// They are separate files now. If livewire.js alone fails to arrive - a 404
// after a bad deploy, a syntax error, an offline phone whose service worker
// never cached it - the page still renders every screen's static markup,
// including the home screen. So it does not look broken. It looks like the app,
// and then nothing happens when you touch it, and it says nothing about why.
// That is worse than a blank screen, because a blank screen at least tells you
// something is wrong.
//
// This file loads BEFORE livewire.js and does one thing: if the application
// never started, say so in one plain sentence with a button that retries.
//
// It deliberately has no dependencies, touches no app code, and styles itself
// through element.style rather than a style attribute or a stylesheet - it has
// to work when livewire.css did not arrive either, and it must not need
// 'unsafe-inline' to keep working when style-src is tightened.
(function () {
  'use strict';

  // How long to wait after the page finishes loading before deciding the
  // application is not coming. Generous: an old phone on a cold cache is slow,
  // and a false alarm here would cover a working app.
  var GRACE_MS = 2500;
  // A backstop for the case where 'load' never fires at all, because some other
  // subresource is hanging.
  var BACKSTOP_MS = 12000;

  var decided = false;
  var failedSrc = null;

  // Resource load failures do not bubble, but they do reach a capture-phase
  // listener on window. This is how we can tell "the file never arrived" from
  // "the file arrived and did not run", which are different sentences.
  window.addEventListener('error', function (e) {
    var el = e.target as HTMLScriptElement | null;
    if (el && (el as any) !== window && el.tagName === 'SCRIPT' && el.src) failedSrc = el.src;
  }, true);

  function check() {
    if (decided) return;

    // livewire.js sets this on its first line. Present means the file arrived
    // and began running, so anything that went wrong after that is the app's
    // own reporter to handle, not ours.
    if (window.__livewireStarted) return;

    // The app is already saying something. Two messages is worse than one.
    if (document.getElementById('boot-error')) return;

    decided = true;
    show();
  }

  function show() {
    var body = document.body || document.documentElement;

    // Cover the screen. The static markup underneath looks like a working app
    // and is not one; leaving it visible and tappable is the whole problem.
    var sheet = document.createElement('div');
    sheet.id = 'boot-guard';
    sheet.setAttribute('role', 'alert');
    var s = sheet.style;
    s.position = 'fixed';
    s.top = '0'; s.left = '0'; s.right = '0'; s.bottom = '0';
    s.zIndex = '2147483647';
    s.background = '#F1ECE0';
    s.color = '#16201F';
    s.font = '16px/1.5 system-ui, -apple-system, sans-serif';
    s.padding = '28px 22px';
    s.overflowY = 'auto';
    // Keeps the text clear of the notch and the home bar on a phone.
    s.paddingTop = 'calc(28px + env(safe-area-inset-top, 0px))';
    s.paddingBottom = 'calc(28px + env(safe-area-inset-bottom, 0px))';

    var rule = document.createElement('div');
    rule.style.height = '4px';
    rule.style.width = '44px';
    rule.style.background = '#A3372A';
    rule.style.marginBottom = '20px';
    sheet.appendChild(rule);

    var head = document.createElement('p');
    head.textContent = 'LiveWire did not finish loading.';
    head.style.margin = '0 0 12px';
    head.style.fontSize = '19px';
    head.style.fontWeight = '600';
    sheet.appendChild(head);

    var body1 = document.createElement('p');
    body1.textContent = failedSrc
      // The file genuinely did not arrive.
      ? 'Part of the app did not arrive, so nothing on this screen will work yet. ' +
        'Try again somewhere with signal.'
      // It arrived and never ran, or never got as far as starting.
      : 'The screen below is only a picture until it starts, so nothing on it ' +
        'will work yet. Try again somewhere with signal.';
    body1.style.margin = '0 0 22px';
    sheet.appendChild(body1);

    var again = document.createElement('button');
    again.type = 'button';
    again.textContent = 'Try again';
    var b = again.style;
    b.font = 'inherit';
    b.fontWeight = '600';
    b.color = '#FBF9F3';
    b.background = '#24404D';
    b.border = '0';
    b.borderRadius = '4px';
    // Comfortably bigger than the 44px minimum touch target, for cold hands.
    b.padding = '14px 22px';
    b.minHeight = '48px';
    b.cursor = 'pointer';
    again.addEventListener('click', function () { location.reload(); });
    sheet.appendChild(again);

    var last = document.createElement('p');
    last.textContent = 'If it keeps happening, close the app completely and open ' +
      'it again. Tell the director if that does not clear it - nothing you have ' +
      'already filed is lost.';
    last.style.margin = '22px 0 0';
    last.style.fontSize = '14px';
    last.style.opacity = '0.75';
    sheet.appendChild(last);

    body.appendChild(sheet);
  }

  if (document.readyState === 'complete') {
    setTimeout(check, GRACE_MS);
  } else {
    window.addEventListener('load', function () { setTimeout(check, GRACE_MS); });
  }
  setTimeout(check, BACKSTOP_MS);
})();
