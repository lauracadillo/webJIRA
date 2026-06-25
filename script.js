
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxCYrCkq8inV0HY83-Vo1_fr2buNSN5QwIsbJ6_IvwDfU1CM-3Wm7HgLpFI2Cuuh61EmQ/exec';
// ─────────────────────────────────────────────

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
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

function fmtDateOnly(str) {
  if (!str) return '—';
  const d = new Date(str);
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
}

function fmtHour(str) {
  if (!str) return '—';
  const d = new Date(str);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
// ─────────────────────────────────────────────
// FETCH ISSUE (APPS SCRIPT → JIRA)
// ─────────────────────────────────────────────

async function getIssue(key) {
  const url = `${APPS_SCRIPT_URL}?key=${encodeURIComponent(key)}`;

  const res = await fetch(url);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Error ${res.status}`);
  }

  return res.json();
}

// ─────────────────────────────────────────────
// SEARCH MAIN
// ─────────────────────────────────────────────

async function search() {
  const raw = document.getElementById('q').value.trim();
  const errEl = document.getElementById('errMsg');
  const countEl = document.getElementById('resultCount');
  const resultsEl = document.getElementById('results');

  errEl.style.display = 'none';

  if (!raw) {
    errEl.textContent = 'Ingresa una clave de incidente (ej. INC-185148).';
    errEl.style.display = 'block';
    return;
  }

  const key = raw.toUpperCase();

  // validación básica de formato Jira
  if (!/^[A-Z]+-\d+$/.test(key)) {
    errEl.textContent = 'Formato inválido. Ejemplo: INC-185148';
    errEl.style.display = 'block';
    return;
  }

  try {
    resultsEl.innerHTML = `
      <div class="empty-state">
        <p>Cargando incidente ${esc(key)}...</p>
      </div>`;

    const issue = await getIssue(key);

    countEl.style.display = 'none';
    resultsEl.innerHTML = renderIssue(issue);

  } catch (e) {
    errEl.textContent = `Error: ${e.message}`;
    errEl.style.display = 'block';
    resultsEl.innerHTML = '';
  }
}

// ─────────────────────────────────────────────
// CLEAR
// ─────────────────────────────────────────────

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

// ─────────────────────────────────────────────
// EVENT LISTENER
// ─────────────────────────────────────────────

document.getElementById('q').addEventListener('keydown', e => {
  if (e.key === 'Enter') search();
});

// ─────────────────────────────────────────────
// RENDER ISSUE 
// ─────────────────────────────────────────────

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
      if (isStatus(it) && it.fromString !== it.toString) {
        const key = minuteKey(h.created);
        const dupe = events.some(e => e.type === 'status' && minuteKey(e.time) === key && e.from === it.fromString && e.to === it.toString);
        if (!dupe) events.push({
          type: 'status',
          time: h.created,
          from: it.fromString,
          to: it.toString,
          author: h.author?.displayName,
        });
      }
      if (isGrupoResolutor(it) && it.toString) {
        const key = minuteKey(h.created);
        const dupe = events.some(e => e.type === 'gruporesolutor' && minuteKey(e.time) === key && e.from === it.fromString && e.to === it.toString);
        if (!dupe) events.push({
          type: 'gruporesolutor',
          time: h.created,
          from: it.fromString,
          to: it.toString,
          author: h.author?.displayName,
        });
      }
      if (isEquipoRed(it) && it.toString) {
        const key = minuteKey(h.created);
        const dupe = events.some(e => e.type === 'equipored' && minuteKey(e.time) === key && e.from === it.fromString && e.to === it.toString);
        if (!dupe) events.push({
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

  // Si en el mismo minuto hay equipored y gruporesolutor con el mismo "to", quitar el gruporesolutor
  const filtered = events.filter(ev => {
    if (ev.type !== 'gruporesolutor') return true;
    const key = minuteKey(ev.time);
    return !events.some(e => e.type === 'equipored' && minuteKey(e.time) === key && e.to === ev.to);
  });

  // Agrupar eventos que ocurren en el mismo minuto
  const groups = [];
  for (const ev of filtered) {
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
          <span class="val-new" style="background:#EEF4FD; color:#1A5FA8; border-color:#BBCFED>${esc(ev.to || '—')}</span>
        </div>
        ${ev.author ? `<div class="tl-sub">Por: ${esc(ev.author)}</div>` : ''}`;

   } else if (ev.type === 'gruporesolutor') {
      function parseGrupo(str) {
        if (!str) return null;
        const m = str.match(/Level 1 values:\s*([^(]+)/i);
        return m ? m[1].trim() : str;
      }
      function parseParent(str) {
        if (!str) return null;
        const m = str.match(/Parent values:\s*([^(]+)/i);
        return m ? m[1].trim() : str;
      }
      const fromVal = parseParent(ev.to) || ev.from;
      const toVal   = parseGrupo(ev.to);
      return `
        <div class="tl-label" style="color:${DOT_COLORS.gruporesolutor}">Cambio de grupo resolutor</div>
        <div class="change-row" style="margin-top:4px">
          ${fromVal ? `<span class="val-old">${esc(fromVal)}</span><span class="arrow">→</span>` : ''}
          <span class="val-new" style="background:#EAF5E0; color:#2E7010; border-color:#A8D888">${esc(toVal || '—')}</span>
        </div>
        ${ev.author ? `<div class="tl-sub">Por: ${esc(ev.author)}</div>` : ''}`;

    } else if (ev.type === 'equipored') {
      return `
        <div class="tl-label" style="color:${DOT_COLORS.gruporesolutor}">Equipo de RED</div>
        <div class="change-row" style="margin-top:4px">
          ${ev.from ? `<span class="val-old">${esc(ev.from)}</span><span class="arrow">→</span>` : ''}
          <span class="val-new" style=" background:#FDEEED; color:#B03030; border-color:#F0BBBB">${esc(ev.to || '—')}</span>
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
    // Separar eventos de "estado" de los demás
    const statusEvs = group.events.filter(ev => ev.type === 'status');
    const otherEvs  = group.events.filter(ev => ev.type !== 'status');

    // Si hay tanto status como otros, mostrarlos en dos columnas
    let eventsHtml = '';
    if (statusEvs.length > 0 && otherEvs.length > 0) {
      eventsHtml = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:start">
          <div style="padding-right:8px;border-right:1px dashed var(--border)">
            ${statusEvs.map(ev => `<div>${renderEventBody(ev)}</div>`).join('<div style="margin:8px 0;border-top:1px dashed var(--border)"></div>')}
          </div>
          <div>
            ${otherEvs.map(ev => `<div>${renderEventBody(ev)}</div>`).join('<div style="margin:8px 0;border-top:1px dashed var(--border)"></div>')}
          </div>
        </div>`;
    } else {
      eventsHtml = group.events.map((ev, ei) => {
        const isLastEv = ei === group.events.length - 1;
        return `
          <div>
            ${renderEventBody(ev)}
            ${!isLastEv ? `<div style="margin:8px 0;border-top:1px dashed var(--border);"></div>` : ''}
          </div>`;
      }).join('');
    }

    return `
      <div class="tl-event">
        <div class="tl-left">
          <div class="tl-time-block">
            <span class="tl-date">${esc(fmtDateOnly(group.time))}</span>
            <span class="tl-hour">${esc(fmtHour(group.time))}</span>
          </div>
          <div class="tl-dot-wrap">
            ${!isLast ? '<div class="tl-connector"></div>' : ''}
          </div>
        </div>
        <div class="tl-body">
          
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
          ${afectacion ? `<span style="font-size:11px;font-weight:600;padding:2px 9px;border-radius:10px;background:rgba(245,166,35,0.15);color:#F5A623;border:1px solid rgba(245,166,35,0.35)">${esc(afectacion)}</span>` : ''}
        </div>
        <div class="inc-summary">${esc(fields.summary || '—')}</div>
      </div>
      <div class="timeline">${timelineHtml || '<p class="no-changes">Sin eventos relevantes.</p>'}</div>
    </div>`;
}