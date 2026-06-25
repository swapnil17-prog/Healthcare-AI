import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, AlertTriangle, TrendingUp, ShieldCheck, ArrowRight } from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { api } from '../services/api';
import './DoctorDashboard.css';

export default function DoctorDashboard() {
  const [patients, setPatients] = useState([]);
  const [predictionsMap, setPredictionsMap] = useState({});
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

      // Fetch predictions for each patient to build charts and metrics
      const predsMap = {};
      await Promise.all(
        patientList.map(async (p) => {
          try {
            const preds = await api.getPredictions(p.id);
            predsMap[p.id] = preds;
          } catch (e) {
            console.error(`Failed to load predictions for patient ${p.id}`, e);
          }
        })
      );
      setPredictionsMap(predsMap);
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
      { name: 'Low Risk (<30%)', value: low, color: '#10b981' },
      { name: 'Moderate Risk (30-60%)', value: moderate, color: '#fbbf24' },
      { name: 'High Risk (>60%)', value: high, color: '#ef4444' },
      { name: 'No Assessments', value: noScan, color: '#64748b' }
    ].filter(item => item.value > 0); // Don't show 0-count slices
  };

  // Process data for Risk Trend Line Chart (Risk scores by date)
  const getLineData = () => {
    const datesMap = {};
    
    // Collect all predictions
    Object.values(predictionsMap).forEach((preds) => {
      preds.forEach((p) => {
        const dateStr = new Date(p.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' });
        if (!datesMap[dateStr]) {
          datesMap[dateStr] = { sum: 0, count: 0 };
        }
        datesMap[dateStr].sum += p.risk_score;
        datesMap[dateStr].count += 1;
      });
    });

    // Format for Recharts
    const data = Object.keys(datesMap).map((date) => ({
      date,
      'Avg Risk Score (%)': parseFloat((datesMap[date].sum / datesMap[date].count).toFixed(1))
    }));

    // Sort by simple date aggregation or return
    return data.slice(-10); // Show last 10 dates
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
  const lineData = getLineData();
  const criticalPatients = getCriticalPatients();

  return (
    <div className="doctor-dashboard-container">
      <div className="bg-gradient-radial"></div>

      {/* Greeting Banner */}
      <div className="dashboard-header glass-card">
        <div className="header-greeting">
          <span className="welcome-tag">DOCTOR CLINICAL PANEL</span>
          <h2>Clinical Management Portal</h2>
          <p>Review population risk statistics, analyze trends, and manage critical care profiles.</p>
        </div>
      </div>

      {/* Main Grid */}
      <div className="dashboard-grid">
        {/* KPI Panel Cards */}
        <div className="glass-card kpi-card">
          <Users className="kpi-icon blue" size={24} />
          <div className="kpi-info">
            <span className="kpi-val">{patients.length}</span>
            <span className="kpi-label">Registered Patients</span>
          </div>
        </div>

        <div className="glass-card kpi-card">
          <AlertTriangle className="kpi-icon red" size={24} />
          <div className="kpi-info">
            <span className="kpi-val">{criticalPatients.length}</span>
            <span className="kpi-label">Critical Patients</span>
          </div>
        </div>

        {/* Recharts Pie Chart (Risk Distribution) */}
        <div className="glass-card grid-card chart-container-card">
          <h3>Risk Severity Distribution</h3>
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
                    innerRadius={50}
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
                      background: 'rgba(15, 23, 42, 0.95)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px',
                      color: 'white'
                    }}
                  />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Recharts Line Chart (Risk Trend over Time) */}
        <div className="glass-card grid-card chart-container-card">
          <h3>Population Risk Trend</h3>
          {lineData.length === 0 ? (
            <p className="empty-text">No assessment timeline recorded.</p>
          ) : (
            <div className="recharts-wrapper">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={lineData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis stroke="#94a3b8" fontSize={10} dataKey="date" />
                  <YAxis stroke="#94a3b8" fontSize={10} />
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(15, 23, 42, 0.95)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px',
                      color: 'white'
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="Avg Risk Score (%)"
                    stroke="#6366f1"
                    strokeWidth={3}
                    dot={{ stroke: '#8b5cf6', strokeWidth: 2, r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Critical Alerts List */}
        <div className="glass-card grid-card critical-list-card">
          <div className="card-title-row">
            <AlertTriangle size={18} className="card-icon red" />
            <h3>High Risk Critical Patient Alerts</h3>
          </div>
          <div className="list-body">
            {criticalPatients.length === 0 ? (
              <div className="no-alerts-state">
                <ShieldCheck size={32} className="alert-success-icon" />
                <p>All patient risk parameters are within acceptable thresholds.</p>
              </div>
            ) : (
              criticalPatients.map(({ patient: p, risk_score, glucose, bmi }) => (
                <div key={p.id} className="critical-alert-item">
                  <div className="alert-meta">
                    <span className="alert-name">{p.user.name}</span>
                    <span className="alert-details">Glucose: {glucose} mg/dL | BMI: {bmi}</span>
                  </div>
                  <div className="alert-action-row">
                    <span className="badge badge-danger">{risk_score}% Risk</span>
                    <button onClick={() => navigate(`/patients`, { state: { selectedPatientId: p.id } })} className="alert-btn">
                      <ArrowRight size={16} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Assigned Patients List Panel */}
        <div className="glass-card grid-card assigned-list-card">
          <div className="card-title-row">
            <Users size={18} className="card-icon" />
            <h3>Registered Patients Roster</h3>
          </div>
          <div className="list-body">
            {patients.length === 0 ? (
              <p className="empty-text">No patients registered in the system.</p>
            ) : (
              patients.map((p) => {
                const preds = predictionsMap[p.id] || [];
                const latest = preds.length > 0 ? preds[preds.length - 1] : null;
                return (
                  <div key={p.id} className="roster-item" onClick={() => navigate('/patients', { state: { selectedPatientId: p.id } })}>
                    <div className="roster-meta">
                      <span className="roster-name">{p.user.name}</span>
                      <span className="roster-sub">Age: {p.age || 'N/A'} | Blood Group: {p.blood_group || 'N/A'}</span>
                    </div>
                    <div className="roster-score-row">
                      {latest ? (
                        <span className={`badge ${latest.risk_score >= 50 ? 'badge-danger' : 'badge-success'}`}>
                          {latest.risk_score}% Risk
                        </span>
                      ) : (
                        <span className="badge badge-warning">No Assessment</span>
                      )}
                      <ArrowRight size={14} className="roster-arrow" />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
