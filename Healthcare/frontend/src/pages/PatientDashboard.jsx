import React, { useState, useEffect } from 'react';
import { Download, Calendar, Activity, RefreshCw, User as UserIcon, FileText } from 'lucide-react';
import { 
  useGetPatientsQuery, 
  useGetPredictionsQuery, 
  useGetAppointmentsQuery, 
  useGetDoctorsQuery, 
  useGetMedicalHistoryQuery,
  useUpdatePatientMutation, 
  useCreateAppointmentMutation,
  downloadPdfReport
} from '../services/apiSlice';
import ChatWidget from '../components/ChatWidget';
import TrendChart from '../components/TrendChart';
import './PatientDashboard.css';

export default function PatientDashboard() {
  const { data: patientsList = [], isLoading: isPatientsLoading } = useGetPatientsQuery();
  const patient = patientsList?.[0];

  const { data: predictions = [], isLoading: isPredsLoading } = useGetPredictionsQuery(patient?.id, { skip: !patient });
  const { data: appointments = [], isLoading: isApptsLoading } = useGetAppointmentsQuery();
  const { data: doctors = [], isLoading: isDocsLoading } = useGetDoctorsQuery();
  const { data: medicalHistory = [], isLoading: isHistoryLoading } = useGetMedicalHistoryQuery(patient?.id, { skip: !patient });

  const [updatePatient] = useUpdatePatientMutation();
  const [createAppointment] = useCreateAppointmentMutation();

  // Booking states
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [apptNotes, setApptNotes] = useState('');
  const [showBookForm, setShowBookForm] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  // Profile Edit states
  const [isEditing, setIsEditing] = useState(false);
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');

  useEffect(() => {
    if (patient) {
      setAge(patient.age || '');
      setGender(patient.gender || '');
      setHeight(patient.height || '');
      setWeight(patient.weight || '');
      setBloodGroup(patient.blood_group || '');
      setPhone(patient.phone || '');
      setAddress(patient.address || '');
    }
  }, [patient]);

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (!patient) return;
    try {
      const payload = {
        age: age ? parseInt(age) : null,
        gender,
        height: height ? parseFloat(height) : null,
        weight: weight ? parseFloat(weight) : null,
        blood_group: bloodGroup,
        phone,
        address
      };
      await updatePatient({ id: patient.id, data: payload }).unwrap();
      setIsEditing(false);
      alert('Profile updated successfully.');
    } catch (err) {
      alert(`Update failed: ${err.data?.detail || err.message}`);
    }
  };

  const handleDownloadPDF = async () => {
    if (!patient) return;
    setPdfLoading(true);
    try {
      const blob = await downloadPdfReport(patient.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Clinical_Summary_Report_${patient.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      alert(`Export failed: ${err.message}`);
    } finally {
      setPdfLoading(false);
    }
  };

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

  const loading = isPatientsLoading || (patient && (isPredsLoading || isApptsLoading || isDocsLoading || isHistoryLoading));

  if (loading) {
    return <div className="dashboard-loading-container">Loading Patient Dashboard...</div>;
  }

  const latestPrediction = predictions.length > 0 ? predictions[predictions.length - 1] : null;
  const riskScore = latestPrediction ? latestPrediction.risk_score : 0;
  
  // Calculate stroke dashoffset for gauge
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (riskScore / 100) * circumference;

  return (
    <div className="patient-dashboard-container">
      <div className="bg-gradient-radial"></div>

      {/* Header Banner */}
      <div className="dashboard-header glass-card">
        <div className="header-greeting">
          <span className="welcome-tag">PATIENT CENTER</span>
          <h2>Welcome back, {patient?.user.name}</h2>
          <p>Monitor your clinical metrics, prediction history, and schedule details.</p>
        </div>
        <button onClick={handleDownloadPDF} className="btn btn-primary export-pdf-btn" disabled={pdfLoading}>
          {pdfLoading ? (
            <>
              <RefreshCw className="animate-spin" size={16} />
              <span>Generating PDF...</span>
            </>
          ) : (
            <>
              <Download size={16} />
              <span>Export Clinical PDF</span>
            </>
          )}
        </button>
      </div>

      <div className="dashboard-grid">
        {/* Risk Score Widget */}
        <div className="glass-card grid-card score-card">
          <h3>Diabetes Risk Assessment</h3>
          <div className="gauge-outer">
            <svg className="gauge-svg" width="140" height="140">
              <circle className="gauge-bg" cx="70" cy="70" r={radius} />
              <circle
                className={`gauge-bar ${riskScore >= 50 ? 'high-risk' : 'low-risk'}`}
                cx="70"
                cy="70"
                r={radius}
                strokeDasharray={circumference}
                strokeDashoffset={offset}
              />
            </svg>
            <div className="gauge-info">
              <span className="gauge-val">{riskScore}%</span>
              <span className="gauge-label">{latestPrediction?.prediction || 'No Scan'}</span>
            </div>
          </div>
          <p className="score-desc">
            {latestPrediction 
              ? `Your latest assessment was compiled on ${new Date(latestPrediction.created_at).toLocaleDateString()}.`
              : 'You have not completed a diabetes risk screening yet.'}
          </p>
        </div>

        {/* Demographics Summary */}
        <div className="glass-card grid-card info-card">
          <div className="card-title-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <UserIcon size={18} className="card-icon" />
              <h3>Your Health Profile</h3>
            </div>
            {!isEditing && (
              <button 
                onClick={() => setIsEditing(true)} 
                className="btn btn-secondary" 
                style={{ padding: '6px 12px', fontSize: '12px', height: 'auto', minHeight: 'unset' }}
              >
                Edit Profile
              </button>
            )}
          </div>

          {isEditing ? (
            <form onSubmit={handleUpdateProfile} className="demographics-form">
              <div className="form-row-2">
                <div className="form-group">
                  <label className="input-label">Age</label>
                  <input type="number" className="input-field" value={age} onChange={(e) => setAge(e.target.value)} placeholder="35" />
                </div>
                <div className="form-group">
                  <label className="input-label">Gender</label>
                  <input type="text" className="input-field" value={gender} onChange={(e) => setGender(e.target.value)} placeholder="Female" />
                </div>
              </div>
              <div className="form-row-2">
                <div className="form-group">
                  <label className="input-label">Height (cm)</label>
                  <input type="number" step="0.1" className="input-field" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="165" />
                </div>
                <div className="form-group">
                  <label className="input-label">Weight (kg)</label>
                  <input type="number" step="0.1" className="input-field" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="62.5" />
                </div>
              </div>
              <div className="form-row-2">
                <div className="form-group">
                  <label className="input-label">Blood Group</label>
                  <input type="text" className="input-field" value={bloodGroup} onChange={(e) => setBloodGroup(e.target.value)} placeholder="AB-" />
                </div>
                <div className="form-group">
                  <label className="input-label">Phone</label>
                  <input type="text" className="input-field" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+12345" />
                </div>
              </div>
              <div className="form-group">
                <label className="input-label">Address</label>
                <input type="text" className="input-field" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Health Ave" />
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Save Changes</button>
                <button type="button" className="btn btn-secondary" onClick={() => {
                  if (patient) {
                    setAge(patient.age || '');
                    setGender(patient.gender || '');
                    setHeight(patient.height || '');
                    setWeight(patient.weight || '');
                    setBloodGroup(patient.blood_group || '');
                    setPhone(patient.phone || '');
                    setAddress(patient.address || '');
                  }
                  setIsEditing(false);
                }}>Cancel</button>
              </div>
            </form>
          ) : (
            <>
              <div className="metrics-grid">
                <div className="metric-box">
                  <span className="metric-label">Age</span>
                  <span className="metric-value">{patient?.age ? `${patient.age} years` : 'N/A'}</span>
                </div>
                <div className="metric-box">
                  <span className="metric-label">Gender</span>
                  <span className="metric-value">{patient?.gender || 'N/A'}</span>
                </div>
                <div className="metric-box">
                  <span className="metric-label">Height</span>
                  <span className="metric-value">{patient?.height ? `${patient.height} cm` : 'N/A'}</span>
                </div>
                <div className="metric-box">
                  <span className="metric-label">Weight</span>
                  <span className="metric-value">{patient?.weight ? `${patient.weight} kg` : 'N/A'}</span>
                </div>
                <div className="metric-box">
                  <span className="metric-label">Blood Group</span>
                  <span className="metric-value">{patient?.blood_group || 'N/A'}</span>
                </div>
                <div className="metric-box">
                  <span className="metric-label">BMI</span>
                  <span className="metric-value">
                    {patient?.weight && patient?.height 
                      ? (patient.weight / ((patient.height / 100) ** 2)).toFixed(1)
                      : 'N/A'}
                  </span>
                </div>
              </div>
              <div className="demographics-address">
                <span><strong>Address:</strong> {patient?.address || 'N/A'}</span>
                <span><strong>Phone:</strong> {patient?.phone || 'N/A'}</span>
              </div>
            </>
          )}
        </div>

        {/* Assessment Metric Trends Chart */}
        <div className="glass-card grid-card full-width trends-chart-card">
          <div className="card-title-row">
            <Activity size={18} className="card-icon" />
            <h3>Assessment Metric Trends</h3>
          </div>
          <TrendChart predictions={predictions} />
        </div>

        {/* Upcoming Appointments */}
        <div className="glass-card grid-card appointments-card">
          <div className="card-title-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Calendar size={18} className="card-icon" />
              <h3>Upcoming Appointments</h3>
            </div>
            {!showBookForm && (
              <button onClick={() => setShowBookForm(true)} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                + Book New
              </button>
            )}
          </div>
          
          {!showBookForm ? (
            <div className="list-body">
              {appointments.length === 0 ? (
                <p className="empty-text">No scheduled appointments.</p>
              ) : (
                appointments.map((appt) => (
                  <div key={appt.id} className="list-item">
                    <div className="item-meta">
                      <span className="item-title">Consultation Call</span>
                      <span className="item-date">
                        {new Date(appt.scheduled_at).toLocaleDateString()} at {new Date(appt.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <span className={`badge ${appt.status === 'Scheduled' ? 'badge-warning' : 'badge-success'}`}>
                      {appt.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          ) : (
            <form onSubmit={handleScheduleAppt} className="booking-form-inline" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
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
          )}
        </div>

        {/* Clinical Medical History Log */}
        <div className="glass-card grid-card medical-history-card">
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
        </div>

        {/* Prediction History Log */}
        <div className="glass-card grid-card full-width predictions-log-card">
          <div className="card-title-row">
            <Activity size={18} className="card-icon" />
            <h3>Diabetes Risk Assessment Log</h3>
          </div>
          <div className="table-wrapper">
            {predictions.length === 0 ? (
              <p className="empty-text">No risk logs compiled.</p>
            ) : (
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Date Run</th>
                    <th>Model Name</th>
                    <th>Glucose</th>
                    <th>Insulin</th>
                    <th>BMI</th>
                    <th>BP</th>
                    <th>Risk Score</th>
                    <th>Category</th>
                  </tr>
                </thead>
                <tbody>
                  {predictions.map((p) => {
                    const feat = p.input_features;
                    return (
                      <tr key={p.id}>
                        <td>{new Date(p.created_at).toLocaleDateString()}</td>
                        <td>{p.model_name}</td>
                        <td>{feat.glucose} mg/dL</td>
                        <td>{feat.insulin} mu U/ml</td>
                        <td>{feat.bmi}</td>
                        <td>{feat.blood_pressure} mm Hg</td>
                        <td><strong>{p.risk_score}%</strong></td>
                        <td>
                          <span className={`badge ${p.prediction === 'High Risk' ? 'badge-danger' : 'badge-success'}`}>
                            {p.prediction}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Floating Chat Widget */}
      <ChatWidget />
    </div>
  );
}
