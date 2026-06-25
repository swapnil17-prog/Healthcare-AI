import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Users, FileText, Upload, Plus, ArrowLeft, Download, PlusCircle, Trash, RefreshCw, Activity } from 'lucide-react';
import { 
  useGetPatientsQuery,
  useGetMedicalHistoryQuery,
  useGetReportsQuery,
  useGetPredictionsQuery,
  useUpdatePatientMutation,
  useUploadReportMutation,
  useAddMedicalHistoryMutation,
  useDeleteMedicalHistoryMutation,
  downloadPdfReport,
  downloadReportFile
} from '../services/apiSlice';
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

  const [updatePatient] = useUpdatePatientMutation();
  const [uploadReport, { isLoading: uploadLoading }] = useUploadReportMutation();
  const [addMedicalHistory] = useAddMedicalHistoryMutation();
  const [deleteMedicalHistory] = useDeleteMedicalHistoryMutation();

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

  useEffect(() => {
    const dashboardPatientId = location.state?.selectedPatientId;
    if (dashboardPatientId) {
      setSelectedPatientId(dashboardPatientId);
    }
  }, [location.state, patients]);

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
      // Clear form
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
      // Reset file input
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

  return (
    <div className="patients-page-container">
      <div className="bg-gradient-radial"></div>

      {/* Roster View */}
      {!selectedPatient ? (
        <div className="roster-view-container">
          <div className="dashboard-header glass-card">
            <div className="header-greeting">
              <span className="welcome-tag">PATIENT ROSTER</span>
              <h2>Registered Patients</h2>
              <p>Select a patient profile to review history, log diagnostics, and update statistics.</p>
            </div>
          </div>

          <div className="patients-grid">
            {patients.length === 0 ? (
              <div className="glass-card empty-roster">
                <p>No patient profiles registered in the system.</p>
              </div>
            ) : (
              patients.map((p) => (
                <div key={p.id} className="glass-card patient-roster-card" onClick={() => setSelectedPatientId(p.id)}>
                  <div className="roster-card-header">
                    <h4>{p.user.name}</h4>
                    <span className="badge badge-success">ID: {p.id}</span>
                  </div>
                  <div className="roster-card-details">
                    <span><strong>Email:</strong> {p.user.email}</span>
                    <span><strong>Age:</strong> {p.age || 'N/A'} | <strong>Blood:</strong> {p.blood_group || 'N/A'}</span>
                    <span><strong>BMI:</strong> {p.weight && p.height ? (p.weight / ((p.height / 100) ** 2)).toFixed(1) : 'N/A'}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        /* Selected Patient Profile Detail View */
        <div className="patient-detail-view">
          <button className="btn btn-secondary back-btn" onClick={() => setSelectedPatientId(null)}>
            <ArrowLeft size={16} />
            <span>Back to Patients List</span>
          </button>

          {/* Profile Overview Card */}
          <div className="glass-card detail-header-card">
            <div className="detail-meta">
              <h2>{selectedPatient.user.name}</h2>
              <span className="detail-sub">Patient Case File #{selectedPatient.id} | Email: {selectedPatient.user.email}</span>
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

          <div className="detail-grid">
            {/* Column 1: Demographics Form */}
            <div className={`glass-card grid-card ${user?.role === 'doctor' ? 'centered-grid-card' : ''}`}>
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

            {/* Column 2: Upload Lab Diagnostics */}
            {user?.role !== 'doctor' && (
              <div className="glass-card grid-card">
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
                <div className="list-body sub-list">
                  {reports.length === 0 ? (
                    <p className="empty-text">No diagnostic documents recorded.</p>
                  ) : (
                    reports.map((rep) => (
                      <div key={rep.id} className="list-item">
                        <div className="item-meta">
                          <span className="item-title">{rep.report_type}</span>
                          <span className="item-date">{new Date(rep.upload_date).toLocaleDateString()}</span>
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
                          className="report-download-link"
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
            <div className="glass-card grid-card full-width">
              <div className="card-title-row">
                <Activity size={18} className="card-icon" />
                <h3>Clinical Assessment Trends</h3>
              </div>
              <TrendChart predictions={predictions} />
            </div>

            {/* Column 4: Medical History Logs */}
            <div className="glass-card grid-card full-width">
              <h3>Clinical Medical History Log</h3>
              
              <div className="history-split-layout">
                {/* History Form */}
                <form onSubmit={handleAddHistory} className="history-form glass-card shadow-sm">
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
                  <button type="submit" className="btn btn-primary add-history-btn">
                    <PlusCircle size={16} />
                    <span>Log Clinical Entry</span>
                  </button>
                </form>

                {/* History Log List */}
                <div className="history-log-list">
                  {medicalHistory.length === 0 ? (
                    <p className="empty-text">No clinical history logged for this patient case file.</p>
                  ) : (
                    medicalHistory.map((h) => (
                      <div key={h.id} className="history-log-item glass-card shadow-sm">
                        <div className="history-item-header">
                          <h5>{h.disease}</h5>
                          <span className="history-item-date">{new Date(h.diagnosis_date).toLocaleDateString()}</span>
                        </div>
                        <div className="history-item-body">
                          {h.medications && <p><strong>Medications:</strong> {h.medications}</p>}
                          {h.notes && <p><strong>Notes:</strong> {h.notes}</p>}
                        </div>
                        <button onClick={() => handleDeleteHistory(h.id)} className="history-delete-btn">
                          <Trash size={14} />
                          <span>Delete</span>
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Column 5: Predictions Log */}
            <div className="glass-card grid-card full-width">
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
