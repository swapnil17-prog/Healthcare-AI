import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, 
  AlertTriangle, 
  TrendingUp, 
  ShieldCheck, 
  ArrowRight,
  Calendar,
  FileText,
  Activity,
  Award
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Legend, 
  ScatterChart, 
  Scatter 
} from 'recharts';
import { motion } from 'framer-motion';
import { api } from '../services/api';
import './DoctorDashboard.css';

export default function DoctorDashboard() {
  const [patients, setPatients] = useState([]);
  const [predictionsMap, setPredictionsMap] = useState({});
  const [appointments, setAppointments] = useState([]);
  const [reportsMap, setReportsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadDoctorData();
  }, []);

  const loadDoctorData = async () => {
    setLoading(true);
    try {
      const patientList = await api.getPatients();
      setPatients(patientList);

      const apptList = await api.getAppointments();
      setAppointments(apptList);

      // Fetch predictions and reports for each patient in parallel
      const predsMap = {};
      const repsMap = {};
      await Promise.all(
        patientList.map(async (p) => {
          try {
            const preds = await api.getPredictions(p.id);
            predsMap[p.id] = preds;
          } catch (e) {
            console.error(`Failed to load predictions for patient ${p.id}`, e);
          }
          try {
            const reps = await api.getReports(p.id);
            repsMap[p.id] = reps;
          } catch (e) {
            console.error(`Failed to load reports for patient ${p.id}`, e);
          }
        })
      );
      setPredictionsMap(predsMap);
      setReportsMap(repsMap);
    } catch (e) {
      console.error('Failed to load doctor dashboard stats', e);
    } finally {
      setLoading(false);
    }
  };

  // Process data for Risk Distribution Pie Chart
  const getPieData = () => {
    let low = 0;
    let moderate = 0;
    let high = 0;
    let noScan = 0;

    patients.forEach((p) => {
      const preds = predictionsMap[p.id] || [];
      if (preds.length === 0) {
        noScan++;
      } else {
        const latest = preds[preds.length - 1];
        const score = latest.risk_score;
        if (score < 30) low++;
        else if (score < 60) moderate++;
        else high++;
      }
    });

    return [
      { name: 'Low Risk (<30%)', value: low, color: '#05CD99' },
      { name: 'Medium Risk (30-60%)', value: moderate, color: '#FFB547' },
      { name: 'High Risk (>60%)', value: high, color: '#EE5D50' },
      { name: 'No Assessments', value: noScan, color: '#A3AED0' }
    ].filter(item => item.value > 0);
  };

  // Process data for Monthly Consultations Bar Chart
  const getMonthlyApptsData = () => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const counts = Array(12).fill(0);
    
    appointments.forEach(a => {
      const date = new Date(a.scheduled_at);
      // Group for current year or last 6 months
      counts[date.getMonth()]++;
    });
    
    return months.map((m, idx) => ({
      month: m,
      'Consultations': counts[idx]
    })).filter((item, idx) => idx <= new Date().getMonth() || item.Consultations > 0);
  };

  // Filter Critical Patients (Risk Score > 70%)
  const getCriticalPatients = () => {
    const criticalList = [];
    patients.forEach((p) => {
      const preds = predictionsMap[p.id] || [];
      if (preds.length > 0) {
        const latest = preds[preds.length - 1];
        if (latest.risk_score > 70) {
          criticalList.push({
            patient: p,
            risk_score: latest.risk_score,
            glucose: latest.input_features.glucose,
            bmi: latest.input_features.bmi
          });
        }
      }
    });
    return criticalList;
  };

  if (loading) {
    return <div className="dashboard-loading-container">Loading Doctor Dashboard...</div>;
  }

  const pieData = getPieData();
  const monthlyApptsData = getMonthlyApptsData();
  const criticalPatients = getCriticalPatients();

  // Metrics computation for cards
  const totalPatients = patients.length;
  const highRiskPatientsCount = patients.filter(p => {
    const preds = predictionsMap[p.id] || [];
    const latest = preds[preds.length - 1];
    return latest && latest.risk_score >= 60;
  }).length;

  const todayStr = new Date().toDateString();
  const appointmentsToday = appointments.filter(a => new Date(a.scheduled_at).toDateString() === todayStr).length;

  let totalReports = 0;
  Object.values(reportsMap).forEach(reps => {
    totalReports += reps.length;
  });

  // Calculate conditions stats for population bar
  let diabetesCount = 0;
  let bpCount = 0;
  let obesityCount = 0;
  let scannedCount = 0;

  patients.forEach((p) => {
    const preds = predictionsMap[p.id] || [];
    const latest = preds[preds.length - 1];
    if (latest) {
      scannedCount++;
      if (latest.input_features.glucose >= 126 || latest.risk_score >= 60) diabetesCount++;
      if (latest.input_features.blood_pressure >= 85) bpCount++;
      if (latest.input_features.bmi >= 30) obesityCount++;
    }
  });

  const conditionsList = [
    { name: 'Diabetes Risk / High Glucose', count: diabetesCount, color: '#5B6BF8' },
    { name: 'Hypertension (High BP)', count: bpCount, color: '#FFB547' },
    { name: 'Obesity (BMI >= 30)', count: obesityCount, color: '#EE5D50' }
  ];

  const scatterData = (() => {
    const data = [];
    patients.forEach((p) => {
      const preds = predictionsMap[p.id] || [];
      if (preds.length > 0) {
        const latest = preds[preds.length - 1];
        data.push({
          name: p.user.name,
          glucose: latest.input_features.glucose,
          bmi: latest.input_features.bmi,
          risk: latest.risk_score,
          prediction: latest.prediction
        });
      }
    });
    return data;
  })();

  return (
    <div className="doctor-dashboard-container">
      {/* Greeting Banner */}
      <div className="dashboard-header-panel">
        <div className="header-greeting">
          <span className="welcome-tag">DOCTOR CLINICAL PANEL</span>
          <h2>Clinical Management Portal</h2>
          <p>Review population risk statistics, analyze trends, and manage care profiles.</p>
        </div>
      </div>

      {/* KPI Panel Cards */}
      <div className="doctor-kpi-grid">
        {/* KPI 1: Total Patients */}
        <div className="white-kpi-card">
          <div className="kpi-icon-wrapper blue-light">
            <Users className="kpi-icon" size={24} />
          </div>
          <div className="kpi-card-info">
            <h3 className="kpi-value">{totalPatients}</h3>
            <span className="kpi-label">Total Patients</span>
          </div>
        </div>

        {/* KPI 2: High Risk */}
        <div className="white-kpi-card">
          <div className="kpi-icon-wrapper danger-light">
            <AlertTriangle className="kpi-icon" size={24} />
          </div>
          <div className="kpi-card-info">
            <h3 className="kpi-value">{highRiskPatientsCount}</h3>
            <span className="kpi-label">High-Risk Patients</span>
          </div>
        </div>

        {/* KPI 3: Appointments Today */}
        <div className="white-kpi-card">
          <div className="kpi-icon-wrapper accent-light">
            <Calendar className="kpi-icon" size={24} />
          </div>
          <div className="kpi-card-info">
            <h3 className="kpi-value">{appointmentsToday}</h3>
            <span className="kpi-label">Appointments Today</span>
          </div>
        </div>

        {/* KPI 4: Reports Pending */}
        <div className="white-kpi-card">
          <div className="kpi-icon-wrapper warning-light">
            <FileText className="kpi-icon" size={24} />
          </div>
          <div className="kpi-card-info">
            <h3 className="kpi-value">{totalReports}</h3>
            <span className="kpi-label">Reports Pending</span>
          </div>
        </div>
      </div>

      {/* CHARTS CONTAINER GRID */}
      <div className="doctor-charts-grid">
        {/* Pie Chart: Risk Distribution */}
        <div className="glass-card doctor-chart-card">
          <div className="card-title-row">
            <Activity size={18} className="card-icon" style={{ color: 'var(--accent)' }} />
            <h3>Risk Severity Distribution</h3>
          </div>
          {pieData.length === 0 ? (
            <p className="empty-text">No patient data available.</p>
          ) : (
            <div className="recharts-wrapper">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--font-body)',
                      fontSize: '12px',
                      boxShadow: 'var(--shadow-md)'
                    }}
                  />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px', color: 'var(--text-secondary)' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Bar Chart: Monthly Consultations */}
        <div className="glass-card doctor-chart-card">
          <div className="card-title-row">
            <TrendingUp size={18} className="card-icon" style={{ color: 'var(--accent)' }} />
            <h3>Monthly Consultations</h3>
          </div>
          {monthlyApptsData.length === 0 ? (
            <p className="empty-text">No consultation records.</p>
          ) : (
            <div className="recharts-wrapper">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthlyApptsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis stroke="var(--text-secondary)" fontSize={10} dataKey="month" tickLine={false} />
                  <YAxis stroke="var(--text-secondary)" fontSize={10} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--font-body)',
                      fontSize: '12px',
                      boxShadow: 'var(--shadow-md)'
                    }}
                  />
                  <Bar dataKey="Consultations" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* COHORTS AND ALERTS ROW */}
      <div className="doctor-details-split">
        {/* Recent Patients Table */}
        <div className="glass-card table-panel-card">
          <div className="card-title-row">
            <Users size={18} className="card-icon" style={{ color: 'var(--accent)' }} />
            <h3>Recent Patients</h3>
          </div>
          <div className="table-wrapper">
            {patients.length === 0 ? (
              <p className="empty-text">No patients registered.</p>
            ) : (
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>Age</th>
                    <th>Risk Level</th>
                    <th>Last Visit</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {patients.slice(0, 5).map((p) => {
                    const preds = predictionsMap[p.id] || [];
                    const latestPred = preds[preds.length - 1];
                    const pAppts = appointments.filter(a => a.patient_id === p.id);
                    const latestAppt = pAppts[pAppts.length - 1];
                    
                    const riskScore = latestPred ? latestPred.risk_score : 0;
                    let riskBadge = <span className="badge badge-info">No Scan</span>;
                    if (latestPred) {
                      if (riskScore >= 60) riskBadge = <span className="badge badge-danger">High Risk</span>;
                      else if (riskScore >= 30) riskBadge = <span className="badge badge-warning">Medium Risk</span>;
                      else riskBadge = <span className="badge badge-success">Low Risk</span>;
                    }
                    
                    const lastVisitDate = latestAppt 
                      ? new Date(latestAppt.scheduled_at).toLocaleDateString()
                      : (latestPred ? new Date(latestPred.created_at).toLocaleDateString() : 'N/A');

                    const isActive = latestPred || latestAppt;

                    return (
                      <tr key={p.id} onClick={() => navigate('/patients', { state: { selectedPatientId: p.id } })} style={{ cursor: 'pointer' }}>
                        <td><strong>{p.user.name}</strong></td>
                        <td>{p.age || 'N/A'}</td>
                        <td>{riskBadge}</td>
                        <td>{lastVisitDate}</td>
                        <td>
                          <span className={`badge ${isActive ? 'badge-success' : 'badge-warning'}`}>
                            {isActive ? 'Active' : 'Inactive'}
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

        {/* Top Conditions Progress Bars */}
        <div className="glass-card conditions-panel-card">
          <div className="card-title-row">
            <Award size={18} className="card-icon" style={{ color: 'var(--accent)' }} />
            <h3>Top Conditions (Scanned Roster)</h3>
          </div>
          <div className="conditions-list-wrapper">
            {scannedCount === 0 ? (
              <p className="empty-text">No diagnostics logs registered to compile population analytics.</p>
            ) : (
              conditionsList.map((cond, idx) => {
                const percentage = Math.round((cond.count / scannedCount) * 100);
                return (
                  <div key={idx} className="condition-progress-row">
                    <div className="condition-meta-row">
                      <span className="condition-name">{cond.name}</span>
                      <span className="condition-ratio"><strong>{cond.count}</strong> / {scannedCount} Patients ({percentage}%)</span>
                    </div>
                    <div className="condition-bar-track">
                      <div 
                        className="condition-bar-fill"
                        style={{ 
                          width: `${percentage}%`, 
                          backgroundColor: cond.color,
                          transition: 'width 0.6s ease'
                        }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Patient Vitals Scatter Correlation Plot */}
      <div className="glass-card scatter-plot-card" style={{ marginTop: '24px' }}>
        <div className="card-title-row">
          <TrendingUp size={18} className="card-icon" style={{ color: 'var(--accent)' }} />
          <h3>Patient Cohort Correlation (Glucose vs. BMI)</h3>
        </div>
        {scatterData.length === 0 ? (
          <p className="empty-text">No patient vitals registered for correlation mapping.</p>
        ) : (
          <div className="recharts-wrapper" style={{ height: '320px', marginTop: '10px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: -10 }}>
                <XAxis 
                  type="number" 
                  dataKey="glucose" 
                  name="Glucose" 
                  unit=" mg/dL" 
                  stroke="var(--text-secondary)" 
                  fontSize={10} 
                  domain={[60, 220]}
                  tickLine={false}
                />
                <YAxis 
                  type="number" 
                  dataKey="bmi" 
                  name="BMI" 
                  stroke="var(--text-secondary)" 
                  fontSize={10} 
                  domain={[15, 55]}
                  tickLine={false}
                />
                <Tooltip 
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div style={{
                          background: 'var(--bg-card)',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          padding: '12px',
                          color: 'var(--text-primary)',
                          fontSize: '12px',
                          boxShadow: 'var(--shadow-md)'
                        }}>
                          <p style={{ margin: '0 0 6px 0', fontWeight: 'bold' }}>{data.name}</p>
                          <p style={{ margin: '2px 0' }}>Glucose: <strong>{data.glucose} mg/dL</strong></p>
                          <p style={{ margin: '2px 0' }}>BMI: <strong>{data.bmi}</strong></p>
                          <p style={{ margin: '2px 0', color: data.risk >= 60 ? 'var(--danger)' : data.risk >= 30 ? 'var(--warning)' : 'var(--success)' }}>
                            Risk Score: <strong>{data.risk}% ({data.prediction})</strong>
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Scatter 
                  name="Patients" 
                  data={scatterData} 
                >
                  {scatterData.map((entry, index) => {
                    const color = entry.risk >= 60 ? 'var(--danger)' : entry.risk >= 30 ? 'var(--warning)' : 'var(--success)';
                    return <Cell key={`cell-${index}`} fill={color} />;
                  })}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Critical High Risk Alerts list */}
      {criticalPatients.length > 0 && (
        <div className="glass-card alerts-full-card" style={{ marginTop: '24px' }}>
          <div className="card-title-row">
            <AlertTriangle size={18} className="card-icon red" style={{ color: 'var(--danger)' }} />
            <h3>High Risk Critical Patient Alerts</h3>
          </div>
          <div className="alerts-body-list">
            {criticalPatients.map(({ patient: p, risk_score, glucose, bmi }) => (
              <div key={p.id} className="clinical-alert-item-dashboard">
                <div className="alert-text-meta">
                  <span className="alert-p-name">{p.user.name}</span>
                  <span className="alert-p-detail">Glucose: {glucose} mg/dL | BMI: {bmi} (Severe parameters flagged)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span className="badge badge-danger">{risk_score}% Risk</span>
                  <button onClick={() => navigate(`/patients`, { state: { selectedPatientId: p.id } })} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                    View Profile
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
