'use strict';
const KEY = 'renewly.v1';
const CATS = ['Entertainment', 'Music', 'Software', 'Cloud & Storage', 'News & Reading', 'Health & Fitness', 'Shopping', 'Utilities', 'Other'];
const COLORS = ['#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6', '#10b981', '#ef4444', '#0ea5e9', '#64748b'];
const CURRENCIES = ['USD', 'EUR', 'GBP', 'NOK', 'SEK', 'DKK', 'CAD', 'AUD', 'CHF', 'JPY', 'INR', 'BRL'];
const PER_MONTH = { weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 };
const CYCLE_LABEL = { weekly: 'week', monthly: 'month', quarterly: '3 months', yearly: 'year' };

const $ = (s) => document.querySelector(s);
let state = load();
let editingId = null;

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.subs)) return s;
  } catch (e) {}
  return { currency: guessCurrency(), subs: [] };
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { toast('Could not save – browser storage is blocked'); }
}
function guessCurrency() {
  const l = (navigator.language || 'en-US').toUpperCase();
  if (/-NO|^NB|^NN/.test(l)) return 'NOK';
  if (/-GB/.test(l)) return 'GBP';
  if (/-SE/.test(l)) return 'SEK';
  if (/-DK/.test(l)) return 'DKK';
  if (/-(DE|FR|ES|IT|NL|IE|FI|AT|PT)/.test(l)) return 'EUR';
  return 'USD';
}

const money = (n) => new Intl.NumberFormat(undefined, { style: 'currency', currency: state.currency, maximumFractionDigits: n >= 100 ? 0 : 2 }).format(n);
const monthly = (s) => s.price * PER_MONTH[s.cycle];

function parseDate(str) { const [y, m, d] = str.split('-').map(Number); return new Date(y, m - 1, d); }
function iso(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function today() { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); }
function advance(d, cycle) {
  const n = new Date(d);
  if (cycle === 'weekly') n.setDate(n.getDate() + 7);
  else {
    const day = n.getDate();
    n.setDate(1);
    n.setMonth(n.getMonth() + (cycle === 'monthly' ? 1 : cycle === 'quarterly' ? 3 : 12));
    n.setDate(Math.min(day, new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate()));
  }
  return n;
}
function nextRenewal(s) {
  let d = parseDate(s.next); const t = today();
  for (let i = 0; d < t && i < 5000; i++) d = advance(d, s.cycle);
  return d;
}
function daysUntil(d) { return Math.round((d - today()) / 864e5); }
function relative(d) {
  const n = daysUntil(d);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n < 14) return `in ${n} days`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const color = (cat) => COLORS[Math.max(0, CATS.indexOf(cat))];

function visible() {
  const q = $('#search').value.trim().toLowerCase();
  const cat = $('#filterCat').value;
  const arr = state.subs.filter((s) => (!q || (s.name + ' ' + (s.notes || '')).toLowerCase().includes(q)) && (!cat || s.category === cat));
  const by = $('#sort').value;
  const cmp = {
    renewal: (a, b) => (a.paused - b.paused) || (nextRenewal(a) - nextRenewal(b)),
    'cost-desc': (a, b) => monthly(b) - monthly(a),
    'cost-asc': (a, b) => monthly(a) - monthly(b),
    name: (a, b) => a.name.localeCompare(b.name),
  }[by];
  return arr.sort(cmp);
}

