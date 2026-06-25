let DATA = [];

// ─────────────────────────────────────────────
// CONFIGURACIÓN
// ─────────────────────────────────────────────
const JIRA_PROJECT = 'INC';
const MAX_RESULTS  = 100;


const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx4evhNErlug4gxhaAS7yrFw3NC0Pw75G4ts6Lbr45Fgf0D78ZJB25nxp3MHSO-ijU01g/exec';
// ─────────────────────────────────────────────

function updateTotalBadge() {
  document.getElementById('totalBadge').textContent =
    DATA.length.toLocaleString('es-PE') + ' incidente' + (DATA.length !== 1 ? 's' : '');
}

async function fetchFromAppsScript() {
  const res = await fetch(APPS_SCRIPT_URL);

  if (!res.ok) {
    throw new Error(`Error ${res.status} al llamar a Apps Script`);
  }

  return res.json();
}

async function loadAllIssues() {
  const data = await fetchFromAppsScript();
  return data || [];
}

// Botón sincronizar
async function syncData() {
  const btn     = document.getElementById('syncBtn');
  const errEl   = document.getElementById('errMsg');
  const spinner = document.getElementById('syncSpinner');

  errEl.style.display = 'none';
  btn.disabled        = true;
  spinner.style.display = 'inline-block';
  btn.textContent     = 'Sincronizando…';

  try {
    const issues = await loadAllIssues();

    DATA = issues;
    updateTotalBadge();

    btn.textContent = `✓ ${DATA.length} tickets cargados`;
    setTimeout(() => { btn.textContent = 'Sincronizar'; }, 2500);

  } catch (e) {
    errEl.textContent   = `Error al sincronizar: ${e.message}`;
    errEl.style.display = 'block';
    btn.textContent     = 'Sincronizar';
  } finally {
    btn.disabled          = false;
    spinner.style.display = 'none';
  }
}

// ─────────────────────────────────────────────
// ######## FUNCIONES TRATAMIENTO ################
// ─────────────────────────────────────────────

document.getElementById('q').addEventListener('keydown', e => {
  if (e.key === 'Enter') search();
});

function esc(s) {
  return String(s ?? '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function fmtDate(str) {
  if (!str) return '';
  const d = new Date(str);
  if (isNaN(d)) return str;
  return d.toLocaleString('es-PE', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true
  });
}

