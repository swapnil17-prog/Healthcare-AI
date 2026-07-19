import React from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Sparkles, CheckCircle2, Lock, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import './UpgradeModal.css';

export default function UpgradeModal({ isOpen, onClose, featureName, limitMessage }) {
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleUpgradeClick = () => {
    onClose();
    navigate('/pricing');
  };

  return (
    <AnimatePresence>
      <div className="upgrade-modal-overlay">
        <motion.div 
          className="upgrade-modal-card"
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
        >
          <div className="upgrade-modal-header">
            <button className="upgrade-modal-close" onClick={onClose}>
              <X size={18} />
            </button>
            <div className="upgrade-modal-icon-badge">
              <Sparkles size={28} />
            </div>
            <h3 className="upgrade-modal-title">Upgrade to Pro Plan</h3>
            <p className="upgrade-modal-subtitle">
              {limitMessage || "Unlock unlimited risk predictions, heart screenings, PDF downloads, and trend forecasting."}
            </p>
          </div>

          <div className="upgrade-modal-body">
            <div className="upgrade-feature-box">
              <div className="upgrade-feature-item">
                <CheckCircle2 size={16} color="#0284c7" />
                <span><strong>Unlimited</strong> Diabetes Risk Predictions</span>
              </div>
              <div className="upgrade-feature-item">
                <CheckCircle2 size={16} color="#0284c7" />
                <span><strong>Unlimited</strong> Heart Disease Screening & XAI</span>
              </div>
              <div className="upgrade-feature-item">
                <CheckCircle2 size={16} color="#0284c7" />
                <span><strong>100 / month</strong> AI Chat Assistant messages</span>
              </div>
              <div className="upgrade-feature-item">
                <CheckCircle2 size={16} color="#0284c7" />
                <span><strong>PDF Report Downloads</strong> & Trend Forecasting</span>
              </div>
            </div>

            <div className="upgrade-modal-actions">
              <button className="btn-upgrade-primary" onClick={handleUpgradeClick}>
                <span>Upgrade for ₹299/mo</span>
                <ArrowRight size={16} />
              </button>
              <button className="btn-upgrade-secondary" onClick={onClose}>
                Maybe Later
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
