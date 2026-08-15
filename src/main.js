const DB_NAME = 'chat-notes-db';
const STORE = 'app-state';
const KEY = 'state';
const DEFAULT_THEME = '#5b6ee1';
const uid = (prefix) => `${prefix}_${crypto.randomUUID()}`;
const now = () => new Date().toISOString();
const initialState = { version: 1, settings: { themeColor: DEFAULT_THEME, userAvatar: '', persistentStorage: 'unknown' }, conversations: [], messages: [] };
let state = structuredClone(initialState);
let activeId = '';
let editingId = '';

function openDb() { return new Promise((resolve, reject) => { const request = indexedDB.open(DB_NAME, 1); request.onupgradeneeded = () => request.result.createObjectStore(STORE); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
async function loadState() { const db = await openDb(); return new Promise((resolve) => { const tx = db.transaction(STORE, 'readonly'); const req = tx.objectStore(STORE).get(KEY); req.onsuccess = () => resolve(req.result || structuredClone(initialState)); req.onerror = () => resolve(structuredClone(initialState)); }); }
async function saveState() { const db = await openDb(); return new Promise((resolve, reject) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(state, KEY); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); }
function persist() { document.documentElement.style.setProperty('--theme', state.settings.themeColor); document.querySelector('meta[name="theme-color"]')?.setAttribute('content', state.settings.themeColor); saveState(); render(); }
function readFileAsDataUrl(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); }); }
function downloadJson(filename, data) { const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url); }
function monthBounds(month) { const [year, index] = month.split('-').map(Number); return { from: new Date(Date.UTC(year, index - 1, 1)).toISOString(), to: new Date(Date.UTC(year, index, 1)).toISOString() }; }
function monthsBetween(from, to) { const out = []; const cur = new Date(`${from}-01T00:00:00Z`); const end = new Date(`${to}-01T00:00:00Z`); while (cur <= end) { out.push(cur.toISOString().slice(0, 7)); cur.setUTCMonth(cur.getUTCMonth() + 1); } return out; }
function exportPayload(conversations, messages, range = null) { return { exportedAt: now(), app: 'Chat Notes', version: state.version, range, conversations: conversations.map((conv) => ({ ...conv, messages: messages.filter((m) => m.conversationId === conv.id) })) }; }
const esc = (s = '') => s.replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
const active = () => state.conversations.find((c) => c.id === activeId);
const activeMessages = () => state.messages.filter((m) => m.conversationId === activeId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

function createConversation() { const conv = { id: uid('conv'), title: 'New record', avatar: '', createdAt: now(), updatedAt: now() }; state.conversations.unshift(conv); activeId = conv.id; persist(); }
function sendMessage() { const input = document.querySelector('#draft'); const text = input.value.trim(); if (!text || !activeId) return; state.messages.push({ id: uid('msg'), conversationId: activeId, author: 'me', content: text, createdAt: now() }); const conv = active(); if (conv) conv.updatedAt = now(); input.value = ''; persist(); }
function exportConversation(months = []) { const conv = active(); if (!conv) return; let messages = activeMessages(); let range = null; if (months.length) { const ranges = months.map(monthBounds); messages = messages.filter((m) => ranges.some((r) => m.createdAt >= r.from && m.createdAt < r.to)); range = { months, from: ranges[0].from, to: ranges.at(-1).to }; } downloadJson(`${conv.title.replace(/\W+/g, '-') || 'conversation'}-export.json`, exportPayload([conv], messages, range)); }

function render() {
  const conv = active();
  document.querySelector('#root').innerHTML = `<main class="app"><aside class="sidebar"><header><h1>Chat Notes</h1><button data-action="new">＋</button></header><section class="settings-card"><label>Theme <input id="theme" type="color" value="${esc(state.settings.themeColor)}"></label><label class="avatar-upload">Me ${state.settings.userAvatar ? `<img src="${state.settings.userAvatar}" alt="Me">` : ''}<input id="userAvatar" type="file" accept="image/*"></label><small>Storage: ${esc(state.settings.persistentStorage)}</small><button data-action="backup">Export backup</button><button data-action="import">Import backup</button><input hidden id="importFile" type="file" accept="application/json"></section><nav>${state.conversations.map((c) => `<button class="conv ${c.id === activeId ? 'active' : ''}" data-id="${c.id}">${c.avatar ? `<img src="${c.avatar}" alt="">` : `<span>${esc(c.title[0] || 'C')}</span>`}<b>${esc(c.title)}</b><small>${esc((state.messages.filter((m) => m.conversationId === c.id).at(-1)?.content) || 'No messages yet')}</small></button>`).join('')}</nav></aside><section class="chat">${conv ? chatHtml(conv) : emptyHtml()}</section>${editingId ? editHtml() : ''}</main>`;
}
function emptyHtml() { return `<div class="empty"><h2>Create a conversation</h2><p>Use lightweight chats for workouts, spending, moods, or anything else.</p><button data-action="new">New conversation</button></div>`; }
function chatHtml(conv) { const month = new Date().toISOString().slice(0, 7); return `<header class="chat-head"><button class="mobile-back" data-action="back">‹</button>${conv.avatar ? `<img src="${conv.avatar}" alt="">` : `<span>${esc(conv.title[0] || 'C')}</span>`}<input id="title" value="${esc(conv.title)}"><button data-action="avatar">Avatar</button><input hidden id="convAvatar" type="file" accept="image/*"><button data-action="exportAll">Export all</button><details><summary>Export months</summary><label>From <input id="fromMonth" type="month" value="${month}"></label><label>To <input id="toMonth" type="month" value="${month}"></label><button data-action="exportMonths">Download</button></details><button class="danger" data-action="deleteConv">Delete</button></header><div class="messages">${activeMessages().map((m) => `<article class="bubble ${esc(m.author)}"><p>${esc(m.content)}</p><time>${new Date(m.createdAt).toLocaleString()}</time><menu><button data-edit="${m.id}">Edit</button><button data-delete="${m.id}">Delete</button></menu></article>`).join('')}</div><footer class="composer"><textarea id="draft" placeholder="Type a note… emoji welcome 🙂"></textarea><button data-action="send">Send</button></footer>`; }
function editHtml() { const msg = state.messages.find((m) => m.id === editingId); return `<dialog open><textarea id="editText">${esc(msg?.content || '')}</textarea><div><button data-action="cancelEdit">Cancel</button><button data-action="saveEdit">Save</button></div></dialog>`; }

document.addEventListener('click', async (event) => {
  const action = event.target.dataset.action;
  const id = event.target.dataset.id;
  if (id) { activeId = id; render(); return; }
  if (event.target.dataset.edit) { editingId = event.target.dataset.edit; render(); return; }
  if (event.target.dataset.delete) { state.messages = state.messages.filter((m) => m.id !== event.target.dataset.delete); persist(); return; }
  if (action === 'new') createConversation();
  if (action === 'back') { activeId = ''; render(); }
  if (action === 'send') sendMessage();
  if (action === 'backup') downloadJson('chat-notes-backup.json', { exportedAt: now(), ...state });
  if (action === 'import') document.querySelector('#importFile').click();
  if (action === 'avatar') document.querySelector('#convAvatar').click();
  if (action === 'exportAll') exportConversation();
  if (action === 'exportMonths') exportConversation(monthsBetween(document.querySelector('#fromMonth').value, document.querySelector('#toMonth').value));
  if (action === 'deleteConv' && confirm('Delete this conversation?')) { state.conversations = state.conversations.filter((c) => c.id !== activeId); state.messages = state.messages.filter((m) => m.conversationId !== activeId); activeId = state.conversations[0]?.id || ''; persist(); }
  if (action === 'cancelEdit') { editingId = ''; render(); }
  if (action === 'saveEdit') { const msg = state.messages.find((m) => m.id === editingId); if (msg) msg.content = document.querySelector('#editText').value; editingId = ''; persist(); }
});
document.addEventListener('change', async (event) => {
  if (event.target.id === 'theme') { state.settings.themeColor = event.target.value; persist(); }
  if (event.target.id === 'title') { const conv = active(); if (conv) conv.title = event.target.value; persist(); }
  if (event.target.id === 'userAvatar' && event.target.files[0]) { state.settings.userAvatar = await readFileAsDataUrl(event.target.files[0]); persist(); }
  if (event.target.id === 'convAvatar' && event.target.files[0]) { const conv = active(); if (conv) conv.avatar = await readFileAsDataUrl(event.target.files[0]); persist(); }
  if (event.target.id === 'importFile' && event.target.files[0]) { const imported = JSON.parse(await event.target.files[0].text()); if (!imported.conversations || !imported.messages) return alert('Invalid backup JSON'); state = { version: imported.version || 1, settings: { ...initialState.settings, ...(imported.settings || {}) }, conversations: imported.conversations, messages: imported.messages }; activeId = state.conversations[0]?.id || ''; persist(); }
});
document.addEventListener('keydown', (event) => { if (event.target.id === 'draft' && event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); } });

loadState().then((saved) => { state = saved; activeId = state.conversations[0]?.id || ''; render(); persist(); });
navigator.serviceWorker?.register('/sw.js');
navigator.storage?.persist?.().then((ok) => { state.settings.persistentStorage = ok ? 'granted' : 'best-effort'; persist(); });
