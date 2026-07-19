import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { Activity, ShieldAlert, Award, ClipboardCheck, Upload, RefreshCw } from 'lucide-react';
import { 
  useGetPatientsQuery, 
  useRunPredictionMutation, 
  useUploadReportMutation, 
  useLazyGetPredictionsQuery,
  usePredictHeartDiseaseMutation,
  useGetHeartStatusQuery,
  useGetCurrentSubscriptionQuery
} from '../services/apiSlice';
import UpgradeModal from '../components/UpgradeModal';
import { motion } from 'framer-motion';
import './Predictions.css';

export default function Predictions() {
  const { user } = useSelector((state) => state.auth);
  
  const { data: patients = [], isLoading: rosterLoading } = useGetPatientsQuery();
  const [runPrediction, { isLoading: predictionLoading }] = useRunPredictionMutation();
  const [uploadReport, { isLoading: uploadLoading }] = useUploadReportMutation();
  const [getPredictions] = useLazyGetPredictionsQuery();
  const [predictHeartDisease, { isLoading: heartLoading }] = usePredictHeartDiseaseMutation();
  const { data: heartStatus } = useGetHeartStatusQuery();
  const { data: currentSub } = useGetCurrentSubscriptionQuery();

  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeLimitMsg, setUpgradeLimitMsg] = useState('');

  const [selectedPatientId, setSelectedPatientId] = useState('');
  
  // Tabs state
  const [activeTab, setActiveTab] = useState('diabetes');
  
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

  // New Heart Prediction input fields
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [apLo, setApLo] = useState('');
  const [cholesterol, setCholesterol] = useState('1');
  const [glucoseLevel, setGlucoseLevel] = useState('1');
  const [smoke, setSmoke] = useState(0);
  const [alco, setAlco] = useState(0);
  const [active, setActive] = useState(1);
  const [heartBmi, setHeartBmi] = useState('');

  // Report upload fields
  const [reportFile, setReportFile] = useState(null);
  const [reportType, setReportType] = useState('Blood Test');

  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  // Auto-calculated BMI for heart disease tab
  useEffect(() => {
    if (height && weight) {
      const h_m = parseFloat(height) / 100;
      const w_kg = parseFloat(weight);
      if (h_m > 0 && w_kg > 0) {
        const calculated = (w_kg / (h_m * h_m)).toFixed(1);
        setHeartBmi(calculated);
      } else {
        setHeartBmi('');
      }
    } else {
      setHeartBmi('');
    }
  }, [height, weight]);

  const getBmiColor = (bmiVal) => {
    const val = parseFloat(bmiVal);
    if (isNaN(val)) return 'var(--text-secondary)';
    if (val < 25) return 'var(--success)';
    if (val < 30) return 'var(--warning)';
    return 'var(--danger)';
  };

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
      setHeight(patient.height.toString());
      setWeight(patient.weight.toString());
    } else {
      setBmi('');
      setHeight('');
      setWeight('');
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
      setHeight('');
      setWeight('');
      setApLo('');
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
      if (err.status === 429 || err.status === 402 || err.data?.detail?.error) {
        setUpgradeLimitMsg(err.data?.detail?.message || 'Prediction limit reached.');
        setShowUpgradeModal(true);
      }
      setError(typeof err.data?.detail === 'string' ? err.data.detail : err.data?.detail?.message || err.message || 'ML Inference failed. Please check inputs.');
    }
  };

  const handleRunHeartPrediction = async (e) => {
    e.preventDefault();
    if (!selectedPatientId) {
      setError('Please select a patient.');
      return;
    }
    
    const sys = parseInt(bloodPressure);
    const dia = parseInt(apLo);
    if (dia >= sys) {
      setError('Diastolic Blood Pressure (ap_lo) must be strictly less than Systolic Blood Pressure (ap_hi).');
      return;
    }

    setError('');
    setResult(null);

    const payload = {
      age_years: parseFloat(age),
      gender: gender === 'Male' ? 2 : 1,
      height: parseFloat(height),
      weight: parseFloat(weight),
      ap_hi: sys,
      ap_lo: dia,
      cholesterol: parseInt(cholesterol),
      gluc: parseInt(glucoseLevel),
      smoke: parseInt(smoke),
      alco: parseInt(alco),
      active: parseInt(active)
    };

    try {
      const predictionResponse = await predictHeartDisease({ data: payload, patient_id: parseInt(selectedPatientId) }).unwrap();
      setResult(predictionResponse);
    } catch (err) {
      if (err.status === 429 || err.status === 402 || err.data?.detail?.error) {
        setUpgradeLimitMsg(err.data?.detail?.message || 'Heart Disease Screening is locked on Free plan.');
        setShowUpgradeModal(true);
      }
      setError(typeof err.data?.detail === 'string' ? err.data.detail : err.data?.detail?.message || err.message || 'Heart prediction failed. Please check inputs.');
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
          <h2>{activeTab === 'heart' ? 'Heart Disease Risk Screening' : 'Diabetes Risk Screening'}</h2>
          <p>
            {activeTab === 'heart'
              ? 'Input patient cardiovascular parameters to calculate the heart disease risk score using the trained machine learning model.'
              : 'Input patient laboratory metrics to calculate the statistical risk score using the trained machine learning model.'}
          </p>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="prediction-tabs">
        <button 
          type="button"
          className={`prediction-tab-btn ${activeTab === 'diabetes' ? 'active' : ''}`}
          onClick={() => { setActiveTab('diabetes'); setResult(null); setError(''); }}
        >
          🩸 Diabetes Risk
        </button>
        <button
          type="button"
          className={`prediction-tab-btn ${activeTab === 'heart' ? 'active' : ''}`}
          onClick={() => { setActiveTab('heart'); setResult(null); setError(''); }}
        >
          ❤️ Heart Disease Risk
        </button>
      </div>

      <div className="predictions-split-grid">
        {/* Form Column */}
        <div className="glass-card form-panel-card">
          {activeTab === 'diabetes' ? (
            <>
              <h3>Diabetes Risk Prediction</h3>
              <p className="form-card-subtitle">Enter your parameters and calculate your diabetes risk</p>
            </>
          ) : (
            <>
              <h3>Heart Disease Risk Prediction</h3>
              <p className="form-card-subtitle">Enter your cardiovascular indicators and calculate your heart disease risk</p>
            </>
          )}
          
          {error && (
            <div className="prediction-error-banner">
              <ShieldAlert size={16} />
              <span>{error}</span>
            </div>
          )}

          {activeTab === 'diabetes' ? (
            <>
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

                  {/* Pregnancies */}
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
            </>
          ) : (
            // Heart tab
            heartStatus && !heartStatus.available ? (
              <div style={{ 
                padding: '24px', 
                textAlign: 'center', 
                background: 'rgba(238, 93, 80, 0.1)', 
                border: '1px solid rgba(238, 93, 80, 0.3)', 
                borderRadius: '12px', 
                color: '#EE5D50', 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '12px', 
                marginTop: '16px' 
              }}>
                <ShieldAlert size={40} style={{ alignSelf: 'center' }} />
                <h3 style={{ margin: 0 }}>Service Unavailable</h3>
                <p style={{ margin: 0, fontSize: '14px' }}>
                  Heart Disease Risk Assessment is currently unavailable. Please contact your administrator.
                </p>
              </div>
            ) : (
              <form onSubmit={handleRunHeartPrediction} className="prediction-form">
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
                    <input 
                      type="number" 
                      className="input-field" 
                      value={age} 
                      onChange={(e) => setAge(e.target.value)} 
                      required 
                      min="18" 
                      max="100" 
                      placeholder="45" 
                    />
                  </div>

                  {/* Gender */}
                  <div className="form-group">
                    <label className="input-label">Gender</label>
                    <select 
                      className="input-field select-field" 
                      value={gender} 
                      onChange={(e) => setGender(e.target.value)}
                      required
                    >
                      <option value="Female">Female</option>
                      <option value="Male">Male</option>
                    </select>
                  </div>

                  {/* Height */}
                  <div className="form-group">
                    <label className="input-label">Height (cm)</label>
                    <input 
                      type="number" 
                      className="input-field" 
                      value={height} 
                      onChange={(e) => setHeight(e.target.value)} 
                      required 
                      min="100" 
                      max="250" 
                      placeholder="170" 
                    />
                  </div>

                  {/* Weight */}
                  <div className="form-group">
                    <label className="input-label">Weight (kg)</label>
                    <input 
                      type="number" 
                      className="input-field" 
                      value={weight} 
                      onChange={(e) => setWeight(e.target.value)} 
                      required 
                      min="30" 
                      max="200" 
                      placeholder="70" 
                    />
                  </div>

                  {/* Systolic BP (ap_hi) */}
                  <div className="form-group">
                    <label className="input-label">Systolic Blood Pressure (ap_hi)</label>
                    <input 
                      type="number" 
                      className="input-field" 
                      value={bloodPressure} 
                      onChange={(e) => setBloodPressure(e.target.value)} 
                      required 
                      min="60" 
                      max="250" 
                      placeholder="120" 
                    />
                  </div>

                  {/* Diastolic BP (ap_lo) */}
                  <div className="form-group">
                    <label className="input-label">Diastolic Blood Pressure (ap_lo)</label>
                    <input 
                      type="number" 
                      className="input-field" 
                      value={apLo} 
                      onChange={(e) => setApLo(e.target.value)} 
                      required 
                      min="40" 
                      max="180" 
                      placeholder="80" 
                    />
                  </div>

                  {/* Cholesterol */}
                  <div className="form-group">
                    <label className="input-label">Cholesterol Level</label>
                    <select 
                      className="input-field select-field" 
                      value={cholesterol} 
                      onChange={(e) => setCholesterol(e.target.value)}
                      required
                    >
                      <option value="1">Normal (1)</option>
                      <option value="2">Above Normal (2)</option>
                      <option value="3">Well Above Normal (3)</option>
                    </select>
                  </div>

                  {/* Glucose */}
                  <div className="form-group">
                    <label className="input-label">Glucose Level</label>
                    <select 
                      className="input-field select-field" 
                      value={glucoseLevel} 
                      onChange={(e) => setGlucoseLevel(e.target.value)}
                      required
                    >
                      <option value="1">Normal (1)</option>
                      <option value="2">Above Normal (2)</option>
                      <option value="3">Well Above Normal (3)</option>
                    </select>
                  </div>

                  {/* Smoking Status */}
                  <div className="form-group">
                    <label className="input-label">Smoking Status</label>
                    <select 
                      className="input-field select-field" 
                      value={smoke} 
                      onChange={(e) => setSmoke(parseInt(e.target.value))}
                      required
                    >
                      <option value="0">No</option>
                      <option value="1">Yes</option>
                    </select>
                  </div>

                  {/* Alcohol Intake */}
                  <div className="form-group">
                    <label className="input-label">Alcohol Intake</label>
                    <select 
                      className="input-field select-field" 
                      value={alco} 
                      onChange={(e) => setAlco(parseInt(e.target.value))}
                      required
                    >
                      <option value="0">No</option>
                      <option value="1">Yes</option>
                    </select>
                  </div>

                  {/* Physical Activity */}
                  <div className="form-group">
                    <label className="input-label">Physically Active</label>
                    <select 
                      className="input-field select-field" 
                      value={active} 
                      onChange={(e) => setActive(parseInt(e.target.value))}
                      required
                    >
                      <option value="1">Yes</option>
                      <option value="0">No</option>
                    </select>
                  </div>

                  {/* Calculated BMI */}
                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <label className="input-label">Auto-Calculated BMI</label>
                    {heartBmi ? (
                      <div style={{
                        padding: '10px 16px',
                        background: 'rgba(255, 255, 255, 0.02)',
                        border: `1px solid ${getBmiColor(heartBmi)}`,
                        borderRadius: '8px',
                        color: getBmiColor(heartBmi),
                        fontWeight: 'bold',
                        fontSize: '14px',
                        display: 'inline-block'
                      }}>
                        Your BMI: {heartBmi}
                      </div>
                    ) : (
                      <div style={{
                        padding: '10px 16px',
                        background: 'rgba(255, 255, 255, 0.02)',
                        border: '1px dashed var(--border)',
                        borderRadius: '8px',
                        color: 'var(--text-secondary)',
                        fontSize: '13px'
                      }}>
                        Enter Height and Weight
                      </div>
                    )}
                  </div>
                </div>

                <button 
                  type="submit" 
                  className="btn btn-primary run-prediction-btn-full" 
                  disabled={heartLoading}
                >
                  {heartLoading ? 'Calculating Risk...' : 'Assess Heart Disease Risk'}
                </button>
              </form>
            )
          )}
        </div>

        {/* Results Column */}
        <div className="glass-card result-panel-card">
          <h3>Screening Results</h3>
          
          {predictionLoading || heartLoading ? (
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
                  <span className={`badge ${
                    (result.type === 'heart' ? result.risk_level === 'High' : result.prediction === 'High Risk') 
                      ? 'badge-danger' 
                      : (result.type === 'heart' && result.risk_level === 'Medium')
                      ? 'badge-warning'
                      : 'badge-success'
                  }`} style={{ fontSize: '15px', padding: '6px 14px' }}>
                    {result.type === 'heart' ? `${result.risk_level} Risk` : result.prediction}
                  </span>
                </div>
              </div>

              {/* Confidence interval range for heart */}
              {result.type === 'heart' && result.confidence_lower !== undefined && result.confidence_upper !== undefined && (
                <div style={{ textAlign: 'center', marginTop: '12px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Confidence Range: <strong>{result.confidence_lower}% – {result.confidence_upper}%</strong>
                </div>
              )}

              {/* Risk explanation card */}
              <div className="risk-explanation-text-box">
                {result.type === 'heart' ? (
                  result.risk_level === 'High' ? (
                    <p className="danger-text-desc">
                      ⚠️ <strong>Warning:</strong> High cardiovascular risk detected. Cardiologist consultation strongly recommended.
                    </p>
                  ) : result.risk_level === 'Medium' ? (
                    <p className="warning-text-desc" style={{ color: 'var(--warning)', margin: 0, fontSize: '14px', lineHeight: '1.5' }}>
                      ⚠️ <strong>Caution:</strong> Medium cardiovascular risk detected. Consider consultation with a Cardiologist.
                    </p>
                  ) : (
                    <p className="success-text-desc">
                      ✅ <strong>Low Risk:</strong> Cardiovascular indicators are within normal limits. Maintain a healthy lifestyle.
                    </p>
                  )
                ) : (
                  result.prediction === 'High Risk' ? (
                    <p className="danger-text-desc">
                      ⚠️ <strong>Warning:</strong> You have a high risk of developing diabetes. We recommend consulting a specialist or an Endocrinologist as soon as possible.
                    </p>
                  ) : (
                    <p className="success-text-desc">
                      ✅ <strong>Low Risk:</strong> Vitals are within normal thresholds. Continue maintaining a balanced diet and regular screening plans.
                    </p>
                  )
                )}
              </div>

              {/* Inputs Echo summary */}
              <div className="result-inputs-echo-box">
                <h4>Vitals Parameter Summary</h4>
                {result.type === 'heart' ? (
                  <div className="result-vitals-echo-grid">
                    <div className="vitals-echo-item">Age: <strong>{result.age_years} yrs</strong></div>
                    <div className="vitals-echo-item">Gender: <strong>{result.gender === 2 ? 'Male' : 'Female'}</strong></div>
                    <div className="vitals-echo-item">Height: <strong>{result.height} cm</strong></div>
                    <div className="vitals-echo-item">Weight: <strong>{result.weight} kg</strong></div>
                    <div className="vitals-echo-item">BMI: <strong>{result.bmi_calculated}</strong></div>
                    <div className="vitals-echo-item">Systolic BP: <strong>{result.ap_hi} mmHg</strong></div>
                    <div className="vitals-echo-item">Diastolic BP: <strong>{result.ap_lo} mmHg</strong></div>
                    <div className="vitals-echo-item">Cholesterol: <strong>{
                      result.cholesterol === 1 ? 'Normal' : result.cholesterol === 2 ? 'Above Normal' : 'Well Above Normal'
                    }</strong></div>
                    <div className="vitals-echo-item">Glucose Level: <strong>{
                      result.gluc === 1 ? 'Normal' : result.gluc === 2 ? 'Above Normal' : 'Well Above Normal'
                    }</strong></div>
                    <div className="vitals-echo-item">Smoking: <strong>{result.smoke === 1 ? 'Yes' : 'No'}</strong></div>
                    <div className="vitals-echo-item">Alcohol: <strong>{result.alco === 1 ? 'Yes' : 'No'}</strong></div>
                    <div className="vitals-echo-item">Activity: <strong>{result.active === 1 ? 'Yes' : 'No'}</strong></div>
                  </div>
                ) : (
                  <div className="result-vitals-echo-grid">
                    <div className="vitals-echo-item">Glucose: <strong>{result.input_features.glucose} mg/dL</strong></div>
                    <div className="vitals-echo-item">Blood Pressure: <strong>{result.input_features.blood_pressure} mm Hg</strong></div>
                    <div className="vitals-echo-item">BMI: <strong>{result.input_features.bmi}</strong></div>
                    <div className="vitals-echo-item">Insulin: <strong>{result.input_features.insulin} mu U/ml</strong></div>
                    <div className="vitals-echo-item">Age: <strong>{result.input_features.age} yrs</strong></div>
                    <div className="vitals-echo-item">Pregnancies: <strong>{result.input_features.pregnancies}</strong></div>
                  </div>
                )}
              </div>

              {/* XAI Feature Contributions */}
              {result.feature_contributions && (
                <div className="xai-contributions-box">
                  <h4>AI Prediction Explanations (Log-Odds Impact)</h4>
                  <p className="xai-subtitle">
                    How each physiological vital parameter influenced the AI model's final risk score decision.
                  </p>
                  <div className="xai-bars-container">
                    {Object.entries(result.feature_contributions).map(([key, value]) => {
                      const cleanLabel = {
                        pregnancies: 'Pregnancies',
                        glucose: 'Blood Glucose',
                        blood_pressure: 'Diastolic Blood Pressure',
                        insulin: 'Insulin Level',
                        bmi: 'Body Mass Index (BMI)',
                        age: 'Age',
                        age_years: 'Age',
                        gender: 'Gender',
                        height: 'Height',
                        weight: 'Weight',
                        ap_hi: 'Systolic Blood Pressure (ap_hi)',
                        ap_lo: 'Diastolic Blood Pressure (ap_lo)',
                        cholesterol: 'Cholesterol Level',
                        gluc: 'Glucose Level',
                        smoke: 'Smoking Status',
                        alco: 'Alcohol Intake',
                        active: 'Physical Activity'
                      }[key] || key.replace('_', ' ');
                      
                      const isPositive = value >= 0;
                      const maxVal = Math.max(...Object.values(result.feature_contributions).map(v => Math.abs(v))) || 1.0;
                      const percentage = Math.min(100, (Math.abs(value) / maxVal) * 100);
                      
                      return (
                        <div key={key} className="xai-bar-row">
                          <div className="xai-bar-label-group">
                            <span className="xai-feature-name">{cleanLabel}</span>
                            <span className={`xai-feature-value ${isPositive ? 'positive' : 'negative'}`}>
                              {isPositive ? '+' : ''}{value.toFixed(4)} {isPositive ? '(Increases Risk)' : '(Reduces Risk)'}
                            </span>
                          </div>
                          <div className="xai-bar-track">
                            <div 
                              className={`xai-bar-fill ${isPositive ? 'positive' : 'negative'}`} 
                              style={{ width: `${percentage}%` }}
                            ></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Doctor Recommendations Rules */}
              {result.type === 'heart' ? (
                result.referral_recommendation && (
                  <div className="result-doctor-recs-box">
                    <h4>Doctor Referral Recommendations</h4>
                    <div className="doc-rec-items-list">
                      <div className="doc-rec-bullet-row">
                        <Award size={16} className="doc-rec-award-icon" />
                        <span>{result.referral_recommendation}</span>
                      </div>
                    </div>
                  </div>
                )
              ) : (
                result.recommendations && result.recommendations.length > 0 && (
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
                )
              )}
            </div>
          )}
        </div>
      </div>
      <UpgradeModal 
        isOpen={showUpgradeModal} 
        onClose={() => setShowUpgradeModal(false)} 
        limitMessage={upgradeLimitMsg} 
      />
    </div>
  );
}
