import React from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';

export default function TrendChart({ predictions = [] }) {
  if (!predictions || !Array.isArray(predictions) || predictions.length === 0) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: 'hsl(var(--text-muted))' }}>
        <p>No screening history available yet to calculate trends.</p>
      </div>
    );
  }

  // Format data for Recharts
  const data = predictions
    .map((p) => ({
      date: new Date(p.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' }),
      'Risk Score (%)': p.risk_score,
      'Glucose (mg/dL)': p.input_features?.glucose || 0,
      'BMI': p.input_features?.bmi || 0,
    }))
    .slice(-10); // Show last 10 screenings

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
          <Line
            type="monotone"
            dataKey="Glucose (mg/dL)"
            stroke="#14b8a6"
            strokeWidth={2}
            dot={{ stroke: '#0d9488', strokeWidth: 1, r: 3 }}
            isAnimationActive={true}
            animationDuration={1000}
          />
          <Line
            type="monotone"
            dataKey="BMI"
            stroke="#ec4899"
            strokeWidth={2}
            dot={{ stroke: '#db2777', strokeWidth: 1, r: 3 }}
            isAnimationActive={true}
            animationDuration={1000}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
