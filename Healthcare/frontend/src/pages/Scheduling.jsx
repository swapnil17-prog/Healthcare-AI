import React, { useState } from 'react';
import { Calendar, User, Clock, FileText, CheckCircle, XCircle, RefreshCw, Clipboard } from 'lucide-react';
import { 
  useGetAppointmentsQuery, 
  useUpdateAppointmentMutation, 
  useGetPatientsQuery 
} from '../services/apiSlice';
import './Scheduling.css';

export default function Scheduling() {
  const { data: appointments = [], isLoading: isApptsLoading } = useGetAppointmentsQuery();
  const { data: patients = [], isLoading: isPatientsLoading } = useGetPatientsQuery();
  const [updateAppointment, { isLoading: updateLoading }] = useUpdateAppointmentMutation();

  const [activeTab, setActiveTab] = useState('active'); // 'active' or 'history'
  
  // Rescheduling states
  const [rescheduleId, setRescheduleId] = useState(null);
  const [newDate, setNewDate] = useState('');
  const [rescheduleNotes, setRescheduleNotes] = useState('');

  // Consultation Notes states
  const [consultId, setConsultId] = useState(null);
  const [consultNotes, setConsultNotes] = useState('');
  const [referralStatus, setReferralStatus] = useState('No Referral'); // e.g. Endocrinologist, etc.

  // Helper to find patient name from ID
  const getPatientName = (patientId) => {
    const found = patients.find(p => p.id === patientId);
    return found ? found.user.name : `Patient ID ${patientId}`;
  };

  const handleUpdateStatus = async (apptId, status, customNotes = null) => {
    try {
      const payload = { status };
      if (customNotes !== null) {
        payload.notes = customNotes;
      }
      await updateAppointment({ id: apptId, data: payload }).unwrap();
      alert(`Appointment updated to: ${status}`);
    } catch (err) {
      alert(`Failed to update appointment: ${err.data?.detail || err.message}`);
    }
  };

  const handleSaveReschedule = async (e) => {
    e.preventDefault();
    if (!newDate) return;
    try {
      const payload = {
        scheduled_at: new Date(newDate).toISOString(),
        status: 'Rescheduled',
        notes: rescheduleNotes ? `Reschedule details: ${rescheduleNotes}` : undefined
      };
      await updateAppointment({ id: rescheduleId, data: payload }).unwrap();
      setRescheduleId(null);
      setNewDate('');
      setRescheduleNotes('');
      alert('Consultation rescheduled successfully.');
    } catch (err) {
      alert(`Rescheduling failed: ${err.data?.detail || err.message}`);
    }
  };

  const handleSaveConsultNotes = async (e) => {
    e.preventDefault();
    if (!consultNotes) return;
    try {
      // Find original appointment to append notes
      const original = appointments.find(a => a.id === consultId);
      const originalNotes = original?.notes ? `${original.notes}\n` : '';
      const mergedNotes = `${originalNotes}Consultation Notes: ${consultNotes} (Referral: ${referralStatus})`;
      
      const payload = {
        status: 'Completed',
        notes: mergedNotes
      };
      await updateAppointment({ id: consultId, data: payload }).unwrap();
      setConsultId(null);
      setConsultNotes('');
      setReferralStatus('No Referral');
      alert('Consultation logged and session marked as Completed.');
    } catch (err) {
      alert(`Consultation note log failed: ${err.data?.detail || err.message}`);
    }
  };

  const loading = isApptsLoading || isPatientsLoading;
  if (loading) {
    return <div className="dashboard-loading-container">Loading Scheduling Center...</div>;
  }

  // Filter appointments
  const activeAppts = appointments.filter(a => ['Scheduled', 'Accepted', 'Rescheduled'].includes(a.status));
  const historyAppts = appointments.filter(a => ['Completed', 'Rejected', 'Cancelled'].includes(a.status));
  const currentAppts = activeTab === 'active' ? activeAppts : historyAppts;

  return (
    <div className="scheduling-page-container">
      <div className="bg-gradient-radial"></div>

      {/* Header Banner */}
      <div className="dashboard-header glass-card">
        <div className="header-greeting">
          <span className="welcome-tag">SCHEDULING CENTER</span>
          <h2>Consultation Planner</h2>
          <p>Review scheduling slots, coordinate reschedules, and record patient consultation summaries.</p>
        </div>
      </div>

      {/* Tabs Row */}
      <div className="tabs-header-row">
        <button 
          onClick={() => { setActiveTab('active'); setRescheduleId(null); setConsultId(null); }}
          className={`tab-btn ${activeTab === 'active' ? 'active' : ''}`}
        >
          Active Consultations ({activeAppts.length})
        </button>
        <button 
          onClick={() => { setActiveTab('history'); setRescheduleId(null); setConsultId(null); }}
          className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
        >
          Session Archive ({historyAppts.length})
        </button>
      </div>

      {/* Roster Grid */}
      <div className="appointments-grid-flow">
        {currentAppts.length === 0 ? (
          <div className="glass-card empty-scheduling-view">
            <Calendar size={48} className="empty-icon" />
            <p>No consultations registered under this section.</p>
          </div>
        ) : (
          currentAppts.map((appt) => (
            <div key={appt.id} className="glass-card appt-card">
              <div className="appt-card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <User className="card-avatar-icon" size={20} />
                  <div>
                    <h4>{getPatientName(appt.patient_id)}</h4>
                    <span className="appt-meta-sub">Case ID: #{appt.patient_id}</span>
                  </div>
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

              <div className="appt-card-details">
                <div className="detail-row">
                  <Clock size={14} className="detail-icon" />
                  <span>
                    <strong>Date & Time:</strong> {new Date(appt.scheduled_at).toLocaleString([], {
                      weekday: 'short',
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>
                {appt.notes && (
                  <div className="detail-row align-start">
                    <FileText size={14} className="detail-icon" style={{ marginTop: '3px' }} />
                    <div className="notes-block">
                      <strong>Notes Log:</strong>
                      <p className="notes-text">{appt.notes}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons for Active Tab */}
              {activeTab === 'active' && (
                <div className="appt-card-actions">
                  {appt.status === 'Scheduled' && (
                    <>
                      <button 
                        onClick={() => handleUpdateStatus(appt.id, 'Accepted')}
                        className="btn btn-primary action-btn flex-center"
                        disabled={updateLoading}
                      >
                        <CheckCircle size={14} />
                        <span>Accept</span>
                      </button>
                      <button 
                        onClick={() => handleUpdateStatus(appt.id, 'Rejected')}
                        className="btn btn-secondary action-btn flex-center border-red"
                        disabled={updateLoading}
                      >
                        <XCircle size={14} />
                        <span>Reject</span>
                      </button>
                    </>
                  )}

                  <button 
                    onClick={() => { setRescheduleId(appt.id); setConsultId(null); }}
                    className="btn btn-secondary action-btn flex-center"
                    disabled={updateLoading}
                  >
                    <RefreshCw size={14} />
                    <span>Reschedule</span>
                  </button>

                  <button 
                    onClick={() => { setConsultId(appt.id); setRescheduleId(null); }}
                    className="btn btn-primary action-btn consult-btn flex-center"
                    disabled={updateLoading}
                  >
                    <Clipboard size={14} />
                    <span>Consult Notes</span>
                  </button>
                </div>
              )}

              {/* Rescheduling Form Overlay inline */}
              {rescheduleId === appt.id && (
                <form onSubmit={handleSaveReschedule} className="inline-action-form glass-card">
                  <h5>Reschedule Session</h5>
                  <div className="form-group">
                    <label className="input-label">Select Date & Time</label>
                    <input 
                      type="datetime-local" 
                      className="input-field"
                      value={newDate} 
                      onChange={(e) => setNewDate(e.target.value)}
                      required 
                    />
                  </div>
                  <div className="form-group">
                    <label className="input-label">Rescheduling Context / Reason</label>
                    <input 
                      type="text" 
                      className="input-field" 
                      value={rescheduleNotes}
                      onChange={(e) => setRescheduleNotes(e.target.value)}
                      placeholder="Doctor reschedule requested..."
                    />
                  </div>
                  <div className="inline-form-actions">
                    <button type="submit" className="btn btn-primary" disabled={updateLoading}>Save Reschedule</button>
                    <button type="button" className="btn btn-secondary" onClick={() => setRescheduleId(null)}>Cancel</button>
                  </div>
                </form>
              )}

              {/* Consultation Notes Form Overlay inline */}
              {consultId === appt.id && (
                <form onSubmit={handleSaveConsultNotes} className="inline-action-form glass-card">
                  <h5>Conduct Consultation & Write Notes</h5>
                  <div className="form-group">
                    <label className="input-label">Clinical Diagnostic Notes & Action Items</label>
                    <textarea 
                      rows="4" 
                      className="input-field textarea-field"
                      value={consultNotes}
                      onChange={(e) => setConsultNotes(e.target.value)}
                      placeholder="Patient reports stable glucose. Advised to maintain daily insulin log and exercise..."
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="input-label">Specialist Referral Recommendation</label>
                    <select 
                      className="input-field select-field"
                      value={referralStatus}
                      onChange={(e) => setReferralStatus(e.target.value)}
                    >
                      <option value="No Referral">No Referral Required</option>
                      <option value="Endocrinologist Referral">Endocrinologist Referral</option>
                      <option value="Cardiologist Referral">Cardiologist Referral</option>
                      <option value="Nutritionist Referral">Nutritionist Referral</option>
                    </select>
                  </div>
                  <div className="inline-form-actions">
                    <button type="submit" className="btn btn-primary green-btn" disabled={updateLoading}>Complete Session</button>
                    <button type="button" className="btn btn-secondary" onClick={() => setConsultId(null)}>Cancel</button>
                  </div>
                </form>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
