// ===== API Client =====
const API = {
  token: null,
  user: null,

  async request(method, url, body = null) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include'
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`/api${url}`, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error del servidor');
    return data;
  },

  async upload(url, formData) {
    const res = await fetch(`/api${url}`, {
      method: 'POST',
      body: formData,
      credentials: 'include'
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al subir');
    return data;
  },

  // Auth
  login: (email, password) => API.request('POST', '/auth/login', { email, password }),
  logout: () => API.request('POST', '/auth/logout'),
  me: () => API.request('GET', '/auth/me'),

  // Workers
  getWorkers: (params = '') => API.request('GET', `/workers${params ? '?' + params : ''}`),
  getWorker: (id) => API.request('GET', `/workers/${id}`),
  createWorker: (data) => API.request('POST', '/workers', data),
  updateWorker: (id, data) => API.request('PUT', `/workers/${id}`, data),
  deleteWorker: (id) => API.request('DELETE', `/workers/${id}`),
  getVacationBalance: (id) => API.request('GET', `/workers/${id}/vacation-balance`),

  // Vacations
  getVacations: (params = '') => API.request('GET', `/vacations${params ? '?' + params : ''}`),
  getCalendar: (params = '') => API.request('GET', `/vacations/calendar${params ? '?' + params : ''}`),
  createVacation: (data) => API.request('POST', '/vacations', data),
  updateVacation: (id, data) => API.request('PUT', `/vacations/${id}`, data),
  deleteVacation: (id) => API.request('DELETE', `/vacations/${id}`),

  // Absences
  getAbsences: (params = '') => API.request('GET', `/absences${params ? '?' + params : ''}`),
  createAbsence: (data) => API.request('POST', '/absences', data),
  updateAbsence: (id, data) => API.request('PUT', `/absences/${id}`, data),
  deleteAbsence: (id) => API.request('DELETE', `/absences/${id}`),

  // Documents
  getDocuments: (params = '') => API.request('GET', `/documents${params ? '?' + params : ''}`),
  uploadDocument: (formData) => API.upload('/documents/upload', formData),
  signDocument: (id, body = {}) => API.request('PUT', `/documents/${id}/sign`, body),
  deleteDocument: (id) => API.request('DELETE', `/documents/${id}`),
};