function renderIssue(issue) {
  const ch = issue.changelog;
  const histories = [...(ch?.histories || [])].sort((a,b) => new Date(a.created) - new Date(b.created));
  const fields = issue.fields || {};

  const DOT_COLORS = {
    creation:       '#2563eb',
    status:         '#7c3aed',
    gruporesolutor: '#0d9488',
    equipored:      '#dc2626',
    comentario:     '#b45309',
  };

  function dotStyle(type) {
    const c = DOT_COLORS[type] || '#6b7280';
    return `background:${c};box-shadow:0 0 0 1.5px ${c};`;
  }

  function isStatus(item) {
    return (item.field || '').toLowerCase() === 'status';
  }

  function isGrupoResolutor(item) {
    const name = (item.field || '').toLowerCase();
    return name.includes('empresa - grupo resolutor') && !name.includes('inicial');
  }

  function isEquipoRed(item) {
    return (item.field || '').toLowerCase() === 'equipo de red'
      || item.fieldId === 'customfield_18452';
  }

  // Clave de agrupación: año-mes-dia-hora-minuto
  function minuteKey(dateStr) {
    if (!dateStr) return 'unknown';
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}-${d.getMinutes()}`;
  }

  const events = [];

  // 1. Creación
  const createdAt = histories.length > 0 ? histories[0].created : (fields.created || null);
  events.push({ type: 'creation', time: createdAt });

  // 2. Cambios relevantes del changelog
  for (const h of histories) {
    for (const it of (h.items || [])) {
      if (isStatus(it)) {
        events.push({
          type: 'status',
          time: h.created,
          from: it.fromString,
          to: it.toString,
          author: h.author?.displayName,
        });
      }
      if (isGrupoResolutor(it) && it.toString) {
        events.push({
          type: 'gruporesolutor',
          time: h.created,
          from: it.fromString,
          to: it.toString,
          author: h.author?.displayName,
        });
      }
      if (isEquipoRed(it) && it.toString) {
        events.push({
          type: 'equipored',
          time: h.created,
          from: it.fromString,
          to: it.toString,
          author: h.author?.displayName,
        });
      }
    }
  }

  // 3. Último comentario
  const comments = fields?.comment?.comments || [];
  if (comments.length > 0) {
    const last = comments[comments.length - 1];
    let body = '—';
    if (typeof last.body === 'string') {
      body = last.body;
    } else if (last.body?.content) {
      body = last.body.content
        .flatMap(b => b.content || [])
        .filter(n => n.type === 'text')
        .map(n => n.text)
        .join(' ');
    }
    events.push({
      type: 'comentario',
      time: last.created,
      value: body,
      author: last.author?.displayName,
    });
  }

  // Ordenar por tiempo
  events.sort((a, b) => new Date(a.time || 0) - new Date(b.time || 0));

  // Agrupar eventos que ocurren en el mismo minuto
  const groups = [];
  for (const ev of events) {
    const key = minuteKey(ev.time);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.events.push(ev);
    } else {
      groups.push({ key, time: ev.time, events: [ev] });
    }
  }

  // Renderizar cada evento individual dentro de un grupo
  function renderEventBody(ev) {
    if (ev.type === 'creation') {
      return `
        <div class="tl-label" style="color:${DOT_COLORS.creation}">Ticket creado</div>
        <div class="tl-detail">${esc(fields.summary || '—')}</div>
        ${fields.reporter ? `<div class="tl-sub">Reportado por: ${esc(fields.reporter?.displayName || fields.reporter)}</div>` : ''}
        ${fields.priority ? `<div class="tl-sub">Prioridad: ${esc(fields.priority?.name || fields.priority)}</div>` : ''}`;

    } else if (ev.type === 'status') {
      return `
        <div class="tl-label" style="color:${DOT_COLORS.status}">Cambio de estado</div>
        <div class="change-row" style="margin-top:4px">
          ${ev.from ? `<span class="val-old">${esc(ev.from)}</span><span class="arrow">→</span>` : ''}
          <span class="val-new" style="background:#ede9fe;color:#5b21b6;border-color:#c4b5fd">${esc(ev.to || '—')}</span>
        </div>
        ${ev.author ? `<div class="tl-sub">Por: ${esc(ev.author)}</div>` : ''}`;

    } else if (ev.type === 'gruporesolutor') {
      return `
        <div class="tl-label" style="color:${DOT_COLORS.gruporesolutor}">Cambio de grupo resolutor</div>
        <div class="change-row" style="margin-top:4px">
          ${ev.from ? `<span class="val-old">${esc(ev.from)}</span><span class="arrow">→</span>` : ''}
          <span class="val-new" style="background:#ccfbf1;color:#0f766e;border-color:#99f6e4">${esc(ev.to || '—')}</span>
        </div>
        ${ev.author ? `<div class="tl-sub">Por: ${esc(ev.author)}</div>` : ''}`;

    } else if (ev.type === 'equipored') {
      return `
        <div class="tl-label" style="color:${DOT_COLORS.equipored}">Equipo de RED</div>
        <div class="change-row" style="margin-top:4px">
          ${ev.from ? `<span class="val-old">${esc(ev.from)}</span><span class="arrow">→</span>` : ''}
          <span class="val-new" style="background:#fee2e2;color:#991b1b;border-color:#fca5a5">${esc(ev.to || '—')}</span>
        </div>
        ${ev.author ? `<div class="tl-sub">Por: ${esc(ev.author)}</div>` : ''}`;

    } else if (ev.type === 'comentario') {
      return `
        <div class="tl-label" style="color:${DOT_COLORS.comentario}">Último comentario</div>
        <div class="tl-detail">${esc(ev.value)}</div>
        ${ev.author ? `<div class="tl-sub">Por: ${esc(ev.author)}</div>` : ''}`;
    }
    return '';
  }

  // Renderizar grupos
  const timelineHtml = groups.map((group, gi) => {
    const isLast = gi === groups.length - 1;
    const time = fmtDate(group.time);
    // Dot color: si hay un solo evento usa su color, si hay varios usa gris medio
    const dotColor = group.events.length === 1
      ? (DOT_COLORS[group.events[0].type] || '#6b7280')
      : '#6b7280';
    const dotSt = `background:${dotColor};box-shadow:0 0 0 1.5px ${dotColor};`;

    // Eventos dentro del grupo: si >1 se separan con un divisor fino
    const eventsHtml = group.events.map((ev, ei) => {
      const isLastEv = ei === group.events.length - 1;
      return `
        <div>
          ${renderEventBody(ev)}
          ${!isLastEv ? `<div style="margin:8px 0;border-top:1px dashed var(--border);"></div>` : ''}
        </div>`;
    }).join('');

    return `
      <div class="tl-event">
        <div class="tl-dot-col">
          <div class="tl-dot" style="${dotSt}"></div>
          ${!isLast ? '<div class="tl-connector"></div>' : ''}
        </div>
        <div class="tl-body">
          <div class="tl-time">${esc(time)}</div>
          ${eventsHtml}
        </div>
      </div>`;
  }).join('');

  const afectacion = fields?.customfield_11184?.value || null;

  return `
    <div class="inc-card">
      <div class="inc-head">
        <div class="inc-meta">
          <span class="key-badge">${esc(issue.key)}</span>
          ${afectacion ? `<span style="font-size:11px;font-weight:500;padding:2px 8px;border-radius:4px;background:#fef3c7;color:#92400e;border:1px solid #fcd34d">${esc(afectacion)}</span>` : ''}
        </div>
        <div class="inc-summary">${esc(fields.summary || '—')}</div>
      </div>
      <div class="timeline">${timelineHtml || '<p class="no-changes">Sin eventos relevantes.</p>'}</div>
    </div>`;
}

function search() {
  const raw = document.getElementById('q').value.trim();
  const errEl = document.getElementById('errMsg');
  const countEl = document.getElementById('resultCount');
  const resultsEl = document.getElementById('results');

  errEl.style.display = 'none';

  if (!raw) {
    errEl.textContent = 'Ingresa una clave de incidente (ej. INC-186671).';
    errEl.style.display = 'block';
    return;
  }

  if (DATA.length === 0) {
    errEl.textContent = 'Primero sincroniza los datos con el botón "Sincronizar".';
    errEl.style.display = 'block';
    return;
  }

  const q = raw.toUpperCase();
  const found = DATA.filter(i => i.key && i.key.toUpperCase().includes(q));

  if (found.length === 0) {
    countEl.style.display = 'none';
    resultsEl.innerHTML = `
      <div class="empty-state">
        <p>No se encontró ningún incidente con clave <strong>${esc(raw)}</strong>.</p>
      </div>`;
    return;
  }

  countEl.textContent = `${found.length} resultado${found.length !== 1 ? 's' : ''} para "${raw}"`;
  countEl.style.display = 'block';
  resultsEl.innerHTML = found.map(renderIssue).join('');
}

function clearSearch() {
  document.getElementById('q').value = '';
  document.getElementById('errMsg').style.display = 'none';
  document.getElementById('resultCount').style.display = 'none';
  document.getElementById('results').innerHTML = `
    <div class="empty-state">
      <p>Ingresa una clave de incidente para ver su historial.</p>
    </div>`;
  document.getElementById('q').focus();
}

updateTotalBadge();