import axios from 'axios';

// Detectar automáticamente la URL de la API
// Si estamos en producción (no localhost), usar la misma URL pero con puerto 3001
// Si hay un proxy (nginx), usar rutas relativas
const getApiUrl = () => {
  // Si hay una variable de entorno, usarla
  if (process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }
  
  // Si estamos en localhost, usar localhost:3001
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:3001';
  }
  
  // Si estamos en el puerto 80 (sin puerto explícito), probablemente hay nginx
  // Usar rutas relativas para que nginx haga el proxy
  if (window.location.port === '' || window.location.port === '80' || window.location.port === '443') {
    return ''; // Rutas relativas - nginx hará el proxy a /api
  }
  
  // Si hay un puerto explícito (como :3000), usar el mismo hostname con puerto 3001
  const hostname = window.location.hostname;
  return `http://${hostname}:3001`;
};

const API_URL = getApiUrl();

// Log para debug (solo en desarrollo)
if (process.env.NODE_ENV === 'development' || window.location.hostname !== 'localhost') {
  console.log('🔗 API URL:', API_URL);
}

const api = axios.create({
  baseURL: API_URL,
  timeout: 10000, // 10 segundos de timeout
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add token to requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      // Token expirado o inválido
      localStorage.removeItem('token');
      localStorage.removeItem('username');
      // Solo redirigir si no estamos ya en la página de login
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  login: (username, password) => 
    api.post('/api/login', { username, password })
};

export const dashboardAPI = {
  getStats: () => api.get('/api/dashboard')
};

export const usersAPI = {
  getAll: () => api.get('/api/users'),
  update: (id, data) => api.put(`/api/users/${id}`, data),
  delete: (id) => api.delete(`/api/users/${id}`)
};

export const walletsAPI = {
  getAll: () => api.get('/api/wallets'),
  create: (data) => api.post('/api/wallets', data),
  update: (id, data) => api.put(`/api/wallets/${id}`, data),
  delete: (id) => api.delete(`/api/wallets/${id}`)
};

export const configAPI = {
  get: () => api.get('/api/config'),
  update: (data) => api.put('/api/config', data)
};

export const codeAPI = {
  getFiles: () => api.get('/api/code'),
  getFile: (file) => api.get(`/api/code/${encodeURIComponent(file)}`),
  updateFile: (file, content) => api.put(`/api/code/${encodeURIComponent(file)}`, { content })
};

export const auditAPI = {
  getLogs: (params) => api.get('/api/audit', { params })
};

export const messagesAPI = {
  getAll: () => api.get('/api/messages'),
  update: (key, message) => api.put('/api/messages', { key, message })
};

export const walletTransactionsAPI = {
  getTransactions: () => api.get('/api/wallet-transactions', { timeout: 120000 }) // 2 minutos de timeout
};

export const transactionsAPI = {
  getAll: (params) => api.get('/api/transactions', { params }),
  updateStatus: (id, status, motivo) => api.put(`/api/transactions/${id}/status`, { status, motivo }),
  clearAll: () => api.post('/api/transactions/clear-all'),
  getDeleted: (params) => api.get('/api/transactions/deleted', { params }),
  downloadDeletedPDF: (params) => api.get('/api/transactions/deleted/pdf', { params, responseType: 'blob' })
};

export default api;

