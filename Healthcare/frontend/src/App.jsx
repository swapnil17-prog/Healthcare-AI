import React from 'react';
import { Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { Activity, LogOut, LayoutDashboard, Users, ClipboardCheck, Calendar } from 'lucide-react';
import { logout } from './redux/authSlice';

// Import pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Patients from './pages/Patients';
import Predictions from './pages/Predictions';
import Scheduling from './pages/Scheduling';

export default function App() {
  const { isAuthenticated, user } = useSelector((state) => state.auth);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const handleLogout = () => {
    dispatch(logout());
    navigate('/');
  };

  // If not authenticated, render Login Page
  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <div className="app-container">
      {/* Dynamic radial gradient backgrounds */}
      <div className="bg-gradient-radial"></div>

      {/* Main Header / Navigation */}
      <header className="main-header glass-card">
        <div className="header-brand" onClick={() => navigate('/dashboard')}>
          <Activity className="brand-logo-icon" size={24} />
          <h1>Healthcare AI</h1>
        </div>

        <nav className="header-nav">
          <Link to="/dashboard" className="nav-link">
            <LayoutDashboard size={16} />
            <span>Dashboard</span>
          </Link>

          {/* Roster tab only available for doctor and admin roles */}
          {user?.role !== 'patient' && (
            <Link to="/patients" className="nav-link">
              <Users size={16} />
              <span>Patients</span>
            </Link>
          )}

          {user?.role !== 'patient' && (
            <Link to="/scheduling" className="nav-link">
              <Calendar size={16} />
              <span>Scheduling</span>
            </Link>
          )}

          <Link to="/predictions" className="nav-link">
            <ClipboardCheck size={16} />
            <span>Screen Risk</span>
          </Link>
        </nav>

        <div className="header-profile-block">
          <div className="profile-info">
            <span className="profile-name">{user?.name}</span>
            <span className="profile-role badge badge-success">{user?.role}</span>
          </div>
          <button onClick={handleLogout} className="btn btn-secondary logout-btn">
            <LogOut size={16} />
            <span>Logout</span>
          </button>
        </div>
      </header>

      {/* Main Content Render */}
      <main className="main-content">
        <Routes>
          <Route path="/dashboard" element={<Dashboard />} />
          {user?.role !== 'patient' && (
            <Route path="/patients" element={<Patients />} />
          )}
          {user?.role !== 'patient' && (
            <Route path="/scheduling" element={<Scheduling />} />
          )}
          <Route path="/predictions" element={<Predictions />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>

      {/* Simple Footer */}
      <footer className="main-footer">
        <p>© 2026 Healthcare AI - Portfolio Prototype. Built with React, FastAPI, scikit-learn & Claude. Synthetic data only.</p>
      </footer>
    </div>
  );
}
