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
  tagTypes: ['Patients', 'MedicalHistory', 'Appointments', 'Predictions', 'Reports', 'Chat', 'AdminStats', 'AdminUsers', 'Assignments'],
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
      providesTags: ['Patients'],
    }),
    getDoctors: builder.query({
      query: () => '/patients/doctors',
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
    
    getReports: builder.query({
      query: (patientId) => `/patients/${patientId}/reports`,
      providesTags: ['Reports'],
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
      providesTags: ['Chat'],
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
  useGetReportsQuery,
  useUploadReportMutation,
  useGetChatHistoryQuery,
  useGetAdminStatsQuery,
  useGetAdminUsersQuery,
  useCreateAdminUserMutation,
  useToggleUserStatusMutation,
  useDeleteUserMutation,
  useGetAssignmentsQuery,
  useCreateAssignmentMutation,
} = apiSlice;
