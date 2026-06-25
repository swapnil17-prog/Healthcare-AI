import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, X, Send, AlertTriangle } from 'lucide-react';
import { api } from '../services/api';
import './ChatWidget.css';

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputMsg, setInputMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      loadHistory();
    }
  }, [isOpen]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadHistory = async () => {
    try {
      const data = await api.getChatHistory();
      setMessages(data);
    } catch (e) {
      console.error('Failed to load chat history', e);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSend = async (e) => {
    e.preventDefault();
    const text = inputMsg.trim();
    if (!text || loading) return;

    // Instantly append user message to local state for responsive UI
    const tempUserMsg = {
      id: Date.now(),
      role: 'user',
      content: text,
      created_at: new Date().toISOString()
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    setInputMsg('');
    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://127.0.0.1:8000/api/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ message: text }),
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Streaming failed');
      }

      // Add a placeholder message for the assistant response
      const assistantMsgId = Date.now() + 1;
      let assistantMsg = {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        created_at: new Date().toISOString()
      };
      
      setMessages((prev) => [...prev, assistantMsg]);
      setLoading(false); // Stop input loading now that streaming started

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line in buffer

        for (const line of lines) {
          const cleanLine = line.trim();
          if (cleanLine.startsWith('data: ')) {
            try {
              const dataStr = cleanLine.substring(6);
              const data = JSON.parse(dataStr);
              if (data.text) {
                assistantMsg.content += data.text;
                // Update messages state in-place
                setMessages((prev) => 
                  prev.map((msg) => msg.id === assistantMsgId ? { ...assistantMsg } : msg)
                );
              }
            } catch (e) {
              console.error('Error parsing SSE chunk', e);
            }
          }
        }
      }
    } catch (err) {
      const errorMsg = {
        id: Date.now() + 1,
        role: 'assistant',
        content: `Error: ${err.message || 'Failed to send message. Please try again.'}`,
        created_at: new Date().toISOString()
      };
      setMessages((prev) => [...prev, errorMsg]);
      setLoading(false);
    }
  };

  return (
    <div className="chat-widget-container">
      {/* Floating Toggle Button */}
      {!isOpen && (
        <button className="chat-trigger-btn" onClick={() => setIsOpen(true)}>
          <MessageSquare size={24} />
          <span className="chat-pulse"></span>
        </button>
      )}

      {/* Chat Window Panel */}
      {isOpen && (
        <div className="chat-window-panel glass-card">
          {/* Header */}
          <div className="chat-header">
            <div>
              <h3>AI Health Assistant</h3>
              <span className="chat-status">AI Assistant Online</span>
            </div>
            <button className="chat-close-btn" onClick={() => setIsOpen(false)}>
              <X size={18} />
            </button>
          </div>

          {/* Warning Disclaimer Banner */}
          <div className="chat-disclaimer">
            <AlertTriangle size={14} className="disclaimer-icon" />
            <span>
              <strong>Not a Doctor:</strong> This assistant explains risk labels and app features. It does not diagnose or give medical advice.
            </span>
          </div>

          {/* Messages Body */}
          <div className="chat-messages-body">
            {messages.length === 0 ? (
              <div className="chat-empty-state">
                <p>Hello! Ask me about your diabetes risk scores or general app usage like uploading reports.</p>
              </div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className={`chat-bubble-row ${msg.role}`}>
                  <div className={`chat-bubble ${msg.role}`}>
                    <p className="chat-bubble-text">{msg.content}</p>
                    <span className="chat-bubble-time">
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))
            )}
            {loading && (
              <div className="chat-bubble-row assistant">
                <div className="chat-bubble assistant typing">
                  <span className="dot"></span>
                  <span className="dot"></span>
                  <span className="dot"></span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Footer Form */}
          <form className="chat-footer-form" onSubmit={handleSend}>
            <input
              type="text"
              className="input-field chat-input"
              placeholder="Ask about reports, risk levels..."
              value={inputMsg}
              onChange={(e) => setInputMsg(e.target.value)}
              disabled={loading}
            />
            <button type="submit" className="btn btn-primary chat-send-btn" disabled={!inputMsg.trim() || loading}>
              <Send size={16} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
