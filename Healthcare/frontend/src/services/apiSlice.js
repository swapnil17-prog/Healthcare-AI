import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

const BASE_URL = 'http://127.0.0.1:8000/api';

// Custom base query using fetchBaseQuery
const baseQuery = fetchBaseQuery({
  baseUrl: BASE_URL,
  prepareHeaders: (headers) => {
    const token = localStorage.getItem('token');
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  },
  credentials: 'include',
});

// Wrapper to handle automatic token refresh (Reauth) on 401 Unauthorized
const baseQueryWithReauth = async (args, api, extraOptions) => {
  let result = await baseQuery(args, api, extraOptions);
  
  if (result.error && result.error.status === 401) {
    const url = typeof args === 'string' ? args : args.url;
    // Don't loop on login/register/refresh endpoints
    if (url && !url.includes('/auth/login') && !url.includes('/auth/register') && !url.includes('/auth/refresh')) {
      const refreshResult = await baseQuery({
        url: '/auth/refresh',
        method: 'POST',
      }, api, extraOptions);
      
      if (refreshResult.data) {
        const newToken = refreshResult.data.access_token;
        localStorage.setItem('token', newToken);
        // Retry the original query with the new token
        result = await baseQuery(args, api, extraOptions);
      } else {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.dispatchEvent(new Event('auth-expired'));
      }
    }
  }
  return result;
};

