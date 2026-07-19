import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, Link, useNavigate, useLocation } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { AnimatePresence, motion } from 'framer-motion';
import { 
  Activity, 
  LogOut, 
  LayoutDashboard, 
  Users, 
  ClipboardCheck, 
  Calendar, 
  FileText, 
  MessageSquare, 
  User as UserIcon,
  Menu,
  X,
  Mail,
  Lock,
  ShieldCheck,
  Bell,
  Crown
} from 'lucide-react';
import { logout } from './redux/authSlice';
import { 
  apiSlice,
  useGetPatientsQuery,
  useUpdatePatientMutation,
  useGetHealthNudgesQuery,
  useMarkHealthNudgeReadMutation,
  useDismissHealthNudgeMutation
} from './services/apiSlice';

// Import pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Patients from './pages/Patients';
import Predictions from './pages/Predictions';
import Scheduling from './pages/Scheduling';
import PatientRecords from './pages/PatientRecords';
import Pricing from './pages/Pricing';

export default function App() {
  const { isAuthenticated, user } = useSelector((state) => state.auth);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  // Nudges queries
  const { data: nudgesList = [] } = useGetHealthNudgesQuery(
    { status: 'unread' },
    { skip: !isAuthenticated || user?.role !== 'patient' }
  );
  
  const [markRead] = useMarkHealthNudgeReadMutation();
  const [dismissNudge] = useDismissHealthNudgeMutation();

  const [bellDropdownOpen, setBellDropdownOpen] = useState(false);
  const unreadCount = nudgesList.length;

  // Queries
  const { data: patientsList = [] } = useGetPatientsQuery(undefined, { skip: !isAuthenticated });
  const patient = user?.role === 'patient' ? patientsList?.[0] : null;
  const [updatePatient] = useUpdatePatientMutation();

  // Profile Edit fields
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Prefill state values when opening the profile settings dialog
  useEffect(() => {
    if (showProfile) {
      setProfileName(user?.name || '');
      setProfileEmail(user?.email || '');
      setProfilePhone(patient?.phone || '');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }
  }, [showProfile, user, patient]);

  const handleLogout = () => {
    dispatch(logout());
    dispatch(apiSlice.util.resetApiState());
    navigate('/');
    setMobileMenuOpen(false);
  };

  const openChatWidget = () => {
    window.dispatchEvent(new CustomEvent('open-chat'));
    setMobileMenuOpen(false);
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (newPassword && newPassword !== confirmPassword) {
      alert("New passwords do not match!");
      return;
    }
    
    try {
      if (user?.role === 'patient' && patient) {
        await updatePatient({
          id: patient.id,
          data: {
            phone: profilePhone
          }
        }).unwrap();
      }
      alert("Profile and password settings updated successfully! (Simulated password change)");
      setShowProfile(false);
    } catch (err) {
      alert("Failed to update profile: " + (err.data?.detail || err.message));
    }
  };

  // If not authenticated, render Login Page
  if (!isAuthenticated) {
    return <Login />;
  }

  const navItems = [
    {
      name: 'Dashboard',
      path: '/dashboard',
      icon: LayoutDashboard,
      roles: ['doctor', 'admin', 'patient']
    },
    {
      name: 'Health Overview',
      path: '/dashboard',
      icon: Activity,
      roles: ['patient', 'doctor', 'admin']
    },
    {
      name: 'Predictions',
      path: '/predictions',
      icon: ClipboardCheck,
      roles: ['patient', 'doctor', 'admin']
    },
    {
      name: 'Medical History',
      path: user?.role === 'patient' ? '/records' : '/patients',
      icon: FileText,
      roles: ['patient', 'doctor', 'admin']
    },
    {
      name: 'Appointments',
      path: user?.role === 'patient' ? '/records' : '/scheduling',
      icon: Calendar,
      roles: ['patient', 'doctor', 'admin']
    },
    {
      name: 'Reports',
      path: user?.role === 'patient' ? '/records' : '/patients',
      icon: ClipboardCheck,
      roles: ['patient', 'doctor', 'admin']
    },
    {
      name: 'Admin Panel',
      path: '/dashboard',
      icon: ShieldCheck,
      roles: ['admin']
    }
  ];

  const sidebarContent = (
    <>
      <div className="sidebar-top">
        {/* Brand Logo */}
        <div className="sidebar-logo" onClick={() => { navigate('/dashboard'); setMobileMenuOpen(false); }} style={{ cursor: 'pointer' }}>
          <Activity className="brand-logo-icon" size={24} style={{ color: 'var(--accent)' }} />
          <h1>Healthcare AI</h1>
        </div>

        {/* Sidebar Nav */}
        <nav className="sidebar-nav">
          {navItems
            .filter(item => item.roles.includes(user?.role))
            .map((item, idx) => {
              const isItemActive = location.pathname === item.path;
              return (
                <Link
                  key={idx}
                  to={item.path}
                  className={`sidebar-link ${isItemActive ? 'active' : ''}`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <item.icon size={18} />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          
          {/* AI Assistant Navigation trigger */}
          {user?.role === 'patient' && (
            <button
              onClick={openChatWidget}
              className="sidebar-link"
              style={{ background: 'transparent', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer' }}
            >
              <MessageSquare size={18} />
              <span>AI Assistant</span>
            </button>
          )}

          {/* Subscription & Pricing Link */}
          <Link
            to="/pricing"
            className={`sidebar-link ${location.pathname === '/pricing' ? 'active' : ''}`}
            onClick={() => setMobileMenuOpen(false)}
          >
            <Crown size={18} />
            <span>Pricing & Plans</span>
          </Link>

          {/* Profile Settings - triggers Profile Modal */}
          <button
            onClick={() => { setShowProfile(true); setMobileMenuOpen(false); }}
            className="sidebar-link"
            style={{ background: 'transparent', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer' }}
          >
            <UserIcon size={18} />
            <span>Profile Settings</span>
          </button>
        </nav>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Help Card */}
        {user?.role === 'patient' && (
          <div className="sidebar-help-card">
            <h4>Need Help?</h4>
            <p>Our AI Assistant is here to help with your medical records & prediction data.</p>
            <button 
              type="button" 
              onClick={openChatWidget}
              className="btn btn-primary" 
              style={{ width: '100%', padding: '8px 16px', fontSize: '12px' }}
            >
              Ask Now
            </button>
          </div>
        )}

        {/* Profile info block & Logout */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: 'rgba(91, 107, 248, 0.1)', padding: '8px', borderRadius: '50%', color: 'var(--accent)' }}>
              <UserIcon size={18} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{user?.name}</span>
              <span className={`badge badge-success`} style={{ alignSelf: 'flex-start', fontSize: '9px', padding: '2px 6px', marginTop: '2px' }}>{user?.role}</span>
            </div>
          </div>
          <button 
            onClick={handleLogout} 
            className="btn btn-secondary" 
            style={{ width: '100%', padding: '10px', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
          >
            <LogOut size={16} />
            <span>Logout</span>
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="app-container">
      {/* Background gradients */}
      <div className="bg-gradient-radial"></div>

      {/* Floating Notification Bell Top Right */}
      {user?.role === 'patient' && (
        <>
          {bellDropdownOpen && (
            <div 
              style={{ position: 'fixed', inset: 0, zIndex: 98 }} 
              onClick={() => setBellDropdownOpen(false)} 
            />
          )}
          <div className="notification-bell-wrapper" style={{ position: 'fixed', top: '20px', right: '32px', zIndex: 100 }}>
            <button 
              onClick={() => setBellDropdownOpen(!bellDropdownOpen)}
              style={{ 
                background: 'var(--bg-card)', 
                border: '1px solid var(--border)', 
                borderRadius: '50%', 
                width: '40px', 
                height: '40px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                position: 'relative', 
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(27, 37, 89, 0.08)',
                color: 'var(--text-primary)'
              }}
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span style={{ 
                  position: 'absolute', 
                  top: '-2px', 
                  right: '-2px', 
                  background: 'var(--danger)', 
                  color: 'white', 
                  fontSize: '9px', 
                  fontWeight: '700', 
                  borderRadius: '50%', 
                  width: '18px', 
                  height: '18px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  border: '2px solid var(--bg-card)'
                }}>
                  {unreadCount}
                </span>
              )}
            </button>

            <AnimatePresence>
              {bellDropdownOpen && (
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  style={{ 
                    position: 'absolute', 
                    top: '48px', 
                    right: 0, 
                    width: '320px', 
                    background: 'var(--bg-card)', 
                    border: '1px solid var(--border)', 
                    borderRadius: '12px', 
                    boxShadow: '0 10px 25px -5px rgba(27, 37, 89, 0.15), 0 8px 10px -6px rgba(27, 37, 89, 0.15)',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    maxHeight: '400px',
                    overflowY: 'auto'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>Health Notifications</h4>
                    {unreadCount > 0 && <span style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: '600' }}>{unreadCount} new</span>}
                  </div>

                  {nudgesList.length === 0 ? (
                    <p style={{ margin: 0, padding: '16px 0', textAlign: 'center', fontSize: '12px', color: 'hsl(var(--text-muted))' }}>
                      All clear! No pending nudges.
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {nudgesList.map((nudge) => (
                        <div 
                          key={nudge.id} 
                          style={{ 
                            padding: '10px', 
                            background: 'rgba(255, 255, 255, 0.02)', 
                            border: '1px solid var(--border)', 
                            borderRadius: '8px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                            <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)' }}>{nudge.title}</span>
                            <span className={`badge ${
                              nudge.priority === 'high' ? 'badge-warning' :
                              nudge.priority === 'medium' ? 'badge-info' : 'badge-success'
                            }`} style={{ fontSize: '9px', padding: '2px 6px' }}>
                              {nudge.priority}
                            </span>
                          </div>
                          <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>{nudge.message}</p>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                            <span style={{ fontSize: '9px', color: 'hsl(var(--text-muted))' }}>
                              {new Date(nudge.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                            </span>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button 
                                onClick={() => markRead(nudge.id)}
                                style={{ background: 'transparent', border: 'none', color: 'var(--accent)', fontSize: '10px', fontWeight: '600', cursor: 'pointer', padding: 0 }}
                              >
                                Mark read
                              </button>
                              <button 
                                onClick={() => dismissNudge(nudge.id)}
                                style={{ background: 'transparent', border: 'none', color: 'hsl(var(--text-muted))', fontSize: '10px', cursor: 'pointer', padding: 0 }}
                              >
                                Dismiss
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </>
      )}
      
      {/* Explicit sidebar wrapper */}
      <div className="sidebar-desktop-wrapper" style={{ display: 'block' }}>
        <div className="sidebar-container" style={{ height: '100vh', position: 'sticky', top: 0 }}>
          {sidebarContent}
        </div>
      </div>

      {/* Mobile top navigation header */}
      <div className="mobile-header" style={{ display: 'none', width: '100%', padding: '14px 20px', background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 100 }}>
        <div className="sidebar-logo" onClick={() => navigate('/dashboard')}>
          <Activity className="brand-logo-icon" size={22} style={{ color: 'var(--accent)' }} />
          <h1 style={{ fontSize: '17px' }}>Healthcare AI</h1>
        </div>
        <button 
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)} 
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-primary)' }}
        >
          {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(27, 37, 89, 0.4)', zIndex: 99, display: 'flex' }}
            onClick={() => setMobileMenuOpen(false)}
          >
            <motion.div 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'tween', duration: 0.25 }}
              style={{ width: '280px', height: '100%', background: 'var(--bg-card)', display: 'flex', flexDirection: 'column', padding: '24px 20px', justifyContent: 'space-between' }}
              onClick={(e) => e.stopPropagation()}
            >
              {sidebarContent}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scrollable Main Content Viewport */}
      <main className="main-content" style={{ flexGrow: 1, minWidth: 0 }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            style={{ width: '100%', height: '100%' }}
          >
            <Routes location={location}>
              <Route path="/dashboard" element={<Dashboard />} />
              {user?.role !== 'patient' && (
                <Route path="/patients" element={<Patients />} />
              )}
              {user?.role !== 'patient' && (
                <Route path="/scheduling" element={<Scheduling />} />
              )}
              {user?.role === 'patient' && (
                <Route path="/records" element={<PatientRecords />} />
              )}
              <Route path="/predictions" element={<Predictions />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Profile Settings Modal Overlay */}
      <AnimatePresence>
        {showProfile && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="modal-overlay"
            onClick={() => setShowProfile(false)}
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="modal-card"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <h3>Profile Settings</h3>
                <button className="modal-close-btn" onClick={() => setShowProfile(false)}>
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleSaveProfile} className="modal-form">
                <div className="form-group">
                  <label className="input-label">Username (Full Name)</label>
                  <div className="input-icon-wrapper">
                    <UserIcon className="input-icon" size={16} />
                    <input 
                      type="text" 
                      className="input-field with-icon" 
                      value={profileName} 
                      onChange={(e) => setProfileName(e.target.value)} 
                      required 
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="input-label">Email ID</label>
                  <div className="input-icon-wrapper">
                    <Mail className="input-icon" size={16} />
                    <input 
                      type="email" 
                      className="input-field with-icon" 
                      value={profileEmail} 
                      onChange={(e) => setProfileEmail(e.target.value)} 
                      required 
                      disabled
                    />
                  </div>
                  <span className="field-hint">Email ID is linked to account verification and cannot be changed.</span>
                </div>
                <div className="form-group">
                  <label className="input-label">Phone Number</label>
                  <div className="input-icon-wrapper">
                    <UserIcon className="input-icon" size={16} />
                    <input 
                      type="text" 
                      className="input-field with-icon" 
                      value={profilePhone} 
                      onChange={(e) => setProfilePhone(e.target.value)} 
                      placeholder="+1 (555) 019-9000"
                    />
                  </div>
                </div>
                
                <div className="modal-form-divider">
                  <span>Change Password</span>
                </div>

                <div className="form-group">
                  <label className="input-label">Current Password</label>
                  <div className="input-icon-wrapper">
                    <Lock className="input-icon" size={16} />
                    <input 
                      type="password" 
                      className="input-field with-icon" 
                      value={currentPassword} 
                      onChange={(e) => setCurrentPassword(e.target.value)} 
                      placeholder="••••••••"
                    />
                  </div>
                </div>
                <div className="form-row-2">
                  <div className="form-group">
                    <label className="input-label">New Password</label>
                    <div className="input-icon-wrapper">
                      <Lock className="input-icon" size={16} />
                      <input 
                        type="password" 
                        className="input-field with-icon" 
                        value={newPassword} 
                        onChange={(e) => setNewPassword(e.target.value)} 
                        placeholder="••••••••"
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="input-label">Confirm Password</label>
                    <div className="input-icon-wrapper">
                      <Lock className="input-icon" size={16} />
                      <input 
                        type="password" 
                        className="input-field with-icon" 
                        value={confirmPassword} 
                        onChange={(e) => setConfirmPassword(e.target.value)} 
                        placeholder="••••••••"
                      />
                    </div>
                  </div>
                </div>

                <div className="modal-actions-row">
                  <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Save Changes</button>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowProfile(false)}>Cancel</button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile/Desktop CSS media overrides directly injected */}
      <style>{`
        .sidebar-desktop-wrapper {
          display: block;
        }
        .mobile-header {
          display: none;
        }
        @media (max-width: 1024px) {
          .app-container {
            flex-direction: column;
          }
          .sidebar-desktop-wrapper {
            display: none !important;
          }
          .mobile-header {
            display: flex !important;
          }
          .main-content {
            padding: 20px 16px;
          }
        }
        /* Modal Overlay */
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(27, 37, 89, 0.4);
          backdrop-filter: blur(4px);
          z-index: 1100;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        /* Modal Card */
        .modal-card {
          background-color: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-lg);
          width: 100%;
          max-width: 500px;
          display: flex;
          flex-direction: column;
          animation: slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .modal-header {
          padding: 20px 24px;
          border-bottom: 1px solid var(--border);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .modal-header h3 {
          font-size: 18px;
          font-weight: 800;
          color: var(--text-primary);
        }
        .modal-close-btn {
          background: transparent;
          border: none;
          cursor: pointer;
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 6px;
          border-radius: var(--radius-sm);
          transition: all var(--transition-fast);
        }
        .modal-close-btn:hover {
          color: var(--text-primary);
          background-color: var(--bg-primary);
        }
        .modal-form {
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .modal-form-divider {
          display: flex;
          align-items: center;
          margin: 10px 0;
        }
        .modal-form-divider::before, .modal-form-divider::after {
          content: '';
          flex: 1;
          border-bottom: 1px solid var(--border);
        }
        .modal-form-divider span {
          padding: 0 12px;
          font-size: 11px;
          font-weight: 700;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .modal-actions-row {
          display: flex;
          gap: 12px;
          margin-top: 8px;
        }
        .field-hint {
          font-size: 11.5px;
          color: var(--text-secondary);
          margin-top: 4px;
        }
      `}</style>
    </div>
  );
}