function render() {
  const active = state.subs.filter((s) => !s.paused);
  const m = active.reduce((t, s) => t + monthly(s), 0);
  $('#statMonth').textContent = money(m);
  $('#statYear').textContent = money(m * 12);
  $('#statCount').textContent = active.length;
  const upcoming = active.map((s) => ({ s, d: nextRenewal(s) })).sort((a, b) => a.d - b.d);
  if (upcoming.length) {
    $('#statNext').textContent = relative(upcoming[0].d);
    $('#statNextSub').textContent = `${upcoming[0].s.name} · ${money(upcoming[0].s.price)}`;
  } else { $('#statNext').textContent = '–'; $('#statNextSub').textContent = ''; }

  // list
  const rows = visible();
  $('#empty').hidden = state.subs.length > 0;
  $('.toolbar').hidden = state.subs.length === 0;
  $('#list').innerHTML = rows.map((s) => {
    const d = nextRenewal(s), n = daysUntil(d);
    const soon = !s.paused && n <= 7;
    return `<li class="item ${s.paused ? 'paused' : ''}" tabindex="0" data-id="${s.id}" role="button" aria-label="Edit ${esc(s.name)}">
      <div class="avatar" style="background:${color(s.category)}">${esc(s.name.trim()[0] || '?').toUpperCase()}</div>
      <div><div class="name">${esc(s.name)}${s.paused ? '<span class="badge">Paused</span>' : soon ? `<span class="badge soon">${relative(d)}</span>` : ''}</div>
        <div class="meta">${esc(s.category)} · renews ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}${s.notes ? ' · ' + esc(s.notes) : ''}</div></div>
      <div class="price">${money(s.price)}<small>/ ${CYCLE_LABEL[s.cycle]}${s.cycle !== 'monthly' ? ` · ${money(monthly(s))}/mo` : ''}</small></div></li>`;
  }).join('');
  if (state.subs.length && !rows.length) $('#list').innerHTML = '<li class="none" style="padding:16px 6px">No matches.</li>';

  // upcoming
  const soon = upcoming.filter((u) => daysUntil(u.d) <= 30);
  $('#upcoming').innerHTML = soon.length ? soon.map((u) => `<li><span>${esc(u.s.name)}<br><span class="when">${relative(u.d)}</span></span><strong>${money(u.s.price)}</strong></li>`).join('') : '<li class="none">No renewals in the next 30 days.</li>';

  // breakdown
  const totals = {};
  active.forEach((s) => (totals[s.category] = (totals[s.category] || 0) + monthly(s)));
  const ent = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  $('#breakdown').innerHTML = ent.length ? ent.map(([c, v]) => `<div class="bar-row"><div class="top"><span>${esc(c)}</span><span>${money(v)}/mo</span></div><div class="track"><div class="fill" style="width:${(v / m) * 100}%;background:${color(c)}"></div></div></div>`).join('') : '<p class="none">Add a subscription to see where your money goes.</p>';

  // filter options
  const sel = $('#filterCat'), cur = sel.value;
  sel.innerHTML = '<option value="">All categories</option>' + [...new Set(state.subs.map((s) => s.category))].map((c) => `<option>${esc(c)}</option>`).join('');
  sel.value = [...sel.options].some((o) => o.value === cur) ? cur : '';
}

// dialog
const dlg = $('#dlg'), form = $('#form');
function openDialog(id) {
  editingId = id || null;
  const s = state.subs.find((x) => x.id === id);
  form.reset();
  $('#dlgTitle').textContent = s ? 'Edit subscription' : 'Add subscription';
  $('#deleteBtn').hidden = !s;
  if (s) {
    form.name.value = s.name; form.price.value = s.price; form.cycle.value = s.cycle;
    form.next.value = iso(nextRenewal(s)); form.category.value = s.category; form.notes.value = s.notes || ''; form.paused.checked = !!s.paused;
  } else form.next.value = iso(advance(today(), 'monthly'));
  dlg.showModal();
  form.name.focus();
}
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const price = parseFloat(form.price.value);
  if (!form.name.value.trim() || !(price >= 0)) return;
  const data = { name: form.name.value.trim(), price, cycle: form.cycle.value, next: form.next.value, category: form.category.value, notes: form.notes.value.trim(), paused: form.paused.checked };
  if (editingId) Object.assign(state.subs.find((x) => x.id === editingId), data);
  else state.subs.push({ id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()), ...data });
  save(); dlg.close(); render(); toast(editingId ? 'Saved' : 'Added');
});
$('#cancelBtn').onclick = () => dlg.close();
$('#deleteBtn').onclick = () => {
  const s = state.subs.find((x) => x.id === editingId);
  if (s && confirm(`Delete ${s.name}?`)) { state.subs = state.subs.filter((x) => x !== s); save(); dlg.close(); render(); toast('Deleted'); }
};
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

