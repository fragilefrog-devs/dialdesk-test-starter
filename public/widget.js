/*! DialDesk website voice widget. Usage: <script src="https://YOUR-APP/widget.js" data-token="TOKEN" async></script>
    Optional: data-label="Talk to us"  data-position="left|right" */
(function () {
  if (window.__dialdeskWidget) return;
  window.__dialdeskWidget = true;
  var s = document.currentScript;
  if (!s) return;
  var token = s.getAttribute('data-token');
  if (!token || !/^[a-f0-9]{32}$/.test(token)) return;
  var base = new URL(s.src).origin;
  var label = s.getAttribute('data-label') || 'Talk to us';
  var left = s.getAttribute('data-position') === 'left';

  var css = '.dd-btn,.dd-panel{position:fixed;bottom:16px;' + (left ? 'left' : 'right') + ':16px;z-index:2147483000;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}' +
    '.dd-btn{min-height:48px;padding:0 20px;border:0;border-radius:10px;background:#6657e8;color:#fff;font-size:16px;font-weight:600;cursor:pointer;box-shadow:0 6px 16px rgba(34,31,79,.14)}' +
    '.dd-btn:hover{background:#5546d6}.dd-btn:focus-visible,.dd-x:focus-visible{outline:2px solid #6657e8;outline-offset:2px}' +
    '.dd-panel{display:none;flex-direction:column;width:360px;max-width:calc(100vw - 32px);height:480px;max-height:calc(100vh - 32px);background:#fff;border:1px solid #e9ebf2;border-radius:15px;overflow:hidden;box-shadow:0 12px 32px rgba(34,31,79,.12)}' +
    '.dd-panel[data-open="true"]{display:flex;animation:dd-in .2s cubic-bezier(.16,1,.3,1)}' +
    '.dd-bar{display:flex;justify-content:flex-end;padding:4px;background:#fff}' +
    '.dd-x{min-height:44px;padding:0 12px;border:0;background:transparent;color:#626980;font-size:14px;cursor:pointer;border-radius:10px}' +
    '.dd-frame{flex:1;border:0;width:100%;background:#f6f7fb}' +
    '@keyframes dd-in{from{opacity:0;transform:translateY(8px)}}' +
    '@media (prefers-color-scheme:dark){.dd-panel,.dd-bar{background:#151728;border-color:#262944}.dd-x{color:#a3a8c0}.dd-frame{background:#0d0e1a}}' +
    '@media (prefers-reduced-motion:reduce){.dd-panel[data-open="true"]{animation:none}}';
  var style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  var btn = document.createElement('button');
  btn.className = 'dd-btn'; btn.type = 'button'; btn.textContent = label;
  btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', 'dd-panel');

  var panel = document.createElement('div');
  panel.className = 'dd-panel'; panel.id = 'dd-panel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Voice assistant');
  var bar = document.createElement('div'); bar.className = 'dd-bar';
  var x = document.createElement('button'); x.className = 'dd-x'; x.type = 'button'; x.textContent = 'Close';
  bar.appendChild(x); panel.appendChild(bar);

  var frame = null;
  function setOpen(open) {
    panel.setAttribute('data-open', open ? 'true' : 'false');
    btn.style.display = open ? 'none' : '';
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open && !frame) {
      frame = document.createElement('iframe');
      frame.className = 'dd-frame'; frame.title = 'Voice assistant';
      frame.setAttribute('allow', 'microphone'); frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
      frame.src = base + '/embed/' + token;
      panel.appendChild(frame);
    }
    // Closing destroys the frame, which ends any call in progress.
    if (!open && frame) { frame.remove(); frame = null; }
    (open ? x : btn).focus();
  }
  btn.addEventListener('click', function () { setOpen(true); });
  x.addEventListener('click', function () { setOpen(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && panel.getAttribute('data-open') === 'true') setOpen(false); });

  function mount() { document.body.appendChild(btn); document.body.appendChild(panel); }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
