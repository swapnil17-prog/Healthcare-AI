import React, { useState, useEffect } from 'react';
import { 
  Download, 
  Activity, 
  RefreshCw, 
  User as UserIcon, 
  FileText, 
  Droplet, 
  Heart, 
  Scale, 
  Calendar,
  Sparkles
} from 'lucide-react';
import { 
  useGetPatientsQuery, 
  useGetPredictionsQuery, 
  useUpdatePatientMutation, 
  useGetAppointmentsQuery,
  useGetDoctorsQuery,
  downloadPdfReport
} from '../services/apiSlice';
import { motion } from 'framer-motion';
import ChatWidget from '../components/ChatWidget';
import TrendChart from '../components/TrendChart';
import './PatientDashboard.css';

export default function PatientDashboard() {
  const { data: patientsList = [], isLoading: isPatientsLoading } = useGetPatientsQuery();
  const patient = patientsList?.[0];

  const { data: predictions = [], isLoading: isPredsLoading } = useGetPredictionsQuery(patient?.id, { skip: !patient });
  const { data: appointments = [], isLoading: isApptsLoading } = useGetAppointmentsQuery(undefined, { skip: !patient });
  const { data: doctors = [], isLoading: isDocsLoading } = useGetDoctorsQuery(undefined, { skip: !patient });

  const [updatePatient] = useUpdatePatientMutation();
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

  // Health Target Goals states
  const [isEditingGoals, setIsEditingGoals] = useState(false);
  const [targetGlucose, setTargetGlucose] = useState(localStorage.getItem('target_glucose') || '100');
  const [targetBmi, setTargetBmi] = useState(localStorage.getItem('target_bmi') || '24.0');
  const [targetBp, setTargetBp] = useState(localStorage.getItem('target_bp') || '80');

  const handleSaveGoals = (e) => {
    e.preventDefault();
    localStorage.setItem('target_glucose', targetGlucose);
    localStorage.setItem('target_bmi', targetBmi);
    localStorage.setItem('target_bp', targetBp);
    setIsEditingGoals(false);
    alert('Health goals updated successfully.');
  };

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

  const loading = isPatientsLoading || (patient && isPredsLoading) || isApptsLoading || isDocsLoading;

  if (loading) {
    return <div className="dashboard-loading-container">Loading Patient Dashboard...</div>;
  }

  const latestPrediction = predictions.length > 0 ? predictions[predictions.length - 1] : null;
  const riskScore = latestPrediction ? latestPrediction.risk_score : 0;
  
  // Extract latest vitals for goal progress trackers & Stat Cards
  const latestGlucose = latestPrediction ? latestPrediction.input_features.glucose : null;
  const calculatedBmi = patient?.weight && patient?.height 
    ? (patient.weight / ((patient.height / 100) ** 2)).toFixed(1)
    : null;
  const latestBmi = latestPrediction ? latestPrediction.input_features.bmi : calculatedBmi;
  const latestBp = latestPrediction ? latestPrediction.input_features.blood_pressure : null;

  // Filter patient's appointments & sort them by scheduled date
  const patientAppts = appointments
    .filter(a => a.patient_id === patient?.id)
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))
    .slice(0, 3); // Get top 3

  // Classify Vitals status
  const getBmiStatus = (bmiValue) => {
    if (!bmiValue) return { text: 'No Data', class: 'badge-info' };
    const num = parseFloat(bmiValue);
    if (num < 18.5) return { text: 'Underweight', class: 'badge-warning' };
    if (num < 25) return { text: 'Normal', class: 'badge-success' };
    if (num < 30) return { text: 'Overweight', class: 'badge-warning' };
    return { text: 'Obese', class: 'badge-danger' };
  };

  const getGlucoseStatus = (glucValue) => {
    if (!glucValue) return { text: 'No Data', class: 'badge-info' };
    const num = parseFloat(glucValue);
    if (num < 100) return { text: 'Normal', class: 'badge-success' };
    if (num < 126) return { text: 'Elevated', class: 'badge-warning' };
    return { text: 'High', class: 'badge-danger' };
  };

  const getBpStatus = (bpValue) => {
    if (!bpValue) return { text: 'No Data', class: 'badge-info' };
    const num = parseFloat(bpValue);
    if (num < 80) return { text: 'Normal', class: 'badge-success' };
    if (num < 90) return { text: 'Elevated', class: 'badge-warning' };
    return { text: 'High', class: 'badge-danger' };
  };

  const bmiStatus = getBmiStatus(latestBmi);
  const glucoseStatus = getGlucoseStatus(latestGlucose);
  const bpStatus = getBpStatus(latestBp);

  return (
    <div className="patient-dashboard-container">
      {/* Header Banner */}
      <div className="dashboard-header-panel">
        <div className="header-greeting">
          <span className="welcome-tag">PATIENT CENTER</span>
          <h2>Welcome back, {patient?.user.name}! 👋</h2>
          <p>Here's your clinical overview, prediction trends, and healthcare details.</p>
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
              <span>Download Report</span>
            </>
          )}
        </button>
      </div>

      {/* STAT CARDS ROW */}
      <div className="stat-cards-grid">
        {/* Card 1: Risk Score */}
        <div className="white-stat-card">
          <div className="stat-card-icon-wrapper accent-light">
            <Activity className="stat-card-icon" size={24} />
          </div>
          <div className="stat-card-info">
            <span className="stat-card-label">Risk Score</span>
            <h3 className="stat-card-value">{riskScore}%</h3>
            <span className={`badge ${riskScore >= 60 ? 'badge-danger' : riskScore >= 30 ? 'badge-warning' : 'badge-success'}`}>
              {latestPrediction?.prediction || 'No Scan'}
            </span>
          </div>
        </div>

        {/* Card 2: BMI */}
        <div className="white-stat-card">
          <div className="stat-card-icon-wrapper success-light">
            <Scale className="stat-card-icon" size={24} />
          </div>
          <div className="stat-card-info">
            <span className="stat-card-label">BMI</span>
            <h3 className="stat-card-value">{latestBmi || 'N/A'}</h3>
            <span className={`badge ${bmiStatus.class}`}>
              {bmiStatus.text}
            </span>
          </div>
        </div>

        {/* Card 3: Glucose */}
        <div className="white-stat-card">
          <div className="stat-card-icon-wrapper danger-light">
            <Droplet className="stat-card-icon" size={24} />
          </div>
          <div className="stat-card-info">
            <span className="stat-card-label">Glucose</span>
            <h3 className="stat-card-value">{latestGlucose ? `${latestGlucose} mg/dL` : 'N/A'}</h3>
            <span className={`badge ${glucoseStatus.class}`}>
              {glucoseStatus.text}
            </span>
          </div>
        </div>

        {/* Card 4: Blood Pressure */}
        <div className="white-stat-card">
          <div className="stat-card-icon-wrapper warning-light">
            <Heart className="stat-card-icon" size={24} />
          </div>
          <div className="stat-card-info">
            <span className="stat-card-label">Blood Pressure</span>
            <h3 className="stat-card-value">{latestBp ? `${latestBp} mmHg` : 'N/A'} (Dia)</h3>
            <span className={`badge ${bpStatus.class}`}>
              {bpStatus.text}
            </span>
          </div>
        </div>
      </div>

      {/* DASHBOARD CONTENT GRID */}
      <div className="dashboard-content-split">
        {/* Health Trend (Left) */}
        <div className="glass-card trends-panel">
          <div className="card-title-row">
            <Activity size={18} className="card-icon" style={{ color: 'var(--accent)' }} />
            <h3>Health Trend</h3>
          </div>
          <TrendChart predictions={predictions} />
        </div>

        {/* Recent Appointments (Right) */}
        <div className="glass-card appointments-panel">
          <div className="card-title-row">
            <Calendar size={18} className="card-icon" style={{ color: 'var(--accent)' }} />
            <h3>Recent Appointments</h3>
          </div>
          <div className="appointments-mini-list">
            {patientAppts.length === 0 ? (
              <p className="empty-text">No scheduled appointments.</p>
            ) : (
              patientAppts.map((appt) => {
                const doctorObj = doctors.find((d) => d.id === appt.doctor_id);
                return (
                  <div key={appt.id} className="appointment-mini-item">
                    <div className="appt-meta-info">
                      <h4 className="appt-doc-name">{doctorObj?.name || `Doctor ID: ${appt.doctor_id}`}</h4>
                      <span className="appt-specialty">General Practitioner</span>
                      <span className="appt-date-sub">
                        {new Date(appt.scheduled_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} at {new Date(appt.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* DETAILS GRID */}
      <div className="dashboard-details-grid">
        {/* Health Profile Card */}
        <div className="glass-card profile-card-inner">
          <div className="card-title-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <UserIcon size={18} className="card-icon" style={{ color: 'var(--accent)' }} />
              <h3>Your Health Profile</h3>
            </div>
            {!isEditing && (
              <button 
                onClick={() => setIsEditing(true)} 
                className="btn btn-secondary" 
                style={{ padding: '6px 12px', fontSize: '12px' }}
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
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
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
            <div className="profile-details-display">
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
                  <span className="metric-value">{calculatedBmi || 'N/A'}</span>
                </div>
              </div>
              <div className="demographics-address">
                <span><strong>Address:</strong> {patient?.address || 'N/A'}</span>
                <span><strong>Phone:</strong> {patient?.phone || 'N/A'}</span>
              </div>
            </div>
          )}
        </div>

        {/* Health Goals Card */}
        <div className="glass-card goals-card-inner">
          <div className="card-title-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={18} className="card-icon" style={{ color: 'var(--accent)' }} />
              <h3>Health Target Goals</h3>
            </div>
            <button 
              onClick={() => setIsEditingGoals(!isEditingGoals)} 
              className="btn btn-secondary" 
              style={{ padding: '6px 12px', fontSize: '12px' }}
            >
              {isEditingGoals ? 'Cancel' : 'Set Targets'}
            </button>
          </div>
          
          {isEditingGoals ? (
            <form onSubmit={handleSaveGoals} className="demographics-form" style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
              <div className="form-group">
                <label className="input-label" style={{ fontSize: '11px' }}>Target Glucose (mg/dL)</label>
                <input 
                  type="number" 
                  className="input-field" 
                  value={targetGlucose} 
                  onChange={(e) => setTargetGlucose(e.target.value)} 
                  required 
                  style={{ padding: '8px 12px', fontSize: '13px' }}
                />
              </div>
              <div className="form-group">
                <label className="input-label" style={{ fontSize: '11px' }}>Target BMI</label>
                <input 
                  type="number" 
                  step="0.1" 
                  className="input-field" 
                  value={targetBmi} 
                  onChange={(e) => setTargetBmi(e.target.value)} 
                  required 
                  style={{ padding: '8px 12px', fontSize: '13px' }}
                />
              </div>
              <div className="form-group">
                <label className="input-label" style={{ fontSize: '11px' }}>Target Diastolic BP (mmHg)</label>
                <input 
                  type="number" 
                  className="input-field" 
                  value={targetBp} 
                  onChange={(e) => setTargetBp(e.target.value)} 
                  required 
                  style={{ padding: '8px 12px', fontSize: '13px' }}
                />
              </div>
              <button type="submit" className="btn btn-primary" style={{ padding: '10px', fontSize: '13px' }}>Save Goals</button>
            </form>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, justifyContent: 'center', marginTop: '10px' }}>
              <GoalProgressBar 
                name="Glucose Level" 
                current={latestGlucose} 
                target={parseFloat(targetGlucose)} 
                unit=" mg/dL" 
              />
              <GoalProgressBar 
                name="Body Mass Index (BMI)" 
                current={latestBmi} 
                target={parseFloat(targetBmi)} 
                unit="" 
              />
              <GoalProgressBar 
                name="Diastolic Blood Pressure" 
                current={latestBp} 
                target={parseFloat(targetBp)} 
                unit=" mmHg" 
              />
            </div>
          )}
        </div>
      </div>

      {/* HEALTH INSIGHTS CARD */}
      <div className="glass-card insights-full-card" style={{ marginTop: '24px' }}>
        <div className="card-title-row">
          <Sparkles size={18} className="card-icon" style={{ color: 'var(--accent)' }} />
          <h3>Health Insights & Clinical Recommendations</h3>
        </div>
        <div className="insights-body">
          {latestPrediction?.recommendations && latestPrediction.recommendations.length > 0 ? (
            <div className="insights-container">
              <p className="insight-intro">Based on your recent lab test values and risk assessment, our clinical decision rules suggest the following options:</p>
              <ul className="insights-bullets">
                {latestPrediction.recommendations.map((rec, i) => (
                  <li key={i} className="insight-bullet-item">
                    <strong>Actionable Recommendation:</strong> {rec}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="insights-empty">
              <p>No diagnostics assessments parsed yet. Run a diabetes risk check or upload a lab summary report to generate personalized health recommendations.</p>
            </div>
          )}
        </div>
      </div>

      {/* Diabetes Risk Assessment Log */}
      <div className="glass-card predictions-log-card-inner" style={{ marginTop: '24px' }}>
        <div className="card-title-row">
          <FileText size={18} className="card-icon" style={{ color: 'var(--accent)' }} />
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

      {/* Floating Chat Widget */}
      <ChatWidget />
    </div>
  );
}

function GoalProgressBar({ name, current, target, unit }) {
  if (current === null || current === undefined) {
    return (
      <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
        <strong>{name}:</strong> No vitals log. Submit screening parameters.
      </div>
    );
  }
  
  const curVal = parseFloat(current);
  const tarVal = parseFloat(target);
  const diff = curVal - tarVal;
  const isAchieved = curVal <= tarVal;
  
  let percentage = 100;
  if (!isAchieved) {
    percentage = Math.max(10, Math.round((1 - (diff / tarVal)) * 100));
  }
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', alignItems: 'baseline' }}>
        <div>
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{name}</span>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginLeft: '6px' }}>
            (Target: {target}{unit})
          </span>
        </div>
        <span style={{ fontWeight: '700', color: isAchieved ? 'var(--success)' : 'var(--danger)' }}>
          {current}{unit}
        </span>
      </div>
      
      <div style={{ width: '100%', height: '8px', background: 'var(--bg-primary)', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--border)' }}>
        <div 
          style={{ 
            width: `${percentage}%`, 
            height: '100%', 
            background: isAchieved 
              ? 'linear-gradient(90deg, #05CD99 0%, #34d399 100%)' 
              : 'linear-gradient(90deg, var(--warning) 0%, var(--danger) 100%)',
            borderRadius: '4px',
            transition: 'width 0.5s ease-in-out'
          }} 
        />
      </div>
      
      <span style={{ fontSize: '11px', color: isAchieved ? 'var(--success)' : 'var(--text-secondary)' }}>
        {isAchieved ? '🎉 Goal Achieved!' : `Exceeds target goal by +${diff.toFixed(1)}${unit}`}
      </span>
    </div>
  );
}
