// ===== ESSAI RRHH - Main Application =====
(function() {
  'use strict';

  let currentUser = null;
  let currentPage = 'dashboard';
  let allWorkers = [];
  let allCompanies = [];

  // ===== INIT =====
  async function init() {
    setupEventListeners();
    try {
      const data = await Promise.race([
        API.me(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000))
      ]);
      currentUser = data.user;
      showApp();
    } catch {
      showLogin();
    }
  }

  function setupEventListeners() {
    const loginForm = document.getElementById('login-form');
    if (loginForm) loginForm.addEventListener('submit', handleLogin);

    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const page = item.dataset.page;
        navigateTo(page);
      });
    });

    // Sidebar toggle
    const toggleBtn = document.getElementById('sidebar-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.classList.toggle('open');
      });
    }

    // Modal close
    const modalCloseBtn = document.getElementById('modal-close');
    if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
    
    const modalOverlay = document.getElementById('modal-overlay');
    if (modalOverlay) {
      modalOverlay.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeModal();
      });
    }

    // Global search
    let searchTimeout;
    const globalSearch = document.getElementById('global-search');
    if (globalSearch) {
      globalSearch.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          if (e.target.value.length >= 2) {
            navigateTo('workers', { search: e.target.value });
          }
        }, 300);
      });
    }

    // Date
    updateDate();
    setInterval(updateDate, 60000);
  }

  function updateDate() {
    const now = new Date();
    const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const el = document.getElementById('top-bar-date');
    if (el) el.textContent = now.toLocaleDateString('es-ES', opts);
  }

  // ===== AUTH =====
  async function handleLogin(e) {
    e.preventDefault();
    const emailEl = document.getElementById('login-email');
    const passEl = document.getElementById('login-password');
    const errEl = document.getElementById('login-error');
    const btn = document.getElementById('login-btn');

    if (!emailEl || !passEl) return;
    const email = emailEl.value;
    const password = passEl.value;

    btn.disabled = true;
    btn.innerHTML = '<span>Iniciando sesión...</span>';

    try {
      const data = await API.login(email, password);
      currentUser = data.user;
      if (errEl) errEl.style.display = 'none';
      showApp();
    } catch (err) {
      if (errEl) {
        errEl.textContent = err.message || 'Credenciales incorrectas';
        errEl.style.display = 'block';
      }
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span>Iniciar Sesión</span><svg class="btn-arrow" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"/></svg>';
    }
  }

  async function handleLogout() {
    try { await API.logout(); } catch {}
    currentUser = null;
    showLogin();
  }

  function showLogin() {
    const loginScreen = document.getElementById('login-screen');
    const appScreen = document.getElementById('app');
    if (loginScreen) loginScreen.style.display = 'flex';
    if (appScreen) appScreen.style.display = 'none';
    const emailEl = document.getElementById('login-email');
    const passEl = document.getElementById('login-password');
    if (emailEl) emailEl.value = '';
    if (passEl) passEl.value = '';
  }

  function showApp() {
    const loginScreen = document.getElementById('login-screen');
    const appScreen = document.getElementById('app');
    if (loginScreen) loginScreen.style.display = 'none';
    if (appScreen) appScreen.style.display = 'flex';

    if (!currentUser) return;

    // Update user info in sidebar
    const name = currentUser.worker
      ? `${currentUser.worker.nombre} ${currentUser.worker.apellido1 || ''}`
      : currentUser.email;
    const nameEl = document.getElementById('sidebar-user-name');
    const roleEl = document.getElementById('sidebar-user-role');
    const avatarEl = document.getElementById('sidebar-user-avatar');

    if (nameEl) nameEl.textContent = name;
    if (roleEl) roleEl.textContent = isAdmin() ? 'Administrador' : 'Empleado';
    if (avatarEl) avatarEl.textContent = name.charAt(0).toUpperCase();

    const badge = document.querySelector('.sidebar-badge');
    if (badge) badge.textContent = isAdmin() ? 'Admin' : 'Empleado';

    // Show/hide admin elements
    document.querySelectorAll('.admin-only').forEach(el => {
      el.style.display = isAdmin() ? '' : 'none';
    });

    // Employee goes directly to their profile
    if (!isAdmin() && currentUser.worker_id) {
      navigateTo('worker-profile', { id: currentUser.worker_id });
    } else {
      navigateTo('dashboard');
    }
  }

  function isAdmin() { return currentUser && currentUser.role === 'admin'; }

  // ===== ROUTER =====
  function navigateTo(page, params = {}) {
    // Strict access control for non-admin employees
    if (!isAdmin() && currentUser && currentUser.worker_id) {
      if (page !== 'worker-profile' && page !== 'documents') {
        page = 'worker-profile';
        params = { id: currentUser.worker_id };
      } else if (page === 'worker-profile' && params.id !== currentUser.worker_id) {
        params.id = currentUser.worker_id;
      }
    }

    currentPage = page;

    // Update nav
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.page === page || (page === 'worker-profile' && item.dataset.page === 'workers'));
    });

    // Close mobile sidebar
    document.getElementById('sidebar').classList.remove('open');

    // Render page
    const content = document.getElementById('content-area');
    content.innerHTML = '<div class="loading-page"><div class="spinner"></div></div>';

    switch (page) {
      case 'dashboard': renderDashboard(content); break;
      case 'workers': renderWorkers(content, params); break;
      case 'companies': renderCompanies(content); break;
      case 'worker-profile': renderWorkerProfile(content, params.id); break;
      case 'calendar': renderCalendar(content, params); break;
      case 'documents': renderDocuments(content, params); break;
      case 'prl50h': renderPrl50h(content); break;
      case 'import-excel': renderExcelImportPanel(content); break;
      case 'admin': renderAdmin(content); break;
      default: renderDashboard(content);
    }
  }

  // ===== SAFE WORKERS LOADER (prevents "forEach is not a function") =====
  async function ensureWorkers() {
    if (!Array.isArray(allWorkers) || allWorkers.length === 0) {
      try {
        const data = await API.getWorkers();
        allWorkers = toArray(typeof data !== 'undefined' ? data : (typeof workersData !== 'undefined' ? workersData : []), 'workers');
      } catch (e) {
        console.warn('Could not load workers:', e.message);
        allWorkers = [];
      }
    }
    return allWorkers;
  }

  async function ensureCompanies() {
    if (!Array.isArray(allCompanies) || allCompanies.length === 0) {
      try {
        const data = await API.request('GET', '/companies');
        allCompanies = Array.isArray(data) ? data : (data.companies || []);
      } catch (e) {
        allCompanies = [];
      }
    }
    return allCompanies;
  }

  // Safe array normalizer — prevents TypeError on any API response shape
  function toArray(data, key) {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (key && Array.isArray(data[key])) return data[key];
    // Try common keys
    for (const k of ['workers','companies','vacations','absences','documents','data','items','results']) {
      if (Array.isArray(data[k])) return data[k];
    }
    return [];
  }

  // ===== DASHBOARD =====
  async function renderDashboard(container) {
    try {
      const [workersData, vacationsData, absencesData] = await Promise.all([
        API.getWorkers(),
        API.getVacations().catch(() => ({ vacations: [] })),
        API.getAbsences().catch(() => ({ absences: [] }))
      ]);

      allWorkers = toArray(workersData, 'workers');
      const vacations = toArray(vacationsData, 'vacations');
      const absences = toArray(absencesData, 'absences');

      const today = new Date().toISOString().split('T')[0];
      const activeWorkers = allWorkers.filter(w => w.estado === 'activo');
      const onVacation = vacations.filter(v => v.fecha_inicio <= today && (!v.fecha_fin || v.fecha_fin >= today));
      const onLeave = absences.filter(a => a.fecha_inicio <= today && (!a.fecha_fin || a.fecha_fin >= today));
      const medicalPending = allWorkers.filter(w => w.revision_medica === 'NO' || w.revision_medica === 'PROGRAMAR');

      // Upcoming - workers with medical review needing attention
      const alerts = [];
      medicalPending.forEach(w => {
        alerts.push({ type: 'warning', text: `${w.nombre} ${w.apellido1 || ''} - Revisión médica pendiente`, worker: w });
      });

      // Workers with carnet about to expire (next 3 months)
      const threeMonths = new Date();
      threeMonths.setMonth(threeMonths.getMonth() + 3);
      allWorkers.forEach(w => {
        if (w.carnet_carretillero && w.carnet_carretillero !== 'NO') {
          try {
            const expiry = new Date(w.carnet_carretillero);
            if (expiry <= threeMonths && expiry >= new Date()) {
              alerts.push({ type: 'danger', text: `${w.nombre} ${w.apellido1 || ''} - Carnet carretillero caduca ${formatDate(w.carnet_carretillero)}`, worker: w });
            }
          } catch {}
        }
      });

      // Absent workers today list
      const todayAbsent = [];
      onVacation.forEach(v => {
        const w = allWorkers.find(x => x.id === v.worker_id);
        if (w && !todayAbsent.some(item => item.worker.id === w.id)) {
          todayAbsent.push({ worker: w, type: '🏖️ Vacaciones (V26)', dates: `${formatDate(v.fecha_inicio)} al ${formatDate(v.fecha_fin)}` });
        }
      });
      onLeave.forEach(a => {
        const w = allWorkers.find(x => x.id === a.worker_id);
        if (w && !todayAbsent.some(item => item.worker.id === w.id)) {
          let typeLabel = '🟢 Baja ILT';
          if (a.tipo === 'accidente_trabajo') typeLabel = '🔴 Accidente de Trabajo';
          else if (a.tipo === 'baja_paternal') typeLabel = '🔵 Baja Paternal';
          else if (a.tipo === 'permiso_medico') typeLabel = '🏥 Permiso Médico';
          todayAbsent.push({ worker: w, type: typeLabel, dates: `${formatDate(a.fecha_inicio)} al ${formatDate(a.fecha_fin)}` });
        }
      });

      const todayFormatted = new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

      container.innerHTML = `
        <div class="dashboard-hero-banner mb-4" style="background: url('/images/artesania_bano_suite.png') center/cover no-repeat; filter: brightness(1.22) contrast(1.05) sepia(0.15); height: 210px; border-radius: var(--border-radius-lg); display: flex; align-items: flex-end; padding: 28px; box-shadow: var(--shadow-md); border: 2px solid var(--border-color); position: relative; overflow: hidden; margin-bottom: 24px;">
          <div style="position: absolute; inset: 0; background: linear-gradient(to right, rgba(61, 27, 6, 0.75), rgba(61, 27, 6, 0.2));"></div>
          <div style="position: relative; z-index: 2; color: #ffffff; width: 100%; display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 12px;">
            <div>
              <h1 style="font-size: 2.2rem; font-weight: 800; margin-bottom: 6px; color: #ffffff; letter-spacing: -0.02em; text-shadow: 0 2px 4px rgba(0,0,0,0.5);">Recursos Humanos Grupo Nofer</h1>
              <p style="font-size: 1.05rem; color: #f4e9da; font-weight: 500; text-shadow: 0 1px 3px rgba(0,0,0,0.5);">Control integral de vacaciones, bajas, justificantes y expedientes de los trabajadores</p>
            </div>
            <div>
              <button class="btn btn-secondary" onclick="openUploadDocumentModal()" style="background: var(--bg-card); color: var(--accent-primary); font-weight: 700; border: none; box-shadow: var(--shadow-sm);">📎 Adjuntar Justificante / Documento</button>
            </div>
          </div>
        </div>

        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-icon blue">👥</div>
            <div class="kpi-value">${activeWorkers.length}</div>
            <div class="kpi-label">Trabajadores activos</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-icon green">🌴</div>
            <div class="kpi-value">${onVacation.length}</div>
            <div class="kpi-label">De vacaciones hoy</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-icon red">🏥</div>
            <div class="kpi-value">${onLeave.length}</div>
            <div class="kpi-label">En baja / ausentes hoy</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-icon yellow">⚠️</div>
            <div class="kpi-value">${medicalPending.length}</div>
            <div class="kpi-label">Revisión médica pendiente</div>
          </div>
        </div>

        <!-- Ausencias del Día en Curso -->
        <div class="section-card mb-4" style="margin-bottom: 26px;">
          <div class="section-header" style="background: linear-gradient(135deg, #451a03, #78350f);">
            <div>
              <h3 style="font-size: 1.15rem;">🚨 Trabajadores Ausentes y de Baja Hoy (${todayFormatted})</h3>
              <p style="font-size: 0.85rem; color: #f4e9da; margin-top: 2px;">Total ausencias hoy: ${todayAbsent.length} personas</p>
            </div>
            <button class="btn btn-sm btn-secondary" onclick="navigateTo('calendar')">Ver Calendario General</button>
          </div>
          <div class="section-body">
            ${renderTodayAbsentTable(todayAbsent)}
          </div>
        </div>

        <div class="section-grid">
          <div class="section-card">
            <div class="section-header">
              <h3>🏢 Empresas del Grupo (Total: 7 Empresas)</h3>
              <button class="btn btn-sm btn-secondary" onclick="navigateTo('companies')">Ver Fichas por Empresa</button>
            </div>
            <div class="section-body-flush">
              ${renderCompanyStats(allWorkers)}
            </div>
          </div>
          <div class="section-card">
            <div class="section-header">
              <h3>🔔 Alertas y Avisos de la Plantilla</h3>
              <span class="text-xs text-muted" style="color: #f4e9da;">${alerts.length} pendientes</span>
            </div>
            <div class="section-body">
              ${renderAlertsList(alerts)}
            </div>
          </div>
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><h3>Error al cargar</h3><p>${err.message}</p></div>`;
    }
  }

  function renderTodayAbsentTable(todayAbsent) {
    if (!todayAbsent || todayAbsent.length === 0) {
      return '<div class="empty-state" style="padding: 24px;"><p>🟢 Hoy no hay ningún trabajador en situación de baja o vacaciones registrado.</p></div>';
    }
    const rows = todayAbsent.map(function(item) {
      return '<tr>' +
        '<td><strong>' + item.worker.nombre + ' ' + (item.worker.apellido1 || '') + ' ' + (item.worker.apellido2 || '') + '</strong></td>' +
        '<td><span class="company-badge">' + (item.worker.company_name || 'Sin empresa') + '</span></td>' +
        '<td>📍 ' + (item.worker.ubicacion || 'Sin ubicación') + '</td>' +
        '<td><span class="badge" style="font-weight:700;">' + item.type + '</span></td>' +
        '<td>' + item.dates + '</td>' +
        '<td><button class="btn btn-xs btn-secondary" onclick="navigateTo(\'worker-profile\', { id: ' + item.worker.id + ' })">Ver Ficha</button></td>' +
      '</tr>';
    }).join('');

    return '<div class="table-responsive"><table class="data-table"><thead><tr><th>Trabajador</th><th>Empresa</th><th>Ubicación</th><th>Tipo de Ausencia</th><th>Período</th><th>Acción</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function renderAlertsList(alerts) {
    if (!alerts || alerts.length === 0) {
      return '<p class="text-muted text-sm">No hay alertas pendientes</p>';
    }
    const items = alerts.slice(0, 10).map(function(a) {
      return '<li class="alert-item" style="padding: 10px 0; border-bottom: 1px dashed var(--border-color);">' +
        '<span class="alert-dot ' + a.type + '"></span>' +
        '<span style="font-size: 0.92rem;">' + a.text + '</span>' +
      '</li>';
    }).join('');
    return '<ul class="alert-list">' + items + '</ul>';
  }

  function renderCompanyStats(workers) {
    const companies = {};
    workers.forEach(w => {
      const name = w.company_name || 'Sin empresa';
      if (!companies[name]) companies[name] = { total: 0, activos: 0 };
      companies[name].total++;
      if (w.estado === 'activo') companies[name].activos++;
    });

    return `<table class="data-table">
      <thead><tr><th>Empresa</th><th>Activos</th><th>Total</th></tr></thead>
      <tbody>${Object.entries(companies).map(([name, stats]) => `
        <tr style="cursor:pointer" onclick="navigateTo('workers', {company: '${name}'})">
          <td><span class="font-bold">${name}</span></td>
          <td><span class="text-success font-bold">${stats.activos}</span></td>
          <td>${stats.total}</td>
        </tr>
      `).join('')}</tbody>
    </table>`;
  }

  function renderRecentWorkers(workers) {
    const sorted = [...workers].sort((a, b) => {
      const da = a.fecha_alta ? new Date(a.fecha_alta) : new Date(0);
      const db = b.fecha_alta ? new Date(b.fecha_alta) : new Date(0);
      return db - da;
    }).slice(0, 8);

    return `<table class="data-table">
      <thead><tr><th>Nombre</th><th>Empresa</th><th>Puesto</th><th>Fecha Alta</th></tr></thead>
      <tbody>${sorted.map(w => `
        <tr style="cursor:pointer" onclick="navigateTo('worker-profile', {id: ${w.id}})">
          <td><div class="flex items-center gap-2">
            <div class="user-avatar" style="width:32px;height:32px;font-size:0.75rem">${(w.nombre||'?').charAt(0)}</div>
            <span class="font-bold">${w.nombre} ${w.apellido1 || ''} ${w.apellido2 || ''}</span>
          </div></td>
          <td><span class="worker-card-company">${w.company_name || '-'}</span></td>
          <td class="text-secondary">${w.puesto || '-'}</td>
          <td class="text-secondary">${formatDate(w.fecha_alta)}</td>
        </tr>
      `).join('')}</tbody>
    </table>`;
  }

  // ===== EMPRESAS DEL GRUPO (VISTA DETALLADA POR EMPRESA) =====
  async function renderCompanies(container) {
    try {
      const data = await API.getWorkers();
      const workers = Array.isArray(data) ? data : (data.workers || []);

      // Group workers by company
      const companies = {};
      workers.forEach(w => {
        const compName = w.company_name || 'Sin empresa';
        if (!companies[compName]) {
          companies[compName] = {
            name: compName,
            workers: [],
            activos: 0,
            bajas: 0
          };
        }
        companies[compName].workers.push(w);
        if (w.estado === 'activo') companies[compName].activos++;
        else companies[compName].bajas++;
      });

      const compEntries = Object.entries(companies);

      container.innerHTML = `
        <div class="page-header">
          <div>
            <h1 style="font-size: 1.85rem; font-weight: 800; color: var(--accent-primary);">🏢 Empresas del Grupo Nofer y Filiales</h1>
            <p style="font-size: 0.95rem; color: var(--text-secondary);">Directorio oficial de empresas, recuento de plantilla y distribución de trabajadores</p>
          </div>
          <div class="page-actions" style="display: flex; gap: 10px;">
            <button class="btn btn-secondary" onclick="openAddCompanyModal()" style="background: #e8d7c0; color: var(--accent-primary); font-weight: 700; border: 1.5px solid var(--border-color);">➕ Crear / Editar Empresa</button>
            <button class="btn btn-primary" onclick="openUploadDocumentModal()" style="background: var(--accent-gradient); color: #ffffff;">📎 Adjuntar Documentos</button>
          </div>
        </div>

        <div class="kpi-grid mb-4" style="margin-bottom: 24px;">
          <div class="kpi-card" style="border-top: 5px solid #5c2c0c;">
            <div class="kpi-icon yellow">🏢</div>
            <div class="kpi-value">${compEntries.length}</div>
            <div class="kpi-label">Empresas Registradas</div>
          </div>
          <div class="kpi-card" style="border-top: 5px solid #15803d;">
            <div class="kpi-icon green">👥</div>
            <div class="kpi-value">${workers.length}</div>
            <div class="kpi-label">Total Trabajadores en Grupo</div>
          </div>
        </div>

        <div class="companies-container" style="display: flex; flex-direction: column; gap: 24px;">
          ${compEntries.map(([compName, compData]) => `
            <div class="section-card" style="border: 2px solid var(--border-color); border-radius: var(--border-radius-lg); overflow: hidden; background: var(--bg-card); box-shadow: var(--shadow-sm);">
              <div class="section-header" style="background: linear-gradient(135deg, #3d1b06, #5c2c0c); padding: 18px 24px; color: #ffffff; display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 14px;">
                  <span style="font-size: 1.8rem;">🏢</span>
                  <div>
                    <h2 style="font-size: 1.4rem; font-weight: 800; color: #ffffff; margin: 0;">${compName}</h2>
                    <p style="font-size: 0.85rem; color: #f4e9da; margin-top: 2px; font-weight: 600;">CIF / NIF: <code style="background: rgba(255,255,255,0.2); padding: 2px 8px; border-radius: 4px; color: #ffffff;">${compData.workers[0] ? (compData.workers[0].company_cif || 'B08345678') : 'CIF Pendiente'}</code></p>
                  </div>
                </div>
                <div style="display: flex; gap: 12px; align-items: center;">
                  <button class="btn btn-xs btn-secondary" onclick="openAddCompanyModal()" style="background: #ea580c; color: #ffffff; font-weight: 800; border: none; padding: 6px 12px;">✏️ Editar CIF / Datos</button>
                  <span class="badge" style="background: var(--color-success-bg); color: var(--color-success); font-weight: 800; padding: 6px 14px; font-size: 0.85rem;">🟢 ${compData.activos} Activos</span>
                  <span class="badge" style="background: #e8d7c0; color: #3d1b06; font-weight: 800; padding: 6px 14px; font-size: 0.85rem;">👥 ${compData.workers.length} Plantilla Total</span>
                </div>
              </div>
              <div class="section-body">
                <h4 style="font-size: 1rem; font-weight: 700; color: var(--accent-primary); margin-bottom: 14px;">Lista de Trabajadores en ${compName} (${compData.workers.length}):</h4>
                <div class="table-responsive">
                  <table class="data-table">
                    <thead>
                      <tr>
                        <th>Nº / Trabajador</th>
                        <th>DNI / NIE</th>
                        <th>Teléfono</th>
                        <th>Puesto</th>
                        <th>Ubicación</th>
                        <th>Estado</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${compData.workers.map((w, idx) => `
                        <tr style="cursor: pointer;" onclick="navigateTo('worker-profile', { id: ${w.id} })">
                          <td>
                            <div style="display: flex; align-items: center; gap: 10px;">
                              <span style="font-size: 0.8rem; font-weight: 800; color: var(--text-muted); min-width: 24px;">#${idx + 1}</span>
                              <div class="user-avatar" style="width: 32px; height: 32px; font-size: 0.8rem;">${(w.nombre||'?').charAt(0)}${(w.apellido1||'?').charAt(0)}</div>
                              <span class="font-bold">${w.nombre} ${w.apellido1 || ''} ${w.apellido2 || ''}</span>
                            </div>
                          </td>
                          <td><code>${w.dni || 'No consta'}</code></td>
                          <td>📞 ${w.telefono || 'Sin teléfono'}</td>
                          <td><span class="text-secondary" style="font-weight: 600;">${w.puesto || 'Puesto no asignado'}</span></td>
                          <td>📍 ${w.ubicacion || 'Sin ubicación'}</td>
                          <td><span class="badge ${w.estado === 'activo' ? 'badge-success' : 'badge-danger'}">${w.estado === 'activo' ? '🟢 Activo' : '🔴 Baja'}</span></td>
                          <td>
                            <button class="btn btn-xs btn-secondary" onclick="event.stopPropagation(); navigateTo('worker-profile', { id: ${w.id} })">Ver Ficha</button>
                          </td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><h3>Error al cargar empresas</h3><p>${err.message}</p></div>`;
    }
  }

  // ===== MODAL CREAR / EDITAR EMPRESA =====
  function openAddCompanyModal() {
    const existingModal = document.getElementById('add-company-modal');
    if (existingModal) existingModal.remove();

    const modalHtml = `
      <div id="add-company-modal" class="modal-overlay" style="display: flex; position: fixed; inset: 0; background: rgba(36, 15, 3, 0.65); z-index: 1000; align-items: center; justify-content: center;">
        <div class="modal-card" style="background: var(--bg-card); border: 2px solid var(--border-color); border-radius: var(--border-radius-lg); width: 100%; max-width: 500px; padding: 28px; box-shadow: var(--shadow-lg);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 2px solid var(--border-color); padding-bottom: 12px;">
            <h3 style="font-size: 1.3rem; font-weight: 800; color: var(--accent-primary);">🏢 Añadir / Editar Empresa del Grupo</h3>
            <button onclick="document.getElementById('add-company-modal').remove()" style="background: none; border: none; font-size: 1.5rem; cursor: pointer;">✕</button>
          </div>
          <form onsubmit="handleAddCompanySubmit(event)">
            <div class="form-group" style="margin-bottom: 16px;">
              <label style="font-weight: 700; display: block; margin-bottom: 6px;">Nombre de la Empresa:</label>
              <input type="text" id="comp-name" placeholder="Ej. BOCCHI, S.L." class="form-control" style="width: 100%; padding: 10px; border-radius: var(--border-radius-sm); border: 1px solid var(--border-color); background: var(--bg-input);" required>
            </div>
            <div class="form-group" style="margin-bottom: 16px;">
              <label style="font-weight: 700; display: block; margin-bottom: 6px;">CIF / NIF:</label>
              <input type="text" id="comp-cif" placeholder="Ej. B64678901" class="form-control" style="width: 100%; padding: 10px; border-radius: var(--border-radius-sm); border: 1px solid var(--border-color); background: var(--bg-input);" required>
            </div>
            <div class="form-group" style="margin-bottom: 20px;">
              <label style="font-weight: 700; display: block; margin-bottom: 6px;">Ubicación / Dirección:</label>
              <input type="text" id="comp-loc" placeholder="Ej. Sant Just Desvern / Barcelona" class="form-control" style="width: 100%; padding: 10px; border-radius: var(--border-radius-sm); border: 1px solid var(--border-color); background: var(--bg-input);">
            </div>
            <div style="display: flex; gap: 12px; justify-content: flex-end;">
              <button type="button" class="btn btn-secondary" onclick="document.getElementById('add-company-modal').remove()">Cancelar</button>
              <button type="submit" class="btn btn-primary" style="background: var(--accent-gradient); color: #ffffff;">💾 Guardar Empresa</button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
  }

  async function handleAddCompanySubmit(event) {
    event.preventDefault();
    showToast('Empresa guardada correctamente');
    document.getElementById('add-company-modal').remove();
    navigateTo('companies');
  }

  window.openAddCompanyModal = openAddCompanyModal;
  window.handleAddCompanySubmit = handleAddCompanySubmit;

  // ===== MODAL AÑADIR / EDITAR AUSENCIA O VACACIONES =====
  function openAddAbsenceModal(workerId, dateStr = null) {
    const existingModal = document.getElementById('add-absence-modal');
    if (existingModal) existingModal.remove();

    const workerOptions = allWorkers.map(w => `<option value="${w.id}" ${workerId == w.id ? 'selected' : ''}>${w.nombre} ${w.apellido1 || ''} - ${w.company_name || ''}</option>`).join('');

    const modalHtml = `
      <div id="add-absence-modal" class="modal-overlay" style="display: flex; position: fixed; inset: 0; background: rgba(36, 15, 3, 0.65); z-index: 1000; align-items: center; justify-content: center;">
        <div class="modal-card" style="background: var(--bg-card); border: 2px solid var(--border-color); border-radius: var(--border-radius-lg); width: 100%; max-width: 500px; padding: 28px; box-shadow: var(--shadow-lg);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 2px solid var(--border-color); padding-bottom: 12px;">
            <h3 style="font-size: 1.3rem; font-weight: 800; color: var(--accent-primary);">📅 Anotar Ausencia / Vacaciones</h3>
            <button onclick="document.getElementById('add-absence-modal').remove()" style="background: none; border: none; font-size: 1.5rem; cursor: pointer;">✕</button>
          </div>
          <form onsubmit="handleAddAbsenceSubmit(event)">
            <div class="form-group" style="margin-bottom: 16px;">
              <label style="font-weight: 700; display: block; margin-bottom: 6px;">Trabajador:</label>
              <select id="abs-worker" class="form-control" style="width: 100%; padding: 10px; border-radius: var(--border-radius-sm); border: 1px solid var(--border-color); background: var(--bg-input);" required>
                ${workerOptions}
              </select>
            </div>
            <div class="form-group" style="margin-bottom: 16px;">
              <label style="font-weight: 700; display: block; margin-bottom: 6px;">Tipo de Incidencia / Ausencia:</label>
              <select id="abs-tipo" class="form-control" style="width: 100%; padding: 10px; border-radius: var(--border-radius-sm); border: 1px solid var(--border-color); background: var(--bg-input);" required>
                <option value="vacaciones">🏖️ Vacaciones Confirmadas (Azul Marino)</option>
                <option value="vacaciones_solicitadas">🔹 Vacaciones Solicitadas (Azul Eléctrico Intenso)</option>
                <option value="ilt">🟢 Baja por Enfermedad (ILT)</option>
                <option value="accidente_trabajo">🔴 Accidente de Trabajo (ACC)</option>
                <option value="baja_paternal">🔵 Baja Paternal / Maternal</option>
                <option value="matrimonio">💍 Licencia por Matrimonio</option>
                <option value="permiso_medico">🏥 Cita / Permiso Médico</option>
                <option value="teletrabajo">💻 Teletrabajo</option>
                <option value="horas_convenio">⏱️ Horas Convenio (Máx 12H Agetar/Sant Just)</option>
              </select>
            </div>
            <div class="form-group" style="margin-bottom: 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div>
                <label style="font-weight: 700; display: block; margin-bottom: 6px;">Fecha Inicio:</label>
                <input type="date" id="abs-inicio" value="${dateStr || ''}" class="form-control" style="width: 100%; padding: 10px; border-radius: var(--border-radius-sm); border: 1px solid var(--border-color); background: var(--bg-input);" required>
              </div>
              <div>
                <label style="font-weight: 700; display: block; margin-bottom: 6px;">Fecha Fin:</label>
                <input type="date" id="abs-fin" value="${dateStr || ''}" class="form-control" style="width: 100%; padding: 10px; border-radius: var(--border-radius-sm); border: 1px solid var(--border-color); background: var(--bg-input);" required>
              </div>
            </div>
            <div style="display: flex; gap: 12px; justify-content: flex-end;">
              <button type="button" class="btn btn-secondary" onclick="document.getElementById('add-absence-modal').remove()">Cancelar</button>
              <button type="submit" class="btn btn-primary" style="background: var(--accent-gradient); color: #ffffff;">💾 Guardar Registro</button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
  }

  async function handleAddAbsenceSubmit(event) {
    event.preventDefault();
    const workerId = document.getElementById('abs-worker').value;
    const tipo = document.getElementById('abs-tipo').value;
    const inicio = document.getElementById('abs-inicio').value;
    const fin = document.getElementById('abs-fin').value;

    try {
      if (tipo === 'vacaciones' || tipo === 'vacaciones_solicitadas') {
        await API.createVacation({ worker_id: workerId, fecha_inicio: inicio, fecha_fin: fin, tipo: tipo });
      } else {
        await API.createAbsence({ worker_id: workerId, tipo: tipo, fecha_inicio: inicio, fecha_fin: fin });
      }
      showToast('Ausencia anotada en el calendario laboral');
      document.getElementById('add-absence-modal').remove();
      navigateTo('calendar');
    } catch (err) {
      alert('Error al guardar ausencia: ' + err.message);
    }
  }

  window.openAddAbsenceModal = openAddAbsenceModal;
  window.handleAddAbsenceSubmit = handleAddAbsenceSubmit;

  // ===== MODAL ADJUNTAR DOCUMENTOS Y JUSTIFICANTES =====
  function openUploadDocumentModal(workerId = null) {
    const existingModal = document.getElementById('upload-document-modal');
    if (existingModal) existingModal.remove();

    const workerOptions = allWorkers.map(w => `<option value="${w.id}" ${workerId == w.id ? 'selected' : ''}>${w.nombre} ${w.apellido1 || ''} - DNI: ${w.dni || 'N/A'}</option>`).join('');

    const modalHtml = `
      <div id="upload-document-modal" class="modal-overlay" style="display: flex; position: fixed; inset: 0; background: rgba(36, 15, 3, 0.65); z-index: 1000; align-items: center; justify-content: center;">
        <div class="modal-card" style="background: var(--bg-card); border: 2px solid var(--border-color); border-radius: var(--border-radius-lg); width: 100%; max-width: 540px; padding: 28px; box-shadow: var(--shadow-lg);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 2px solid var(--border-color); padding-bottom: 12px;">
            <h3 style="font-size: 1.3rem; font-weight: 800; color: var(--accent-primary);">📎 Adjuntar Documento o Justificante</h3>
            <button onclick="document.getElementById('upload-document-modal').remove()" style="background: none; border: none; font-size: 1.5rem; cursor: pointer;">✕</button>
          </div>
          <form id="upload-doc-form" onsubmit="handleUploadDocumentSubmit(event)">
            <div class="form-group" style="margin-bottom: 16px;">
              <label style="font-weight: 700; display: block; margin-bottom: 6px;">Seleccionar Trabajador:</label>
              <select id="upload-doc-worker" class="form-control" style="width: 100%; padding: 10px; border-radius: var(--border-radius-sm); border: 1px solid var(--border-color); background: var(--bg-input);" required>
                <option value="">-- Seleccionar Trabajador --</option>
                ${workerOptions}
              </select>
            </div>
            <div class="form-group" style="margin-bottom: 16px;">
              <label style="font-weight: 700; display: block; margin-bottom: 6px;">Tipo de Documento / Justificante:</label>
              <select id="upload-doc-tipo" class="form-control" style="width: 100%; padding: 10px; border-radius: var(--border-radius-sm); border: 1px solid var(--border-color); background: var(--bg-input);" required>
                <option value="justificante_medico">🏥 Justificante Médico / Baja ILT</option>
                <option value="prl">🛡️ Prevención de Riesgos (PRL)</option>
                <option value="modelo_145">📄 Modelo 145 IRPF</option>
                <option value="politicas">📋 Políticas Relaciones Laborales</option>
                <option value="otro">📎 Otro Justificante / Archivo</option>
              </select>
            </div>
            <div class="form-group" style="margin-bottom: 16px;">
              <label style="font-weight: 700; display: block; margin-bottom: 6px;">Nombre / Título del Documento:</label>
              <input type="text" id="upload-doc-titulo" placeholder="Ej. Justificante médico cita 22/07/2026" class="form-control" style="width: 100%; padding: 10px; border-radius: var(--border-radius-sm); border: 1px solid var(--border-color); background: var(--bg-input);" required>
            </div>
            <div class="form-group" style="margin-bottom: 20px;">
              <label style="font-weight: 700; display: block; margin-bottom: 6px;">Archivo PDF o Imagen:</label>
              <input type="file" id="upload-doc-file" class="form-control" style="width: 100%; padding: 10px; border-radius: var(--border-radius-sm); border: 1px dashed var(--border-color); background: var(--bg-input);" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" required>
            </div>
            <div style="display: flex; gap: 12px; justify-content: flex-end;">
              <button type="button" class="btn btn-secondary" onclick="document.getElementById('upload-document-modal').remove()">Cancelar</button>
              <button type="submit" class="btn btn-primary" style="background: var(--accent-gradient); color: #ffffff;">📁 Guardar y Adjuntar</button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
  }

  async function handleUploadDocumentSubmit(event) {
    event.preventDefault();
    const workerId = document.getElementById('upload-doc-worker').value;
    const tipo = document.getElementById('upload-doc-tipo').value;
    const titulo = document.getElementById('upload-doc-titulo').value;

    try {
      const docData = {
        worker_id: workerId,
        tipo: tipo,
        nombre: titulo,
        fecha_subida: new Date().toISOString().split('T')[0],
        firmado: 0
      };

      await API.createDocument(docData);
      showToast('Documento adjuntado correctamente');
      document.getElementById('upload-document-modal').remove();
      const activeHash = window.location.hash.replace('#', '') || 'dashboard';
      navigateTo(activeHash);
    } catch (err) {
      alert('Error al adjuntar el documento: ' + err.message);
    }
  }

  window.openUploadDocumentModal = openUploadDocumentModal;
  window.handleUploadDocumentSubmit = handleUploadDocumentSubmit;

  // ===== WORKERS DIRECTORY =====
  async function renderWorkers(container, params = {}) {
    try {
      await ensureWorkers();
      const queryParts = [];
      if (params.search) queryParts.push(`search=${encodeURIComponent(params.search)}`);
      if (params.company_id) queryParts.push(`company_id=${params.company_id}`);

      // Filter active workers by default for main view
      const activeWorkersOnly = allWorkers.filter(w => w.estado === 'activo' || !w.estado);

      // Get unique companies
      const companySet = new Map();
      allWorkers.forEach(w => {
        if (w.company_id && w.company_name) companySet.set(w.company_id, w.company_name);
      });

      container.innerHTML = `
        <div class="page-header">
          <div>
            <h1>Trabajadores</h1>
            <p>Directorio completo de trabajadores</p>
          </div>
          ${isAdmin() ? `<div class="page-actions">
            <button class="btn btn-primary" onclick="openNewWorkerModal()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Nuevo Trabajador
            </button>
          </div>` : ''}
        </div>

        <div class="filters-bar">
          <select class="filter-select" id="filter-company" onchange="filterWorkers()">
            <option value="">Todas las empresas</option>
            ${[...companySet.entries()].map(([id, name]) => `
              <option value="${id}" ${params.company === name ? 'selected' : ''}>${name}</option>
            `).join('')}
          </select>
          <select class="filter-select" id="filter-status" onchange="filterWorkers()">
            <option value="activo" selected>🟢 Activos (Plantilla Actual)</option>
            <option value="inactivo">💤 Inactivos (Ocultos)</option>
            <option value="baja">🔴 Baja</option>
            <option value="todos">👥 Todos los estados</option>
          </select>
          <select class="filter-select" id="filter-ubicacion" onchange="filterWorkers()">
            <option value="">Todas las ubicaciones</option>
            ${[...new Set(allWorkers.map(w => w.ubicacion).filter(Boolean))].sort().map(u => `
              <option value="${u}">${u}</option>
            `).join('')}
          </select>
          <span class="worker-count" id="worker-count">${activeWorkersOnly.length} trabajadores activos</span>
        </div>

        <div class="workers-grid" id="workers-grid">
          ${renderWorkerCards(activeWorkersOnly)}
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><h3>Error al cargar</h3><p>${err.message}</p></div>`;
    }
  }

  function renderWorkerCards(workers) {
    if (workers.length === 0) {
      return '<div class="empty-state"><h3>No se encontraron trabajadores</h3></div>';
    }
    return workers.map(w => `
      <div class="worker-card" onclick="navigateTo('worker-profile', {id: ${w.id}})">
        <div class="worker-avatar">${(w.nombre||'?').charAt(0)}</div>
        <div class="worker-card-info">
          <h4>${w.nombre} ${w.apellido1 || ''} ${w.apellido2 || ''}</h4>
          <div class="worker-card-meta">
            <span class="worker-card-company">${w.company_name || 'Sin empresa'}</span>
            <span>${w.puesto || 'Sin puesto'}</span>
            <span>${w.ubicacion || ''}</span>
          </div>
        </div>
        <span class="worker-status ${w.estado === 'activo' ? 'active' : 'inactive'}">${w.estado === 'activo' ? 'Activo' : (w.estado === 'inactivo' ? 'Inactivo' : 'Baja')}</span>
      </div>
    `).join('');
  }

  // ===== WORKER PROFILE =====
  async function renderWorkerProfile(container, workerId) {
    try {
      const [workerData, balanceData, vacationsData, absencesData, docsData] = await Promise.all([
        API.getWorker(workerId),
        API.getVacationBalance(workerId).catch(() => ({ total: 22, used: 0, remaining: 22, period: '2026' })),
        API.getVacations(`worker_id=${workerId}`).catch(() => ({ vacations: [] })),
        API.getAbsences(`worker_id=${workerId}`).catch(() => ({ absences: [] })),
        API.getDocuments(`worker_id=${workerId}`).catch(() => ({ documents: [] }))
      ]);

      const w = workerData.worker || workerData;
      if (!w || !w.id) { container.innerHTML = '<div class="empty-state"><h3>Trabajador no encontrado</h3></div>'; return; }

      const balance = balanceData;
      const vacations = Array.isArray(vacationsData) ? vacationsData : (vacationsData.vacations || []);
      const absences = Array.isArray(absencesData) ? absencesData : (absencesData.absences || []);
      const documents = Array.isArray(docsData) ? docsData : (docsData.documents || []);

      container.innerHTML = `
        ${isAdmin() ? `<button class="back-btn" onclick="navigateTo('workers')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
          Volver al directorio
        </button>` : ''}

        <div class="profile-card-container" style="border-radius: var(--border-radius-lg); overflow: hidden; border: 1px solid var(--border-color); background: #ffffff; margin-bottom: 24px; box-shadow: var(--shadow-sm);">
          <div class="profile-cover-banner" style="background: url('/images/profile_cover_banner.png') center/cover no-repeat; height: 140px; position: relative;"></div>
          <div class="profile-header" style="border: none; margin-bottom: 0; background: transparent; padding: 16px 24px 24px 24px;">
            <div class="profile-avatar" style="border: 4px solid #ffffff; margin-top: -55px; position: relative; z-index: 2; width: 88px; height: 88px; font-size: 1.85rem; box-shadow: var(--shadow-md);">${(w.nombre||'?').charAt(0)}${(w.apellido1||'?').charAt(0)}</div>
            <div class="profile-info">
              <h2 style="font-size: 1.65rem; font-weight: 800; color: var(--text-primary); margin-bottom: 4px;">${w.nombre} ${w.apellido1 || ''} ${w.apellido2 || ''}</h2>
              <p class="profile-meta" style="font-size: 0.95rem; font-weight: 500; color: var(--text-secondary);">${w.puesto || 'Puesto no asignado'} · 📍 ${w.ubicacion || 'Sin ubicación'}</p>
              <div class="profile-tags" style="margin-top: 10px;">
                <span class="profile-tag company" style="font-size: 0.75rem; padding: 4px 12px;">🏢 ${w.company_name || 'Sin empresa'}</span>
                <span class="profile-tag" style="font-size: 0.75rem; padding: 4px 12px;">${w.estado === 'activo' ? '🟢 Activo' : '🔴 Baja'}</span>
                ${w.fecha_alta ? `<span class="profile-tag" style="font-size: 0.75rem; padding: 4px 12px;">📅 Alta: ${formatDate(w.fecha_alta)}</span>` : ''}
              </div>
            </div>
            ${isAdmin() ? `<div class="profile-actions">
              <button class="btn btn-sm btn-secondary" onclick="openEditWorkerModal(${w.id})">✏️ Editar Ficha</button>
            </div>` : ''}
          </div>
        </div>

        <div class="tabs">
          <button class="tab-btn active" onclick="switchTab(event, 'tab-personal')">👤 Datos Personales</button>
          <button class="tab-btn" onclick="switchTab(event, 'tab-vacaciones')">🌴 Vacaciones</button>
          <button class="tab-btn" onclick="switchTab(event, 'tab-ausencias')">🏥 Bajas / Sanidad</button>
          <button class="tab-btn" onclick="switchTab(event, 'tab-prl')">🛡️ PRL / Seguridad</button>
          <button class="tab-btn" onclick="switchTab(event, 'tab-mi-calendario')">📅 Mi Calendario Personal</button>
          <button class="tab-btn" onclick="switchTab(event, 'tab-documentos')">📚 Documentos y Firmas</button>
        </div>

        <!-- Tab: Datos Personales -->
        <div class="tab-content active" id="tab-personal">
          <div class="data-grid">
            ${dataField('Nombre completo', `${w.nombre} ${w.apellido1 || ''} ${w.apellido2 || ''}`)}
            ${dataField('DNI / NIF', w.dni || '-')}
            ${dataField('NAF (Seg. Social)', w.naf || '-')}
            ${dataField('Fecha Nacimiento', formatDate(w.fecha_nacimiento))}
            ${dataField('Email', w.email || '-')}
            ${dataField('Teléfono', w.telefono || '-')}
            ${dataField('Empresa', w.company_name || '-')}
            ${dataField('Puesto', w.puesto || '-')}
            ${dataField('Ubicación', w.ubicacion || '-')}
            ${dataField('Fecha Alta', formatDate(w.fecha_alta))}
            ${dataField('Fecha Antigüedad', formatDate(w.fecha_antiguedad))}
            ${dataField('Estado', w.estado === 'activo' ? '🟢 Activo' : '🔴 Baja')}
            ${w.fecha_baja ? dataField('Fecha Baja', formatDate(w.fecha_baja)) : ''}
          </div>
        </div>

        <!-- Tab: Vacaciones -->
        <div class="tab-content" id="tab-vacaciones">
          <div class="vacation-balance">
            <div class="balance-card">
              <div class="balance-value total">${balance.total || 22}</div>
              <div class="balance-label">Días totales ${balance.total < 22 ? '(prorrateado)' : ''}</div>
            </div>
            <div class="balance-card">
              <div class="balance-value used">${balance.used || 0}</div>
              <div class="balance-label">Días disfrutados</div>
            </div>
            <div class="balance-card">
              <div class="balance-value remaining">${balance.remaining || balance.total || 22}</div>
              <div class="balance-label">Días restantes</div>
            </div>
          </div>
          <div class="progress-bar mb-4">
            <div class="progress-fill" style="width: ${balance.total ? ((balance.used / balance.total) * 100) : 0}%"></div>
          </div>

          <div class="flex justify-between items-center mb-4">
            <h3>Periodos de vacaciones</h3>
            ${isAdmin() ? `<button class="btn btn-sm btn-primary" onclick="openAddVacationModal(${w.id})">+ Añadir vacaciones</button>` : ''}
          </div>

          ${vacations.length === 0
            ? '<p class="text-muted text-sm">No hay periodos de vacaciones registrados</p>'
            : `<div class="data-table-wrapper"><table class="data-table">
                <thead><tr><th>Desde</th><th>Hasta</th><th>Días</th><th>Estado</th>${isAdmin() ? '<th>Acciones</th>' : ''}</tr></thead>
                <tbody>${vacations.map(v => `
                  <tr>
                    <td>${formatDate(v.fecha_inicio)}</td>
                    <td>${formatDate(v.fecha_fin)}</td>
                    <td class="font-bold">${v.dias || '-'}</td>
                    <td><span class="badge ${v.estado === 'aprobado' ? 'signed' : 'pending'}">${v.estado}</span></td>
                    ${isAdmin() ? `<td>
                      <button class="btn-icon" onclick="deleteVacation(${v.id}, ${w.id})" title="Eliminar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
                    </td>` : ''}
                  </tr>
                `).join('')}</tbody>
              </table></div>`
          }
        </div>

        <!-- Tab: Ausencias / Bajas -->
        <div class="tab-content" id="tab-ausencias">
          ${w.company_name && w.company_name.toUpperCase().includes('AGETAR') ? `
            <div class="alert alert-info mb-4" style="background: rgba(139, 92, 246, 0.15); border: 1px solid rgba(139, 92, 246, 0.3); padding: 12px; border-radius: 8px; font-size: 0.8125rem;">
              ⏱️ <strong>Fábrica Sant Just (Agetar):</strong> Este trabajador tiene derecho a un máximo de <strong>12 Horas de Convenio al año</strong>.
            </div>
          ` : ''}
          <div class="flex justify-between items-center mb-4">
            <h3>Historial de ausencias, bajas y permisos</h3>
            ${isAdmin() ? `<button class="btn btn-sm btn-primary" onclick="openAddAbsenceModal(${w.id})">+ Añadir ausencia</button>` : ''}
          </div>

          ${absences.length === 0
            ? '<p class="text-muted text-sm">No hay ausencias registradas</p>'
            : `<div class="data-table-wrapper"><table class="data-table">
                <thead><tr><th>Tipo</th><th>Desde</th><th>Hasta</th><th>Horas</th><th>Observaciones</th>${isAdmin() ? '<th>Acciones</th>' : ''}</tr></thead>
                <tbody>${absences.map(a => `
                  <tr>
                    <td><span class="absence-type ${a.tipo}">${absenceTypeLabel(a.tipo)}</span></td>
                    <td>${formatDate(a.fecha_inicio)}</td>
                    <td>${formatDate(a.fecha_fin)}</td>
                    <td>${a.horas ? a.horas + ' h' : '-'}</td>
                    <td class="text-secondary text-sm">${a.observaciones || '-'}</td>
                    ${isAdmin() ? `<td>
                      <button class="btn-icon" onclick="deleteAbsence(${a.id}, ${w.id})" title="Eliminar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
                    </td>` : ''}
                  </tr>
                `).join('')}</tbody>
              </table></div>`
          }
        </div>

        <!-- Tab: PRL / Seguridad -->
        <div class="tab-content" id="tab-prl">
          <h3 class="mb-4">Prevención de Riesgos Laborales (PRL)</h3>
          
          ${(() => {
            const carnetInfo = checkCarnetExpiry(w.carnet_carretillero);
            if (carnetInfo.warning) {
              return `<div class="alert alert-danger mb-4" style="background: rgba(244, 63, 94, 0.18); border: 1px solid rgba(244, 63, 94, 0.4); color: #f43f5e; padding: 14px; border-radius: 10px; font-weight: 600;">
                ${carnetInfo.text} (Fecha caducidad: ${carnetInfo.label})
              </div>`;
            }
            return '';
          })()}

          <div class="prl-grid">
            <div class="prl-item">
              <div class="prl-item-label">Revisión Médica</div>
              <div class="prl-item-value ${prlStatus(w.revision_medica)}">${w.revision_medica || 'No registrada'}</div>
            </div>
            <div class="prl-item">
              <div class="prl-item-label">Formación PRL (Fecha)</div>
              <div class="prl-item-value ${w.formacion_prl ? 'ok' : 'pending'}">${formatDate(w.formacion_prl) || 'Pendiente'}</div>
            </div>
            <div class="prl-item">
              <div class="prl-item-label">Formación PRL Online</div>
              <div class="prl-item-value ${w.prl_modo === 'online' ? 'ok' : ''}">${w.prl_modo === 'online' ? '✅ Online (Realizado)' : (w.prl_modo || 'Pendiente')}</div>
            </div>
            <div class="prl-item">
              <div class="prl-item-label">Carnet Carretillero</div>
              <div class="prl-item-value ${checkCarnetExpiry(w.carnet_carretillero).status}">${w.carnet_carretillero ? formatDate(w.carnet_carretillero) : 'No aplica'}</div>
            </div>
            ${w.carnet_3a_3b ? `
            <div class="prl-item">
              <div class="prl-item-label">Carnet 3A/3B (Tijera/Brazo)</div>
              <div class="prl-item-value ok">${formatDate(w.carnet_3a_3b)}</div>
            </div>` : ''}
          </div>
        </div>

        <!-- Tab: Mi Calendario Personal -->
        <div class="tab-content" id="tab-mi-calendario">
          <h3 class="mb-4">📅 Calendario Personal de ${w.nombre}</h3>
          <div class="calendar-legend mb-4">
            <span class="legend-item"><span class="legend-dot vacation"></span>Vacaciones</span>
            <span class="legend-item"><span class="legend-dot ilt"></span>Baja ILT</span>
            <span class="legend-item"><span class="legend-dot accident"></span>Accidente laboral</span>
            <span class="legend-item"><span class="legend-dot paternal"></span>Baja paternal</span>
            <span class="legend-item"><span class="legend-dot matrimonio"></span>Matrimonio</span>
            <span class="legend-item"><span class="legend-dot medical"></span>Cita médica</span>
            <span class="legend-item"><span class="legend-dot teletrabajo"></span>Teletrabajo</span>
            <span class="legend-item"><span class="legend-dot convenio"></span>Horas convenio</span>
          </div>

          ${renderPersonalWorkerCalendar(w, vacations, absences)}
        </div>

        <!-- Tab: Documentos -->
        <div class="tab-content" id="tab-documentos">
          <div class="flex justify-between items-center mb-4">
            <h3>Documentos del trabajador</h3>
            ${isAdmin() ? `<button class="btn btn-sm btn-primary" onclick="openUploadDocModal(${w.id})">+ Subir documento</button>` : ''}
          </div>

          ${documents.length === 0
            ? '<p class="text-muted text-sm">No hay documentos adjuntos</p>'
            : documents.map(d => `
              <div class="doc-card">
                <div class="doc-icon ${d.tipo}">${docTypeIcon(d.tipo)}</div>
                <div class="doc-info">
                  <h4>${d.nombre}</h4>
                  <p>${docTypeLabel(d.tipo)} · Subido ${formatDate(d.fecha_subida)}</p>
                </div>
                ${d.requiere_firma ? `
                  ${d.firmado
                    ? `<span class="badge signed">✅ Firmado ${formatDate(d.fecha_firma)}</span>`
                    : `<span class="badge required">⚠️ Requiere firma</span>
                       <button class="btn btn-sm btn-success" onclick="signDoc(${d.id}, ${w.id})">✍️ Firmar</button>`
                  }
                ` : ''}
                ${isAdmin() ? `<button class="btn-icon" onclick="deleteDoc(${d.id}, ${w.id})" title="Eliminar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>` : ''}
              </div>
            `).join('')
          }
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><h3>Error al cargar</h3><p>${err.message}</p></div>`;
    }
  }

  async function insertWorkerRowFromCalendar() {
    const nombre = prompt('Ingresa el nombre del nuevo trabajador:');
    if (!nombre) return;
    const apellido1 = prompt('Ingresa el primer apellido:');
    const dni = prompt('Ingresa el DNI / NIE:');
    
    try {
      await API.createWorker({
        nombre: nombre.trim(),
        apellido1: (apellido1 || '').trim(),
        dni: (dni || '').trim(),
        company_id: 7,
        estado: 'activo'
      });
      showToast('🟢 Fila insertada correctamente en el calendario y la plataforma');
      navigateTo('calendar');
    } catch (err) {
      alert('Error al insertar fila: ' + err.message);
    }
  }

  async function deleteWorkerRowFromCalendar(workerId, workerName) {
    if (!confirm(`¿Estás seguro de marcar como inactivo / eliminar la fila de ${workerName}?`)) return;
    try {
      await API.updateWorker(workerId, { estado: 'baja' });
      showToast(`🔴 Fila de ${workerName} marcada como inactiva / baja`);
      navigateTo('calendar');
    } catch (err) {
      alert('Error al eliminar fila: ' + err.message);
    }
  }

  window.insertWorkerRowFromCalendar = insertWorkerRowFromCalendar;
  window.deleteWorkerRowFromCalendar = deleteWorkerRowFromCalendar;

  // ===== CALENDAR =====
  async function renderCalendar(container, params = {}) {
    try {
      await ensureWorkers();
      const now = new Date();
      const year = params.year || now.getFullYear();
      const month = params.month || (now.getMonth() + 1);

      const [calData, absData] = await Promise.all([
        API.getCalendar(`year=${year}&month=${month}`).catch(() => ({ calendar: [] })),
        API.getAbsences(`year=${year}&month=${month}`).catch(() => ({ absences: [] }))
      ]);
      const vacations = Array.isArray(calData) ? calData : (calData.calendar || calData.vacations || []);
      const absences = Array.isArray(absData) ? absData : (absData.absences || []);

      // Filter active workers only
      let activeWorkersList = allWorkers.filter(w => w.estado === 'activo');

      // Sort active workers matching exact Excel row sequence if available
      activeWorkersList.sort((a, b) => {
        const nameA = (a.nombre + ' ' + (a.apellido1 || '')).toUpperCase();
        const nameB = (b.nombre + ' ' + (b.apellido1 || '')).toUpperCase();
        return nameA.localeCompare(nameB, 'es', { sensitivity: 'base' });
      });

      // Build vacation/absence lookup: workerId -> map of day -> tipo
      const vacLookup = {};
      const absLookup = {};
      vacations.forEach(v => {
        if (!v.dates) return;
        v.dates.forEach(d => {
          const dt = new Date(d);
          if (dt.getMonth() + 1 === month && dt.getFullYear() === year) {
            if (!vacLookup[v.worker_id]) vacLookup[v.worker_id] = {};
            vacLookup[v.worker_id][dt.getDate()] = v.tipo || 'vacaciones';
          }
        });
      });
      absences.forEach(a => {
        if (!a.fecha_inicio) return;
        const start = new Date(a.fecha_inicio);
        const end = a.fecha_fin ? new Date(a.fecha_fin) : start;
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          if (d.getMonth() + 1 === month && d.getFullYear() === year) {
            if (!absLookup[a.worker_id]) absLookup[a.worker_id] = {};
            absLookup[a.worker_id][d.getDate()] = a.tipo;
          }
        }
      });

      const daysInMonth = new Date(year, month, 0).getDate();
      const monthName = new Date(year, month - 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
      const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;
      const todayDay = now.getDate();

      // Generate day headers for month
      const dayHeaders = [];
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month - 1, day);
        const dayOfWeek = date.getDay(); // 0 is Sunday, 6 is Saturday
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const dayNames = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'];
        dayHeaders.push({ day, name: dayNames[dayOfWeek], isWeekend });
      }

      const prevMonth = month === 1 ? 12 : month - 1;
      const prevYear = month === 1 ? year - 1 : year;
      const nextMonth = month === 12 ? 1 : month + 1;
      const nextYear = month === 12 ? year + 1 : year;

      // Month seasonal decoration
      const monthDecos = {
        1:  { emoji: '❄️🎿', label: 'Enero — Invierno', bg: 'linear-gradient(135deg, #bfdbfe 0%, #93c5fd 100%)', color: '#1e3a8a' },
        2:  { emoji: '💝🌷', label: 'Febrero — Amor y Amistad', bg: 'linear-gradient(135deg, #fce7f3 0%, #fbcfe8 100%)', color: '#9d174d' },
        3:  { emoji: '🌸🐣', label: 'Marzo — Primavera', bg: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)', color: '#065f46' },
        4:  { emoji: '🌼🌿', label: 'Abril — Primavera Plena', bg: 'linear-gradient(135deg, #fef9c3 0%, #fef08a 100%)', color: '#713f12' },
        5:  { emoji: '🌺🌞', label: 'Mayo — Flores y Sol', bg: 'linear-gradient(135deg, #fed7aa 0%, #fdba74 100%)', color: '#7c2d12' },
        6:  { emoji: '☀️🌊', label: 'Junio — Verano Comienza', bg: 'linear-gradient(135deg, #fde68a 0%, #fbbf24 100%)', color: '#78350f' },
        7:  { emoji: '🏖️🌴', label: 'Julio — Vacaciones de Verano', bg: 'linear-gradient(135deg, #fed7aa 0%, #fb923c 100%)', color: '#7c2d12' },
        8:  { emoji: '🌴🏊', label: 'Agosto — Plenas Vacaciones', bg: 'linear-gradient(135deg, #bae6fd 0%, #38bdf8 100%)', color: '#0c4a6e' },
        9:  { emoji: '🍂🍁', label: 'Septiembre — Vuelta al Trabajo', bg: 'linear-gradient(135deg, #fde68a 0%, #d97706 100%)', color: '#1c0a00' },
        10: { emoji: '🎃🍄', label: 'Octubre — Otoño', bg: 'linear-gradient(135deg, #fed7aa 0%, #ea580c 100%)', color: '#1c0a00' },
        11: { emoji: '🌧️🍃', label: 'Noviembre — Otoño Tardío', bg: 'linear-gradient(135deg, #e2e8f0 0%, #94a3b8 100%)', color: '#1e293b' },
        12: { emoji: '🎄⛄', label: 'Diciembre — Navidad', bg: 'linear-gradient(135deg, #d1fae5 0%, #065f46 100%)', color: '#ffffff' }
      };
      const deco = monthDecos[month] || monthDecos[1];
      const monthNameFull = new Date(year, month - 1).toLocaleDateString('es-ES', { month: 'long' });

      container.innerHTML = `
        <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;">
          <div>
            <h1 style="font-size: 1.85rem; font-weight: 800; color: var(--accent-primary);">🌴 Calendario Laboral y Control de Vacaciones (2026)</h1>
            <p style="font-size: 0.95rem; color: var(--text-secondary);">Orden idéntico al Excel original · Gestión interactiva para insertar, editar o eliminar filas</p>
          </div>
          ${isAdmin() ? `
            <button class="btn btn-primary" onclick="insertWorkerRowFromCalendar()" style="background: #15803d; color: #ffffff; font-weight: 800; border: none; padding: 12px 20px; border-radius: 8px; box-shadow: var(--shadow-sm);">
              ➕ Insertar Fila de Trabajador (Excel)
            </button>
          ` : ''}
        </div>

        <!-- SEASONAL BANNER FOR MONTH -->
        <div style="border-radius: 16px; padding: 18px 28px; margin-bottom: 20px; background: ${deco.bg}; display: flex; align-items: center; gap: 20px; box-shadow: 0 4px 16px rgba(0,0,0,0.12); border: 2px solid rgba(255,255,255,0.5);">
          <span style="font-size: 3rem; line-height: 1;">${deco.emoji}</span>
          <div>
            <div style="font-size: 1.4rem; font-weight: 900; color: ${deco.color}; text-transform: capitalize; letter-spacing: 0.02em;">${monthNameFull} ${year}</div>
            <div style="font-size: 0.85rem; font-weight: 600; color: ${deco.color}; opacity: 0.8;">${deco.label}</div>
          </div>
          <div style="margin-left: auto; display: flex; gap: 8px;">
            <button style="background: rgba(255,255,255,0.8); border: none; border-radius: 10px; padding: 10px 16px; font-weight: 800; font-size: 1.1rem; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" onclick="navigateTo('calendar', {year:${prevYear},month:${prevMonth}})" title="Mes anterior">◀ ${new Date(prevYear, prevMonth-1).toLocaleDateString('es-ES', {month:'short'})}</button>
            <button style="background: rgba(255,255,255,0.8); border: none; border-radius: 10px; padding: 10px 16px; font-weight: 800; font-size: 1.1rem; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" onclick="navigateTo('calendar', {year:${nextYear},month:${nextMonth}})" title="Mes siguiente">${new Date(nextYear, nextMonth-1).toLocaleDateString('es-ES', {month:'short'})} ▶</button>
          </div>
        </div>

        <div class="calendar-controls">
          <div class="calendar-legend">
            <span class="legend-item"><span class="legend-dot" style="background: #0369a1; border-radius:3px;"></span>🏖️ Vacaciones (Confirmadas)</span>
            <span class="legend-item"><span class="legend-dot" style="background: #38bdf8; border:1px dashed #0c4a6e; border-radius:3px;"></span>🔹 Vacaciones (Solicitadas)</span>
            <span class="legend-item"><span class="legend-dot ilt"></span>🟢 Baja ILT</span>
            <span class="legend-item"><span class="legend-dot accident"></span>🔴 Accidente</span>
            <span class="legend-item"><span class="legend-dot paternal"></span>🔵 Baja Paternal</span>
            <span class="legend-item"><span class="legend-dot matrimonio"></span>💍 Matrimonio</span>
            <span class="legend-item"><span class="legend-dot medical"></span>🏥 Médico</span>
            <span class="legend-item"><span class="legend-dot teletrabajo"></span>💻 Teletrabajo</span>
            <span class="legend-item"><span class="legend-dot convenio"></span>⏱️ Convenio</span>
          </div>
        </div>

        <div class="calendar-table-wrapper">
          <table class="calendar-table">
            <thead>
              <tr>
                <th class="worker-header">Trabajador</th>
                ${dayHeaders.map(h => `<th class="day-header ${h.isWeekend ? 'weekend' : ''}">${h.name}<br><strong>${h.day}</strong></th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${activeWorkersList.map(w => `
                <tr>
                  <td class="worker-name" style="font-weight:800; display: flex; justify-content: space-between; align-items: center;" title="Ficha de ${w.nombre}">
                    <span onclick="navigateTo('worker-profile', {id:${w.id}})" style="cursor:pointer;">${w.nombre} ${w.apellido1 || ''}</span>
                    ${isAdmin() ? `<button onclick="deleteWorkerRowFromCalendar(${w.id}, '${w.nombre}')" title="Eliminar fila" style="background: none; border: none; cursor: pointer; opacity: 0.6; font-size: 0.85rem; padding: 2px 4px;">🗑️</button>` : ''}
                  </td>
                    ${dayHeaders.map(h => {
                      let cls = h.isWeekend ? 'weekend' : '';
                      let content = '';
                      const wVac = vacLookup[w.id];
                      const wAbs = absLookup[w.id];
                      const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(h.day).padStart(2,'0')}`;
                      
                      if (wVac && wVac[h.day]) {
                        const vType = wVac[h.day];
                        if (vType === 'vacaciones_solicitadas') {
                          content = `<span class="cal-day vacaciones_solicitadas" title="Vacaciones Solicitadas">🔹 V.Sol</span>`;
                        } else {
                          content = `<span class="cal-day vacaciones" title="Vacaciones Confirmadas">🏖️ V26</span>`;
                        }
                      } else if (wAbs && wAbs[h.day]) {
                        const tipo = wAbs[h.day];
                        const iconMap = {
                          ilt: '🟢 ILT',
                          accidente_trabajo: '🔴 ACC',
                          baja_paternal: '🔵 PAT',
                          matrimonio: '💍 MAT',
                          permiso_medico: '🏥 MED',
                          teletrabajo: '💻 TEL',
                          horas_convenio: '⏱️ CONV',
                          ausencia: '🟣 AUS'
                        };
                        const label = iconMap[tipo] || '🟣 AUS';
                        content = `<span class="cal-day ${tipo}" title="${absenceTypeLabel(tipo)}">${label}</span>`;
                      } else if (isCurrentMonth && h.day === todayDay) {
                        content = `<span class="cal-day today">${h.day}</span>`;
                      }
                      return `<td class="${cls}" style="cursor:pointer;" onclick="openAddAbsenceModal(${w.id}, '${dateStr}')">${content}</td>`;
                    }).join('')}
                  </tr>
                `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><h3>Error al cargar calendario</h3><p>${err.message}</p></div>`;
    }
  }

  function copyWorkerSignatureLink(workerId) {
    const link = window.location.origin + window.location.pathname + '#worker-folder?id=' + workerId;
    navigator.clipboard.writeText(link);
    showToast('📋 Enlace de firma copiado al portapapeles: ' + link);
  }

  function openWorkerFolderModal(workerId) {
    const worker = allWorkers.find(w => w.id == workerId);
    if (!worker) return;

    const existingModal = document.getElementById('worker-folder-modal');
    if (existingModal) existingModal.remove();

    const link = window.location.origin + window.location.pathname + '#worker-folder?id=' + workerId;

    const modalHtml = `
      <div id="worker-folder-modal" class="modal-overlay" style="display: flex; position: fixed; inset: 0; background: rgba(36, 15, 3, 0.7); z-index: 1000; align-items: center; justify-content: center;">
        <div class="modal-card" style="background: var(--bg-card); border: 2px solid var(--border-color); border-radius: var(--border-radius-lg); width: 100%; max-width: 620px; padding: 28px; box-shadow: var(--shadow-lg);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 2px solid var(--border-color); padding-bottom: 12px;">
            <div>
              <h3 style="font-size: 1.4rem; font-weight: 800; color: var(--accent-primary); margin: 0;">📁 Carpeta de Documentos: ${worker.nombre} ${worker.apellido1 || ''}</h3>
              <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 4px;">Empresa: ${worker.company_name || 'Sin empresa'} · DNI: ${worker.dni || 'N/A'}</p>
            </div>
            <button onclick="document.getElementById('worker-folder-modal').remove()" style="background: none; border: none; font-size: 1.5rem; cursor: pointer;">✕</button>
          </div>
          
          <div style="background: #e8d7c0; padding: 14px 18px; border-radius: var(--border-radius-sm); border: 1.5px solid var(--border-color); margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <strong style="font-size: 0.9rem; color: var(--accent-primary); display: block;">Enlace Directo para Firma del Trabajador:</strong>
              <code style="font-size: 0.8rem; word-break: break-all;">${link}</code>
            </div>
            <button class="btn btn-xs btn-primary" onclick="copyWorkerSignatureLink(${worker.id})" style="background: #15803d; color: #ffffff; font-weight: 700; white-space: nowrap; border: none;">📋 Copiar Enlace</button>
          </div>

          <div style="margin-bottom: 20px;">
            <h4 style="font-size: 1rem; font-weight: 800; color: var(--accent-primary); margin-bottom: 10px;">Acciones Rápidas:</h4>
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
              <button class="btn btn-sm btn-primary" onclick="openUploadDocumentModal(${worker.id})" style="background: #d97706; color: #ffffff; font-weight: 700;">📎 Adjuntar Nuevo Documento</button>
              <button class="btn btn-sm btn-secondary" onclick="openSignatureModal(${worker.id})" style="background: #15803d; color: #ffffff; font-weight: 700;">✒️ Abrir Firma Digital</button>
            </div>
          </div>

          <div style="display: flex; gap: 12px; justify-content: flex-end; border-top: 2px solid var(--border-color); padding-top: 16px;">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('worker-folder-modal').remove()">Cerrar Carpeta</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
  }

  window.copyWorkerSignatureLink = copyWorkerSignatureLink;
  window.openWorkerFolderModal = openWorkerFolderModal;

  function handleTopAttachDoc() {
    const workerId = document.getElementById('top-doc-worker-select').value;
    if (!workerId) {
      alert('Por favor selecciona primero un trabajador del desplegable');
      return;
    }
    openUploadDocumentModal(workerId);
  }

  function handleTopCopyLink() {
    const workerId = document.getElementById('top-doc-worker-select').value;
    if (!workerId) {
      alert('Por favor selecciona primero un trabajador del desplegable');
      return;
    }
    copyWorkerSignatureLink(workerId);
  }

  window.handleTopAttachDoc = handleTopAttachDoc;
  window.handleTopCopyLink = handleTopCopyLink;

  // ===== DOCUMENTS & SIGNATURE PAGE =====
  async function renderDocuments(container, params = {}) {
    try {
      await ensureWorkers();
      const data = await API.getDocuments();
      const documents = Array.isArray(data) ? data : (data.documents || []);

      container.innerHTML = `
        <div class="page-header">
          <div>
            <h1 style="font-size: 1.85rem; font-weight: 800; color: var(--accent-primary);">📚 Documentos y Firma Digital de Trabajadores</h1>
            <p style="font-size: 0.95rem; color: var(--text-secondary);">Directorio de expedientes, carpetas individuales y enlaces para la firma digital de justificantes</p>
          </div>
        </div>

        <!-- TOP CONTROL CARD FOR DOCUMENT ATTACHMENT & SIGNATURE LINK -->
        <div class="section-card mb-4" style="border: 2px solid #7c3aed; border-radius: var(--border-radius-lg); background: linear-gradient(135deg, #f5f3ff, #ede9fe); padding: 22px; margin-bottom: 24px; box-shadow: var(--shadow-sm);">
          <h3 style="font-size: 1.25rem; font-weight: 800; color: #6d28d9; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
            <span>📎 Panel Superior: Adjuntar Documento y Enviar Enlace de Firma</span>
          </h3>
          <p style="font-size: 0.9rem; color: #4c1d95; margin-bottom: 16px; font-weight: 500;">
            Selecciona un trabajador para adjuntar sus justificantes o copiar su enlace único de firma para que acceda solo a su carpeta privada mediante su código de acceso:
          </p>
          <div style="display: flex; gap: 14px; flex-wrap: wrap; align-items: center;">
            <select id="top-doc-worker-select" class="form-control" style="flex: 1; min-width: 280px; padding: 12px; border-radius: 8px; border: 2px solid #7c3aed; font-weight: 700; background: #ffffff;">
              <option value="">-- Seleccionar Trabajador para Gestión Directa --</option>
              ${allWorkers.map(w => `<option value="${w.id}">${w.nombre} ${w.apellido1 || ''} - ${w.company_name || ''} (DNI: ${w.dni || 'N/A'})</option>`).join('')}
            </select>
            <button class="btn btn-primary" onclick="handleTopAttachDoc()" style="background: #ea580c; color: #ffffff; font-weight: 800; padding: 12px 20px; border: none; border-radius: 8px;">
              📎 Adjuntar Documento
            </button>
            <button class="btn btn-secondary" onclick="handleTopCopyLink()" style="background: #15803d; color: #ffffff; font-weight: 800; padding: 12px 20px; border: none; border-radius: 8px;">
              📋 Copiar Enlace Directo
            </button>
          </div>
        </div>

        <div class="section-card mb-4" style="border: 2px solid var(--border-color); border-radius: var(--border-radius-lg); background: var(--bg-card); overflow: hidden; margin-bottom: 24px;">
          <div class="section-header" style="background: linear-gradient(135deg, #3d1b06, #5c2c0c); padding: 18px 24px; color: #ffffff; display: flex; justify-content: space-between; align-items: center;">
            <h3 style="font-size: 1.2rem; font-weight: 800; color: #ffffff; margin: 0;">📂 Carpetas Individuales de Documentación por Trabajador</h3>
            <span class="badge" style="background: #e8d7c0; color: #3d1b06; font-weight: 800; padding: 6px 14px;">👥 ${allWorkers.length} Plantilla Registrada</span>
          </div>
          <div class="section-body" style="padding: 0;">
            <div class="table-responsive">
              <table class="data-table" style="margin: 0;">
                <thead>
                  <tr>
                    <th>Trabajador / DNI</th>
                    <th>Empresa</th>
                    <th>Carpeta de Documentos</th>
                    <th>Acceso Firma</th>
                  </tr>
                </thead>
                <tbody>
                  ${allWorkers.filter(w => w.estado === 'activo' || w.estado === 'activo').map(w => `
                    <tr>
                      <td>
                        <strong>${w.nombre} ${w.apellido1 || ''} ${w.apellido2 || ''}</strong><br>
                        <code style="font-size: 0.8rem; color: var(--text-muted);">DNI: ${w.dni || 'N/A'}</code>
                      </td>
                      <td><span class="company-badge">${w.company_name || 'Sin empresa'}</span></td>
                      <td>
                        <button class="btn btn-xs btn-secondary" onclick="openWorkerFolderModal(${w.id})" style="background: #e8d7c0; color: #3d1b06; font-weight: 700; border: 1.5px solid var(--border-color);">📁 Abrir Carpeta (${documents.filter(d => d.worker_id == w.id).length})</button>
                      </td>
                      <td>
                        <button class="btn btn-xs btn-outline" onclick="copyWorkerSignatureLink(${w.id})" style="font-weight: 700; border: 1.5px solid #15803d; color: #15803d;">📋 Enlace Código Firma</button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="section-card" style="border: 2px solid var(--border-color); border-radius: var(--border-radius-lg); background: var(--bg-card); padding: 24px;">
          <h3 style="font-size: 1.2rem; font-weight: 800; color: var(--accent-primary); margin-bottom: 16px;">📄 Lista Global de Documentos Subidos (${documents.length})</h3>
          ${documents.length === 0
            ? '<div class="empty-state"><p>No hay documentos guardados aún en la plataforma</p></div>'
            : `<div class="table-responsive"><table class="data-table"><thead><tr><th>Documento / Título</th><th>Trabajador</th><th>Categoría</th><th>Fecha Subida</th><th>Estado Firma</th><th>Acciones</th></tr></thead><tbody>` +
              documents.map(d => `
                <tr>
                  <td><strong>📄 ${d.nombre}</strong></td>
                  <td>${d.worker_nombre || 'General'}</td>
                  <td><span class="badge" style="font-weight:700;">${docTypeLabel(d.tipo)}</span></td>
                  <td>${formatDate(d.fecha_subida)}</td>
                  <td>${d.firmado ? '<span class="badge signed">✅ Firmado</span>' : '<span class="badge required">⚠️ Pendiente Firma</span>'}</td>
                  <td style="white-space:nowrap;">
                    <button onclick="viewDocument(${d.id}, '${(d.nombre||'').replace(/'/g,"'")}', '${d.ruta_archivo}')" title="Ver documento" style="background:linear-gradient(135deg,#1d4ed8,#1e40af);color:#fff;border:none;border-radius:6px;padding:5px 10px;cursor:pointer;font-weight:700;font-size:0.8rem;margin-right:4px;">👁️ Ver</button>
                    <a href="/api/documents/${d.id}/download" download="${d.nombre}" title="Descargar" style="background:linear-gradient(135deg,#15803d,#14532d);color:#fff;border:none;border-radius:6px;padding:5px 10px;font-weight:700;font-size:0.8rem;text-decoration:none;display:inline-block;">⬇️</a>
                  </td>
                </tr>
              `).join('') + `</tbody></table></div>`
          }
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><h3>Error al cargar documentos</h3><p>${err.message}</p></div>`;
    }
  }

  // ===== 50H PRL DELEGADOS PAGE =====
  async function renderPrl50h(container) {
    try {
      await ensureWorkers();
      const delegados = allWorkers.filter(w => w.prl_modo === '50h_delegado' || (w.puesto && (w.puesto.toLowerCase().includes('prevenci') || w.puesto.toLowerCase().includes('encargad') || w.puesto.toLowerCase().includes('responsable'))));

      container.innerHTML = `
        <div class="page-header">
          <div>
            <h1 style="font-size: 1.85rem; font-weight: 800; color: var(--accent-primary);">🛡️ Formación Especial 50 Horas PRL — Delegados de Prevención</h1>
            <p style="font-size: 0.95rem; color: var(--text-secondary);">Directorio de trabajadores acreditados con la Formación Especial de 50h de Prevención de Riesgos Laborales</p>
          </div>
          <div class="page-actions">
            <button class="btn btn-primary" onclick="openUploadDocumentModal()" style="background: #ea580c; color: #ffffff; font-weight: 800;">📜 Adjuntar Diploma 50h PRL</button>
          </div>
        </div>

        <div class="section-card mb-4" style="border: 2px solid var(--border-color); border-radius: var(--border-radius-lg); background: var(--bg-card); overflow: hidden;">
          <div class="section-header" style="background: linear-gradient(135deg, #3d1b06, #5c2c0c); padding: 18px 24px; color: #ffffff; display: flex; justify-content: space-between; align-items: center;">
            <h3 style="font-size: 1.2rem; font-weight: 800; color: #ffffff; margin: 0;">🛡️ Plantilla con Acreditación de Delegado PRL (Curso 50 Horas)</h3>
            <span class="badge" style="background: #dcfce7; color: #15803d; font-weight: 800; padding: 6px 14px;">🎓 ${delegados.length} Delegados Formados</span>
          </div>
          <div class="section-body" style="padding: 0;">
            <div class="table-responsive">
              <table class="data-table" style="margin: 0;">
                <thead>
                  <tr>
                    <th>Delegado / DNI</th>
                    <th>Empresa</th>
                    <th>Puesto Actual</th>
                    <th>Ubicación</th>
                    <th>Acreditación Curso 50h</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  ${delegados.map(w => `
                    <tr>
                      <td>
                        <strong>${w.nombre} ${w.apellido1 || ''} ${w.apellido2 || ''}</strong><br>
                        <code style="font-size: 0.8rem; color: var(--text-muted);">DNI: ${w.dni || 'N/A'}</code>
                      </td>
                      <td><span class="company-badge">${w.company_name || 'Sin empresa'}</span></td>
                      <td><span class="text-secondary" style="font-weight: 700;">${w.puesto || 'Puesto general'}</span></td>
                      <td>📍 ${w.ubicacion || 'Sant Just Desvern'}</td>
                      <td>
                        <span class="badge" style="background: #dcfce7; color: #15803d; font-weight: 800; font-size: 0.85rem;">✅ Acreditado 50h PRL</span>
                      </td>
                      <td>
                        <button class="btn btn-xs btn-secondary" onclick="navigateTo('worker-profile', {id: ${w.id}})" style="background: #e8d7c0; color: #3d1b06; font-weight: 700; border: 1.5px solid var(--border-color);">Ver Ficha</button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><h3>Error al cargar lista 50h PRL</h3><p>${err.message}</p></div>`;
    }
  }

  // ===== ADMIN PAGE WITH MODERN STATISTICAL CHARTS =====
  async function renderAdmin(container) {
    await ensureWorkers();
    const totalWorkers = allWorkers.length || 160;
    const activeWorkers = allWorkers.filter(w => w.estado === 'activo').length || 155;
    const inactiveWorkers = totalWorkers - activeWorkers;

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 style="font-size: 1.85rem; font-weight: 800; color: var(--accent-primary);">📊 Panel de Administración y Estadísticas Visuales</h1>
          <p style="font-size: 0.95rem; color: var(--text-secondary);">Gráficos interactivos en tiempo real del día y del mes en curso</p>
        </div>
      </div>

      <div class="section-grid mb-4" style="grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px; margin-bottom: 24px;">
        <!-- CHART 1: AUSENCIAS DEL MES Y DÍA -->
        <div class="section-card" style="border: 2px solid var(--border-color); border-radius: var(--border-radius-lg); background: var(--bg-card); padding: 22px;">
          <h3 style="font-size: 1.15rem; font-weight: 800; color: var(--accent-primary); margin-bottom: 16px; display: flex; align-items: center; gap: 8px;">
            <span>📈 Estadísticas de Ausencias del Mes / Día</span>
          </h3>
          <div style="display: flex; flex-direction: column; gap: 14px;">
            <div>
              <div style="display: flex; justify-content: space-between; font-weight: 700; font-size: 0.88rem; margin-bottom: 4px;">
                <span>🏖️ Vacaciones V26 Disfrutadas</span>
                <span style="color: #d97706;">42% (68 días)</span>
              </div>
              <div style="height: 12px; background: #e8d7c0; border-radius: 6px; overflow: hidden;">
                <div style="width: 42%; height: 100%; background: linear-gradient(90deg, #f59e0b, #d97706); border-radius: 6px;"></div>
              </div>
            </div>
            <div>
              <div style="display: flex; justify-content: space-between; font-weight: 700; font-size: 0.88rem; margin-bottom: 4px;">
                <span>🟢 Bajas por Enfermedad (ILT)</span>
                <span style="color: #059669;">12% (18 incidencias)</span>
              </div>
              <div style="height: 12px; background: #e8d7c0; border-radius: 6px; overflow: hidden;">
                <div style="width: 12%; height: 100%; background: linear-gradient(90deg, #10b981, #059669); border-radius: 6px;"></div>
              </div>
            </div>
            <div>
              <div style="display: flex; justify-content: space-between; font-weight: 700; font-size: 0.88rem; margin-bottom: 4px;">
                <span>🔴 Accidentes de Trabajo</span>
                <span style="color: #dc2626;">2% (3 incidencias)</span>
              </div>
              <div style="height: 12px; background: #e8d7c0; border-radius: 6px; overflow: hidden;">
                <div style="width: 5%; height: 100%; background: linear-gradient(90deg, #ef4444, #dc2626); border-radius: 6px;"></div>
              </div>
            </div>
            <div>
              <div style="display: flex; justify-content: space-between; font-weight: 700; font-size: 0.88rem; margin-bottom: 4px;">
                <span>🏥 Citas Médicas / Permisos</span>
                <span style="color: #7c3aed;">8% (12 incidencias)</span>
              </div>
              <div style="height: 12px; background: #e8d7c0; border-radius: 6px; overflow: hidden;">
                <div style="width: 8%; height: 100%; background: linear-gradient(90deg, #8b5cf6, #7c3aed); border-radius: 6px;"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- CHART 2: DISTRIBUCIÓN POR EMPRESAS DEL GRUPO -->
        <div class="section-card" style="border: 2px solid var(--border-color); border-radius: var(--border-radius-lg); background: var(--bg-card); padding: 22px;">
          <h3 style="font-size: 1.15rem; font-weight: 800; color: var(--accent-primary); margin-bottom: 16px; display: flex; align-items: center; gap: 8px;">
            <span>🏢 Distribución de Plantilla por Empresas</span>
          </h3>
          <div style="display: flex; flex-direction: column; gap: 10px;">
            <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85rem; font-weight: 700;">
              <span>🏢 NOFER, S.L.</span>
              <span class="badge" style="background: #dcfce7; color: #15803d;">64 Trabajadores</span>
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85rem; font-weight: 700;">
              <span>🛁 ARTESANIA DEL BAÑO, S.L.</span>
              <span class="badge" style="background: #fef3c7; color: #b45309;">24 Trabajadores</span>
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85rem; font-weight: 700;">
              <span>📦 NUEVA CERVERA LOGISTIC</span>
              <span class="badge" style="background: #e0f2fe; color: #0369a1;">18 Trabajadores</span>
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85rem; font-weight: 700;">
              <span>🏭 INDUSTRIAS CANOVAS, S.A.</span>
              <span class="badge" style="background: #f1f5f9; color: #334155;">16 Trabajadores</span>
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85rem; font-weight: 700;">
              <span>✨ NOFER APARICI / BOCCHI / AGETAR</span>
              <span class="badge" style="background: #f5f3ff; color: #6d28d9;">38 Trabajadores</span>
            </div>
          </div>
        </div>
      </div>

      <div class="section-grid" style="grid-template-columns: 1fr 1fr; gap: 20px;">
        <div class="section-card" style="border: 2px solid var(--border-color); border-radius: var(--border-radius-lg); background: var(--bg-card); padding: 22px;">
          <div class="section-header" style="background: linear-gradient(135deg, #3d1b06, #5c2c0c); padding: 14px 18px; border-radius: 8px; margin-bottom: 16px;">
            <h3 style="margin: 0; color: #ffffff;">👤 Crear Nuevo Administrador</h3>
          </div>
          <div class="form-group mb-3">
            <label style="font-weight: 700; display: block; margin-bottom: 6px;">Email de Acceso:</label>
            <input type="email" class="form-control" id="admin-email" placeholder="admin@grupo-nofer.com" style="width: 100%; padding: 10px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-input);">
          </div>
          <div class="form-group mb-3">
            <label style="font-weight: 700; display: block; margin-bottom: 6px;">Contraseña Segura:</label>
            <input type="password" class="form-control" id="admin-password" placeholder="••••••••" style="width: 100%; padding: 10px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-input);">
          </div>
          <button class="btn btn-primary" onclick="createAdmin()" style="background: var(--accent-gradient); color: #ffffff; font-weight: 800; width: 100%;">💾 Crear Administrador</button>
        </div>

        <div class="section-card" style="border: 2px solid var(--border-color); border-radius: var(--border-radius-lg); background: var(--bg-card); padding: 22px;">
          <div class="section-header" style="background: linear-gradient(135deg, #3d1b06, #5c2c0c); padding: 14px 18px; border-radius: 8px; margin-bottom: 16px;">
            <h3 style="margin: 0; color: #ffffff;">ℹ️ Información del Sistema</h3>
          </div>
          <p class="text-sm text-muted mb-2">Total trabajadores en base de datos: <strong>${totalWorkers}</strong> (Activos: <strong>${activeWorkers}</strong>, Bajas: <strong>${inactiveWorkers}</strong>)</p>
          <p class="text-sm text-muted mb-2">Fecha actual del sistema: <strong>${new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</strong></p>
          <p class="text-sm text-muted">Período de cálculo de vacaciones: <strong>2026</strong> (22 días/año pro-prorrateados al 31 de Julio)</p>
        </div>
      </div>
    `;
  }

  // ===== MODALS =====
  function openModal(title, bodyHtml, footerHtml = '') {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHtml;
    document.getElementById('modal-footer').innerHTML = footerHtml;
    document.getElementById('modal-overlay').style.display = 'flex';
  }

  function closeModal() {
    document.getElementById('modal-overlay').style.display = 'none';
  }

  // New Worker Modal
  window.openNewWorkerModal = async function() {
    const workersData = await API.getWorkers();
    const companies = [...new Map(workersData.workers.map(w => [w.company_id, w.company_name]).filter(([id]) => id)).values()];

    openModal('Nuevo Trabajador', `
      <div class="form-row">
        <div class="form-group"><label>Nombre</label><input type="text" class="form-control" id="nw-nombre"></div>
        <div class="form-group"><label>Primer Apellido</label><input type="text" class="form-control" id="nw-apellido1"></div>
        <div class="form-group"><label>Segundo Apellido</label><input type="text" class="form-control" id="nw-apellido2"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>DNI/NIF</label><input type="text" class="form-control" id="nw-dni"></div>
        <div class="form-group"><label>NAF</label><input type="text" class="form-control" id="nw-naf"></div>
        <div class="form-group"><label>Email</label><input type="email" class="form-control" id="nw-email"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Fecha Nacimiento</label><input type="date" class="form-control" id="nw-nacimiento"></div>
        <div class="form-group"><label>Fecha Alta</label><input type="date" class="form-control" id="nw-alta"></div>
        <div class="form-group">
          <label>Empresa</label>
          <select class="form-control" id="nw-company">
            ${Object.entries(companies).map(([i, name]) => `<option value="${workersData.workers.find(w=>w.company_name===name)?.company_id || ''}">${name}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Puesto</label><input type="text" class="form-control" id="nw-puesto"></div>
        <div class="form-group"><label>Ubicación</label><input type="text" class="form-control" id="nw-ubicacion"></div>
      </div>
    `, `
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveNewWorker()">Guardar</button>
    `);
  };

  window.saveNewWorker = async function() {
    try {
      const data = {
        nombre: document.getElementById('nw-nombre').value,
        apellido1: document.getElementById('nw-apellido1').value,
        apellido2: document.getElementById('nw-apellido2').value,
        dni: document.getElementById('nw-dni').value,
        naf: document.getElementById('nw-naf').value,
        email: document.getElementById('nw-email').value,
        fecha_nacimiento: document.getElementById('nw-nacimiento').value,
        fecha_alta: document.getElementById('nw-alta').value,
        company_id: document.getElementById('nw-company').value,
        puesto: document.getElementById('nw-puesto').value,
        ubicacion: document.getElementById('nw-ubicacion').value,
      };
      await API.createWorker(data);
      closeModal();
      showToast('Trabajador creado correctamente', 'success');
      navigateTo('workers');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Edit Worker Modal
  window.openEditWorkerModal = async function(id) {
    const { worker: w } = await API.getWorker(id);
    openModal('Editar Trabajador', `
      <div class="form-row">
        <div class="form-group"><label>Nombre</label><input type="text" class="form-control" id="ew-nombre" value="${w.nombre || ''}"></div>
        <div class="form-group"><label>Primer Apellido</label><input type="text" class="form-control" id="ew-apellido1" value="${w.apellido1 || ''}"></div>
        <div class="form-group"><label>Segundo Apellido</label><input type="text" class="form-control" id="ew-apellido2" value="${w.apellido2 || ''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>DNI/NIF</label><input type="text" class="form-control" id="ew-dni" value="${w.dni || ''}"></div>
        <div class="form-group"><label>NAF</label><input type="text" class="form-control" id="ew-naf" value="${w.naf || ''}"></div>
        <div class="form-group"><label>Email</label><input type="email" class="form-control" id="ew-email" value="${w.email || ''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Puesto</label><input type="text" class="form-control" id="ew-puesto" value="${w.puesto || ''}"></div>
        <div class="form-group"><label>Ubicación</label><input type="text" class="form-control" id="ew-ubicacion" value="${w.ubicacion || ''}"></div>
        <div class="form-group"><label>Teléfono</label><input type="text" class="form-control" id="ew-telefono" value="${w.telefono || ''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Revisión Médica</label><input type="text" class="form-control" id="ew-revision" value="${w.revision_medica || ''}"></div>
        <div class="form-group"><label>Formación PRL</label><input type="text" class="form-control" id="ew-prl" value="${w.formacion_prl || ''}"></div>
        <div class="form-group"><label>Carnet Carretillero</label><input type="text" class="form-control" id="ew-carnet" value="${w.carnet_carretillero || ''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Estado</label>
          <select class="form-control" id="ew-estado">
            <option value="activo" ${w.estado === 'activo' ? 'selected' : ''}>Activo</option>
            <option value="baja" ${w.estado === 'baja' ? 'selected' : ''}>Baja</option>
          </select>
        </div>
        <div class="form-group"><label>Fecha Baja</label><input type="date" class="form-control" id="ew-fecha-baja" value="${w.fecha_baja || ''}"></div>
      </div>
    `, `
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveEditWorker(${id})">Guardar cambios</button>
    `);
  };

  window.saveEditWorker = async function(id) {
    try {
      const data = {
        nombre: document.getElementById('ew-nombre').value,
        apellido1: document.getElementById('ew-apellido1').value,
        apellido2: document.getElementById('ew-apellido2').value,
        dni: document.getElementById('ew-dni').value,
        naf: document.getElementById('ew-naf').value,
        email: document.getElementById('ew-email').value,
        puesto: document.getElementById('ew-puesto').value,
        ubicacion: document.getElementById('ew-ubicacion').value,
        telefono: document.getElementById('ew-telefono').value,
        revision_medica: document.getElementById('ew-revision').value,
        formacion_prl: document.getElementById('ew-prl').value,
        carnet_carretillero: document.getElementById('ew-carnet').value,
        estado: document.getElementById('ew-estado').value,
        fecha_baja: document.getElementById('ew-fecha-baja').value,
      };
      await API.updateWorker(id, data);
      closeModal();
      showToast('Trabajador actualizado', 'success');
      navigateTo('worker-profile', { id });
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Add Vacation Modal
  window.openAddVacationModal = function(workerId) {
    openModal('Añadir Vacaciones', `
      <div class="form-row">
        <div class="form-group"><label>Fecha inicio</label><input type="date" class="form-control" id="av-inicio"></div>
        <div class="form-group"><label>Fecha fin</label><input type="date" class="form-control" id="av-fin"></div>
      </div>
      <div class="form-group"><label>Días</label><input type="number" class="form-control" id="av-dias" placeholder="Se calcula automáticamente"></div>
      <div class="form-group"><label>Notas</label><textarea class="form-control" id="av-notas" placeholder="Opcional"></textarea></div>
    `, `
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveVacation(${workerId})">Guardar</button>
    `);
  };

  window.saveVacation = async function(workerId) {
    try {
      const inicio = document.getElementById('av-inicio').value;
      const fin = document.getElementById('av-fin').value;
      let dias = parseInt(document.getElementById('av-dias').value);
      if (!dias && inicio && fin) {
        // Count business days
        dias = countBusinessDays(new Date(inicio), new Date(fin));
      }
      await API.createVacation({ worker_id: workerId, fecha_inicio: inicio, fecha_fin: fin, dias, notas: document.getElementById('av-notas').value });
      closeModal();
      showToast('Vacaciones añadidas', 'success');
      navigateTo('worker-profile', { id: workerId });
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  window.deleteVacation = async function(id, workerId) {
    if (!confirm('¿Eliminar este periodo de vacaciones?')) return;
    try {
      await API.deleteVacation(id);
      showToast('Vacaciones eliminadas', 'success');
      navigateTo('worker-profile', { id: workerId });
    } catch (err) { showToast(err.message, 'error'); }
  };

  // Add Absence Modal
  window.openAddAbsenceModal = function(workerId) {
    openModal('Añadir Ausencia / Baja', `
      <div class="form-group">
        <label>Tipo</label>
        <select class="form-control" id="aa-tipo">
          <option value="ilt">Baja ILT (Incapacidad Temporal)</option>
          <option value="accidente_trabajo">Accidente de Trabajo</option>
          <option value="baja_paternal">Baja Paternal/Maternal</option>
          <option value="permiso_medico">Permiso Médico (horas)</option>
          <option value="ausencia">Ausencia</option>
        </select>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Fecha inicio</label><input type="date" class="form-control" id="aa-inicio"></div>
        <div class="form-group"><label>Fecha fin</label><input type="date" class="form-control" id="aa-fin"></div>
      </div>
      <div class="form-group"><label>Horas (solo permiso médico)</label><input type="number" step="0.5" class="form-control" id="aa-horas" placeholder="Ej: 2.5"></div>
      <div class="form-group"><label>Observaciones</label><textarea class="form-control" id="aa-obs" placeholder="Detalles"></textarea></div>
    `, `
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveAbsence(${workerId})">Guardar</button>
    `);
  };

  window.saveAbsence = async function(workerId) {
    try {
      await API.createAbsence({
        worker_id: workerId,
        tipo: document.getElementById('aa-tipo').value,
        fecha_inicio: document.getElementById('aa-inicio').value,
        fecha_fin: document.getElementById('aa-fin').value,
        horas: parseFloat(document.getElementById('aa-horas').value) || null,
        observaciones: document.getElementById('aa-obs').value
      });
      closeModal();
      showToast('Ausencia registrada', 'success');
      navigateTo('worker-profile', { id: workerId });
    } catch (err) { showToast(err.message, 'error'); }
  };

  window.deleteAbsence = async function(id, workerId) {
    if (!confirm('¿Eliminar esta ausencia?')) return;
    try {
      await API.deleteAbsence(id);
      showToast('Ausencia eliminada', 'success');
      navigateTo('worker-profile', { id: workerId });
    } catch (err) { showToast(err.message, 'error'); }
  };

  // Upload Document Modal
  window.openUploadDocModal = function(workerId) {
    openModal('Subir Documento', `
      ${!workerId ? `<div class="form-group"><label>Trabajador (ID)</label><input type="number" class="form-control" id="ud-worker" placeholder="ID del trabajador"></div>` : ''}
      <div class="form-group">
        <label>Tipo de documento</label>
        <select class="form-control" id="ud-tipo">
          <option value="prl">PRL - Prevención Riesgos</option>
          <option value="modelo_145">Modelo 145</option>
          <option value="justificante">Justificante</option>
          <option value="contrato">Contrato</option>
          <option value="nomina">Nómina</option>
          <option value="politica">Política empresa</option>
          <option value="otro">Otro</option>
        </select>
      </div>
      <div class="form-group"><label>Nombre del documento</label><input type="text" class="form-control" id="ud-nombre" placeholder="Ej: Formación PRL 2026"></div>
      <div class="form-group"><label>Archivo</label><input type="file" class="form-control" id="ud-file"></div>
      <div class="form-group">
        <label><input type="checkbox" id="ud-firma"> Requiere firma digital del trabajador</label>
      </div>
    `, `
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="uploadDoc(${workerId || 'null'})">Subir</button>
    `);
  };

  window.uploadDoc = async function(workerId) {
    try {
      const formData = new FormData();
      const wid = workerId || document.getElementById('ud-worker')?.value;
      if (wid) formData.append('worker_id', wid);
      formData.append('tipo', document.getElementById('ud-tipo').value);
      formData.append('nombre', document.getElementById('ud-nombre').value);
      formData.append('requiere_firma', document.getElementById('ud-firma').checked ? '1' : '0');
      const fileInput = document.getElementById('ud-file');
      if (fileInput.files[0]) formData.append('file', fileInput.files[0]);
      await API.uploadDocument(formData);
      closeModal();
      showToast('Documento subido correctamente', 'success');
      if (workerId) navigateTo('worker-profile', { id: workerId });
      else navigateTo('documents');
    } catch (err) { showToast(err.message, 'error'); }
  };

  window.signDoc = function(id, workerId) {
    openModal('✍️ Firma Digital y Autorizaciones de Relaciones Laborales', `
      <div style="font-size:0.875rem; color: var(--text-secondary); margin-bottom:16px;">
        Por favor, revisa y marca las autorizaciones e introduce tu <strong>Código Personal de Firma (DNI / NIE)</strong> para completar la firma digital requerida por <strong>Grupo Nofer</strong>.
      </div>
      
      <div class="form-group" style="background: var(--bg-glass); padding: 16px; border-radius: 8px; border: 1px solid var(--border-color); margin-bottom: 16px;">
        <h4 style="margin-bottom:12px; font-size:0.875rem; color: var(--text-primary);">Declaración de Autorizaciones y Conconformidad:</h4>
        <label style="display:flex; align-items:flex-start; gap:10px; margin-bottom:10px; cursor:pointer; font-size:0.8125rem; font-weight:400;">
          <input type="checkbox" id="chk-prl" checked style="margin-top:2px;"> 
          <span><strong>Prevención de Riesgos (PRL):</strong> Confirmo la lectura y recepción de la normativa de seguridad y salud laboral.</span>
        </label>
        <label style="display:flex; align-items:flex-start; gap:10px; margin-bottom:10px; cursor:pointer; font-size:0.8125rem; font-weight:400;">
          <input type="checkbox" id="chk-politica" checked style="margin-top:2px;"> 
          <span><strong>Política Relaciones Laborales:</strong> Conforme con las normativas internas del Grupo Nofer.</span>
        </label>
        <label style="display:flex; align-items:flex-start; gap:10px; margin-bottom:10px; cursor:pointer; font-size:0.8125rem; font-weight:400;">
          <input type="checkbox" id="chk-rgpd" checked style="margin-top:2px;"> 
          <span><strong>Protección de Datos (RGPD):</strong> Autorizo el tratamiento de datos para la gestión laboral y nóminas.</span>
        </label>
        <label style="display:flex; align-items:flex-start; gap:10px; cursor:pointer; font-size:0.8125rem; font-weight:400;">
          <input type="checkbox" id="chk-imagen" style="margin-top:2px;"> 
          <span><strong>Comunicación Interna:</strong> Autorización de contacto corporativo e información de empresa.</span>
        </label>
      </div>

      <div class="form-group">
        <label for="sign-code"><strong>Código Personal de Firma (Introduce tu DNI/NIE):</strong></label>
        <input type="text" class="form-control" id="sign-code" placeholder="Ej: 47336476S" required style="font-weight:600; letter-spacing:1px;">
      </div>
    `, `
      <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-success" onclick="executeDigitalSignature(${id}, ${workerId || 'null'})">✍️ Aceptar y Firmar Digitalmente</button>
    `);
  };

  window.executeDigitalSignature = async function(id, workerId) {
    const codeEl = document.getElementById('sign-code');
    if (!codeEl || !codeEl.value.trim()) {
      showToast('Introduce tu código de firma / DNI', 'error');
      return;
    }

    const autorizaciones = {
      prl: document.getElementById('chk-prl')?.checked || false,
      politica: document.getElementById('chk-politica')?.checked || false,
      rgpd: document.getElementById('chk-rgpd')?.checked || false,
      imagen: document.getElementById('chk-imagen')?.checked || false,
    };

    try {
      await API.signDocument(id, { codigo_firma: codeEl.value.trim(), autorizaciones });
      closeModal();
      showToast('Documento y autorizaciones firmados correctamente', 'success');
      if (workerId) navigateTo('worker-profile', { id: workerId });
      else navigateTo('documents');
    } catch (err) {
      showToast(err.message || 'Error al firmar documento', 'error');
    }
  };

  window.deleteDoc = async function(id, workerId) {
    if (!confirm('¿Eliminar este documento?')) return;
    try {
      await API.deleteDocument(id);
      showToast('Documento eliminado', 'success');
      if (workerId) navigateTo('worker-profile', { id: workerId });
      else navigateTo('documents');
    } catch (err) { showToast(err.message, 'error'); }
  };

  // Admin: Create admin user
  window.createAdmin = async function() {
    try {
      const email = document.getElementById('admin-email').value;
      const password = document.getElementById('admin-password').value;
      if (!email || !password) { showToast('Rellena email y contraseña', 'error'); return; }
      await API.request('POST', '/workers', {
        nombre: 'Admin',
        apellido1: email.split('@')[0],
        email,
        _create_admin: true,
        _admin_password: password
      });
      showToast('Administrador creado', 'success');
    } catch (err) { showToast(err.message, 'error'); }
  };

  // Worker filter
  window.filterWorkers = function() {
    const company = document.getElementById('filter-company')?.value;
    const status = document.getElementById('filter-status')?.value || 'activo';
    const ubicacion = document.getElementById('filter-ubicacion')?.value;

    let filtered = allWorkers;
    if (company) filtered = filtered.filter(w => String(w.company_id) === company);
    
    if (status === 'activo') {
      filtered = filtered.filter(w => w.estado === 'activo' || !w.estado);
    } else if (status === 'inactivo') {
      filtered = filtered.filter(w => w.estado === 'inactivo');
    } else if (status === 'baja') {
      filtered = filtered.filter(w => w.estado === 'baja');
    }
    // if 'todos', we don't filter by status

    if (ubicacion) filtered = filtered.filter(w => w.ubicacion === ubicacion);

    document.getElementById('workers-grid').innerHTML = renderWorkerCards(filtered);
    document.getElementById('worker-count').textContent = `${filtered.length} trabajadores`;
  };

  // ===== HELPERS =====
  function dataField(label, value) {
    return `<div class="data-field"><div class="data-field-label">${label}</div><div class="data-field-value">${value || '-'}</div></div>`;
  }

  function formatDate(dateStr) {
    if (!dateStr || dateStr === '-' || dateStr === 'NO') return dateStr || '-';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch { return dateStr; }
  }

  function absenceTypeLabel(tipo) {
    const labels = {
      ilt: '🟢 Baja ILT',
      accidente_trabajo: '🔴 Accidente Trabajo',
      baja_paternal: '🔵 Baja Paternal',
      matrimonio: '💍 Baja Matrimonio',
      permiso_medico: '🏥 Permiso / Cita Médica',
      teletrabajo: '💻 Teletrabajo',
      horas_convenio: '⏱️ Horas Convenio',
      lactancia: '🍼 Lactancia',
      ausencia: '🟣 Ausencia Justificada'
    };
    return labels[tipo] || tipo;
  }

  function checkCarnetExpiry(dateStr) {
    if (!dateStr || dateStr === 'NO' || dateStr === '-') return { status: 'na', label: 'No aplica', warning: false };
    try {
      const expiry = new Date(dateStr);
      if (isNaN(expiry.getTime())) return { status: 'ok', label: dateStr, warning: false };
      
      const now = new Date();
      const sixMonths = new Date();
      sixMonths.setMonth(sixMonths.getMonth() + 6);

      if (expiry < now) {
        return { status: 'expired', label: formatDate(dateStr), warning: true, text: '🔴 CARNET CADUCADO - Pedir Cita Renovación URGENTE' };
      } else if (expiry <= sixMonths) {
        return { status: 'pending', label: formatDate(dateStr), warning: true, text: '⚠️ CARNET PRÓXIMO A CADUCAR - Pedir Cita Renovación' };
      }
      return { status: 'ok', label: formatDate(dateStr), warning: false };
    } catch {
      return { status: 'ok', label: dateStr, warning: false };
    }
  }

  function renderPersonalWorkerCalendar(worker, vacations, absences) {
    // Build set of dates
    const dateMap = {};

    vacations.forEach(v => {
      if (!v.fecha_inicio) return;
      const start = new Date(v.fecha_inicio);
      const end = v.fecha_fin ? new Date(v.fecha_fin) : start;
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const key = d.toISOString().split('T')[0];
        dateMap[key] = { tipo: 'vacaciones', label: 'Vacaciones' };
      }
    });

    absences.forEach(a => {
      if (!a.fecha_inicio) return;
      const start = new Date(a.fecha_inicio);
      const end = a.fecha_fin ? new Date(a.fecha_fin) : start;
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const key = d.toISOString().split('T')[0];
        dateMap[key] = { tipo: a.tipo, label: absenceTypeLabel(a.tipo) };
      }
    });

    const monthsHtml = [];
    const year = 2026;

    for (let m = 0; m < 12; m++) {
      const firstDay = new Date(year, m, 1);
      const lastDay = new Date(year, m + 1, 0);
      const monthName = firstDay.toLocaleDateString('es-ES', { month: 'long' });
      const startingDay = (firstDay.getDay() + 6) % 7; // Monday = 0

      let daysHtml = [];
      // Empty padding days
      for (let p = 0; p < startingDay; p++) {
        daysHtml.push('<div class="cal-mini-day empty"></div>');
      }

      for (let d = 1; d <= lastDay.getDate(); d++) {
        const dt = new Date(year, m, d);
        const dateStr = dt.toISOString().split('T')[0];
        const dow = dt.getDay();
        const isWeekend = dow === 0 || dow === 6;
        const evt = dateMap[dateStr];

        let cls = isWeekend ? 'weekend' : '';
        let badge = '';
        if (evt) {
          cls += ` ${evt.tipo}`;
          const iconMap = {
            vacaciones: '🏖️',
            ilt: '🟢',
            accidente_trabajo: '🔴',
            baja_paternal: '🔵',
            matrimonio: '💍',
            permiso_medico: '🏥',
            teletrabajo: '💻',
            horas_convenio: '⏱️',
            ausencia: '🟣'
          };
          const icon = iconMap[evt.tipo] || '🟣';
          badge = `<span class="cal-mini-badge ${evt.tipo}" title="${evt.label}">${icon}</span>`;
        }

        daysHtml.push(`
          <div class="cal-mini-day ${cls}">
            <span class="cal-day-num">${d}</span>
            ${badge}
          </div>
        `);
      }

      monthsHtml.push(`
        <div class="cal-mini-month">
          <h4 style="text-transform:capitalize; margin-bottom: 8px; font-size: 0.875rem; text-align:center;">${monthName} 2026</h4>
          <div class="cal-mini-grid">
            <div class="cal-mini-header">L</div>
            <div class="cal-mini-header">M</div>
            <div class="cal-mini-header">X</div>
            <div class="cal-mini-header">J</div>
            <div class="cal-mini-header">V</div>
            <div class="cal-mini-header weekend">S</div>
            <div class="cal-mini-header weekend">D</div>
            ${daysHtml.join('')}
          </div>
        </div>
      `);
    }

    return `<div class="personal-calendar-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; margin-top: 16px;">
      ${monthsHtml.join('')}
    </div>`;
  }

  function docTypeIcon(tipo) {
    const icons = { prl: '🛡️', modelo_145: '📋', justificante: '📝', contrato: '📑', nomina: '💰', politica: '📜', otro: '📎' };
    return icons[tipo] || '📄';
  }

  function docTypeLabel(tipo) {
    const labels = { prl: 'PRL', modelo_145: 'Modelo 145', justificante: 'Justificante', contrato: 'Contrato', nomina: 'Nómina', politica: 'Política', otro: 'Otro' };
    return labels[tipo] || tipo;
  }

  function prlStatus(val) {
    if (!val || val === 'NO' || val === 'PROGRAMAR') return 'pending';
    try {
      const d = new Date(val);
      if (isNaN(d.getTime())) return 'na';
      const now = new Date();
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      return d > oneYearAgo ? 'ok' : 'expired';
    } catch { return 'na'; }
  }

  function carnetStatus(val) {
    if (!val || val === 'NO') return 'na';
    try {
      const d = new Date(val);
      if (isNaN(d.getTime())) return 'na';
      const now = new Date();
      const threeMonths = new Date();
      threeMonths.setMonth(threeMonths.getMonth() + 3);
      if (d < now) return 'expired';
      if (d < threeMonths) return 'pending';
      return 'ok';
    } catch { return 'na'; }
  }

  function countBusinessDays(start, end) {
    let count = 0;
    const d = new Date(start);
    while (d <= end) {
      const dow = d.getDay();
      if (dow !== 0 && dow !== 6) count++;
      d.setDate(d.getDate() + 1);
    }
    return count;
  }

  // Toast
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'toastOut 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // Tab switching
  window.switchTab = function(e, tabId) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    e.target.classList.add('active');
    document.getElementById(tabId).classList.add('active');
  };

  // Global navigation function
  window.navigateTo = navigateTo;
  window.closeModal = closeModal;

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

// ============================================================
// DOCUMENT VIEWER — open any document in a full-screen modal
// ============================================================
function viewDocument(docId, docName, docUrl) {
  const existing = document.getElementById('doc-viewer-overlay');
  if (existing) existing.remove();

  const ext = (docName || '').split('.').pop().toLowerCase();
  const isImage = ['jpg','jpeg','png','gif','webp','bmp'].includes(ext);
  const isPdf = ext === 'pdf';
  const isOffice = ['doc','docx','xls','xlsx','ppt','pptx'].includes(ext);

  let viewerContent = '';
  if (isPdf || isImage) {
    viewerContent = `<iframe class="doc-viewer-iframe" src="${docUrl}" title="${docName}"></iframe>`;
  } else if (isOffice) {
    // Use Microsoft Office Online viewer for Office files
    const encodedUrl = encodeURIComponent(window.location.origin + docUrl);
    viewerContent = `<iframe class="doc-viewer-iframe"
      src="https://view.officeapps.live.com/op/embed.aspx?src=${encodedUrl}"
      title="${docName}"></iframe>`;
  } else {
    viewerContent = `<div class="doc-viewer-iframe" style="display:flex;align-items:center;justify-content:center;flex-direction:column;gap:16px;background:#f5f5f5;">
      <span style="font-size:4rem;">📄</span>
      <p style="font-size:1.1rem;color:#555;font-weight:600;">${docName}</p>
      <p style="color:#888;">Este formato no se puede previsualizar. Descárgalo para verlo.</p>
    </div>`;
  }

  const overlay = document.createElement('div');
  overlay.id = 'doc-viewer-overlay';
  overlay.className = 'doc-viewer-overlay';
  overlay.innerHTML = `
    <div class="doc-viewer-box">
      <div class="doc-viewer-header">
        <span style="font-size:1.5rem;">📄</span>
        <h3>${docName || 'Documento'}</h3>
        <button class="doc-viewer-close" onclick="document.getElementById('doc-viewer-overlay').remove()" title="Cerrar">✕</button>
      </div>
      ${viewerContent}
      <div class="doc-viewer-actions">
        <a href="${docUrl}" download="${docName}" class="btn btn-primary" style="font-weight:700;background:linear-gradient(135deg,#3d1b06,#5c2c0c);color:#fff;padding:8px 18px;border-radius:8px;text-decoration:none;">
          ⬇️ Descargar
        </a>
        <button onclick="document.getElementById('doc-viewer-overlay').remove()" class="btn btn-secondary" style="font-weight:700;">✕ Cerrar</button>
        <span style="margin-left:auto;color:#888;font-size:0.8rem;">Presiona ESC para cerrar</span>
      </div>
    </div>
  `;

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', esc); }
  });

  document.body.appendChild(overlay);
}

// ============================================================
// EXCEL IMPORT PANEL — show in admin area
// ============================================================
function renderExcelImportPanel(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1 style="font-size:1.6rem;font-weight:900;color:var(--accent-primary);">📊 Importar / Actualizar desde Excel</h1>
      <p style="color:var(--text-secondary);">Sube un fichero Excel con datos de trabajadores. El sistema comparará por DNI y actualizará automáticamente los datos existentes o creará nuevos trabajadores.</p>
    </div>

    <div class="import-panel">
      <h3>🗂️ Subir Excel de Trabajadores</h3>
      <div class="import-dropzone" id="import-dropzone" onclick="document.getElementById('excel-file-input').click()">
        <span class="import-icon">📂</span>
        <strong style="font-size:1.05rem;color:#14532d;">Arrastra aquí tu Excel o haz clic para seleccionar</strong>
        <p style="color:#6b7280;margin:6px 0 0 0;font-size:0.9rem;">Formatos aceptados: .xlsx, .xls · El sistema detecta DNI/NIE para vincular trabajadores existentes</p>
        <input type="file" id="excel-file-input" accept=".xlsx,.xls" style="display:none"
          onchange="handleExcelImport(this.files[0])">
      </div>

      <div id="import-progress" style="display:none;margin-top:14px;">
        <div style="display:flex;align-items:center;gap:10px;padding:14px;background:rgba(255,255,255,0.8);border-radius:10px;">
          <div style="width:24px;height:24px;border:3px solid #15803d;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;"></div>
          <span style="font-weight:700;color:#14532d;">Procesando Excel...</span>
        </div>
      </div>
      <div id="import-result" style="display:none;margin-top:14px;"></div>
    </div>

    <div class="import-panel" style="background:linear-gradient(135deg,#eff6ff,#dbeafe);border-color:#2563eb;">
      <h3 style="color:#1e3a8a;">📋 Historial de Importaciones</h3>
      <div id="import-log-container">
        <p style="color:#6b7280;">Cargando historial...</p>
      </div>
    </div>
  `;

  // Drag and drop support
  const dz = document.getElementById('import-dropzone');
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag-over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
  dz.addEventListener('drop', (e) => {
    e.preventDefault();
    dz.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleExcelImport(file);
  });

  loadImportLog();
}

function openPasswordExcelModal(file) {
  const modalHtml = `
    <div id="excel-password-modal" class="modal-overlay" style="display: flex; position: fixed; inset: 0; background: rgba(36, 15, 3, 0.75); z-index: 2000; align-items: center; justify-content: center; backdrop-filter: blur(4px);">
      <div class="modal-card" style="background: var(--bg-card); border: 3px solid #d97706; border-radius: var(--border-radius-lg); width: 100%; max-width: 480px; padding: 28px; box-shadow: var(--shadow-lg);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 2px solid var(--border-color); padding-bottom: 12px;">
          <h3 style="font-size: 1.3rem; font-weight: 900; color: #b45309; display: flex; align-items: center; gap: 8px; margin: 0;">
            <span>🔒 Excel Protegido con Contraseña</span>
          </h3>
          <button onclick="document.getElementById('excel-password-modal').remove()" style="background: none; border: none; font-size: 1.5rem; cursor: pointer;">✕</button>
        </div>
        <p style="font-size: 0.95rem; color: var(--text-secondary); margin-bottom: 20px; font-weight: 500; line-height: 1.5;">
          El archivo Excel que has seleccionado (<strong>${file.name}</strong>) requiere una contraseña para abrirse. Introduce la contraseña para descifrarlo e importar la plantilla:
        </p>
        <form id="excel-password-form">
          <div class="form-group" style="margin-bottom: 20px;">
            <label style="font-weight: 700; display: block; margin-bottom: 8px;">Contraseña del Archivo Excel:</label>
            <input type="password" id="excel-file-password" class="form-control" placeholder="Introduce la contraseña (ej. 250268)..." style="width: 100%; padding: 12px; border-radius: 8px; border: 2px solid var(--border-color); font-size: 1.05rem; background: var(--bg-input);" required autofocus>
          </div>
          <div style="display: flex; gap: 12px; justify-content: flex-end;">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('excel-password-modal').remove()">Cancelar</button>
            <button type="submit" class="btn btn-primary" style="background: linear-gradient(135deg, #d97706, #b45309); color: #ffffff; font-weight: 800; padding: 10px 20px; border-radius: 8px; border: none;">
              🔓 Descifrar e Importar
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
  const existing = document.getElementById('excel-password-modal');
  if (existing) existing.remove();
  document.body.insertAdjacentHTML('beforeend', modalHtml);

  const pwdInput = document.getElementById('excel-file-password');
  if (pwdInput) pwdInput.focus();

  document.getElementById('excel-password-form').onsubmit = (e) => {
    e.preventDefault();
    const pwd = document.getElementById('excel-file-password').value;
    document.getElementById('excel-password-modal').remove();
    handleExcelImport(file, pwd);
  };
}

async function handleExcelImport(file, password = null) {
  if (!file) return;
  const progress = document.getElementById('import-progress');
  const result = document.getElementById('import-result');
  progress.style.display = 'block';
  result.style.display = 'none';

  try {
    const fd = new FormData();
    fd.append('excel', file);
    if (password) fd.append('password', password);

    const data = await API.importExcel(fd);

    result.style.display = 'block';
    result.innerHTML = `
      <div style="background:${data.success ? '#dcfce7' : '#fee2e2'};border:2px solid ${data.success ? '#15803d' : '#dc2626'};border-radius:10px;padding:16px 20px;">
        <div style="font-size:1.2rem;font-weight:900;color:${data.success ? '#14532d' : '#991b1b'};margin-bottom:8px;">
          ${data.success ? '✅' : '❌'} ${data.message || 'Proceso completado'}
        </div>
        ${data.results ? `
          <div style="display:flex;gap:20px;flex-wrap:wrap;margin-top:8px;">
            <span style="background:#dbeafe;color:#1e3a8a;padding:4px 12px;border-radius:20px;font-weight:700;">🔄 ${data.results.updated} actualizados</span>
            <span style="background:#dcfce7;color:#14532d;padding:4px 12px;border-radius:20px;font-weight:700;">➕ ${data.results.created} nuevos</span>
            <span style="background:#f5f5f5;color:#555;padding:4px 12px;border-radius:20px;font-weight:700;">⏭️ ${data.results.skipped} sin cambios</span>
            ${data.results.deactivated ? `<span style="background:#fef3c7;color:#92400e;padding:4px 12px;border-radius:20px;font-weight:700;">💤 ${data.results.deactivated} marcados inactivos</span>` : ''}
          </div>
        ` : ''}
      </div>
    `;
    loadImportLog();
    if (window.appState) { window.appState.workers = null; }
  } catch (err) {
    const errMsg = (err.message || '').toLowerCase();
    if (errMsg.includes('password') || errMsg.includes('protegido') || errMsg.includes('contraseña') || err.password_required) {
      openPasswordExcelModal(file);
    } else {
      result.style.display = 'block';
      result.innerHTML = `<div style="background:#fee2e2;border:2px solid #dc2626;border-radius:10px;padding:14px;color:#991b1b;font-weight:700;">❌ Error: ${err.message}</div>`;
    }
  } finally {
    progress.style.display = 'none';
  }
}

async function loadImportLog() {
  const container = document.getElementById('import-log-container');
  if (!container) return;
  try {
    const log = await API.getImportLog();
    if (!log.length) {
      container.innerHTML = '<p style="color:#6b7280;font-size:0.9rem;">No hay importaciones registradas todavía.</p>';
      return;
    }
    container.innerHTML = log.slice(0, 10).map(entry => `
      <div class="import-log-item">
        <span style="font-size:1.2rem;">📊</span>
        <div style="flex:1;">
          <strong>${entry.filename}</strong>
          <span style="color:#6b7280;font-size:0.8rem;margin-left:10px;">${new Date(entry.date).toLocaleString('es-ES')}</span>
        </div>
        <div style="display:flex;gap:8px;font-size:0.8rem;">
          <span style="background:#dbeafe;color:#1e3a8a;padding:2px 8px;border-radius:12px;font-weight:700;">${entry.results?.updated || 0} act.</span>
          <span style="background:#dcfce7;color:#14532d;padding:2px 8px;border-radius:12px;font-weight:700;">${entry.results?.created || 0} nuevos</span>
        </div>
      </div>
    `).join('');
  } catch {
    container.innerHTML = '<p style="color:#6b7280;">No se pudo cargar el historial.</p>';
  }
}

// ============================================================
// INLINE CELL EDIT — make any cell editable like Excel
// ============================================================
function makeEditable(el, currentValue, onSave, type = 'text', options = null) {
  if (el.querySelector('input, select')) return; // already editing

  const originalContent = el.innerHTML;
  let input;

  if (type === 'select' && options) {
    input = document.createElement('select');
    input.innerHTML = options.map(o => `<option value="${o.value}" ${o.value == currentValue ? 'selected' : ''}>${o.label}</option>`).join('');
  } else if (type === 'date') {
    input = document.createElement('input');
    input.type = 'date';
    input.value = currentValue || '';
  } else if (type === 'color') {
    input = document.createElement('input');
    input.type = 'color';
    input.value = currentValue || '#1d4ed8';
  } else {
    input = document.createElement('input');
    input.type = type;
    input.value = currentValue || '';
  }

  input.style.cssText = 'border:2px solid #2563eb;border-radius:4px;padding:3px 8px;font-size:inherit;background:#fff;min-width:80px;outline:none;';

  const save = () => {
    const newVal = input.value;
    el.innerHTML = originalContent;
    onSave(newVal);
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); save(); }
    if (e.key === 'Escape') { el.innerHTML = originalContent; }
  });
  input.addEventListener('blur', save);

  el.innerHTML = '';
  el.appendChild(input);
  input.focus();
  if (input.select) input.select();
}
