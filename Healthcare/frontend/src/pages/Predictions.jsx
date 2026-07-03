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
  
  // ML API features input fields
  const [pregnancies, setPregnancies] = useState('0');
  const [glucose, setGlucose] = useState('');
  const [bloodPressure, setBloodPressure] = useState('');
  const [insulin, setInsulin] = useState('');
  const [bmi, setBmi] = useState('');
  const [age, setAge] = useState('');

  // UI Aesthetic inputs (MediAI spec)
  const [gender, setGender] = useState('Male');
  const [skinThickness, setSkinThickness] = useState('20');
  const [diabetesPedigreeFunction, setDiabetesPedigreeFunction] = useState('0.45');

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
    if (patient.gender) {
      setGender(patient.gender);
    }
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

    // Payload for ML backend only takes the validated schema properties
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
      const fileInput = document.getElementById('report-file-input-predictions');
      if (fileInput) fileInput.value = '';
      
    } catch (err) {
      setError(err.data?.detail || err.message || 'Report upload or parsing failed.');
    }
  };

  return (
    <div className="predictions-page-container">
      {/* Header Greeting */}
      <div className="dashboard-header-panel">
        <div className="header-greeting">
          <span className="welcome-tag">RISK ASSESSMENT</span>
          <h2>Diabetes Risk Screening</h2>
          <p>Input patient laboratory metrics to calculate the statistical risk score using the trained machine learning model.</p>
        </div>
      </div>

      <div className="predictions-split-grid">
        {/* Form Column */}
        <div className="glass-card form-panel-card">
          <h3>Diabetes Risk Prediction</h3>
          <p className="form-card-subtitle">Enter your parameters and calculate your diabetes risk</p>
          
          {error && (
            <div className="prediction-error-banner">
              <ShieldAlert size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Quick Lab Report Upload */}
          <div className="report-upload-box-light">
            <h4 className="upload-header-title">
              <Upload size={16} style={{ color: 'var(--accent)' }} />
              Auto-fill from Lab Report (PDF / CSV)
            </h4>
            <form onSubmit={handleUploadReport} className="upload-inline-form">
              {user?.role !== 'patient' && (
                <div className="form-group" style={{ marginBottom: '8px' }}>
                  <label className="input-label" style={{ fontSize: '10px' }}>Select Patient Case File</label>
                  <select 
                    className="input-field select-field" 
                    value={selectedPatientId} 
                    onChange={handlePatientChange} 
                    required
                    disabled={rosterLoading}
                    style={{ padding: '8px 12px', fontSize: '13px' }}
                  >
                    <option value="">{rosterLoading ? 'Loading roster...' : '-- Choose Patient --'}</option>
                    {patients.map(p => (
                      <option key={p.id} value={p.id}>{p.user.name} (Case ID: {p.id})</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="form-row-2">
                <div className="form-group">
                  <label className="input-label" style={{ fontSize: '10px' }}>Report Category</label>
                  <input
                    type="text"
                    className="input-field"
                    value={reportType}
                    onChange={(e) => setReportType(e.target.value)}
                    placeholder="E.g., Blood Test"
                    required
                    style={{ padding: '8px 12px', fontSize: '13px' }}
                  />
                </div>
                <div className="form-group">
                  <label className="input-label" style={{ fontSize: '10px' }}>Document File</label>
                  <input
                    id="report-file-input-predictions"
                    type="file"
                    className="input-field file-input"
                    onChange={(e) => setReportFile(e.target.files[0])}
                    required
                    style={{ padding: '6px 10px', fontSize: '12px', height: 'auto', minHeight: 'unset' }}
                  />
                </div>
              </div>
              <button 
                type="submit" 
                className="btn btn-secondary upload-submit-btn-inline" 
                disabled={uploadLoading || !reportFile || !selectedPatientId} 
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
              </button>
            </form>
          </div>

          <div className="form-divider-line">
            <span className="divider-text">Or Enter Manually</span>
          </div>

          <form onSubmit={handleRunPrediction} className="prediction-form">
            {user?.role !== 'patient' && (
              <div className="form-group" style={{ marginBottom: '16px' }}>
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
              </div>
            )}

            <div className="two-column-inputs-grid">
              {/* Age */}
              <div className="form-group">
                <label className="input-label">Age (years)</label>
                <input type="number" className="input-field" value={age} onChange={(e) => setAge(e.target.value)} required placeholder="45" />
              </div>

              {/* Gender */}
              <div className="form-group">
                <label className="input-label">Gender</label>
                <select className="input-field select-field" value={gender} onChange={(e) => setGender(e.target.value)}>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {/* Glucose */}
              <div className="form-group">
                <label className="input-label">Glucose (mg/dL)</label>
                <input type="number" className="input-field" value={glucose} onChange={(e) => setGlucose(e.target.value)} required placeholder="152" />
              </div>

              {/* Blood Pressure */}
              <div className="form-group">
                <label className="input-label">Blood Pressure (mmHg)</label>
                <input type="number" className="input-field" value={bloodPressure} onChange={(e) => setBloodPressure(e.target.value)} required placeholder="80" />
              </div>

              {/* BMI */}
              <div className="form-group">
                <label className="input-label">BMI (kg/m²)</label>
                <input type="number" step="0.1" className="input-field" value={bmi} onChange={(e) => setBmi(e.target.value)} required placeholder="28.4" />
              </div>

              {/* Insulin */}
              <div className="form-group">
                <label className="input-label">Insulin (mu U/ml)</label>
                <input type="number" className="input-field" value={insulin} onChange={(e) => setInsulin(e.target.value)} required placeholder="15.5" />
              </div>

              {/* Skin Thickness */}
              <div className="form-group">
                <label className="input-label">Skin Thickness (mm)</label>
                <input type="number" className="input-field" value={skinThickness} onChange={(e) => setSkinThickness(e.target.value)} placeholder="32" />
              </div>

              {/* Diabetes Pedigree Function */}
              <div className="form-group">
                <label className="input-label">Diabetes Pedigree Function</label>
                <input type="number" step="0.01" className="input-field" value={diabetesPedigreeFunction} onChange={(e) => setDiabetesPedigreeFunction(e.target.value)} placeholder="0.45" />
              </div>

              {/* Pregnancies (Conditional/Default mapping) */}
              <div className="form-group">
                <label className="input-label">Pregnancies (count)</label>
                <input type="number" className="input-field" value={pregnancies} onChange={(e) => setPregnancies(e.target.value)} required placeholder="0" />
              </div>
            </div>

            <button 
              type="submit" 
              className="btn btn-primary run-prediction-btn-full" 
              disabled={predictionLoading}
            >
              {predictionLoading ? 'Calculating Risk...' : 'Predict Risk'}
            </button>
          </form>
        </div>

        {/* Results Column */}
        <div className="glass-card result-panel-card">
          <h3>Screening Results</h3>
          
          {predictionLoading ? (
            <div className="result-loader-wrapper">
              <div className="skeleton skeleton-circle" style={{ width: '120px', height: '120px', margin: '0 auto 20px auto' }}></div>
              <div className="skeleton skeleton-line title" style={{ width: '50%', margin: '0 auto 12px auto' }}></div>
              <div className="skeleton skeleton-line" style={{ width: '80%', margin: '0 auto 8px auto' }}></div>
              <div className="skeleton skeleton-block" style={{ height: '80px', marginTop: '24px' }}></div>
            </div>
          ) : !result ? (
            <div className="result-panel-placeholder">
              <Activity className="placeholder-brand-icon" size={48} />
              <p>Enter patient indicators and click calculate to view the diagnostic risk assessments.</p>
            </div>
          ) : (
            <div className="result-details-wrapper">
              <div className="result-score-heading-block">
                <div className="large-circle-score-indicator">
                  <span className="circle-score-percent">{result.risk_score}%</span>
                </div>
                <div className="result-score-labels">
                  <span className="result-score-tag">Prediction Result:</span>
                  <span className={`badge ${result.prediction === 'High Risk' ? 'badge-danger' : 'badge-success'}`} style={{ fontSize: '15px', padding: '6px 14px' }}>
                    {result.prediction}
                  </span>
                </div>
              </div>

              {/* Risk explanation card */}
              <div className="risk-explanation-text-box">
                {result.prediction === 'High Risk' ? (
                  <p className="danger-text-desc">
                    ⚠️ <strong>Warning:</strong> You have a high risk of developing diabetes. We recommend consulting a specialist or an Endocrinologist as soon as possible.
                  </p>
                ) : (
                  <p className="success-text-desc">
                    ✅ <strong>Low Risk:</strong> Vitals are within normal thresholds. Continue maintaining a balanced diet and regular screening plans.
                  </p>
                )}
              </div>

              {/* Inputs Echo summary */}
              <div className="result-inputs-echo-box">
                <h4>Vitals Parameter Summary</h4>
                <div className="result-vitals-echo-grid">
                  <div className="vitals-echo-item">Glucose: <strong>{result.input_features.glucose} mg/dL</strong></div>
                  <div className="vitals-echo-item">Blood Pressure: <strong>{result.input_features.blood_pressure} mm Hg</strong></div>
                  <div className="vitals-echo-item">BMI: <strong>{result.input_features.bmi}</strong></div>
                  <div className="vitals-echo-item">Insulin: <strong>{result.input_features.insulin} mu U/ml</strong></div>
                  <div className="vitals-echo-item">Age: <strong>{result.input_features.age} yrs</strong></div>
                  <div className="vitals-echo-item">Pregnancies: <strong>{result.input_features.pregnancies}</strong></div>
                </div>
              </div>

              {/* Doctor Recommendations Rules */}
              {result.recommendations && result.recommendations.length > 0 && (
                <div className="result-doctor-recs-box">
                  <h4>Doctor Recommendations</h4>
                  <div className="doc-rec-items-list">
                    {result.recommendations.map((rec, i) => (
                      <div key={i} className="doc-rec-bullet-row">
                        <Award size={16} className="doc-rec-award-icon" />
                        <span>{rec}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
