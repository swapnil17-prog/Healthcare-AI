import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { Sparkles, Check, X as XIcon, CreditCard, ShieldCheck, Crown, Zap, AlertCircle, Stethoscope, User as UserIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGetSubscriptionPlansQuery, useGetCurrentSubscriptionQuery, useUpgradeSubscriptionMutation, useCancelSubscriptionMutation } from '../services/apiSlice';
import './Pricing.css';

export default function Pricing() {
  const { user } = useSelector((state) => state.auth);
  const { data: currentSub, isLoading: isSubLoading, refetch: refetchSub } = useGetCurrentSubscriptionQuery();
  const [upgradeSubscription, { isLoading: isUpgrading }] = useUpgradeSubscriptionMutation();
  const [cancelSubscription, { isLoading: isCancelling }] = useCancelSubscriptionMutation();

  const [activeRoleTab, setActiveRoleTab] = useState(user?.role === 'doctor' ? 'doctor' : 'patient');
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [paymentMode, setPaymentMode] = useState('mock'); // 'mock' or 'razorpay'
  const [isSuccessMessage, setIsSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const rawTier = currentSub?.subscription_tier || user?.subscription_tier || 'Free';
  
  // Normalize active tier code for comparison
  const isDoctorTier = rawTier.startsWith('Doc_');
  const activeTierCode = rawTier;

  const handleSelectPlan = (plan) => {
    if (plan.code === activeTierCode) return;
    if (plan.code === 'Free' || plan.code === 'Doc_Free') {
      handleCancel();
      return;
    }
    setSelectedPlan(plan);
    setErrorMessage('');
  };

  const handleConfirmCheckout = async () => {
    if (!selectedPlan) return;
    try {
      setErrorMessage('');
      const res = await upgradeSubscription({
        plan_code: selectedPlan.code,
        payment_method: paymentMode,
        payment_id: `tx_${paymentMode}_${Date.now()}`
      }).unwrap();

      setIsSuccessMessage(`Successfully upgraded to ${selectedPlan.name}!`);
      setSelectedPlan(null);
      refetchSub();

      setTimeout(() => setIsSuccessMessage(''), 4000);
    } catch (err) {
      setErrorMessage(err?.data?.detail || 'Failed to complete subscription payment.');
    }
  };

  const handleCancel = async () => {
    if (window.confirm('Are you sure you want to cancel your paid subscription and revert to Free tier?')) {
      try {
        await cancelSubscription().unwrap();
        setIsSuccessMessage('Subscription cancelled. Reverted to Free plan.');
        refetchSub();
        setTimeout(() => setIsSuccessMessage(''), 4000);
      } catch (err) {
        setErrorMessage(err?.data?.detail || 'Failed to cancel subscription.');
      }
    }
  };

  return (
    <div className="pricing-page-container">
      {/* Header */}
      <div className="pricing-header">
        <div className="pricing-badge">
          <Sparkles size={14} />
          <span>Flexible Plans & Transparent Pricing</span>
        </div>
        <h1 className="pricing-title">Simple, Powerful Healthcare Plans</h1>
        <p className="pricing-subtitle">
          Choose the right plan to unlock AI risk screening, PDF clinical exports, cohort clustering, and priority support.
        </p>

        {/* Role Toggle Switch / Badge */}
        {user?.role === 'admin' ? (
          <div style={{ display: 'inline-flex', background: '#f1f5f9', padding: '4px', borderRadius: '14px', marginTop: '24px', border: '1px solid #cbd5e1' }}>
            <button
              onClick={() => setActiveRoleTab('patient')}
              style={{
                padding: '10px 24px',
                borderRadius: '10px',
                border: 'none',
                background: activeRoleTab === 'patient' ? '#0284c7' : 'transparent',
                color: activeRoleTab === 'patient' ? 'white' : '#64748b',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s ease'
              }}
            >
              <UserIcon size={16} />
              <span>Patient Plans</span>
            </button>
            <button
              onClick={() => setActiveRoleTab('doctor')}
              style={{
                padding: '10px 24px',
                borderRadius: '10px',
                border: 'none',
                background: activeRoleTab === 'doctor' ? '#7c3aed' : 'transparent',
                color: activeRoleTab === 'doctor' ? 'white' : '#64748b',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s ease'
              }}
            >
              <Stethoscope size={16} />
              <span>Doctor & Clinic Plans</span>
            </button>
          </div>
        ) : user?.role === 'doctor' ? (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(124, 58, 237, 0.1)', color: '#7c3aed', padding: '8px 18px', borderRadius: '12px', marginTop: '24px', fontWeight: 700, fontSize: '14px', border: '1px solid rgba(124, 58, 237, 0.2)' }}>
            <Stethoscope size={18} />
            <span>Doctor & Clinic Subscription Plans</span>
          </div>
        ) : (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(2, 132, 199, 0.1)', color: '#0284c7', padding: '8px 18px', borderRadius: '12px', marginTop: '24px', fontWeight: 700, fontSize: '14px', border: '1px solid rgba(2, 132, 199, 0.2)' }}>
            <UserIcon size={18} />
            <span>Patient Subscription Plans</span>
          </div>
        )}

        {isSuccessMessage && (
          <div style={{ background: '#dcfce7', color: '#15803d', padding: '12px 20px', borderRadius: '12px', marginTop: '20px', fontSize: '14px', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            <Check size={18} />
            <span>{isSuccessMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '12px 20px', borderRadius: '12px', marginTop: '20px', fontSize: '14px', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={18} />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>

      {/* PATIENT PLANS TAB */}
      {activeRoleTab === 'patient' && (
        <div className="pricing-grid">
          {/* FREE PLAN */}
          <div className={`pricing-card ${activeTierCode === 'Free' ? 'active-card' : ''}`}>
            {activeTierCode === 'Free' && (
              <div className="pricing-popular-badge" style={{ background: '#64748b' }}>Current Plan</div>
            )}
            <h3 className="plan-name">Free Plan</h3>
            <p className="plan-description">Basic risk screening and vital tracking for casual personal health checks.</p>
            <div className="plan-price-box">
              <span className="plan-price-currency">₹</span>
              <span className="plan-price-val">0</span>
              <span className="plan-price-period">/ month</span>
            </div>
            <ul className="plan-features-list">
              <li className="plan-feature-row"><Check size={16} color="#0284c7" /> 3 Diabetes Predictions / month</li>
              <li className="plan-feature-row disabled"><XIcon size={16} /> Heart Disease Risk Screening</li>
              <li className="plan-feature-row"><Check size={16} color="#0284c7" /> 10 AI Chat Messages / month</li>
              <li className="plan-feature-row disabled"><XIcon size={16} /> PDF Clinical Report Downloads</li>
              <li className="plan-feature-row disabled"><XIcon size={16} /> Risk Trend Forecasting</li>
              <li className="plan-feature-row disabled"><XIcon size={16} /> Automated Lab Summaries</li>
              <li className="plan-feature-row"><Check size={16} color="#0284c7" /> 30 Days Data History</li>
            </ul>
            <button 
              className={`btn-plan-select ${activeTierCode === 'Free' ? 'active-plan' : ''}`}
              onClick={() => handleSelectPlan({ code: 'Free', name: 'Free Plan' })}
              disabled={activeTierCode === 'Free'}
            >
              {activeTierCode === 'Free' ? 'Active Tier' : 'Downgrade to Free'}
            </button>
          </div>

          {/* PRO PLAN */}
          <div className={`pricing-card featured ${activeTierCode === 'Pro' ? 'active-card' : ''}`}>
            {activeTierCode === 'Pro' ? (
              <div className="pricing-popular-badge">Current Plan</div>
            ) : (
              <div className="pricing-popular-badge">Most Popular</div>
            )}
            <h3 className="plan-name">Pro Plan</h3>
            <p className="plan-description">Full screening capabilities, PDF downloads, and advanced health insights.</p>
            <div className="plan-price-box">
              <span className="plan-price-currency">₹</span>
              <span className="plan-price-val">299</span>
              <span className="plan-price-period">/ month</span>
            </div>
            <ul className="plan-features-list">
              <li className="plan-feature-row"><Check size={16} color="#0284c7" /> <strong>Unlimited</strong> Diabetes Predictions</li>
              <li className="plan-feature-row"><Check size={16} color="#0284c7" /> <strong>Unlimited</strong> Heart Disease Screening</li>
              <li className="plan-feature-row"><Check size={16} color="#0284c7" /> 100 AI Chat Messages / month</li>
              <li className="plan-feature-row"><Check size={16} color="#0284c7" /> PDF Clinical Report Downloads</li>
              <li className="plan-feature-row"><Check size={16} color="#0284c7" /> 6-Month Risk Trend Forecasting</li>
              <li className="plan-feature-row"><Check size={16} color="#0284c7" /> Automated Lab Report Summaries</li>
              <li className="plan-feature-row"><Check size={16} color="#0284c7" /> 365 Days Data History</li>
            </ul>
            <button 
              className={`btn-plan-select ${activeTierCode === 'Pro' ? 'active-plan' : 'featured-btn'}`}
              onClick={() => handleSelectPlan({ code: 'Pro', name: 'Pro Plan', price_inr: 299 })}
              disabled={activeTierCode === 'Pro'}
            >
              {activeTierCode === 'Pro' ? 'Active Tier' : 'Upgrade to Pro'}
            </button>
          </div>

          {/* CLINICAL PLAN */}
          <div className={`pricing-card ${activeTierCode === 'Clinical' ? 'active-card' : ''}`}>
            {activeTierCode === 'Clinical' && (
              <div className="pricing-popular-badge" style={{ background: '#7c3aed' }}>Current Plan</div>
            )}
            <h3 className="plan-name">Clinical Plan</h3>
            <p className="plan-description">Unlimited access, doctor consultation integration, and priority support.</p>
            <div className="plan-price-box">
              <span className="plan-price-currency">₹</span>
              <span className="plan-price-val">999</span>
              <span className="plan-price-period">/ month</span>
            </div>
            <ul className="plan-features-list">
              <li className="plan-feature-row"><Check size={16} color="#7c3aed" /> <strong>Unlimited</strong> Diabetes Predictions</li>
              <li className="plan-feature-row"><Check size={16} color="#7c3aed" /> <strong>Unlimited</strong> Heart Disease Screening</li>
              <li className="plan-feature-row"><Check size={16} color="#7c3aed" /> <strong>Unlimited</strong> AI Chat Messages</li>
              <li className="plan-feature-row"><Check size={16} color="#7c3aed" /> PDF Clinical Report Downloads</li>
              <li className="plan-feature-row"><Check size={16} color="#7c3aed" /> Risk Trend Forecasting</li>
              <li className="plan-feature-row"><Check size={16} color="#7c3aed" /> Doctor Assignment & Messaging</li>
              <li className="plan-feature-row"><Check size={16} color="#7c3aed" /> <strong>Unlimited</strong> Data Retention & Priority Support</li>
            </ul>
            <button 
              className={`btn-plan-select ${activeTierCode === 'Clinical' ? 'active-plan' : ''}`}
              onClick={() => handleSelectPlan({ code: 'Clinical', name: 'Clinical Plan', price_inr: 999 })}
              disabled={activeTierCode === 'Clinical'}
              style={{ background: activeTierCode === 'Clinical' ? undefined : 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)', color: activeTierCode === 'Clinical' ? undefined : 'white', border: 'none' }}
            >
              {activeTierCode === 'Clinical' ? 'Active Tier' : 'Upgrade to Clinical'}
            </button>
          </div>
        </div>
      )}

      {/* DOCTOR & CLINIC PLANS TAB */}
      {activeRoleTab === 'doctor' && (
        <div className="pricing-grid">
          {/* FREE DOCTOR */}
          <div className={`pricing-card ${activeTierCode === 'Doc_Free' || activeTierCode === 'Free' ? 'active-card' : ''}`}>
            {(activeTierCode === 'Doc_Free' || activeTierCode === 'Free') && (
              <div className="pricing-popular-badge" style={{ background: '#64748b' }}>Current Plan</div>
            )}
            <h3 className="plan-name">Free Trial Doctor</h3>
            <p className="plan-description">For individual doctors exploring platform capabilities and evaluating patient tools.</p>
            <div className="plan-price-box">
              <span className="plan-price-currency">₹</span>
              <span className="plan-price-val">0</span>
              <span className="plan-price-period">/ month</span>
            </div>
            <ul className="plan-features-list">
              <li className="plan-feature-row"><Check size={16} color="#7c3aed" /> Max <strong>5 Assigned Patients</strong></li>
              <li className="plan-feature-row"><Check size={16} color="#7c3aed" /> 10 ML Scans / month</li>
              <li className="plan-feature-row"><Check size={16} color="#7c3aed" /> 5 PDF Report Downloads / month</li>
              <li className="plan-feature-row disabled"><XIcon size={16} /> Heart Disease Risk Screening</li>
              <li className="plan-feature-row disabled"><XIcon size={16} /> Patient Cohort Clustering (K-Means)</li>
              <li className="plan-feature-row disabled"><XIcon size={16} /> Predictive Risk Alerts</li>
              <li className="plan-feature-row"><Check size={16} color="#7c3aed" /> 30 Days Consultation History</li>
            </ul>
            <button 
              className={`btn-plan-select ${(activeTierCode === 'Doc_Free' || activeTierCode === 'Free') ? 'active-plan' : ''}`}
              onClick={() => handleSelectPlan({ code: 'Doc_Free', name: 'Free Doctor Plan' })}
              disabled={activeTierCode === 'Doc_Free' || activeTierCode === 'Free'}
            >
              {(activeTierCode === 'Doc_Free' || activeTierCode === 'Free') ? 'Active Tier' : 'Downgrade to Free'}
            </button>
          </div>

          {/* PROFESSIONAL DOCTOR */}
          <div className={`pricing-card featured ${activeTierCode === 'Doc_Professional' ? 'active-card' : ''}`}>
            {activeTierCode === 'Doc_Professional' ? (
              <div className="pricing-popular-badge">Current Plan</div>
            ) : (
              <div className="pricing-popular-badge">Recommended for Clinics</div>
            )}
            <h3 className="plan-name">Professional Doctor</h3>
            <p className="plan-description">Ideal for individual practitioners and small clinics managing active patient rosters.</p>
            <div className="plan-price-box">
              <span className="plan-price-currency">₹</span>
              <span className="plan-price-val">999</span>
              <span className="plan-price-period">/ month</span>
            </div>
            <ul className="plan-features-list">
              <li className="plan-feature-row"><Check size={16} color="#7c3aed" /> Max <strong>50 Assigned Patients</strong></li>
              <li className="plan-feature-row"><Check size={16} color="#7c3aed" /> <strong>200 ML Scans</strong> / month</li>
              <li className="plan-feature-row"><Check size={16} color="#7c3aed" /> <strong>Unlimited</strong> PDF Downloads</li>
              <li className="plan-feature-row"><Check size={16} color="#7c3aed" /> Heart Disease Risk Screening</li>
              <li className="plan-feature-row"><Check size={16} color="#7c3aed" /> Population Risk Distribution & Feature Importance</li>
              <li className="plan-feature-row"><Check size={16} color="#7c3aed" /> Automated Lab Report Summarization</li>
              <li className="plan-feature-row"><Check size={16} color="#7c3aed" /> 1 Year Consultation History</li>
            </ul>
            <button 
              className={`btn-plan-select ${activeTierCode === 'Doc_Professional' ? 'active-plan' : 'featured-btn'}`}
              onClick={() => handleSelectPlan({ code: 'Doc_Professional', name: 'Professional Doctor Plan', price_inr: 999 })}
              disabled={activeTierCode === 'Doc_Professional'}
              style={{ background: activeTierCode === 'Doc_Professional' ? undefined : 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)', color: activeTierCode === 'Doc_Professional' ? undefined : 'white', border: 'none' }}
            >
              {activeTierCode === 'Doc_Professional' ? 'Active Tier' : 'Upgrade to Professional (₹999)'}
            </button>
          </div>

          {/* CLINICAL PLUS DOCTOR */}
          <div className={`pricing-card ${activeTierCode === 'Doc_Clinical_Plus' ? 'active-card' : ''}`}>
            {activeTierCode === 'Doc_Clinical_Plus' && (
              <div className="pricing-popular-badge" style={{ background: '#059669' }}>Current Plan</div>
            )}
            <h3 className="plan-name">Clinical Plus Doctor</h3>
            <p className="plan-description">For multi-doctor clinics and hospital departments requiring advanced population analytics.</p>
            <div className="plan-price-box">
              <span className="plan-price-currency">₹</span>
              <span className="plan-price-val">2,499</span>
              <span className="plan-price-period">/ month</span>
            </div>
            <ul className="plan-features-list">
              <li className="plan-feature-row"><Check size={16} color="#059669" /> <strong>Unlimited Assigned Patients</strong></li>
              <li className="plan-feature-row"><Check size={16} color="#059669" /> <strong>Unlimited ML Scans</strong></li>
              <li className="plan-feature-row"><Check size={16} color="#059669" /> <strong>Unlimited PDF Downloads</strong></li>
              <li className="plan-feature-row"><Check size={16} color="#059669" /> Patient Cohort Clustering (K-Means)</li>
              <li className="plan-feature-row"><Check size={16} color="#059669" /> Predictive Risk Alerts & Custom Date Analytics</li>
              <li className="plan-feature-row"><Check size={16} color="#059669" /> <strong>Unlimited</strong> Consultation History</li>
              <li className="plan-feature-row"><Check size={16} color="#059669" /> Priority Dedicated Support & API Access</li>
            </ul>
            <button 
              className={`btn-plan-select ${activeTierCode === 'Doc_Clinical_Plus' ? 'active-plan' : ''}`}
              onClick={() => handleSelectPlan({ code: 'Doc_Clinical_Plus', name: 'Clinical Plus Doctor Plan', price_inr: 2499 })}
              disabled={activeTierCode === 'Doc_Clinical_Plus'}
              style={{ background: activeTierCode === 'Doc_Clinical_Plus' ? undefined : 'linear-gradient(135deg, #059669 0%, #047857 100%)', color: activeTierCode === 'Doc_Clinical_Plus' ? undefined : 'white', border: 'none' }}
            >
              {activeTierCode === 'Doc_Clinical_Plus' ? 'Active Tier' : 'Upgrade to Clinical Plus (₹2,499)'}
            </button>
          </div>
        </div>
      )}

      {/* Feature Comparison Matrix */}
      <div className="comparison-section">
        <h3 className="comparison-title">
          {activeRoleTab === 'patient' ? 'Full Patient Feature Comparison' : 'Full Doctor & Clinic Feature Comparison'}
        </h3>
        {activeRoleTab === 'patient' ? (
          <table className="comparison-table">
            <thead>
              <tr>
                <th>Feature</th>
                <th>Free</th>
                <th>Pro (₹299/mo)</th>
                <th>Clinical (₹999/mo)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Diabetes Risk Predictions</td>
                <td>3 / month</td>
                <td>Unlimited</td>
                <td>Unlimited</td>
              </tr>
              <tr>
                <td>Heart Disease Risk Screening</td>
                <td>❌ Locked</td>
                <td>Unlimited</td>
                <td>Unlimited</td>
              </tr>
              <tr>
                <td>AI Chatbot Assistant Messages</td>
                <td>10 / month</td>
                <td>100 / month</td>
                <td>Unlimited</td>
              </tr>
              <tr>
                <td>PDF Clinical Report Downloads</td>
                <td>❌ Locked</td>
                <td>✅ Included</td>
                <td>✅ Included</td>
              </tr>
              <tr>
                <td>6-Month Trend Forecasting</td>
                <td>❌ Locked</td>
                <td>✅ Included</td>
                <td>✅ Included</td>
              </tr>
              <tr>
                <td>Automated Lab Report Summarization</td>
                <td>❌ Locked</td>
                <td>✅ Included</td>
                <td>✅ Included</td>
              </tr>
              <tr>
                <td>Data History Retention</td>
                <td>30 Days</td>
                <td>1 Year</td>
                <td>Unlimited</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <table className="comparison-table">
            <thead>
              <tr>
                <th>Feature</th>
                <th>Free Trial</th>
                <th>Professional (₹999/mo)</th>
                <th>Clinical Plus (₹2,499/mo)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Max Assigned Patients</td>
                <td>5 Patients</td>
                <td>50 Patients</td>
                <td>Unlimited</td>
              </tr>
              <tr>
                <td>ML Predictions / Month</td>
                <td>10 / month</td>
                <td>200 / month</td>
                <td>Unlimited</td>
              </tr>
              <tr>
                <td>Heart Disease Risk Screening</td>
                <td>❌ Locked</td>
                <td>✅ Included</td>
                <td>✅ Included</td>
              </tr>
              <tr>
                <td>PDF Report Downloads</td>
                <td>5 / month</td>
                <td>Unlimited</td>
                <td>Unlimited</td>
              </tr>
              <tr>
                <td>Population Risk & Feature Importance</td>
                <td>Basic Stats</td>
                <td>✅ Included</td>
                <td>✅ Included</td>
              </tr>
              <tr>
                <td>Patient Cohort Clustering (K-Means)</td>
                <td>❌ Locked</td>
                <td>❌ Locked</td>
                <td>✅ Included</td>
              </tr>
              <tr>
                <td>Predictive Risk Alerts</td>
                <td>❌ Locked</td>
                <td>❌ Locked</td>
                <td>✅ Included</td>
              </tr>
              <tr>
                <td>Consultation History Retention</td>
                <td>30 Days</td>
                <td>1 Year</td>
                <td>Unlimited</td>
              </tr>
              <tr>
                <td>Support Level</td>
                <td>Community</td>
                <td>Email</td>
                <td>Priority + Dedicated</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      {/* Checkout Modal Dialog */}
      <AnimatePresence>
        {selectedPlan && (
          <div className="checkout-modal-overlay">
            <motion.div 
              className="checkout-card"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Confirm Subscription Upgrade</h3>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }} onClick={() => setSelectedPlan(null)}>
                  <XIcon size={20} />
                </button>
              </div>

              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 600 }}>Plan:</span>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#7c3aed' }}>{selectedPlan.name}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '14px', fontWeight: 600 }}>Billing Amount:</span>
                  <span style={{ fontSize: '16px', fontWeight: 800 }}>₹{selectedPlan.price_inr} / month</span>
                </div>
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '8px' }}>Select Payment Method:</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button 
                    style={{ flex: 1, padding: '10px', borderRadius: '10px', border: paymentMode === 'mock' ? '2px solid #7c3aed' : '1px solid #cbd5e1', background: paymentMode === 'mock' ? '#f5f3ff' : 'white', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                    onClick={() => setPaymentMode('mock')}
                  >
                    Simulated Instant Pay (Portfolio Demo)
                  </button>
                  <button 
                    style={{ flex: 1, padding: '10px', borderRadius: '10px', border: paymentMode === 'razorpay' ? '2px solid #7c3aed' : '1px solid #cbd5e1', background: paymentMode === 'razorpay' ? '#f5f3ff' : 'white', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                    onClick={() => setPaymentMode('razorpay')}
                  >
                    Razorpay Test Mode
                  </button>
                </div>
              </div>

              <button 
                className="btn-plan-select featured-btn"
                onClick={handleConfirmCheckout}
                disabled={isUpgrading}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)', color: 'white', border: 'none' }}
              >
                {isUpgrading ? (
                  <span>Processing...</span>
                ) : (
                  <>
                    <ShieldCheck size={18} />
                    <span>Pay ₹{selectedPlan.price_inr} & Upgrade Now</span>
                  </>
                )}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
