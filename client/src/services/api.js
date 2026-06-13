import axios from 'axios';

// Create a configured Axios instance
const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '', // Falls back to relative path for Vite dev proxy locally
  timeout: 30000,
});

// Axios Request Interceptor: Automatically inject token from localStorage if available
API.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// --- Auth Endpoints ---

export const login = async (email, password) => {
  const res = await API.post('/api/auth/login', { email, password });
  return res.data;
};

export const register = async (name, email, password) => {
  const res = await API.post('/api/auth/register', { name, email, password });
  return res.data;
};

export const getMe = async () => {
  const res = await API.get('/api/auth/me');
  return res.data;
};

export const getUsers = async () => {
  const res = await API.get('/api/auth/users');
  return res.data;
};

// --- Groups Endpoints ---

export const getGroups = async () => {
  const res = await API.get('/api/groups');
  return res.data;
};

export const getGroup = async (id) => {
  const res = await API.get(`/api/groups/${id}`);
  return res.data;
};

export const createGroup = async (name) => {
  const res = await API.post('/api/groups', { name });
  return res.data;
};

export const addMember = async (groupId, userId, joinedAt) => {
  const res = await API.post(`/api/groups/${groupId}/members`, { userId, joinedAt });
  return res.data;
};

export const updateMember = async (groupId, userId, leftAt) => {
  const res = await API.patch(`/api/groups/${groupId}/members/${userId}`, { leftAt });
  return res.data;
};

// --- Expenses & Settlements Endpoints ---

export const getExpenses = async (groupId) => {
  const res = await API.get(`/api/groups/${groupId}/expenses`);
  return res.data;
};

export const createExpense = async (groupId, expenseData) => {
  const res = await API.post(`/api/groups/${groupId}/expenses`, expenseData);
  return res.data;
};

export const deleteExpense = async (groupId, expenseId) => {
  const res = await API.delete(`/api/groups/${groupId}/expenses/${expenseId}`);
  return res.data;
};

export const getSettlements = async (groupId) => {
  const res = await API.get(`/api/groups/${groupId}/settlements`);
  return res.data;
};

export const createSettlement = async (groupId, settlementData) => {
  const res = await API.post(`/api/groups/${groupId}/settlements`, settlementData);
  return res.data;
};

// --- Balances Endpoints ---

export const getBalances = async (groupId) => {
  const res = await API.get(`/api/groups/${groupId}/balances`);
  return res.data;
};

export const getUserBreakdown = async (groupId, userId) => {
  const res = await API.get(`/api/groups/${groupId}/balances/${userId}`);
  return res.data;
};

// --- Import Endpoints ---

export const uploadCSV = async (groupId, file) => {
  const formData = new FormData();
  formData.append('file', file);
  const res = await API.post(`/api/groups/${groupId}/import`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
};

export const confirmImport = async (groupId, importData) => {
  const res = await API.post(`/api/groups/${groupId}/import/confirm`, importData);
  return res.data;
};

export const getImportReports = async (groupId) => {
  const res = await API.get(`/api/groups/${groupId}/import-reports`);
  return res.data;
};

export default API;
