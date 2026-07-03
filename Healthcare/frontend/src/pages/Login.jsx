import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Activity, Mail, Lock, User as UserIcon, ShieldAlert, Shield } from 'lucide-react';
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
    <div className="login-split-container">
      {/* LEFT PANEL: Branding & Premium AI Illustration */}
      <motion.div 
        initial={{ opacity: 0, x: -50 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="login-left-panel"
      >
        <div className="brand-header-inline">
          <Activity size={32} className="brand-logo-glow" />
          <h2>HealthCare AI</h2>
        </div>

        <div className="illustration-wrapper">
          {/* Custom Modern Styled AI Robot / Medical Pulse Vector with floating animation */}
          <motion.div 
            animate={{ y: [0, -12, 0] }}
            transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
            className="premium-robot-graphic"
          >
            <div className="glow-backdrop"></div>
            <div className="robot-head">
              <div className="robot-eyes">
                <div className="eye"></div>
                <div className="eye"></div>
              </div>
            </div>
            <div className="robot-body">
              <div className="medical-cross-shield">
                <Activity size={28} className="pulse-heart" />
              </div>
            </div>
            <div className="pulse-rings">
              <div className="ring ring-1"></div>
              <div className="ring ring-2"></div>
              <div className="ring ring-3"></div>
            </div>
          </motion.div>
        </div>

        <div className="left-panel-content">
          <h3>Your Health, Our Priority</h3>
          <p>
            AI-powered insights. Doctor-guided care. Better health decisions, every day. Secure and private clinical statistics at your fingertips.
          </p>
        </div>

        <div className="left-panel-footer">
          <p>© 2026 Healthcare AI Inc. All rights reserved.</p>
        </div>
      </motion.div>

      {/* RIGHT PANEL: Form Credentials */}
      <motion.div 
        initial={{ opacity: 0, x: 50 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
        className="login-right-panel"
      >
        <motion.div layout className="login-form-card">
          <div className="login-form-header">
            <h3>{isRegister ? 'Welcome to Healthcare AI' : 'Welcome Back'}</h3>
            <p className="login-subtitle">
              {isRegister ? 'Register your account to begin health risk calculation' : 'Login for your account'}
            </p>
          </div>

          <AnimatePresence>
            {(localError || error) && (
              <motion.div 
                className="login-error-alert"
                initial={{ opacity: 0, height: 0, y: -10 }}
                animate={{ opacity: 1, height: 'auto', y: 0 }}
                exit={{ opacity: 0, height: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                style={{ overflow: 'hidden' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ShieldAlert size={18} className="error-alert-icon" />
                  <span>{localError || error}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleSubmit} className="login-form">
            <motion.div
              variants={{
                hidden: { opacity: 0 },
                show: {
                  opacity: 1,
                  transition: {
                    staggerChildren: 0.05
                  }
                }
              }}
              initial="hidden"
              animate="show"
              style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}
            >
              <AnimatePresence mode="popLayout">
                {isRegister && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0, y: -10 }}
                    animate={{ opacity: 1, height: 'auto', y: 0 }}
                    exit={{ opacity: 0, height: 0, y: -10 }}
                    transition={{ duration: 0.25 }}
                    style={{ overflow: 'hidden' }}
                    className="form-group"
                  >
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
                  </motion.div>
                )}
              </AnimatePresence>

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

              <AnimatePresence mode="popLayout">
                {isRegister && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0, y: -10 }}
                    animate={{ opacity: 1, height: 'auto', y: 0 }}
                    exit={{ opacity: 0, height: 0, y: -10 }}
                    transition={{ duration: 0.25 }}
                    style={{ overflow: 'hidden' }}
                    className="form-group"
                  >
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
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.button 
                whileHover={{ scale: 1.01 }} 
                whileTap={{ scale: 0.99 }}
                type="submit" 
                className="btn btn-primary login-submit-btn" 
                disabled={loading}
              >
                {loading ? 'Processing...' : isRegister ? 'Register & Login' : 'Login'}
              </motion.button>
            </motion.div>
          </form>

          <div className="login-toggle-footer">
            <button type="button" onClick={handleToggle} className="login-toggle-btn">
              {isRegister ? 'Already have an account? Sign In' : "Don't have an account? Register"}
            </button>
          </div>
        </motion.div>

        {/* HIPAA Compliant Shield badge */}
        <div className="hipaa-badge">
          <Shield size={16} className="hipaa-icon" />
          <span>HIPAA Compliant - Your data is safe and encrypted</span>
        </div>
      </motion.div>
    </div>
  );
}
