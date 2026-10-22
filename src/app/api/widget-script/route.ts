export const dynamic = 'force-static'

// Embed: <script src="https://YOUR_APP/widget.js" data-slug="acme-dental" async></script>
const SCRIPT = `(() => {
  const s = document.currentScript; if (!s) return;
  const slug = s.dataset.slug; const origin = new URL(s.src).origin; if (!slug) return;
  const LABEL = '\\u{1F399} Talk to us';
  const btn = document.createElement('button');
  btn.textContent = LABEL; btn.setAttribute('aria-label', 'Start voice chat');
  btn.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483647;padding:14px 20px;border:0;border-radius:999px;background:#0d7377;color:#fff;font:600 15px system-ui;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.25)';
  document.body.appendChild(btn);
  let ws, stream, context, source, processor, callId, token, started = 0, transcript = [], playbackAt = 0, agentSpeaking = false;
  const finish = () => {
    if (!callId) return;
    callId = null;
  };
  const stop = () => {
    try { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'stop' })); ws && ws.close(); processor && processor.disconnect(); source && source.disconnect(); stream && stream.getTracks().forEach(t => t.stop()); context && context.close(); } catch (e) {}
    finish(); ws = context = stream = processor = source = null; btn.textContent = LABEL;
  };
  const base64 = (bytes) => { let value = ''; for (let i = 0; i < bytes.length; i++) value += String.fromCharCode(bytes[i]); return btoa(value); };
  const play = (message) => {
    const bytes = Uint8Array.from(atob(message.pcm), c => c.charCodeAt(0));
    const samples = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
    const audio = context.createBuffer(1, samples.length, message.sampleRate);
    const channel = audio.getChannelData(0);
    for (let i = 0; i < samples.length; i++) channel[i] = samples[i] / 32768;
    const node = context.createBufferSource(); node.buffer = audio; node.connect(context.destination);
    playbackAt = Math.max(playbackAt, context.currentTime + 0.03); node.start(playbackAt); playbackAt += audio.duration;
  };
  btn.onclick = async () => {
    if (ws) return stop();
    btn.textContent = 'Connecting...';
    try {
      const r = await fetch(origin + '/api/realtime/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || 'unavailable');
      callId = j.callId; token = j.token; transcript = []; started = Date.now();
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      context = new AudioContext({ sampleRate: 16000 }); await context.resume(); playbackAt = 0;
      ws = new WebSocket(j.gatewayUrl);
      ws.onopen = () => { ws.send(JSON.stringify({ type: 'start', callId, token })); btn.textContent = 'End call'; };
      ws.onmessage = (event) => {
        const m = JSON.parse(event.data);
        if (m.type === 'transcript') transcript.push({ role: m.role === 'caller' ? 'caller' : 'agent', text: m.text });
        if (m.type === 'audio') play(m);
        if (m.type === 'speaking') agentSpeaking = Boolean(m.value);
        if (m.type === 'error') btn.textContent = 'Audio unavailable';
      };
      ws.onerror = () => { btn.textContent = 'Connection failed'; };
      ws.onclose = () => { if (ws) stop(); };
      source = context.createMediaStreamSource(stream);
      processor = context.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (event) => {
        if (!ws || ws.readyState !== WebSocket.OPEN || agentSpeaking || context.currentTime < playbackAt) return;
        const input = event.inputBuffer.getChannelData(0), ratio = context.sampleRate / 16000;
        const output = new Int16Array(Math.floor(input.length / ratio));
        for (let i = 0; i < output.length; i++) output[i] = Math.max(-1, Math.min(1, input[Math.floor(i * ratio)])) * 32767;
        ws.send(JSON.stringify({ type: 'audio', pcm: base64(new Uint8Array(output.buffer)) }));
      };
      source.connect(processor); processor.connect(context.destination);
    } catch (e) { btn.textContent = 'Unavailable'; setTimeout(() => (btn.textContent = LABEL), 2500); finish(); }
  };
  window.addEventListener('pagehide', finish);
})();`

export function GET() {
  return new Response(SCRIPT, { headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=300' } })
}
