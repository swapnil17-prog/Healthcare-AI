import React, { useState, useEffect } from 'react';
import { Download, Activity, RefreshCw, User as UserIcon, FileText } from 'lucide-react';
import { 
  useGetPatientsQuery, 
  useGetPredictionsQuery, 
  useUpdatePatientMutation, 
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

  const loading = isPatientsLoading || (patient && isPredsLoading);

  if (loading) {
    return <div className="dashboard-loading-container">Loading Patient Dashboard...</div>;
  }

  const latestPrediction = predictions.length > 0 ? predictions[predictions.length - 1] : null;
  const riskScore = latestPrediction ? latestPrediction.risk_score : 0;
  
  // Calculate stroke dashoffset for gauge
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (riskScore / 100) * circumference;

  // Extract latest vitals for goal progress trackers
  const latestGlucose = latestPrediction ? latestPrediction.input_features.glucose : null;
  const calculatedBmi = patient?.weight && patient?.height 
    ? (patient.weight / ((patient.height / 100) ** 2)).toFixed(1)
    : null;
  const latestBmi = latestPrediction ? latestPrediction.input_features.bmi : calculatedBmi;
  const latestBp = latestPrediction ? latestPrediction.input_features.blood_pressure : null;

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

      <motion.div 
        className="dashboard-grid"
        variants={{
          hidden: { opacity: 0 },
          show: { opacity: 1, transition: { staggerChildren: 0.08 } }
        }}
        initial="hidden"
        animate="show"
      >
        {/* Risk Score Widget */}
        <motion.div 
          className="glass-card grid-card score-card"
          variants={{
            hidden: { opacity: 0, y: 15 },
            show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } }
          }}
          whileHover={{ scale: 1.02, boxShadow: '0 8px 30px rgba(99, 102, 241, 0.15)', borderColor: 'rgba(99,102,241,0.2)' }}
        >
          <h3>Diabetes Risk Assessment</h3>
          <div className="gauge-outer">
            <svg className="gauge-svg" width="140" height="140">
              <circle className="gauge-bg" cx="70" cy="70" r={radius} />
              <motion.circle
                className={`gauge-bar ${riskScore >= 50 ? 'high-risk' : 'low-risk'}`}
                cx="70"
                cy="70"
                r={radius}
                strokeDasharray={circumference}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset: offset }}
                transition={{ duration: 1, ease: 'easeOut' }}
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
        </motion.div>

        {/* Demographics Summary */}
        <motion.div 
          className="glass-card grid-card info-card"
          variants={{
            hidden: { opacity: 0, y: 15 },
            show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } }
          }}
          whileHover={{ scale: 1.02, boxShadow: '0 8px 30px rgba(99, 102, 241, 0.15)', borderColor: 'rgba(99,102,241,0.2)' }}
        >
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
        </motion.div>

        {/* Health Target Goals Tracker */}
        <motion.div 
          className="glass-card grid-card goals-card"
          variants={{
            hidden: { opacity: 0, y: 15 },
            show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } }
          }}
          whileHover={{ scale: 1.02, boxShadow: '0 8px 30px rgba(99, 102, 241, 0.15)', borderColor: 'rgba(99,102,241,0.2)' }}
        >
          <div className="card-title-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={18} className="card-icon" />
              <h3>Health Target Goals</h3>
            </div>
            <button 
              onClick={() => setIsEditingGoals(!isEditingGoals)} 
              className="btn btn-secondary" 
              style={{ padding: '4px 10px', fontSize: '11px', height: 'auto', minHeight: 'unset' }}
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
                  style={{ padding: '6px 12px', fontSize: '12px' }}
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
                  style={{ padding: '6px 12px', fontSize: '12px' }}
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
                  style={{ padding: '6px 12px', fontSize: '12px' }}
                />
              </div>
              <button type="submit" className="btn btn-primary" style={{ padding: '8px', fontSize: '12px' }}>Save Goals</button>
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
        </motion.div>

        {/* Assessment Metric Trends Chart */}
        <motion.div 
          className="glass-card grid-card full-width trends-chart-card"
          variants={{
            hidden: { opacity: 0, y: 15 },
            show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } }
          }}
          whileHover={{ scale: 1.02, boxShadow: '0 8px 30px rgba(99, 102, 241, 0.15)', borderColor: 'rgba(99,102,241,0.2)' }}
        >
          <div className="card-title-row">
            <Activity size={18} className="card-icon" />
            <h3>Assessment Metric Trends</h3>
          </div>
          <TrendChart predictions={predictions} />
        </motion.div>

        {/* Prediction History Log */}
        <motion.div 
          className="glass-card grid-card full-width predictions-log-card"
          variants={{
            hidden: { opacity: 0, y: 15 },
            show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } }
          }}
          whileHover={{ scale: 1.02, boxShadow: '0 8px 30px rgba(99, 102, 241, 0.15)', borderColor: 'rgba(99,102,241,0.2)' }}
        >
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
        </motion.div>
      </motion.div>

      {/* Floating Chat Widget */}
      <ChatWidget />
    </div>
  );
}

function GoalProgressBar({ name, current, target, unit }) {
  if (current === null || current === undefined) {
    return (
      <div style={{ fontSize: '12.5px', color: 'hsl(var(--text-muted))' }}>
        <strong>{name}:</strong> No vitals log. Submit screening parameters.
      </div>
    );
  }
  
  const curVal = parseFloat(current);
  const tarVal = parseFloat(target);
  const diff = curVal - tarVal;
  const isAchieved = curVal <= tarVal;
  
  // Compute percentage value to render progress bar.
  // If achieved, progress is 100%. If exceeds, progress decreases.
  let percentage = 100;
  if (!isAchieved) {
    percentage = Math.max(10, Math.round((1 - (diff / tarVal)) * 100));
  }
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', alignItems: 'baseline' }}>
        <div>
          <span style={{ color: 'white', fontWeight: 600 }}>{name}</span>
          <span style={{ fontSize: '11px', color: 'hsl(var(--text-muted))', marginLeft: '6px' }}>
            (Target: {target}{unit})
          </span>
        </div>
        <span style={{ fontWeight: '700', color: isAchieved ? '#34d399' : '#f87171' }}>
          {current}{unit}
        </span>
      </div>
      
      <div style={{ width: '100%', height: '8px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '4px', overflow: 'hidden' }}>
        <div 
          style={{ 
            width: `${percentage}%`, 
            height: '100%', 
            background: isAchieved 
              ? 'linear-gradient(90deg, #059669 0%, #34d399 100%)' 
              : 'linear-gradient(90deg, #d97706 0%, #f87171 100%)',
            borderRadius: '4px',
            transition: 'width 0.5s ease-in-out'
          }} 
        />
      </div>
      
      <span style={{ fontSize: '11px', color: isAchieved ? '#34d399' : 'hsl(var(--text-muted))' }}>
        {isAchieved ? '🎉 Goal Achieved!' : `Exceeds target goal by +${diff.toFixed(1)}${unit}`}
      </span>
    </div>
  );
}
