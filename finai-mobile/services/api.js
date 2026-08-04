// finai-mobile/services/api.js
import axios from 'axios';

// Gamitin ang IP address na 192.168.1.67
const API_BASE_URL = 'http://192.168.1.74:8000/api'; 

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Categories Endpoints
export const getCategories = () => api.get('/categories');

// Accounts Endpoints
export const getAccounts = () => api.get('/accounts');

// Budgets Endpoints
export const setBudget = (data) => api.post('/budgets/set-limit', data);

export default api;