export const apiSlice = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Patients', 'MedicalHistory', 'Appointments', 'Predictions', 'Reports', 'Chat', 'AdminStats', 'AdminUsers', 'Assignments', 'HealthNudges'],
  endpoints: (builder) => ({
    getMe: builder.query({
      query: () => '/auth/me',
    }),
    register: builder.mutation({
      query: (data) => ({
        url: '/auth/register',
        method: 'POST',
        body: data,
      }),
    }),
    login: builder.mutation({
      query: (data) => ({
        url: '/auth/login',
        method: 'POST',
        body: data,
      }),
    }),
    logout: builder.mutation({
      query: () => ({
        url: '/auth/logout',
        method: 'POST',
      }),
    }),
    
    getPatients: builder.query({
      query: () => '/patients',
      transformResponse: (response) => response?.items || response,
      providesTags: ['Patients'],
    }),
    getDoctors: builder.query({
      query: () => '/patients/doctors',
      transformResponse: (response) => response?.items || response,
    }),
    getPatient: builder.query({
      query: (id) => `/patients/${id}`,
      providesTags: (result, error, id) => [{ type: 'Patients', id }],
    }),
    updatePatient: builder.mutation({
      query: ({ id, data }) => ({
        url: `/patients/${id}`,
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: (result, error, { id }) => ['Patients', { type: 'Patients', id }],
    }),
    
    getMedicalHistory: builder.query({
      query: (patientId) => `/patients/${patientId}/medical-history`,
      transformResponse: (response) => response?.items || response,
      providesTags: ['MedicalHistory'],
    }),
    addMedicalHistory: builder.mutation({
      query: ({ patientId, data }) => ({
        url: `/patients/${patientId}/medical-history`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['MedicalHistory'],
    }),
    deleteMedicalHistory: builder.mutation({
      query: (id) => ({
        url: `/medical-history/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['MedicalHistory'],
    }),
    
    getAppointments: builder.query({
      query: () => '/appointments',
      transformResponse: (response) => response?.items || response,
      providesTags: ['Appointments'],
    }),
    createAppointment: builder.mutation({
      query: (data) => ({
        url: '/appointments',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['Appointments'],
    }),
    updateAppointment: builder.mutation({
      query: ({ id, data }) => ({
        url: `/appointments/${id}`,
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: ['Appointments'],
    }),
    
    getPredictions: builder.query({
      query: (patientId) => `/patients/${patientId}/predictions`,
      transformResponse: (response) => response?.items || response,
      providesTags: ['Predictions'],
    }),
    runPrediction: builder.mutation({
      query: ({ patientId, data }) => ({
        url: `/predictions/${patientId}`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['Predictions'],
    }),
    predictHeartDisease: builder.mutation({
      query: (data) => ({
        url: '/heart/predict',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['Predictions'],
    }),
    getHeartPredictionHistory: builder.query({
      query: ({ limit = 10, skip = 0 } = {}) =>
        `/heart/history?limit=${limit}&skip=${skip}`,
      providesTags: ['Predictions'],
    }),
    getHeartStatus: builder.query({
      query: () => '/heart/status',
    }),
    getRiskForecast: builder.query({
      query: ({ monthsAhead = 3, patientId } = {}) => {
        let url = `/predictions/forecast?months_ahead=${monthsAhead}`;
        if (patientId) url += `&patient_id=${patientId}`;
        return url;
      },
      providesTags: ['Predictions'],
    }),
    
    getReports: builder.query({
      query: (patientId) => `/patients/${patientId}/reports`,
      transformResponse: (response) => response?.items || response,
      providesTags: ['Reports'],
    }),
    getHealthNudges: builder.query({
      query: ({ status, limit, patientId } = {}) => {
        let url = `/health-nudges?limit=${limit || 20}`;
        if (status) url += `&status=${status}`;
        if (patientId) url += `&patient_id=${patientId}`;
        return url;
      },
      providesTags: ['HealthNudges'],
    }),
    markHealthNudgeRead: builder.mutation({
      query: (id) => ({
        url: `/health-nudges/${id}/read`,
        method: 'PATCH',
      }),
      invalidatesTags: ['HealthNudges'],
    }),
    dismissHealthNudge: builder.mutation({
      query: (id) => ({
        url: `/health-nudges/${id}/dismiss`,
        method: 'PATCH',
      }),
      invalidatesTags: ['HealthNudges'],
    }),
    runNudgeChecks: builder.mutation({
      query: () => ({
        url: '/health-nudges/run-checks',
        method: 'POST',
      }),
      invalidatesTags: ['HealthNudges'],
    }),
    uploadReport: builder.mutation({
      query: ({ patientId, formData }) => ({
        url: `/patients/${patientId}/reports`,
        method: 'POST',
        body: formData,
      }),
      invalidatesTags: ['Reports'],
    }),
    
    getChatHistory: builder.query({
      query: () => '/chat/history',
      transformResponse: (response) => response?.items || response,
      providesTags: ['Chat'],
    }),
    clearChatHistory: builder.mutation({
      query: () => ({
        url: '/chat/history',
        method: 'DELETE',
      }),
      invalidatesTags: ['Chat'],
    }),
    getAdminStats: builder.query({
      query: () => '/admin/stats',
      providesTags: ['AdminStats'],
    }),
    getAdminUsers: builder.query({
      query: ({ role, search } = {}) => {
        let url = '/admin/users';
        const params = [];
        if (role) params.push(`role=${role}`);
        if (search) params.push(`search=${encodeURIComponent(search)}`);
        if (params.length) url += `?${params.join('&')}`;
        return url;
      },
      transformResponse: (response) => response?.items || response,
      providesTags: ['AdminUsers'],
    }),
    createAdminUser: builder.mutation({
      query: (data) => ({
        url: '/admin/users',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['AdminUsers', 'AdminStats', 'Patients'],
    }),
    toggleUserStatus: builder.mutation({
      query: (id) => ({
        url: `/admin/users/${id}/status`,
        method: 'PATCH',
      }),
      invalidatesTags: ['AdminUsers'],
    }),
    deleteUser: builder.mutation({
      query: (id) => ({
        url: `/admin/users/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['AdminUsers', 'AdminStats', 'Patients'],
    }),
    getAssignments: builder.query({
      query: () => '/admin/assignments',
      transformResponse: (response) => response?.items || response,
      providesTags: ['Assignments'],
    }),
    createAssignment: builder.mutation({
      query: (data) => ({
        url: '/admin/assignments',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['Assignments', 'AdminUsers'],
    }),
  }),
});

// Keep manual download endpoints for blobs, which are cleaner to handle imperatively
export const downloadPdfReport = async (patientId) => {
  const token = localStorage.getItem('token');
  const res = await fetch(`${BASE_URL}/patients/${patientId}/pdf-report`, {
    headers: {
      'Authorization': `Bearer ${token}`
    },
    credentials: 'include'
  });
  if (!res.ok) throw new Error('PDF compilation failed');
  return res.blob();
};

export const downloadReportFile = async (reportId) => {
  const token = localStorage.getItem('token');
  const res = await fetch(`${BASE_URL}/reports/${reportId}/download`, {
    headers: {
      'Authorization': `Bearer ${token}`
    },
    credentials: 'include'
  });
  if (!res.ok) throw new Error('Report document download failed');
  return res.blob();
};

export const {
  useGetMeQuery,
  useRegisterMutation,
  useLoginMutation,
  useLogoutMutation,
  useGetPatientsQuery,
  useGetDoctorsQuery,
  useGetPatientQuery,
  useUpdatePatientMutation,
  useGetMedicalHistoryQuery,
  useAddMedicalHistoryMutation,
  useDeleteMedicalHistoryMutation,
  useGetAppointmentsQuery,
  useCreateAppointmentMutation,
  useUpdateAppointmentMutation,
  useGetPredictionsQuery,
  useLazyGetPredictionsQuery,
  useRunPredictionMutation,
  useGetRiskForecastQuery,
  useGetReportsQuery,
  useUploadReportMutation,
  useGetChatHistoryQuery,
  useClearChatHistoryMutation,
  useGetAdminStatsQuery,
  useGetAdminUsersQuery,
  useCreateAdminUserMutation,
  useToggleUserStatusMutation,
  useDeleteUserMutation,
  useGetAssignmentsQuery,
  useCreateAssignmentMutation,
  useGetHealthNudgesQuery,
  useMarkHealthNudgeReadMutation,
  useDismissHealthNudgeMutation,
  useRunNudgeChecksMutation,
  usePredictHeartDiseaseMutation,
  useGetHeartPredictionHistoryQuery,
  useGetHeartStatusQuery,
} = apiSlice;
