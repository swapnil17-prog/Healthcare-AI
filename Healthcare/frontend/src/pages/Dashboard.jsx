import React from 'react';
import { useSelector } from 'react-redux';
import PatientDashboard from './PatientDashboard';
import DoctorDashboard from './DoctorDashboard';

export default function Dashboard() {
  const { user } = useSelector((state) => state.auth);

  if (!user) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>Loading user profile...</div>;
  }

  if (user.role === 'patient') {
    return <PatientDashboard />;
  }

  // Doctor or Admin roles share the Doctor/Admin dashboard
  return <DoctorDashboard />;
}
