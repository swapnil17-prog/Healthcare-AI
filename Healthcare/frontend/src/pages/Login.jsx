import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Activity, Mail, Lock, User as UserIcon, ShieldAlert } from 'lucide-react';
import { loginStart, loginSuccess, loginFailure, clearError } from '../redux/authSlice';
import { api } from '../services/api';
import './Login.css';

export default function Login() {
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('patient');
  const [localError, setLocalError] = useState('');

  const { loading, error } = useSelector((state) => state.auth);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const handleToggle = () => {
    setIsRegister(!isRegister);
    setLocalError('');
    dispatch(clearError());
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');
    dispatch(loginStart());

    try {
      if (isRegister) {
        // Register first
        await api.register(name, email, password, role);
      }

      // Log in
      const authData = await api.login(email, password);
      
      // Load full user details
      localStorage.setItem('token', authData.access_token); // Set temp token for getMe call
      const meData = await api.getMe();

      dispatch(loginSuccess({
        token: authData.access_token,
        user: meData
      }));

      navigate('/dashboard');
    } catch (err) {
      const errMsg = err.message || 'Authentication failed';
      setLocalError(errMsg);
      dispatch(loginFailure(errMsg));
    }
  };

  return (
    <div className="login-page-container">
      <div className="bg-gradient-radial"></div>

      <div className="login-logo-container">
        <Activity className="login-logo-icon" size={36} />
        <h2>Healthcare AI</h2>
      </div>

      <div className="glass-card login-card">
        <h3>{isRegister ? 'Create Account' : 'Welcome Back'}</h3>
        <p className="login-subtitle">
          {isRegister ? 'Register as a doctor or patient to begin' : 'Sign in to access your risk panel'}
        </p>

        {(localError || error) && (
          <div className="login-error-alert">
            <ShieldAlert size={18} className="error-alert-icon" />
            <span>{localError || error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          {isRegister && (
            <div className="form-group">
              <label className="input-label">Full Name</label>
              <div className="input-icon-wrapper">
                <UserIcon className="input-icon" size={16} />
                <input
                  type="text"
                  required
                  className="input-field with-icon"
                  placeholder="Dr. John Watson"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="form-group">
            <label className="input-label">Email Address</label>
            <div className="input-icon-wrapper">
              <Mail className="input-icon" size={16} />
              <input
                type="email"
                required
                className="input-field with-icon"
                placeholder="email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="input-label">Password</label>
            <div className="input-icon-wrapper">
              <Lock className="input-icon" size={16} />
              <input
                type="password"
                required
                className="input-field with-icon"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {isRegister && (
            <div className="form-group">
              <label className="input-label">I am a</label>
              <div className="role-selector-container">
                <button
                  type="button"
                  className={`role-btn ${role === 'patient' ? 'active' : ''}`}
                  onClick={() => setRole('patient')}
                >
                  Patient
                </button>
                <button
                  type="button"
                  className={`role-btn ${role === 'doctor' ? 'active' : ''}`}
                  onClick={() => setRole('doctor')}
                >
                  Doctor
                </button>
              </div>
            </div>
          )}

          <button type="submit" className="btn btn-primary login-submit-btn" disabled={loading}>
            {loading ? 'Processing...' : isRegister ? 'Register & Login' : 'Login'}
          </button>
        </form>

        <div className="login-toggle-footer">
          <button type="button" onClick={handleToggle} className="login-toggle-btn">
            {isRegister ? 'Already have an account? Sign In' : "Don't have an account? Register"}
          </button>
        </div>
      </div>
    </div>
  );
}
