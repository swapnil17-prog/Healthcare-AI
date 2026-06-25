const BASE_URL = 'http://127.0.0.1:8000/api';

let isRefreshing = false;
let refreshSubscribers = [];

const subscribeTokenRefresh = (cb) => {
  refreshSubscribers.push(cb);
};

const onRefreshed = (token) => {
  refreshSubscribers.map((cb) => cb(token));
  refreshSubscribers = [];
};

const customFetch = async (url, options = {}) => {
  // Always include credentials to support HTTP-only cookies (refresh token)
  options.credentials = 'include';
  
  if (!options.headers) {
    options.headers = {};
  }
  
  const token = localStorage.getItem('token');
  if (token && !options.headers['Authorization']) {
    options.headers['Authorization'] = `Bearer ${token}`;
  }
  
  let res = await fetch(url, options);
  
  // If unauthorized and not logging in/registering, attempt to refresh the session
  if (res.status === 401 && !url.includes('/auth/login') && !url.includes('/auth/register') && !url.includes('/auth/refresh')) {
    if (!isRefreshing) {
      isRefreshing = true;
      try {
        const refreshRes = await fetch(`${BASE_URL}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (refreshRes.ok) {
          const data = await refreshRes.json();
          localStorage.setItem('token', data.access_token);
          isRefreshing = false;
          onRefreshed(data.access_token);
        } else {
          isRefreshing = false;
          localStorage.removeItem('token');
          window.dispatchEvent(new Event('auth-expired'));
          throw new Error('Session expired');
        }
      } catch (err) {
        isRefreshing = false;
        localStorage.removeItem('token');
        window.dispatchEvent(new Event('auth-expired'));
        throw err;
      }
    }
    
    // Wait for the token refresh to complete and retry the request
    const retryOriginalRequest = new Promise((resolve) => {
      subscribeTokenRefresh((newToken) => {
        options.headers['Authorization'] = `Bearer ${newToken}`;
        resolve(fetch(url, options));
      });
    });
    
    res = await retryOriginalRequest;
  }
  
  return res;
};

export const api = {
  // --- AUTHENTICATION ---
  register: async (name, email, password, role) => {
    const res = await customFetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, role }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Registration failed');
    }
    return res.json();
  },

  login: async (email, password) => {
    const res = await customFetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Login failed');
    }
    return res.json();
  },

  logout: async () => {
    try {
      await customFetch(`${BASE_URL}/auth/logout`, {
        method: 'POST',
      });
    } catch (e) {
      console.error('Logout API call failed', e);
    }
    localStorage.removeItem('token');
  },

  getMe: async () => {
    const res = await customFetch(`${BASE_URL}/auth/me`, {
      method: 'GET',
    });
    if (!res.ok) throw new Error('Failed to fetch user profile');
    return res.json();
  },

  // --- PATIENTS ---
  getPatients: async () => {
    const res = await customFetch(`${BASE_URL}/patients`, {
      method: 'GET',
    });
    if (!res.ok) throw new Error('Failed to fetch patients list');
    return res.json();
  },

  getDoctors: async () => {
    const res = await customFetch(`${BASE_URL}/patients/doctors`, {
      method: 'GET',
    });
    if (!res.ok) throw new Error('Failed to fetch doctors list');
    return res.json();
  },

  getPatient: async (id) => {
    const res = await customFetch(`${BASE_URL}/patients/${id}`, {
      method: 'GET',
    });
    if (!res.ok) throw new Error('Failed to fetch patient details');
    return res.json();
  },

  updatePatient: async (id, data) => {
    const res = await customFetch(`${BASE_URL}/patients/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to update patient profile');
    return res.json();
  },

  // --- MEDICAL HISTORY ---
  getMedicalHistory: async (patientId) => {
    const res = await customFetch(`${BASE_URL}/patients/${patientId}/medical-history`, {
      method: 'GET',
    });
    if (!res.ok) throw new Error('Failed to fetch medical history');
    return res.json();
  },

  addMedicalHistory: async (patientId, data) => {
    const res = await customFetch(`${BASE_URL}/patients/${patientId}/medical-history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to add medical history');
    }
    return res.json();
  },

  deleteMedicalHistory: async (id) => {
    const res = await customFetch(`${BASE_URL}/medical-history/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete medical history record');
    return true;
  },

  // --- APPOINTMENTS ---
  getAppointments: async () => {
    const res = await customFetch(`${BASE_URL}/appointments`, {
      method: 'GET',
    });
    if (!res.ok) throw new Error('Failed to fetch appointments');
    return res.json();
  },

  createAppointment: async (patientId, doctorId, scheduledAt, notes = '') => {
    const res = await customFetch(`${BASE_URL}/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patient_id: parseInt(patientId),
        doctor_id: parseInt(doctorId),
        scheduled_at: scheduledAt,
        status: 'Scheduled',
        notes,
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to schedule appointment');
    }
    return res.json();
  },

  // --- PREDICTIONS ---
  runPrediction: async (patientId, data) => {
    const res = await customFetch(`${BASE_URL}/predictions/${patientId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Inference engine failed');
    }
    return res.json();
  },

  getPredictions: async (patientId) => {
    const res = await customFetch(`${BASE_URL}/patients/${patientId}/predictions`, {
      method: 'GET',
    });
    if (!res.ok) throw new Error('Failed to fetch prediction history');
    return res.json();
  },

  // --- LAB REPORTS ---
  getReports: async (patientId) => {
    const res = await customFetch(`${BASE_URL}/patients/${patientId}/reports`, {
      method: 'GET',
    });
    if (!res.ok) throw new Error('Failed to fetch lab reports');
    return res.json();
  },

  uploadReport: async (patientId, file, reportType) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('report_type', reportType);

    const res = await customFetch(`${BASE_URL}/patients/${patientId}/reports`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to upload report');
    }
    return res.json();
  },

  getDownloadUrl: (reportId) => {
    return `${BASE_URL}/reports/${reportId}/download`;
  },

  downloadPdfReport: async (patientId) => {
    const res = await customFetch(`${BASE_URL}/patients/${patientId}/pdf-report`);
    if (!res.ok) throw new Error('PDF compilation failed');
    return res.blob();
  },

  downloadReportFile: async (reportId) => {
    const res = await customFetch(api.getDownloadUrl(reportId));
    if (!res.ok) throw new Error('Report document download failed');
    return res.blob();
  },

  // --- CHATBOT ---
  getChatHistory: async () => {
    const res = await customFetch(`${BASE_URL}/chat/history`, {
      method: 'GET',
    });
    if (!res.ok) throw new Error('Failed to fetch chat history');
    return res.json();
  },

  sendChatMessage: async (message) => {
    const res = await customFetch(`${BASE_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to send chat message');
    }
    return res.json();
  },
};
