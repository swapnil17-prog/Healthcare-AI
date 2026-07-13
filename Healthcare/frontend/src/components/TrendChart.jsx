import React from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ReferenceLine } from 'recharts';

export default function TrendChart({ predictions = [], forecast = null, type = 'diabetes' }) {
  if (!predictions || !Array.isArray(predictions) || predictions.length === 0) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: 'hsl(var(--text-muted))' }}>
        <p>No screening history available yet to calculate trends.</p>
      </div>
    );
  }

  // Format historical data
  const historicalData = predictions
    .map((p) => {
      const date = new Date(p.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' });
      if (type === 'heart') {
        return {
          date,
          'Risk Score (%)': p.risk_score,
          'Systolic BP': p.ap_hi || 0,
          'Diastolic BP': p.ap_lo || 0,
          'BMI': p.bmi_calculated || 0,
          projected_risk: null,
        };
      } else {
        return {
          date,
          'Risk Score (%)': p.risk_score,
          'Glucose (mg/dL)': p.input_features?.glucose || 0,
          'BMI': p.input_features?.bmi || 0,
          projected_risk: null,
        };
      }
    })
    .slice(-10); // Show last 10 screenings

  let data = [...historicalData];

  // Merge projected scores if available
  if (type === 'diabetes' && forecast && forecast.projected_scores && forecast.projected_scores.length > 0) {
    const projectedData = forecast.projected_scores.map((item) => ({
      date: new Date(item.date).toLocaleDateString([], { month: 'short', day: 'numeric' }),
      'Risk Score (%)': null,
      'Glucose (mg/dL)': null,
      'BMI': null,
      projected_risk: item.risk_score,
    }));
    data = [...data, ...projectedData];
  }

  // Use the last historical prediction date as the "Today" vertical reference anchor
  const todayFormatted = historicalData.length > 0
    ? historicalData[historicalData.length - 1].date
    : new Date().toLocaleDateString([], { month: 'short', day: 'numeric' });

  return (
    <div className="recharts-wrapper" style={{ width: '100%', height: '280px', marginTop: '16px' }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" />
          <XAxis stroke="#94a3b8" fontSize={11} dataKey="date" tickLine={false} />
          <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
          <Tooltip
            contentStyle={{
              background: 'rgba(15, 23, 42, 0.95)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '12px',
              color: 'white',
              boxShadow: 'var(--shadow-lg)',
              fontFamily: 'var(--font-body)',
              fontSize: '12px'
            }}
          />
          <Legend 
            verticalAlign="top" 
            height={36} 
            iconType="circle" 
            wrapperStyle={{ 
              fontSize: '11px', 
              fontFamily: 'var(--font-title)',
              color: '#94a3b8'
            }} 
          />
          <Line
            type="monotone"
            dataKey="Risk Score (%)"
            stroke="#6366f1"
            strokeWidth={3}
            dot={{ stroke: '#8b5cf6', strokeWidth: 2, r: 4 }}
            activeDot={{ r: 6 }}
            isAnimationActive={true}
            animationDuration={1000}
          />
          {type === 'diabetes' && (
            <Line
              type="monotone"
              dataKey="projected_risk"
              stroke="#EE5D50"
              strokeWidth={2}
              strokeDasharray="6 3"
              dot={{ r: 4, fill: "#EE5D50" }}
              name="Projected Risk"
              connectNulls={false}
            />
          )}
          {type === 'diabetes' && (
            <Line
              type="monotone"
              dataKey="Glucose (mg/dL)"
              stroke="#14b8a6"
              strokeWidth={2}
              dot={{ stroke: '#0d9488', strokeWidth: 1, r: 3 }}
              isAnimationActive={true}
              animationDuration={1000}
            />
          )}
          {type === 'heart' && (
            <>
              <Line
                type="monotone"
                dataKey="Systolic BP"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={{ stroke: '#d97706', strokeWidth: 1, r: 3 }}
                isAnimationActive={true}
                animationDuration={1000}
              />
              <Line
                type="monotone"
                dataKey="Diastolic BP"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ stroke: '#059669', strokeWidth: 1, r: 3 }}
                isAnimationActive={true}
                animationDuration={1000}
              />
            </>
          )}
          <Line
            type="monotone"
            dataKey="BMI"
            stroke="#ec4899"
            strokeWidth={2}
            dot={{ stroke: '#db2777', strokeWidth: 1, r: 3 }}
            isAnimationActive={true}
            animationDuration={1000}
          />
          <ReferenceLine
            x={todayFormatted}
            stroke="#A3AED0"
            strokeDasharray="4 2"
            label={{ value: "Today", fill: "#A3AED0", fontSize: 11 }}
          />
          <ReferenceLine
            y={75}
            stroke="#EE5D50"
            strokeDasharray="4 2"
            label={{ 
              value: "High Risk Threshold", 
              fill: "#EE5D50", 
              fontSize: 11 
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
