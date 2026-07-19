import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { 
  Users, 
  Stethoscope, 
  Activity, 
  AlertTriangle, 
  Calendar, 
  FileText, 
  Search, 
  Lock, 
  Unlock, 
  Trash2, 
  UserPlus, 
  CheckCircle, 
  ShieldAlert,
  ArrowRight,
  Crown
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  useGetAdminStatsQuery,
  useGetAdminUsersQuery,
  useCreateAdminUserMutation,
  useToggleUserStatusMutation,
  useDeleteUserMutation,
  useGetAssignmentsQuery,
  useCreateAssignmentMutation,
  useGetAdminSubscriptionsQuery,
  useAdminUpgradeSubscriptionMutation,
  useAdminCancelSubscriptionMutation
} from '../services/apiSlice';
import './AdminDashboard.css';

export default function AdminDashboard() {
  const { user: currentAdmin } = useSelector((state) => state.auth);
  const [activeTab, setActiveTab] = useState('patient'); // 'patient', 'doctor', or 'subscription'
  const [searchTerm, setSearchTerm] = useState('');
  
  // Subscription Plan Modal state
  const [planModal, setPlanModal] = useState({ isOpen: false, userId: null, userName: '', userRole: '', currentTier: '' });
  const [targetTier, setTargetTier] = useState('');

  // Create User state
  const [createForm, setCreateForm] = useState({ full_name: '', email: '', password: '', role: 'patient' });
  const [createError, setCreateError] = useState('');
  
  // Assign Patient state
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  
  // Toast state
  const [toast, setToast] = useState({ message: '', type: 'success', visible: false });
  
  // Confirmation Modal state
  const [modal, setModal] = useState({ isOpen: false, type: '', userId: null, message: '', onConfirm: null });

  // RTK Query API Hooks
  const { data: stats, isLoading: isStatsLoading } = useGetAdminStatsQuery();
  const { data: users = [], isLoading: isUsersLoading, refetch: refetchUsers } = useGetAdminUsersQuery({ role: activeTab === 'subscription' ? undefined : activeTab });
  const { data: subData, isLoading: isSubsLoading, refetch: refetchSubs } = useGetAdminSubscriptionsQuery({ search: searchTerm }, { skip: activeTab !== 'subscription' });
  const { data: assignments = [], isLoading: isAssignmentsLoading } = useGetAssignmentsQuery();
  const { data: allDoctors = [] } = useGetAdminUsersQuery({ role: 'doctor' });

  const [createAdminUser, { isLoading: isCreatingUser }] = useCreateAdminUserMutation();
  const [toggleUserStatus] = useToggleUserStatusMutation();
  const [deleteUser] = useDeleteUserMutation();
  const [createAssignment, { isLoading: isAssigning }] = useCreateAssignmentMutation();
  const [adminUpgradeSubscription, { isLoading: isAdminUpgrading }] = useAdminUpgradeSubscriptionMutation();
  const [adminCancelSubscription, { isLoading: isAdminCancelling }] = useAdminCancelSubscriptionMutation();

  const showToast = (message, type = 'success') => {
    setToast({ message, type, visible: true });
    setTimeout(() => {
      setToast(prev => ({ ...prev, visible: false }));
    }, 4000);
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setCreateError('');
    try {
      await createAdminUser(createForm).unwrap();
      showToast(`User ${createForm.full_name} created successfully!`, 'success');
      setCreateForm({ full_name: '', email: '', password: '', role: 'patient' });
    } catch (err) {
      setCreateError(err.data?.detail || err.message || 'Failed to create user');
    }
  };

  const triggerModal = (type, userId, message, onConfirm) => {
    setModal({ isOpen: true, type, userId, message, onConfirm });
  };

  const closeModal = () => {
    setModal({ isOpen: false, type: '', userId: null, message: '', onConfirm: null });
  };

  const handleToggleStatus = (user) => {
    triggerModal(
      'suspend',
      user.id,
      `Are you sure you want to ${user.is_active ? 'suspend' : 'unsuspend'} user "${user.full_name}"?`,
      async () => {
        try {
          await toggleUserStatus(user.id).unwrap();
          showToast(`User status updated.`, 'success');
          refetchUsers();
        } catch (err) {
          showToast(err.data?.detail || 'Failed to toggle status', 'error');
        }
        closeModal();
      }
    );
  };

  const handleDeleteUser = (user) => {
    triggerModal(
      'delete',
      user.id,
      `Are you sure you want to permanently delete user "${user.full_name}"? This action cannot be undone and will clean up all associated records.`,
      async () => {
        try {
          await deleteUser(user.id).unwrap();
          showToast(`User deleted successfully.`, 'success');
          refetchUsers();
        } catch (err) {
          showToast(err.data?.detail || 'Failed to delete user', 'error');
        }
        closeModal();
      }
    );
  };

  const handleAssignDoctor = async (e) => {
    e.preventDefault();
    if (!selectedPatientId || !selectedDoctorId) return;
    try {
      await createAssignment({
        patient_id: parseInt(selectedPatientId),
        doctor_id: parseInt(selectedDoctorId)
      }).unwrap();
      showToast('Patient assigned successfully!', 'success');
      setSelectedPatientId('');
      setSelectedDoctorId('');
    } catch (err) {
      showToast(err.data?.detail || 'Assignment failed', 'error');
    }
  };

  const openPlanModal = (subUser) => {
    const defaultTarget = subUser.role === 'doctor' ? (subUser.subscription_tier || 'Doc_Free') : (subUser.subscription_tier || 'Free');
    setPlanModal({
      isOpen: true,
      userId: subUser.id,
      userName: subUser.name,
      userRole: subUser.role,
      currentTier: subUser.subscription_tier
    });
    setTargetTier(defaultTarget);
  };

  const handleUpdateUserSub = async () => {
    if (!planModal.userId || !targetTier) return;
    try {
      await adminUpgradeSubscription({
        userId: planModal.userId,
        plan_code: targetTier,
        payment_method: 'admin_override'
      }).unwrap();
      showToast(`Updated ${planModal.userName}'s subscription plan to ${targetTier}!`, 'success');
      setPlanModal({ isOpen: false, userId: null, userName: '', userRole: '', currentTier: '' });
      refetchSubs();
    } catch (err) {
      showToast(err.data?.detail || 'Failed to update subscription', 'error');
    }
  };

  const handleCancelSubConfirm = (subUser) => {
    confirmModal(
      `Are you sure you want to cancel the active subscription for ${subUser.name}?`,
      async () => {
        try {
          await adminCancelSubscription(subUser.id).unwrap();
          showToast(`Cancelled active subscription for ${subUser.name}`, 'success');
          closeModal();
          refetchSubs();
        } catch (err) {
          showToast(err.data?.detail || 'Failed to cancel subscription', 'error');
        }
      }
    );
  };

  // Filter users by client-side search term (name or email)
  const filteredUsers = users.filter(u => 
    u.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="admin-dashboard-container">
      {/* Greeting Banner */}
      <div className="admin-header-panel">
        <div className="header-greeting">
          <span className="welcome-tag">ADMINISTRATOR CONTROL PANEL</span>
          <h2>Platform Management Dashboard</h2>
          <p>Monitor system statistics, manage patient/doctor roles, and assign care partners.</p>
        </div>
      </div>

      {/* Section 1: Stats Row */}
      <div className="admin-stats-grid">
        {isStatsLoading ? (
          Array(6).fill(0).map((_, i) => (
            <div key={i} className="admin-stat-card">
              <div className="skeleton-loader admin-stat-icon-wrapper" />
              <div>
                <div className="skeleton-loader skeleton-text" style={{ width: '40px' }} />
                <div className="skeleton-loader skeleton-text" style={{ width: '80px' }} />
              </div>
            </div>
          ))
        ) : (
          <>
            <div className="admin-stat-card">
              <div className="admin-stat-icon-wrapper blue-light">
                <Users size={20} />
              </div>
              <div>
                <div className="admin-stat-value">{stats?.total_patients || 0}</div>
                <div className="admin-stat-label">Total Patients</div>
              </div>
            </div>

            <div className="admin-stat-card">
              <div className="admin-stat-icon-wrapper green-light">
                <Stethoscope size={20} />
              </div>
              <div>
                <div className="admin-stat-value">{stats?.total_doctors || 0}</div>
                <div className="admin-stat-label">Total Doctors</div>
              </div>
            </div>

            <div className="admin-stat-card">
              <div className="admin-stat-icon-wrapper purple-light">
                <Activity size={20} />
              </div>
              <div>
                <div className="admin-stat-value">{stats?.total_predictions || 0}</div>
                <div className="admin-stat-label">Predictions Run</div>
              </div>
            </div>

            <div className="admin-stat-card">
              <div className="admin-stat-icon-wrapper red-light">
                <AlertTriangle size={20} />
              </div>
              <div>
                <div className="admin-stat-value">{stats?.high_risk_count || 0}</div>
                <div className="admin-stat-label">High Risk Patients</div>
              </div>
            </div>

            <div className="admin-stat-card">
              <div className="admin-stat-icon-wrapper orange-light">
                <Calendar size={20} />
              </div>
              <div>
                <div className="admin-stat-value">{stats?.total_appointments_today || 0}</div>
                <div className="admin-stat-label">Appointments Today</div>
              </div>
            </div>

            <div className="admin-stat-card">
              <div className="admin-stat-icon-wrapper indigo-light">
                <FileText size={20} />
              </div>
              <div>
                <div className="admin-stat-value">{stats?.total_reports || 0}</div>
                <div className="admin-stat-label">Total Reports</div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Sections Split: Table Left, Forms Right */}
      <div className="admin-dashboard-split">
        
        {/* User Management Table */}
        <div className="glass-card table-panel-card" style={{ alignSelf: 'start' }}>
          <div className="card-title-row">
            <Users size={18} className="card-icon" style={{ color: 'var(--accent)' }} />
            <h3>User Management</h3>
          </div>
          
          <div className="table-controls">
            <div className="tabs-group">
              <button 
                className={`tab-btn ${activeTab === 'patient' ? 'active' : ''}`}
                onClick={() => { setActiveTab('patient'); setSearchTerm(''); }}
              >
                Patients
              </button>
              <button 
                className={`tab-btn ${activeTab === 'doctor' ? 'active' : ''}`}
                onClick={() => { setActiveTab('doctor'); setSearchTerm(''); }}
              >
                Doctors
              </button>
              <button 
                className={`tab-btn ${activeTab === 'subscription' ? 'active' : ''}`}
                onClick={() => { setActiveTab('subscription'); setSearchTerm(''); }}
              >
                Subscriptions
              </button>
            </div>

            <div className="search-wrapper">
              <input 
                type="text"
                placeholder="Search by name or email..."
                className="search-input"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <Search size={16} style={{ position: 'absolute', right: '12px', top: '10px', color: 'var(--text-secondary)' }} />
            </div>
          </div>

          <div className="table-wrapper">
            {activeTab === 'subscription' ? (
              isSubsLoading ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  Loading Subscription records...
                </div>
              ) : subData?.items?.length === 0 ? (
                <p className="empty-text">No subscription records found.</p>
              ) : (
                <table className="dashboard-table">
                  <thead>
                    <tr>
                      <th>User Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Current Plan Tier</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subData?.items?.map((subUser) => {
                      const tierBadgeColor = 
                        subUser.subscription_tier === 'Doc_Clinical_Plus' || subUser.subscription_tier === 'Clinical' ? '#7c3aed' :
                        subUser.subscription_tier === 'Doc_Professional' || subUser.subscription_tier === 'Pro' ? '#0284c7' : '#64748b';
                        
                      const tierName = 
                        subUser.subscription_tier === 'Doc_Clinical_Plus' ? 'Clinical Plus (₹2499)' :
                        subUser.subscription_tier === 'Doc_Professional' ? 'Professional Doctor (₹999)' :
                        subUser.subscription_tier === 'Doc_Free' ? 'Free Trial Doctor' :
                        subUser.subscription_tier === 'Clinical' ? 'Clinical Patient (₹999)' :
                        subUser.subscription_tier === 'Pro' ? 'Pro Patient (₹299)' : 'Free Patient';

                      return (
                        <tr key={subUser.id}>
                          <td><strong>{subUser.name}</strong></td>
                          <td>{subUser.email}</td>
                          <td>
                            <span className={`badge ${subUser.role === 'doctor' ? 'badge-info' : 'badge-neutral'}`} style={{ textTransform: 'capitalize' }}>
                              {subUser.role}
                            </span>
                          </td>
                          <td>
                            <span className="badge" style={{ backgroundColor: `${tierBadgeColor}20`, color: tierBadgeColor, fontWeight: 700 }}>
                              {tierName}
                            </span>
                          </td>
                          <td>
                            <span className={`badge ${subUser.status === 'active' ? 'badge-success' : 'badge-danger'}`}>
                              {subUser.status}
                            </span>
                          </td>
                          <td>
                            <div className="action-buttons" style={{ display: 'flex', gap: '6px' }}>
                              <button
                                className="btn-action"
                                title="Change Plan"
                                onClick={() => openPlanModal(subUser)}
                                style={{ background: '#f1f5f9', color: '#0f172a', border: '1px solid #cbd5e1', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}
                              >
                                <Crown size={13} /> Change Plan
                              </button>
                              {subUser.subscription_tier !== 'Free' && subUser.subscription_tier !== 'Doc_Free' && (
                                <button
                                  className="btn-action btn-delete"
                                  title="Cancel Subscription"
                                  onClick={() => handleCancelSubConfirm(subUser)}
                                  style={{ padding: '4px 10px', fontSize: '12px' }}
                                >
                                  Cancel Sub
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )
            ) : isUsersLoading ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                Loading Users database...
              </div>
            ) : filteredUsers.length === 0 ? (
              <p className="empty-text">No user profiles matched your criteria.</p>
            ) : (
              <table className="dashboard-table">
                <thead>
                  {activeTab === 'patient' ? (
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Status</th>
                      <th>Risk Level</th>
                      <th>Last Prediction</th>
                      <th>Actions</th>
                    </tr>
                  ) : (
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Status</th>
                      <th>Assigned Patients</th>
                      <th>Actions</th>
                    </tr>
                  )}
                </thead>
                <tbody>
                  {filteredUsers.map((u) => {
                    // Risk level badges construction
                    let riskBadge = <span className="badge" style={{ backgroundColor: '#E2E8F0', color: '#4A5568' }}>N/A</span>;
                    if (u.risk_score !== null) {
                      if (u.risk_score >= 60) riskBadge = <span className="badge badge-danger">High ({Math.round(u.risk_score)}%)</span>;
                      else if (u.risk_score >= 30) riskBadge = <span className="badge badge-warning">Medium ({Math.round(u.risk_score)}%)</span>;
                      else riskBadge = <span className="badge badge-success">Low ({Math.round(u.risk_score)}%)</span>;
                    }

                    const isSelf = currentAdmin?.id === u.id;

                    return (
                      <tr key={u.id}>
                        <td><strong>{u.full_name}</strong> {isSelf && <span style={{ fontSize: '10px', color: 'var(--accent)' }}>(You)</span>}</td>
                        <td>{u.email}</td>
                        <td>
                          <span className={`badge ${u.is_active ? 'badge-success' : 'badge-danger'}`}>
                            {u.is_active ? 'Active' : 'Suspended'}
                          </span>
                        </td>
                        
                        {activeTab === 'patient' ? (
                          <>
                            <td>{riskBadge}</td>
                            <td>{u.prediction_date ? new Date(u.prediction_date).toLocaleDateString() : 'N/A'}</td>
                          </>
                        ) : (
                          <td>{u.patient_count ?? 0} patients</td>
                        )}

                        <td>
                          <div className="action-buttons">
                            <button 
                              className="btn-action" 
                              title={u.is_active ? 'Suspend User' : 'Unsuspend User'}
                              onClick={() => handleToggleStatus(u)}
                              disabled={isSelf}
                            >
                              {u.is_active ? <Lock size={14} /> : <Unlock size={14} />}
                            </button>
                            <button 
                              className="btn-action btn-delete" 
                              title="Delete User"
                              onClick={() => handleDeleteUser(u)}
                              disabled={isSelf}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Action Panel Side */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Add New User Card */}
          <div className="glass-card">
            <div className="card-title-row">
              <UserPlus size={18} className="card-icon" style={{ color: 'var(--accent)' }} />
              <h3>Add New User</h3>
            </div>
            
            <form onSubmit={handleCreateUser} className="admin-card-form">
              <div className="form-group">
                <label className="input-label">Full Name</label>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="e.g. Jane Smith"
                  required
                  value={createForm.full_name}
                  onChange={(e) => setCreateForm({...createForm, full_name: e.target.value})}
                />
              </div>

              <div className="form-group">
                <label className="input-label">Email Address</label>
                <input 
                  type="email" 
                  className="input-field" 
                  placeholder="jane.smith@example.com"
                  required
                  value={createForm.email}
                  onChange={(e) => setCreateForm({...createForm, email: e.target.value})}
                />
              </div>

              <div className="form-group-row">
                <div className="form-group">
                  <label className="input-label">Password</label>
                  <input 
                    type="password" 
                    className="input-field" 
                    placeholder="••••••"
                    required
                    value={createForm.password}
                    onChange={(e) => setCreateForm({...createForm, password: e.target.value})}
                  />
                </div>

                <div className="form-group">
                  <label className="input-label">Role</label>
                  <select 
                    className="input-field select-field"
                    value={createForm.role}
                    onChange={(e) => setCreateForm({...createForm, role: e.target.value})}
                  >
                    <option value="patient">Patient</option>
                    <option value="doctor">Doctor</option>
                  </select>
                </div>
              </div>

              {createError && (
                <div style={{ color: '#EE5D50', fontSize: '12px', fontWeight: '500', marginTop: '4px' }}>
                  {createError}
                </div>
              )}

              <button 
                type="submit" 
                className="btn btn-primary" 
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                disabled={isCreatingUser}
              >
                {isCreatingUser ? 'Creating...' : 'Create User'}
                <ArrowRight size={14} />
              </button>
            </form>
          </div>

          {/* Patient Assignment Card */}
          <div className="glass-card">
            <div className="card-title-row">
              <Stethoscope size={18} className="card-icon" style={{ color: 'var(--accent)' }} />
              <h3>Assign Patient to Doctor</h3>
            </div>
            
            <form onSubmit={handleAssignDoctor} className="admin-card-form">
              <div className="form-group">
                <label className="input-label">Select Patient</label>
                <select 
                  className="input-field select-field"
                  required
                  value={selectedPatientId}
                  onChange={(e) => setSelectedPatientId(e.target.value)}
                >
                  <option value="">-- Choose Patient --</option>
                  {isAssignmentsLoading ? (
                    <option disabled>Loading patients list...</option>
                  ) : (
                    assignments.map((a) => (
                      <option key={a.patient_id} value={a.patient_id}>
                        {a.patient_name} {a.assigned_doctor_name ? `(Assigned: ${a.assigned_doctor_name})` : '(No Doc Assigned)'}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="form-group">
                <label className="input-label">Select Doctor</label>
                <select 
                  className="input-field select-field"
                  required
                  value={selectedDoctorId}
                  onChange={(e) => setSelectedDoctorId(e.target.value)}
                >
                  <option value="">-- Choose Doctor --</option>
                  {allDoctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.full_name}
                    </option>
                  ))}
                </select>
              </div>

              <button 
                type="submit" 
                className="btn btn-primary" 
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                disabled={isAssigning}
              >
                {isAssigning ? 'Assigning...' : 'Assign'}
                <ArrowRight size={14} />
              </button>
            </form>
          </div>

        </div>
      </div>

      {/* Change Plan Modal */}
      <AnimatePresence>
        {planModal.isOpen && (
          <div className="modal-overlay" onClick={() => setPlanModal({ isOpen: false, userId: null, userName: '', userRole: '', currentTier: '' })}>
            <motion.div 
              className="modal-content"
              onClick={(e) => e.stopPropagation()}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.15 }}
              style={{ maxWidth: '420px', textAlign: 'left' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <div className="modal-icon-wrapper" style={{ backgroundColor: 'rgba(124, 58, 237, 0.1)', color: '#7c3aed', width: '40px', height: '40px', margin: 0 }}>
                  <Crown size={22} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '17px' }}>Change Plan Tier</h3>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Target User: <strong>{planModal.userName}</strong> ({planModal.userRole})</span>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '20px', marginTop: '16px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Select Subscription Tier:</label>
                <select
                  className="form-input"
                  value={targetTier}
                  onChange={(e) => setTargetTier(e.target.value)}
                  style={{ width: '100%', marginTop: '6px', padding: '10px' }}
                >
                  {planModal.userRole === 'doctor' ? (
                    <>
                      <option value="Doc_Free">Free Trial Doctor (₹0/mo)</option>
                      <option value="Doc_Professional">Professional Doctor (₹999/mo)</option>
                      <option value="Doc_Clinical_Plus">Clinical Plus Doctor (₹2,499/mo)</option>
                    </>
                  ) : (
                    <>
                      <option value="Free">Free Patient (₹0/mo)</option>
                      <option value="Pro">Pro Patient (₹299/mo)</option>
                      <option value="Clinical">Clinical Patient (₹999/mo)</option>
                    </>
                  )}
                </select>
              </div>

              <div className="modal-actions" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '24px' }}>
                <button 
                  className="btn btn-secondary" 
                  onClick={() => setPlanModal({ isOpen: false, userId: null, userName: '', userRole: '', currentTier: '' })} 
                  style={{ padding: '8px 16px', fontSize: '13px' }}
                >
                  Cancel
                </button>
                <button 
                  className="btn" 
                  onClick={handleUpdateUserSub}
                  disabled={isAdminUpgrading}
                  style={{ 
                    padding: '8px 18px', 
                    fontSize: '13px', 
                    color: 'white',
                    backgroundColor: '#7c3aed',
                    fontWeight: '600'
                  }}
                >
                  {isAdminUpgrading ? 'Updating...' : 'Update Plan'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {modal.isOpen && (
          <div className="modal-overlay" onClick={closeModal}>
            <motion.div 
              className="modal-content"
              onClick={(e) => e.stopPropagation()}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <div className="modal-icon-wrapper">
                <ShieldAlert size={28} />
              </div>
              <h3>Are you sure?</h3>
              <p>{modal.message}</p>
              
              <div className="modal-actions">
                <button className="btn btn-secondary" onClick={closeModal} style={{ padding: '8px 16px', fontSize: '13px' }}>
                  Cancel
                </button>
                <button 
                  className="btn" 
                  onClick={modal.onConfirm}
                  style={{ 
                    padding: '8px 16px', 
                    fontSize: '13px', 
                    color: 'white',
                    backgroundColor: modal.type === 'delete' ? '#EE5D50' : '#FFB547' 
                  }}
                >
                  Confirm
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast Alert System */}
      <AnimatePresence>
        {toast.visible && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            style={{
              position: 'fixed',
              bottom: '24px',
              right: '24px',
              backgroundColor: toast.type === 'success' ? '#05CD99' : '#EE5D50',
              color: 'white',
              padding: '12px 20px',
              borderRadius: '8px',
              boxShadow: '0 8px 30px rgba(0, 0, 0, 0.15)',
              zIndex: 1100,
              fontWeight: '600',
              fontSize: '13.5px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}
          >
            <CheckCircle size={18} />
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