// list interactions
$('#list').addEventListener('click', (e) => { const li = e.target.closest('.item'); if (li) openDialog(li.dataset.id); });
$('#list').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { const li = e.target.closest('.item'); if (li) { e.preventDefault(); openDialog(li.dataset.id); } } });
['#search', '#filterCat', '#sort'].forEach((s) => $(s).addEventListener('input', render));
$('#addBtn').onclick = () => openDialog();
$('#emptyAdd').onclick = () => openDialog();
$('#currency').addEventListener('change', (e) => { state.currency = e.target.value; save(); render(); });

$('#demoBtn').onclick = () => {
  const t = today(), at = (n) => iso(new Date(t.getFullYear(), t.getMonth(), t.getDate() + n));
  const demo = [['Netflix', 15.99, 'monthly', 3, 'Entertainment'], ['Spotify', 11.99, 'monthly', 12, 'Music'], ['iCloud+', 2.99, 'monthly', 20, 'Cloud & Storage'], ['Adobe Creative Cloud', 59.99, 'monthly', 6, 'Software'], ['Gym', 39, 'monthly', 25, 'Health & Fitness'], ['Amazon Prime', 139, 'yearly', 90, 'Shopping']];
  demo.forEach(([name, price, cycle, n, category]) => state.subs.push({ id: crypto.randomUUID(), name, price, cycle, next: at(n), category, notes: '', paused: false }));
  save(); render();
};

// data menu
const menu = $('#menu');
$('#menuBtn').onclick = (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; };
document.addEventListener('click', () => (menu.hidden = true));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') menu.hidden = true; });
menu.addEventListener('click', (e) => {
  const act = e.target.dataset.act; if (!act) return;
  if (act === 'csv') {
    const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [['Name', 'Price', 'Currency', 'Billing', 'Monthly cost', 'Next renewal', 'Category', 'Status', 'Notes'].join(',')].concat(
      state.subs.map((s) => [q(s.name), s.price, state.currency, s.cycle, monthly(s).toFixed(2), iso(nextRenewal(s)), q(s.category), s.paused ? 'paused' : 'active', q(s.notes || '')].join(',')));
    download('subscriptions.csv', lines.join('\n'), 'text/csv');
  } else if (act === 'json') download('renewly-backup.json', JSON.stringify(state, null, 2), 'application/json');
  else if (act === 'import') $('#importFile').click();
  else if (act === 'clear' && confirm('Delete all subscriptions? This cannot be undone.')) { state.subs = []; save(); render(); }
});
$('#importFile').addEventListener('change', async (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!Array.isArray(d.subs)) throw 0;
    const subs = d.subs.filter((s) => s && typeof s.name === 'string' && isFinite(s.price) && PER_MONTH[s.cycle] && /^\d{4}-\d\d-\d\d$/.test(s.next))
      .map((s) => ({ id: String(s.id || crypto.randomUUID()), name: s.name.slice(0, 60), price: +s.price, cycle: s.cycle, next: s.next, category: CATS.includes(s.category) ? s.category : 'Other', notes: String(s.notes || '').slice(0, 120), paused: !!s.paused }));
    state = { currency: CURRENCIES.includes(d.currency) ? d.currency : state.currency, subs };
    save(); initCurrency(); render(); toast(`Restored ${subs.length} subscriptions`);
  } catch (err) { toast('That file is not a valid backup'); }
});
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
let tt;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 2200); }

function initCurrency() { $('#currency').innerHTML = CURRENCIES.map((c) => `<option ${c === state.currency ? 'selected' : ''}>${c}</option>`).join(''); }
form.category.innerHTML = CATS.map((c) => `<option>${c}</option>`).join('');
initCurrency();
render();
