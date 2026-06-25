let DATA = [];

// ─────────────────────────────────────────────
// CONFIGURACIÓN
// ─────────────────────────────────────────────
const JIRA_PROJECT = 'INC';
const MAX_RESULTS  = 100;


const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwyAxgM6BVvmvr_xdgWJ1sVCBmr-tzUOqtBPvvbx-es3hAtnzQUpCEwPo2RilYDcXdyhQ/exec';
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

/* TODO TU renderIssue() Y RESTO SE QUEDAN IGUAL */

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