const qs = s => document.querySelector(s);
const qsa = s => [...document.querySelectorAll(s)];

let screens = {};
let els = {};
let history = [];
let inflight = null;

function initElements() {
  screens = {
    onboarding: qs('#screen-onboarding'),
    chat: qs('#screen-chat')
  };

  els = {
    create: qs('#btn-create'),
    back: qs('#btn-back'),
    exit: qs('#btn-exit'),
    messages: qs('#messages'),
    composer: qs('#composer'),
    input: qs('#input'),
    sendBtn: qs('#sendBtn'),
    overlay: qs('#loadingOverlay'),
    overlayClose: qs('#overlayClose'),
    btnStop: qs('#btnStop')
  };

  history = loadHistory();
}

function showScreen(name){
  for (const k in screens) screens[k].hidden = true;
  screens[name].hidden = false;
}

function addMessage(role, text){
  const wrap = document.createElement('div');
  wrap.className = `message ${role}`;
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;
  wrap.appendChild(bubble);
  els.messages.appendChild(wrap);
  scrollToBottom();
}

function scrollToBottom(){
  requestAnimationFrame(() => {
    els.messages.scrollTop = els.messages.scrollHeight;
    window.scrollTo({ top: document.body.scrollHeight });
  });
}

function saveHistory(){
  try { localStorage.setItem('ai.chat.history', JSON.stringify(history)); } catch {}
}
function loadHistory(){
  try {
    const raw = localStorage.getItem('ai.chat.history');
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function hydrateFromHistory(){
  els.messages.innerHTML = '';
  for (const turn of history) {
    const role = turn.role === 'assistant' || turn.role === 'model' ? 'ai' : 'user';
    addMessage(role, turn.text);
  }
}

function setLoading(state){
  if (state) {
    els.overlay.hidden = false;
    els.sendBtn.disabled = true;
    els.input.disabled = true;
  } else {
    els.overlay.hidden = true;
    els.sendBtn.disabled = false;
    els.input.disabled = false;
    els.input.focus();
  }
}

async function sendToGemini(message){
  const controller = new AbortController();
  inflight = controller;

  const body = JSON.stringify({ message, history });
  const resp = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal: controller.signal
  });

  if (!resp.ok) {
    const details = await resp.text().catch(() => '');
    throw new Error(`API ${resp.status}: ${details || 'Request failed'}`);
  }
  const data = await resp.json();
  inflight = null;
  return data.text || '';
}

function autosizeTextarea(){
  els.input.style.height = 'auto';
  els.input.style.height = Math.min(140, els.input.scrollHeight) + 'px';
}

function stopRequest() {
  if (inflight) {
    inflight.abort();
    inflight = null;
  }
  setLoading(false);
}

document.addEventListener('DOMContentLoaded', () => {
  initElements();

  autosizeTextarea();
  if (history.length) {
    showScreen('chat');
    hydrateFromHistory();
  } else {
    showScreen('onboarding');
  }

  els.input.addEventListener('input', autosizeTextarea);

  els.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      els.composer.requestSubmit();
    }
  });

  els.composer.addEventListener('submit', async (e) => {
    e.preventDefault();
    const message = els.input.value.trim();
    if (!message || els.sendBtn.disabled) return;

    addMessage('user', message);
    history.push({ role: 'user', text: message });
    saveHistory();

    els.input.value = '';
    autosizeTextarea();
    setLoading(true);

    try {
      const reply = await sendToGemini(message);
      if (reply) {
        addMessage('ai', reply);
        history.push({ role: 'assistant', text: reply });
        saveHistory();
      } else {
        addMessage('ai', 'Hmm, I couldn't generate a reply. Try again?');
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        addMessage('ai', 'Request stopped.');
      } else {
        console.error(err);
        addMessage('ai', 'Sorry, something went wrong connecting to the AI.');
      }
    } finally {
      setLoading(false);
      inflight = null;
    }
  });

  els.create.addEventListener('click', () => {
    showScreen('chat');
    if (history.length === 0) {
      const welcome = "Hi! I'm your AI Companion. Ask me anything — I'll help in a friendly, concise way.";
      addMessage('ai', welcome);
      history.push({ role: 'assistant', text: welcome });
      saveHistory();
    }
    setTimeout(() => els.input.focus(), 100);
  });

  els.back.addEventListener('click', () => {
    if (window.history.length > 1) {
      window.history.back();
    }
  });

  els.exit.addEventListener('click', () => {
    showScreen('onboarding');
  });

  els.overlayClose.addEventListener('click', stopRequest);
  els.btnStop.addEventListener('click', stopRequest);
});

window.addEventListener('resize', scrollToBottom);
