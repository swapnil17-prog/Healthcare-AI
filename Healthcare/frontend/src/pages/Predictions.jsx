import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { Activity, ShieldAlert, Award, ClipboardCheck, Upload, RefreshCw } from 'lucide-react';
import { 
  useGetPatientsQuery, 
  useRunPredictionMutation, 
  useUploadReportMutation, 
  useLazyGetPredictionsQuery 
} from '../services/apiSlice';
import { motion } from 'framer-motion';
import './Predictions.css';

export default function Predictions() {
  const { user } = useSelector((state) => state.auth);
  
  const { data: patients = [], isLoading: rosterLoading } = useGetPatientsQuery();
  const [runPrediction, { isLoading: predictionLoading }] = useRunPredictionMutation();
  const [uploadReport, { isLoading: uploadLoading }] = useUploadReportMutation();
  const [getPredictions] = useLazyGetPredictionsQuery();

  const [selectedPatientId, setSelectedPatientId] = useState('');
  
  // Features input fields
  const [pregnancies, setPregnancies] = useState('0');
  const [glucose, setGlucose] = useState('');
  const [bloodPressure, setBloodPressure] = useState('');
  const [insulin, setInsulin] = useState('');
  const [bmi, setBmi] = useState('');
  const [age, setAge] = useState('');

  // Report upload fields
  const [reportFile, setReportFile] = useState(null);
  const [reportType, setReportType] = useState('Blood Test');

  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user?.role === 'patient' && patients.length > 0) {
      const self = patients[0];
      setSelectedPatientId(self.id);
      autofillPatientData(self);
    }
  }, [patients, user]);

  const autofillPatientData = (patient) => {
    setAge(patient.age || '');
    if (patient.weight && patient.height) {
      const calculatedBmi = (patient.weight / ((patient.height / 100) ** 2)).toFixed(1);
      setBmi(calculatedBmi);
    } else {
      setBmi('');
    }
  };

  const handlePatientChange = (e) => {
    const id = e.target.value;
    setSelectedPatientId(id);
    setResult(null);
    setError('');

    const found = patients.find(p => p.id === parseInt(id));
    if (found) {
      autofillPatientData(found);
    } else {
      setAge('');
      setBmi('');
    }
  };

  const handleRunPrediction = async (e) => {
    e.preventDefault();
    if (!selectedPatientId) {
      setError('Please select a patient.');
      return;
    }

    setError('');
    setResult(null);

    const payload = {
      pregnancies: parseInt(pregnancies),
      glucose: parseFloat(glucose),
      blood_pressure: parseFloat(bloodPressure),
      insulin: parseFloat(insulin),
      bmi: parseFloat(bmi),
      age: parseInt(age)
    };

    try {
      const predictionResponse = await runPrediction({ patientId: selectedPatientId, data: payload }).unwrap();
      setResult(predictionResponse);
    } catch (err) {
      setError(err.data?.detail || err.message || 'ML Inference failed. Please check inputs.');
    }
  };

  const handleUploadReport = async (e) => {
    e.preventDefault();
    if (!reportFile || !selectedPatientId) return;
    
    setError('');
    setResult(null);
    
    try {
      const formData = new FormData();
      formData.append('file', reportFile);
      formData.append('report_type', reportType);

      // 1. Upload report
      await uploadReport({ patientId: selectedPatientId, formData }).unwrap();
      
      // 2. Fetch the newly created prediction
      const preds = await getPredictions(selectedPatientId).unwrap();
      if (preds && preds.length > 0) {
        // Find the latest prediction
        const latest = preds[preds.length - 1];
        setResult(latest);
        
        // Prefill manual input fields with the parsed values
        if (latest.input_features) {
          const feat = latest.input_features;
          if (feat.age !== undefined && feat.age !== null) setAge(feat.age.toString());
          if (feat.bmi !== undefined && feat.bmi !== null) setBmi(feat.bmi.toString());
          if (feat.glucose !== undefined && feat.glucose !== null) setGlucose(feat.glucose.toString());
          if (feat.blood_pressure !== undefined && feat.blood_pressure !== null) setBloodPressure(feat.blood_pressure.toString());
          if (feat.insulin !== undefined && feat.insulin !== null) setInsulin(feat.insulin.toString());
          if (feat.pregnancies !== undefined && feat.pregnancies !== null) setPregnancies(feat.pregnancies.toString());
        }
        alert('Lab report uploaded and parsed successfully! Results loaded below.');
      } else {
        setError('Report uploaded, but no vitals could be parsed to generate a risk score. Please enter vitals manually.');
      }
      
      setReportFile(null);
      // Reset input element
      const fileInput = document.getElementById('report-file-input-predictions');
      if (fileInput) fileInput.value = '';
      
    } catch (err) {
      setError(err.data?.detail || err.message || 'Report upload or parsing failed.');
    }
  };

  return (
    <div className="predictions-page-container">
      <div className="bg-gradient-radial"></div>

      <div className="dashboard-header glass-card">
        <div className="header-greeting">
          <span className="welcome-tag">RISK ASSESSMENT</span>
          <h2>Diabetes Risk Screening</h2>
          <p>Input patient laboratory metrics to calculate the statistical risk score using the trained model.</p>
        </div>
      </div>

      <div className="predictions-split-grid">
        {/* Form Column */}
        <div className="glass-card grid-card">
          <h3>Screening Parameters</h3>
          {error && (
            <div className="prediction-error-banner">
              <ShieldAlert size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Quick Lab Report Upload */}
          <div className="report-upload-box glass-card shadow-sm" style={{ padding: '16px', marginBottom: '20px', background: 'rgba(255, 255, 255, 0.02)', border: '1px dashed rgba(255, 255, 255, 0.15)' }}>
            <h4 style={{ fontSize: '13px', color: 'white', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
              <Upload size={16} style={{ color: 'hsl(var(--secondary))' }} />
              Auto-fill from Lab Report (PDF / CSV)
            </h4>
            <form onSubmit={handleUploadReport} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Patient dropdown selection for reports (only visible for Doctors/Admins) */}
              {user?.role !== 'patient' && (
                <div className="form-group" style={{ marginBottom: '6px' }}>
                  <label className="input-label" style={{ fontSize: '10px' }}>Select Patient Case File</label>
                  <select 
                    className="input-field select-field" 
                    value={selectedPatientId} 
                    onChange={handlePatientChange} 
                    required
                    disabled={rosterLoading}
                    style={{ padding: '6px 12px', fontSize: '12px' }}
                  >
                    <option value="">{rosterLoading ? 'Loading roster...' : '-- Choose Patient --'}</option>
                    {patients.map(p => (
                      <option key={p.id} value={p.id}>{p.user.name} (Case ID: {p.id})</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="form-row-2" style={{ marginBottom: '0px' }}>
                <div className="form-group" style={{ marginBottom: '0px' }}>
                  <label className="input-label" style={{ fontSize: '10px' }}>Report Category</label>
                  <input
                    type="text"
                    className="input-field"
                    value={reportType}
                    onChange={(e) => setReportType(e.target.value)}
                    placeholder="E.g., Blood Test"
                    required
                    style={{ padding: '6px 12px', fontSize: '12px' }}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: '0px' }}>
                  <label className="input-label" style={{ fontSize: '10px' }}>Document File</label>
                  <input
                    id="report-file-input-predictions"
                    type="file"
                    className="input-field file-input"
                    onChange={(e) => setReportFile(e.target.files[0])}
                    required
                    style={{ padding: '4px 10px', fontSize: '11px', height: 'auto', minHeight: 'unset' }}
                  />
                </div>
              </div>
              <motion.button 
                whileHover={{ scale: 1.03 }} 
                whileTap={{ scale: 0.97 }}
                type="submit" 
                className="btn btn-secondary" 
                disabled={uploadLoading || !reportFile || !selectedPatientId} 
                style={{ padding: '8px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', cursor: 'pointer' }}
              >
                {uploadLoading ? (
                  <>
                    <RefreshCw className="animate-spin" size={14} />
                    <span>Parsing Report...</span>
                  </>
                ) : (
                  <>
                    <Upload size={14} />
                    <span>Upload & Auto-Fill Vitals</span>
                  </>
                )}
              </motion.button>
            </form>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', margin: '20px 0', width: '100%' }}>
            <hr style={{ flex: 1, border: 'none', borderTop: '1px solid rgba(255,255,255,0.08)' }} />
            <span style={{ padding: '0 10px', fontSize: '10px', color: 'hsl(var(--text-muted))', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Or Enter Manually</span>
            <hr style={{ flex: 1, border: 'none', borderTop: '1px solid rgba(255,255,255,0.08)' }} />
          </div>

          <form onSubmit={handleRunPrediction} className="prediction-form">
            {/* Patient dropdown selection (only visible for Doctors/Admins) */}
            {user?.role !== 'patient' && (
              <div className="form-group">
                <label className="input-label">Select Patient Case File</label>
                <select 
                  className="input-field select-field" 
                  value={selectedPatientId} 
                  onChange={handlePatientChange} 
                  required
                  disabled={rosterLoading}
                >
                  <option value="">{rosterLoading ? 'Loading roster...' : '-- Choose Patient --'}</option>
                  {patients.map(p => (
                    <option key={p.id} value={p.id}>{p.user.name} (Case ID: {p.id})</option>
                  ))}
                </select>
                <span className="field-hint">Selecting a patient autofills their age and BMI automatically if saved.</span>
              </div>
            )}

            <div className="form-row-2">
              <div className="form-group">
                <label className="input-label">Age (years)</label>
                <input type="number" className="input-field" value={age} onChange={(e) => setAge(e.target.value)} required placeholder="45" />
              </div>
              <div className="form-group">
                <label className="input-label">BMI</label>
                <input type="number" step="0.1" className="input-field" value={bmi} onChange={(e) => setBmi(e.target.value)} required placeholder="28.5" />
              </div>
            </div>

            <div className="form-row-2">
              <div className="form-group">
                <label className="input-label">Glucose (mg/dL)</label>
                <input type="number" className="input-field" value={glucose} onChange={(e) => setGlucose(e.target.value)} required placeholder="125" />
                <span className="field-hint">Elevated fasting is &gt; 100 mg/dL</span>
              </div>
              <div className="form-group">
                <label className="input-label">Diastolic BP (mm Hg)</label>
                <input type="number" className="input-field" value={bloodPressure} onChange={(e) => setBloodPressure(e.target.value)} required placeholder="80" />
                <span className="field-hint">Elevated diastolic is &gt; 80 mm Hg</span>
              </div>
            </div>

            <div className="form-row-2">
              <div className="form-group">
                <label className="input-label">Serum Insulin (mu U/ml)</label>
                <input type="number" className="input-field" value={insulin} onChange={(e) => setInsulin(e.target.value)} required placeholder="85" />
              </div>
              <div className="form-group">
                <label className="input-label">Pregnancies (count)</label>
                <input type="number" className="input-field" value={pregnancies} onChange={(e) => setPregnancies(e.target.value)} required placeholder="0" />
              </div>
            </div>

            <motion.button 
              whileHover={{ scale: 1.03 }} 
              whileTap={{ scale: 0.97 }}
              type="submit" 
              className="btn btn-primary run-inference-btn" 
              disabled={predictionLoading}
            >
              <ClipboardCheck size={18} />
              <span>{predictionLoading ? 'Analyzing Vitals...' : 'Compile Risk Score'}</span>
            </motion.button>
          </form>
        </div>

        {/* Results Column */}
        <div className="glass-card grid-card result-display-card">
          <h3>Assessment Output</h3>
          
          {predictionLoading ? (
            <div className="result-content-container" style={{ animation: 'none' }}>
              <div className="result-metric-header">
                <div className="skeleton skeleton-circle"></div>
                <div className="score-label-block" style={{ width: '100%' }}>
                  <div className="skeleton skeleton-line short" style={{ marginBottom: '8px' }}></div>
                  <div className="skeleton skeleton-line title"></div>
                </div>
              </div>

              <div className="result-inputs-echo glass-card shadow-sm" style={{ minHeight: '120px' }}>
                <div className="skeleton skeleton-line short" style={{ marginBottom: '16px' }}></div>
                <div className="echo-grid">
                  <div className="skeleton skeleton-line" style={{ width: '80%' }}></div>
                  <div className="skeleton skeleton-line" style={{ width: '70%' }}></div>
                  <div className="skeleton skeleton-line" style={{ width: '85%' }}></div>
                  <div className="skeleton skeleton-line" style={{ width: '75%' }}></div>
                  <div className="skeleton skeleton-line" style={{ width: '90%' }}></div>
                  <div className="skeleton skeleton-line" style={{ width: '80%' }}></div>
                </div>
              </div>

              <div className="result-referrals-list">
                <div className="skeleton skeleton-line short" style={{ marginBottom: '12px' }}></div>
                <div className="referral-items-container">
                  <div className="skeleton skeleton-block" style={{ height: '48px' }}></div>
                  <div className="skeleton skeleton-block" style={{ height: '48px' }}></div>
                </div>
              </div>
            </div>
          ) : !result ? (
            <div className="result-placeholder">
              <Activity className="placeholder-icon" size={48} />
              <p>Enter patient indicators on the left and click compile to view machine-learning risk predictions.</p>
            </div>
          ) : (
            <div className="result-content-container">
              {/* Score Meter */}
              <div className="result-metric-header">
                <div className="score-percentage-circle">
                  <span>{result.risk_score}%</span>
                </div>
                <div className="score-label-block">
                  <span className="result-tag">CLASSIFICATION</span>
                  <h4 className={result.prediction === 'High Risk' ? 'high-risk' : 'low-risk'}>
                    {result.prediction}
                  </h4>
                </div>
              </div>

              {/* Input values echo */}
              <div className="result-inputs-echo glass-card shadow-sm">
                <h5>Input Features Logged</h5>
                <div className="echo-grid">
                  <span>Glucose: <strong>{result.input_features.glucose} mg/dL</strong></span>
                  <span>BP: <strong>{result.input_features.blood_pressure} mm Hg</strong></span>
                  <span>Insulin: <strong>{result.input_features.insulin} mu U/ml</strong></span>
                  <span>BMI: <strong>{result.input_features.bmi}</strong></span>
                  <span>Pregnancies: <strong>{result.input_features.pregnancies}</strong></span>
                  <span>Age: <strong>{result.input_features.age} yrs</strong></span>
                </div>
              </div>

              {/* Risk Drivers (Explainable AI) */}
              {result.feature_contributions && (
                <div className="result-explainability glass-card shadow-sm" style={{ padding: '16px', background: 'rgba(10, 15, 30, 0.4)' }}>
                  <h5 style={{ fontSize: '11px', textTransform: 'uppercase', color: 'hsl(var(--text-muted))', marginBottom: '12px', letterSpacing: '0.05em', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '6px' }}>
                    Risk Drivers (Explainable AI)
                  </h5>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {Object.entries(result.feature_contributions).map(([feature, contribution]) => {
                      const labels = {
                        glucose: 'Glucose level',
                        bmi: 'BMI (Body Mass Index)',
                        age: 'Age Factor',
                        blood_pressure: 'Diastolic BP',
                        insulin: 'Serum Insulin',
                        pregnancies: 'Pregnancy History'
                      };
                      const displayName = labels[feature] || feature;
                      const absVal = Math.abs(contribution);
                      const barWidth = Math.min(100, Math.round(absVal * 150));
                      const isPositive = contribution >= 0;
                      
                      return (
                        <div key={feature} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px' }}>
                            <span style={{ color: 'white' }}>{displayName}</span>
                            <span style={{ color: isPositive ? '#f87171' : '#34d399', fontWeight: 600 }}>
                              {isPositive ? '+' : ''}{contribution.toFixed(2)}
                            </span>
                          </div>
                          <div style={{ width: '100%', height: '6px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div 
                              style={{ 
                                width: `${barWidth}%`, 
                                height: '100%', 
                                background: isPositive 
                                  ? 'linear-gradient(90deg, hsl(var(--primary)) 0%, #f87171 100%)' 
                                  : 'linear-gradient(90deg, #10b981 0%, #34d399 100%)',
                                borderRadius: '3px'
                              }} 
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Referrals (Rule Engine) */}
              <div className="result-referrals-list">
                <h5>Doctor Recommendations</h5>
                <div className="referral-items-container">
                  {result.recommendations.map((rec, i) => (
                    <div key={i} className="referral-item">
                      <Award size={18} className="referral-badge-icon" />
                      <span>{rec}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="disclaimer-note">
                <span>Deterministic rules applied. ML model: SimpleLogisticRegression (portfolio synthetic data). Not for diagnosis.</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
