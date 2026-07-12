import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { 
  Users, 
  FileText, 
  Upload, 
  Plus, 
  ArrowLeft, 
  Download, 
  PlusCircle, 
  Trash, 
  RefreshCw, 
  Activity,
  Search,
  SlidersHorizontal,
  Eye,
  ClipboardCopy,
  Sparkles
} from 'lucide-react';
import { 
  useGetPatientsQuery,
  useGetMedicalHistoryQuery,
  useGetReportsQuery,
  useGetPredictionsQuery,
  useUpdatePatientMutation,
  useUploadReportMutation,
  useAddMedicalHistoryMutation,
  useDeleteMedicalHistoryMutation,
  useGetRiskForecastQuery,
  downloadPdfReport,
  downloadReportFile
} from '../services/apiSlice';
import { api } from '../services/api';
import TrendChart from '../components/TrendChart';
import './Patients.css';

export default function Patients() {
  const { user } = useSelector((state) => state.auth);
  const { data: patientsList = [], isLoading: isRosterLoading } = useGetPatientsQuery();
  const [selectedPatientId, setSelectedPatientId] = useState(null);
  
  const patients = Array.isArray(patientsList) ? patientsList : [];
  const selectedPatient = patients.find(p => p.id === selectedPatientId);

  const { data: medicalHistory = [] } = useGetMedicalHistoryQuery(selectedPatientId, { skip: !selectedPatientId });
  const { data: reports = [] } = useGetReportsQuery(selectedPatientId, { skip: !selectedPatientId });
  const { data: predictions = [] } = useGetPredictionsQuery(selectedPatientId, { skip: !selectedPatientId });
  const { data: forecast, isLoading: isForecastLoading } = useGetRiskForecastQuery(
    { patientId: selectedPatientId },
    { skip: !selectedPatientId }
  );

  const [updatePatient] = useUpdatePatientMutation();
  const [uploadReport, { isLoading: uploadLoading }] = useUploadReportMutation();
  const [addMedicalHistory] = useAddMedicalHistoryMutation();
  const [deleteMedicalHistory] = useDeleteMedicalHistoryMutation();

  // Search & Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('All'); // 'All', 'High Risk', 'Medium Risk', 'Low Risk'

  // Parallel extra data state for roster table
  const [predictionsMap, setPredictionsMap] = useState({});
  const [appointments, setAppointments] = useState([]);
  const [extraLoading, setExtraLoading] = useState(false);

  // Forms states
  const [disease, setDisease] = useState('');
  const [diagDate, setDiagDate] = useState('');
  const [meds, setMeds] = useState('');
  const [notes, setNotes] = useState('');

  const [reportType, setReportType] = useState('Blood Test');
  const [reportFile, setReportFile] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');

  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const dashboardPatientId = location.state?.selectedPatientId;
    if (dashboardPatientId) {
      setSelectedPatientId(dashboardPatientId);
    }
  }, [location.state, patients]);

  // Load predictions & appointments for all patients to display in data table
  useEffect(() => {
    if (patients.length > 0) {
      loadExtraRosterDetails();
    }
  }, [patientsList]);

  const loadExtraRosterDetails = async () => {
    setExtraLoading(true);
    try {
      const appts = await api.getAppointments();
      setAppointments(appts);

      const predsMap = {};
      await Promise.all(
        patients.map(async (p) => {
          try {
            const preds = await api.getPredictions(p.id);
            predsMap[p.id] = preds;
          } catch (e) {
            console.error(e);
          }
        })
      );
      setPredictionsMap(predsMap);
    } catch (e) {
      console.error('Failed to load patient predictions lists', e);
    } finally {
      setExtraLoading(false);
    }
  };

  useEffect(() => {
    if (selectedPatient) {
      setAge(selectedPatient.age || '');
      setGender(selectedPatient.gender || '');
      setHeight(selectedPatient.height || '');
      setWeight(selectedPatient.weight || '');
      setBloodGroup(selectedPatient.blood_group || '');
      setPhone(selectedPatient.phone || '');
      setAddress(selectedPatient.address || '');
    }
  }, [selectedPatientId]);

  const handleAddHistory = async (e) => {
    e.preventDefault();
    if (!disease || !diagDate || !selectedPatientId) return;
    try {
      const payload = {
        disease,
        diagnosis_date: new Date(diagDate).toISOString(),
        medications: meds,
        notes
      };
      await addMedicalHistory({ patientId: selectedPatientId, data: payload }).unwrap();
      setDisease('');
      setDiagDate('');
      setMeds('');
      setNotes('');
    } catch (err) {
      alert(`Failed to add record: ${err.data?.detail || err.message}`);
    }
  };

  const handleDeleteHistory = async (historyId) => {
    if (!window.confirm('Are you sure you want to delete this clinical record? (Only Admin accounts have permission)')) return;
    try {
      await deleteMedicalHistory(historyId).unwrap();
    } catch (err) {
      alert(`Deletion failed: Only Administrators can delete clinical history logs.`);
    }
  };

  const handleUploadReport = async (e) => {
    e.preventDefault();
    if (!reportFile || !selectedPatientId) return;
    try {
      const formData = new FormData();
      formData.append('file', reportFile);
      formData.append('report_type', reportType);

      await uploadReport({ patientId: selectedPatientId, formData }).unwrap();
      setReportFile(null);
      document.getElementById('report-file-input').value = '';
    } catch (err) {
      alert(`Upload failed: ${err.data?.detail || err.message}`);
    }
  };

  const handleUpdateDemographics = async (e) => {
    e.preventDefault();
    if (!selectedPatientId) return;
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
      await updatePatient({ id: selectedPatientId, data: payload }).unwrap();
      alert('Patient demographics updated successfully.');
    } catch (err) {
      alert(`Update failed: ${err.data?.detail || err.message}`);
    }
  };

  const handleDownloadPDF = async () => {
    if (!selectedPatient) return;
    setPdfLoading(true);
    try {
      const blob = await downloadPdfReport(selectedPatient.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Clinical_Report_${selectedPatient.user.name.replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      alert(`Export failed: ${err.message}`);
    } finally {
      setPdfLoading(false);
    }
  };

  if (isRosterLoading) {
    return <div className="dashboard-loading-container">Loading Patient Profile Panel...</div>;
  }

  // Filter patients by search term and risk category
  const filteredPatients = patients.filter((p) => {
    // 1. Search term match
    const nameMatch = p.user.name.toLowerCase().includes(searchTerm.toLowerCase());
    const emailMatch = p.user.email.toLowerCase().includes(searchTerm.toLowerCase());
    if (!nameMatch && !emailMatch) return false;

    // 2. Active Tab filter match
    const preds = predictionsMap[p.id] || [];
    const latest = preds[preds.length - 1];
    const riskScore = latest ? latest.risk_score : 0;

    if (activeTab === 'High Risk') return latest && riskScore >= 60;
    if (activeTab === 'Medium Risk') return latest && riskScore >= 30 && riskScore < 60;
    if (activeTab === 'Low Risk') return latest && riskScore < 30;
    return true; // 'All'
  });

  return (
    <div className="patients-page-container">
      {/* Roster Table View (when no patient is selected) */}
      {!selectedPatient ? (
        <div className="roster-view-wrapper">
          <div className="dashboard-header-panel">
            <div className="header-greeting">
              <span className="welcome-tag">PATIENT ROSTER</span>
              <h2>Registered Patients</h2>
              <p>Select a patient profile to review history, log diagnostics, and update statistics.</p>
            </div>
          </div>

          {/* Search bar & filter tabs */}
          <div className="roster-controls-panel">
            <div className="search-bar-wrapper">
              <Search size={18} className="search-icon" />
              <input 
                type="text" 
                placeholder="Search patient by name or email..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-field search-input"
              />
            </div>
            
            <div className="filter-tabs-row">
              {['All', 'High Risk', 'Medium Risk', 'Low Risk'].map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`filter-tab-btn ${activeTab === tab ? 'active' : ''}`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {/* Clean Data Table */}
          <div className="glass-card roster-table-card">
            <div className="table-wrapper">
              {filteredPatients.length === 0 ? (
                <p className="empty-text">No patients matched search criteria.</p>
              ) : (
                <table className="dashboard-table">
                  <thead>
                    <tr>
                      <th>Patient</th>
                      <th>Age</th>
                      <th>Risk Level</th>
                      <th>Last Visit</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'center' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPatients.map((p) => {
                      const preds = predictionsMap[p.id] || [];
                      const latest = preds[preds.length - 1];
                      const riskScore = latest ? latest.risk_score : 0;
                      
                      let riskBadge = <span className="badge badge-info">No Scan</span>;
                      if (latest) {
                        if (riskScore >= 60) riskBadge = <span className="badge badge-danger">High Risk</span>;
                        else if (riskScore >= 30) riskBadge = <span className="badge badge-warning">Medium Risk</span>;
                        else riskBadge = <span className="badge badge-success">Low Risk</span>;
                      }

                      const pAppts = appointments.filter(a => a.patient_id === p.id);
                      const latestAppt = pAppts[pAppts.length - 1];

                      const lastVisitDate = latestAppt 
                        ? new Date(latestAppt.scheduled_at).toLocaleDateString()
                        : (latest ? new Date(latest.created_at).toLocaleDateString() : 'N/A');

                      const isActive = latest || latestAppt;

                      return (
                        <tr key={p.id}>
                          <td>
                            <div className="roster-patient-cell">
                              {/* Safe: plain text rendering, no HTML injection risk */}
                              <span className="p-cell-name">{p.user.name}</span>
                              <span className="p-cell-email">{p.user.email}</span>
                            </div>
                          </td>
                          <td>{p.age || 'N/A'}</td>
                          <td>{riskBadge}</td>
                          <td>{lastVisitDate}</td>
                          <td>
                            <span className={`badge ${isActive ? 'badge-success' : 'badge-warning'}`}>
                              {isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td>
                            <div className="actions-button-row">
                              <button 
                                onClick={() => setSelectedPatientId(p.id)} 
                                className="btn btn-secondary action-btn-mini" 
                                title="View Medical File"
                              >
                                <Eye size={14} />
                                <span>View File</span>
                              </button>
                              <button 
                                onClick={() => navigate('/predictions', { state: { selectedPatientId: p.id } })}
                                className="btn btn-primary action-btn-mini"
                                title="Perform ML Risk Screening"
                              >
                                <ClipboardCopy size={14} />
                                <span>Scan Risk</span>
                              </button>
                            </div>
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
      ) : (
        /* Selected Patient Case File Details view */
        <div className="patient-detail-view-wrapper">
          <button className="btn btn-secondary back-to-list-btn" onClick={() => setSelectedPatientId(null)}>
            <ArrowLeft size={16} />
            <span>Back to Patients List</span>
          </button>

          {/* Header detail summary card */}
          <div className="glass-card detail-header-card">
            <div className="detail-meta-header">
              <span className="detail-header-tag">PATIENT RECORD FILE</span>
              <h2>{selectedPatient.user.name}</h2>
              <p>Case File ID: #{selectedPatient.id} | Email: {selectedPatient.user.email}</p>
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
                  <span>Download PDF Summary</span>
                </>
              )}
            </button>
          </div>

          {/* Grids Content */}
          <div className="detail-sections-grid">
            
            {/* Column 1: Demographics */}
            <div className="glass-card detail-card-grid">
              <h3>Demographics & Vital Metrics</h3>
              <form onSubmit={handleUpdateDemographics} className="demographics-form">
                <div className="form-row-2">
                  <div className="form-group">
                    <label className="input-label">Age</label>
                    <input type="number" className="input-field" value={age} onChange={(e) => setAge(e.target.value)} placeholder="35" disabled={user?.role === 'doctor'} />
                  </div>
                  <div className="form-group">
                    <label className="input-label">Gender</label>
                    <input type="text" className="input-field" value={gender} onChange={(e) => setGender(e.target.value)} placeholder="Female" disabled={user?.role === 'doctor'} />
                  </div>
                </div>
                <div className="form-row-2">
                  <div className="form-group">
                    <label className="input-label">Height (cm)</label>
                    <input type="number" step="0.1" className="input-field" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="165" disabled={user?.role === 'doctor'} />
                  </div>
                  <div className="form-group">
                    <label className="input-label">Weight (kg)</label>
                    <input type="number" step="0.1" className="input-field" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="62.5" disabled={user?.role === 'doctor'} />
                  </div>
                </div>
                <div className="form-row-2">
                  <div className="form-group">
                    <label className="input-label">Blood Group</label>
                    <input type="text" className="input-field" value={bloodGroup} onChange={(e) => setBloodGroup(e.target.value)} placeholder="AB-" disabled={user?.role === 'doctor'} />
                  </div>
                  <div className="form-group">
                    <label className="input-label">Phone</label>
                    <input type="text" className="input-field" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+12345" disabled={user?.role === 'doctor'} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="input-label">Address</label>
                  <input type="text" className="input-field" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Health Ave" disabled={user?.role === 'doctor'} />
                </div>
                {user?.role !== 'doctor' && (
                  <button type="submit" className="btn btn-secondary update-btn">Update Profile</button>
                )}
              </form>
            </div>

            {/* Column 2: Upload Lab Diagnostics (Available for Patient/Admin) */}
            {user?.role !== 'doctor' && (
              <div className="glass-card detail-card-grid">
                <h3>Upload Diagnostics Report</h3>
                <form onSubmit={handleUploadReport} className="upload-form">
                  <div className="form-group">
                    <label className="input-label">Report Category / Type</label>
                    <input type="text" className="input-field" value={reportType} onChange={(e) => setReportType(e.target.value)} placeholder="Thyroid Screening" required />
                  </div>
                  <div className="form-group">
                    <label className="input-label">Document File (PDF / CSV, Max 5MB)</label>
                    <input
                      id="report-file-input"
                      type="file"
                      className="input-field file-input"
                      onChange={(e) => setReportFile(e.target.files[0])}
                      required
                    />
                  </div>
                  <button type="submit" className="btn btn-primary upload-btn" disabled={uploadLoading || !reportFile}>
                    {uploadLoading ? (
                      <>
                        <RefreshCw className="animate-spin" size={16} />
                        <span>Uploading...</span>
                      </>
                    ) : (
                      <>
                        <Upload size={16} />
                        <span>Upload Document</span>
                      </>
                    )}
                  </button>
                </form>

                {/* Uploaded Reports Lists */}
                <h4 className="sub-section-title">Diagnostic Reports Archive</h4>
                <div className="reports-mini-archive-list">
                  {reports.length === 0 ? (
                    <p className="empty-text">No diagnostic documents recorded.</p>
                  ) : (
                    reports.map((rep) => (
                      <div key={rep.id} className="report-archive-item">
                        <div className="report-item-meta">
                          <span className="report-title">{rep.report_type}</span>
                          <span className="report-date">{new Date(rep.upload_date).toLocaleDateString()}</span>
                        </div>
                        <a
                          href="#"
                          onClick={async (e) => {
                            e.preventDefault();
                            try {
                              const blob = await downloadReportFile(rep.id);
                              const url = window.URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = rep.file_path.split('/').pop();
                              document.body.appendChild(a);
                              a.click();
                              a.remove();
                            } catch (err) {
                              alert(`Download failed: ${err.message}`);
                            }
                          }}
                          className="report-download-btn-link"
                        >
                          Download
                        </a>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Column 3: Clinical Trends Visualization */}
            <div className="glass-card detail-card-grid full-width-grid">
              <div className="card-title-row">
                <Activity size={18} className="card-icon" style={{ color: 'var(--accent)' }} />
                <h3>Clinical Assessment Trends</h3>
              </div>
              <TrendChart predictions={predictions} forecast={forecast} />
            </div>

            {/* Risk Trend Forecast Section (Read-Only for Doctors) */}
            {isForecastLoading ? (
              <div className="glass-card detail-card-grid full-width-grid animate-pulse" style={{ padding: '24px' }}>
                <div style={{ height: '20px', width: '200px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', marginBottom: '16px' }}></div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '16px' }}>
                  <div style={{ height: '60px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}></div>
                  <div style={{ height: '60px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}></div>
                  <div style={{ height: '60px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}></div>
                </div>
                <div style={{ height: '40px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}></div>
              </div>
            ) : forecast ? (
              <div className="glass-card detail-card-grid full-width-grid">
                <div className="card-title-row">
                  <Sparkles size={18} className="card-icon" style={{ color: 'var(--accent)' }} />
                  <h3>Risk Trend Forecast (Projections)</h3>
                </div>
                
                {!forecast.sufficient_data ? (
                  <div style={{ padding: '20px', textAlign: 'center' }}>
                    <p style={{ margin: 0, fontSize: '14px', color: 'hsl(var(--text-muted))' }}>
                      📊 Insufficient tracking data available to calculate risk trend forecasting for this patient (minimum 4 screenings required).
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Top row: three stat mini-boxes */}
                    <div className="forecast-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px', marginTop: '16px' }}>
                      <div className="forecast-stat-box" style={{ padding: '16px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border)', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '12px', color: 'hsl(var(--text-muted))' }}>Trend Direction</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {forecast.trend_direction === 'increasing' && (
                            <span className="badge badge-danger" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span>↗</span> <span>Rising</span>
                            </span>
                          )}
                          {forecast.trend_direction === 'decreasing' && (
                            <span className="badge badge-success" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span>↘</span> <span>Improving</span>
                            </span>
                          )}
                          {forecast.trend_direction === 'stable' && (
                            <span className="badge badge-info" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span>→</span> <span>Stable</span>
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="forecast-stat-box" style={{ padding: '16px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border)', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '12px', color: 'hsl(var(--text-muted))' }}>Projected Risk (3 months)</span>
                        <span style={{ 
                          fontSize: '24px', 
                          fontWeight: '700', 
                          color: forecast.projected_scores?.[forecast.projected_scores.length - 1]?.risk_score > 75 
                            ? 'var(--danger)' 
                            : forecast.projected_scores?.[forecast.projected_scores.length - 1]?.risk_score > 50 
                            ? 'var(--warning)' 
                            : 'var(--success)'
                        }}>
                          {forecast.projected_scores?.[forecast.projected_scores.length - 1]?.risk_score}%
                        </span>
                      </div>

                      <div className="forecast-stat-box" style={{ padding: '16px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border)', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '12px', color: 'hsl(var(--text-muted))' }}>Confidence Level</span>
                        <div>
                          <span className={`badge ${
                            forecast.confidence === 'high' ? 'badge-success' :
                            forecast.confidence === 'medium' ? 'badge-warning' : 'badge-danger'
                          }`}>
                            {forecast.confidence.toUpperCase()}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Middle: Plain language message */}
                    <div className="forecast-message-box" style={{ 
                      padding: '16px', 
                      background: 'rgba(91, 107, 248, 0.05)', 
                      border: '1px solid rgba(91, 107, 248, 0.2)', 
                      borderRadius: '12px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                      marginBottom: '16px'
                    }}>
                      <Sparkles size={20} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: '2px' }} />
                      <p style={{ margin: 0, fontSize: '14px', lineHeight: '1.5', color: 'var(--text-primary)' }}>
                        {forecast.forecast_message}
                      </p>
                    </div>

                    {/* High Risk warning banner if applicable */}
                    {forecast.trend_direction === 'increasing' && forecast.months_to_high_risk !== null && (
                      <div className="forecast-warning-banner" style={{
                        padding: '12px 16px',
                        background: 'rgba(238, 93, 80, 0.1)',
                        border: '1px solid rgba(238, 93, 80, 0.3)',
                        borderRadius: '12px',
                        color: '#EE5D50',
                        fontWeight: '600',
                        fontSize: '14px',
                        marginBottom: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}>
                        <span>⚠️</span>
                        <span>Patient's risk may reach high-risk levels in {forecast.months_to_high_risk} month(s)</span>
                      </div>
                    )}

                    {/* Bottom: Disclaimer */}
                    <p style={{ margin: 0, fontSize: '11px', color: 'hsl(var(--text-muted))', lineHeight: '1.4' }}>
                      This projection is based on the patient's historical trend and assumes no lifestyle changes. It is not a medical prediction.
                    </p>
                  </>
                )}
              </div>
            ) : null}

            {/* Column 4: Medical History Logs */}
            <div className="glass-card detail-card-grid full-width-grid">
              <h3>Clinical Medical History Log</h3>
              
              <div className="history-split-layout">
                {/* History Form */}
                <form onSubmit={handleAddHistory} className="history-form-card">
                  <h4>Log New Diagnosis</h4>
                  <div className="form-group">
                    <label className="input-label">Disease / Diagnosis</label>
                    <input type="text" className="input-field" value={disease} onChange={(e) => setDisease(e.target.value)} placeholder="Type 2 Diabetes" required />
                  </div>
                  <div className="form-group">
                    <label className="input-label">Diagnosis Date</label>
                    <input type="date" className="input-field" value={diagDate} onChange={(e) => setDiagDate(e.target.value)} required />
                  </div>
                  <div className="form-group">
                    <label className="input-label">Active Medications</label>
                    <input type="text" className="input-field" value={meds} onChange={(e) => setMeds(e.target.value)} placeholder="Metformin 500mg daily" />
                  </div>
                  <div className="form-group">
                    <label className="input-label">Clinical Notes</label>
                    <textarea rows="3" className="input-field textarea-field" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Patient reports mild fatigue..."></textarea>
                  </div>
                  <button type="submit" className="btn btn-primary add-history-btn" style={{ width: '100%' }}>
                    <PlusCircle size={16} />
                    <span>Log Clinical Entry</span>
                  </button>
                </form>

                {/* History Log List */}
                <div className="history-log-list-scrollable">
                  {medicalHistory.length === 0 ? (
                    <p className="empty-text">No clinical history logged for this patient case file.</p>
                  ) : (
                    medicalHistory.map((h) => (
                      <div key={h.id} className="history-log-item-card">
                        <div className="history-item-header">
                          <h5>{h.disease}</h5>
                          <span className="history-item-date">{new Date(h.diagnosis_date).toLocaleDateString()}</span>
                        </div>
                        <div className="history-item-body">
                          {h.medications && <p><strong>Medications:</strong> {h.medications}</p>}
                          {h.notes && <p><strong>Notes:</strong> {h.notes}</p>}
                        </div>
                        <button onClick={() => handleDeleteHistory(h.id)} className="history-delete-btn-link">
                          <Trash size={14} />
                          <span>Delete Log</span>
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Column 5: Predictions Log */}
            <div className="glass-card detail-card-grid full-width-grid">
              <h3>Diabetes Risk Assessments Log</h3>
              <div className="table-wrapper">
                {predictions.length === 0 ? (
                  <p className="empty-text">No diabetes risk assessments run for this patient.</p>
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
                        <th>Calculated Risk</th>
                        <th>Status</th>
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
        </div>
      )}
    </div>
  );
}
