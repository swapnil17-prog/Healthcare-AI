import React from 'react';
import { useSelector } from 'react-redux';
import PatientDashboard from './PatientDashboard';
import DoctorDashboard from './DoctorDashboard';
import AdminDashboard from './AdminDashboard';

export default function Dashboard() {
  const { user } = useSelector((state) => state.auth);

  if (!user) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>Loading user profile...</div>;
  }

  const role = user.role;
  if (role === 'admin') return <AdminDashboard />;
  if (role === 'doctor') return <DoctorDashboard />;
  if (role === 'patient') return <PatientDashboard />;
}
