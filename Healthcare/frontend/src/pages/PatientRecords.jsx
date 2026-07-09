import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { Calendar, FileText, Clock, User } from 'lucide-react';
import { motion } from 'framer-motion';
import {
  useGetPatientsQuery,
  useGetAppointmentsQuery,
  useGetDoctorsQuery,
  useGetMedicalHistoryQuery,
  useCreateAppointmentMutation,
  useGetReportsQuery
} from '../services/apiSlice';
import './PatientDashboard.css';

export default function PatientRecords() {
  const { user } = useSelector((state) => state.auth);
  
  // Queries
  const { data: patients = [] } = useGetPatientsQuery();
  const patient = patients.find((p) => p.user_id === user?.id);

  const { data: appointments = [], isLoading: isApptsLoading } = useGetAppointmentsQuery();
  const { data: doctors = [], isLoading: isDocsLoading } = useGetDoctorsQuery();
  const { data: medicalHistory = [], isLoading: isHistoryLoading } = useGetMedicalHistoryQuery(patient?.id, { skip: !patient });
  const { data: reports = [], isLoading: isReportsLoading } = useGetReportsQuery(patient?.id, { skip: !patient });
  
  const [createAppointment] = useCreateAppointmentMutation();

  // Booking states
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [apptNotes, setApptNotes] = useState('');
  const [showBookForm, setShowBookForm] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);

  const [apptTab, setApptTab] = useState('upcoming');

  // Filter patient's own appointments
  const myAppointments = patient
    ? appointments.filter((appt) => appt.patient_id === patient.id)
    : [];

  const now = new Date();
  
  // Sort upcoming appointments ascending (soonest first)
  const upcomingAppts = myAppointments
    .filter((appt) => {
      const isFuture = new Date(appt.scheduled_at) >= now;
      const isActive = appt.status !== 'Completed' && appt.status !== 'Cancelled';
      return isFuture && isActive;
    })
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));

  // Sort past appointments descending (most recent first)
  const pastAppts = myAppointments
    .filter((appt) => {
      const isPast = new Date(appt.scheduled_at) < now;
      const isInactive = appt.status === 'Completed' || appt.status === 'Cancelled';
      return isPast || isInactive;
    })
    .sort((a, b) => new Date(b.scheduled_at) - new Date(a.scheduled_at));

  const activeAppts = apptTab === 'upcoming' ? upcomingAppts : pastAppts;

  const handleScheduleAppt = async (e) => {
    e.preventDefault();
    if (!selectedDoctorId || !scheduledAt || !patient) {
      alert('Please fill out all scheduling details.');
      return;
    }
    setBookingLoading(true);
    try {
      await createAppointment({
        patient_id: patient.id,
        doctor_id: parseInt(selectedDoctorId),
        scheduled_at: new Date(scheduledAt).toISOString(),
        status: 'Scheduled',
        notes: apptNotes
      }).unwrap();
      setSelectedDoctorId('');
      setScheduledAt('');
      setApptNotes('');
      setShowBookForm(false);
      alert('Consultation scheduled successfully.');
    } catch (err) {
      alert(`Scheduling failed: ${err.data?.detail || err.message}`);
    } finally {
      setBookingLoading(false);
    }
  };

  const loading = isApptsLoading || isDocsLoading || isHistoryLoading;

  if (loading) {
    return <div className="dashboard-loading-container">Loading Clinical Records...</div>;
  }

  return (
    <div className="patient-dashboard-container">
      <div className="bg-gradient-radial"></div>

      {/* Greeting Banner */}
      <div className="dashboard-header glass-card">
        <div className="header-greeting">
          <span className="welcome-tag">CLINICAL RECORDS & VISITS</span>
          <h2>Your Appointments & Medical History</h2>
          <p>Review scheduled consultations, check diagnostic notes, and view documented clinical summaries.</p>
        </div>
      </div>

      <motion.div 
        className="dashboard-grid"
        variants={{
          hidden: { opacity: 0 },
          show: { opacity: 1, transition: { staggerChildren: 0.08 } }
        }}
        initial="hidden"
        animate="show"
      >
        {/* Upcoming Appointments */}
        <motion.div 
          className="glass-card grid-card appointments-card" 
          style={{ gridColumn: 'span 6' }}
          variants={{
            hidden: { opacity: 0, y: 15 },
            show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } }
          }}
          whileHover={{ scale: 1.02, boxShadow: '0 8px 30px rgba(99, 102, 241, 0.15)', borderColor: 'rgba(99,102,241,0.2)' }}
        >
          <div className="card-title-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {!showBookForm ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div 
                  onClick={() => setApptTab('upcoming')} 
                  style={{ 
                    cursor: 'pointer', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '6px',
                    borderBottom: apptTab === 'upcoming' ? '2px solid var(--accent)' : '2px solid transparent',
                    paddingBottom: '4px',
                    fontWeight: apptTab === 'upcoming' ? '700' : '500',
                    color: apptTab === 'upcoming' ? 'white' : 'var(--text-secondary)',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <Calendar size={16} />
                  <span style={{ fontSize: '13.5px' }}>Upcoming</span>
                </div>
                <div 
                  onClick={() => setApptTab('history')} 
                  style={{ 
                    cursor: 'pointer', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '6px',
                    borderBottom: apptTab === 'history' ? '2px solid var(--accent)' : '2px solid transparent',
                    paddingBottom: '4px',
                    fontWeight: apptTab === 'history' ? '700' : '500',
                    color: apptTab === 'history' ? 'white' : 'var(--text-secondary)',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <Clock size={16} />
                  <span style={{ fontSize: '13.5px' }}>History</span>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Calendar size={18} className="card-icon" />
                <h3>Book Consultation</h3>
              </div>
            )}
            {!showBookForm && (
              <button onClick={() => setShowBookForm(true)} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                + Book New
              </button>
            )}
          </div>
          
          {!showBookForm ? (
            <div className="list-body">
              {activeAppts.length === 0 ? (
                <p className="empty-text">
                  {apptTab === 'upcoming' ? 'No upcoming scheduled appointments.' : 'No past or completed appointments.'}
                </p>
              ) : (
                activeAppts.map((appt) => (
                  <div key={appt.id} className="list-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
                    <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div className="item-meta">
                        <span className="item-title" style={{ marginRight: '6px' }}>Consultation Call -</span>
                        <span className="item-date">
                          {new Date(appt.scheduled_at).toLocaleDateString()} at {new Date(appt.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <span className={`badge ${
                        appt.status === 'Completed' ? 'badge-success' :
                        appt.status === 'Accepted' ? 'badge-info' :
                        appt.status === 'Rescheduled' ? 'badge-warning' :
                        appt.status === 'Scheduled' ? 'badge-pending' : 'badge-danger'
                      }`}>
                        {appt.status}
                      </span>
                    </div>
                    {appt.notes && (
                      <div style={{ 
                        width: '100%', 
                        marginTop: '4px', 
                        padding: '10px 12px', 
                        background: 'rgba(255, 255, 255, 0.02)', 
                        border: '1px solid rgba(255, 255, 255, 0.05)', 
                        borderRadius: '6px',
                        fontSize: '12px' 
                      }}>
                        <strong style={{ color: 'white', display: 'block', marginBottom: '4px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notes Log:</strong>
                        <p style={{ margin: 0, color: 'hsl(var(--text-muted))', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{appt.notes}</p>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '24px', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <form onSubmit={handleScheduleAppt} className="booking-form-inline" style={{ flex: 1, minWidth: '240px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div className="form-group">
                  <label className="input-label" style={{ fontSize: '10px' }}>Select Doctor</label>
                  <select
                    className="input-field select-field"
                    value={selectedDoctorId}
                    onChange={(e) => setSelectedDoctorId(e.target.value)}
                    required
                    style={{ padding: '8px 12px', fontSize: '13px' }}
                  >
                    <option value="">-- Choose Doctor --</option>
                    {doctors.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="input-label" style={{ fontSize: '10px' }}>Date & Time</label>
                  <input
                    type="datetime-local"
                    className="input-field"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    required
                    style={{ padding: '8px 12px', fontSize: '13px' }}
                  />
                </div>
                <div className="form-group">
                  <label className="input-label" style={{ fontSize: '10px' }}>Notes</label>
                  <input
                    type="text"
                    className="input-field"
                    value={apptNotes}
                    onChange={(e) => setApptNotes(e.target.value)}
                    placeholder="Need diabetes screening..."
                    style={{ padding: '8px 12px', fontSize: '13px' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                  <button type="submit" className="btn btn-primary" disabled={bookingLoading} style={{ flex: 1, padding: '8px 12px', fontSize: '13px' }}>
                    {bookingLoading ? 'Booking...' : 'Schedule'}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowBookForm(false)} style={{ padding: '8px 12px', fontSize: '13px' }}>
                    Cancel
                  </button>
                </div>
              </form>
              <div className="scheduling-illust-wrapper" style={{ width: '160px', height: '140px', display: 'flex', justifyContent: 'center', alignItems: 'center', flexShrink: 0 }}>
                <img src="/scheduling_illust.jpg" alt="Schedule Illustration" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '8px' }} />
              </div>
            </div>
          )}
        </motion.div>

        {/* Clinical Medical History Log */}
        <motion.div 
          className="glass-card grid-card medical-history-card" 
          style={{ gridColumn: 'span 6' }}
          variants={{
            hidden: { opacity: 0, y: 15 },
            show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } }
          }}
          whileHover={{ scale: 1.02, boxShadow: '0 8px 30px rgba(99, 102, 241, 0.15)', borderColor: 'rgba(99,102,241,0.2)' }}
        >
          <div className="card-title-row">
            <FileText size={18} className="card-icon" />
            <h3>Your Clinical Medical History</h3>
          </div>
          <div className="list-body">
            {medicalHistory.length === 0 ? (
              <p className="empty-text">No clinical history logged in your file.</p>
            ) : (
              medicalHistory.map((h) => (
                <div key={h.id} className="history-log-item-dashboard">
                  <div className="history-item-header-dashboard">
                    <h5>{h.disease}</h5>
                    <span className="history-item-date-dashboard">{new Date(h.diagnosis_date).toLocaleDateString()}</span>
                  </div>
                  <div className="history-item-body-dashboard">
                    {h.medications && <p style={{ margin: '0 0 6px 0' }}><strong>Medications:</strong> {h.medications}</p>}
                    {h.notes && <p style={{ margin: 0 }}><strong>Notes:</strong> {h.notes}</p>}
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.div>

        {/* Diagnostic Reports Portal */}
        <motion.div 
          className="glass-card grid-card reports-portal-card" 
          style={{ gridColumn: 'span 12', marginTop: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '32px', flexWrap: 'wrap' }}
          variants={{
            hidden: { opacity: 0, y: 15 },
            show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } }
          }}
          whileHover={{ scale: 1.01, boxShadow: '0 8px 30px rgba(99, 102, 241, 0.12)', borderColor: 'rgba(99,102,241,0.15)' }}
        >
          <div style={{ flex: 1, minWidth: '300px' }}>
            <div className="card-title-row" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <FileText size={18} className="card-icon" style={{ color: 'var(--accent)' }} />
              <h3>Uploaded Diagnostic Reports</h3>
            </div>
            
            {isReportsLoading ? (
              <p className="empty-text">Loading diagnostic reports...</p>
            ) : reports.length === 0 ? (
              <p className="empty-text">No diagnostic report documents uploaded to your clinical file yet. Please contact your physician to upload copies.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {reports.map((r) => (
                  <div 
                    key={r.id} 
                    style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center', 
                      background: 'rgba(255, 255, 255, 0.02)', 
                      border: '1px solid var(--border)', 
                      padding: '12px 16px', 
                      borderRadius: '8px' 
                    }}
                  >
                    <div>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', display: 'block' }}>{r.report_type}</span>
                      <span style={{ fontSize: '11px', color: 'hsl(var(--text-muted))' }}>Uploaded on {new Date(r.uploaded_at).toLocaleDateString()}</span>
                    </div>
                    <a 
                      href={`http://127.0.0.1:8000/api/reports/${r.id}/download`} 
                      className="btn btn-secondary" 
                      style={{ padding: '6px 12px', fontSize: '11px', textDecoration: 'none' }}
                      download
                    >
                      Download {r.file_path.split('.').pop().toUpperCase()}
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ width: '220px', height: '160px', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
            <img src="/report_illust.jpg" alt="PDF Report Illustration" style={{ width: '100%', height: '120px', objectFit: 'contain', borderRadius: '8px' }} />
            <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)', textAlign: 'center', fontWeight: '500' }}>Secure Diagnostic Records</span>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
