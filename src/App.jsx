import React, { useState, useEffect, useMemo } from 'react';
import { Mail, Search, Plus, Trash2, User, LogOut, ArrowLeft, Send, AlertCircle } from 'lucide-react';
import './index.css';
export default function App() {
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [accountSearchQuery, setAccountSearchQuery] = useState('');
  const [emailSearchQuery, setEmailSearchQuery] = useState('');
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [emails, setEmails] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showAutoForwarder, setShowAutoForwarder] = useState(false);
  const [forwardSubject, setForwardSubject] = useState('');
  const [targetEmail, setTargetEmail] = useState('');
  const [rules, setRules] = useState([]);
  const [isAddingRule, setIsAddingRule] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [forwardedEmailsList, setForwardedEmailsList] = useState([]);
  const [expandedPreviewIndex, setExpandedPreviewIndex] = useState(null);
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const API_URL = isLocalhost ? 'http://localhost:5001' : 'https://hotmail-manager-ppna.onrender.com';
  useEffect(() => {
    fetch(`${API_URL}/api/accounts`)
      .then(res => res.json())
      .then(data => setAccounts(data))
      .catch(err => console.error("Failed to load accounts", err));
  }, []);
  const handleLogin = () => {
    window.location.href = `${API_URL}/api/auth/login`;
  };
  const handleLogout = async (email, e) => {
    e.stopPropagation();
    try {
      await fetch(`${API_URL}/api/accounts/${encodeURIComponent(email)}`, {
        method: 'DELETE'
      });
      setAccounts(prev => prev.filter(acc => acc.email !== email));
      if (selectedAccount === email) {
        setSelectedAccount(null);
        setSelectedEmail(null);
      }
    } catch (err) {
      console.error("Failed to remove account", err);
    }
  };
  const fetchEmailsForAccount = async (email) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/api/emails/${encodeURIComponent(email)}`);
      if (!response.ok) {
        throw new Error('Failed to fetch emails');
      }
      const fetchedMessages = await response.json();
      const formattedEmails = fetchedMessages.map(msg => {
        const senderName = msg.sender?.emailAddress?.name || msg.sender?.emailAddress?.address || 'Unknown Sender';
        const receivedDate = new Date(msg.receivedDateTime);
        return {
          id: msg.id,
          accountId: email,
          sender: senderName,
          subject: msg.subject || '(No Subject)',
          preview: msg.bodyPreview || '',
          body: msg.body?.content || 'No content',
          time: receivedDate.toLocaleDateString() + ' ' + receivedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
      });
      setEmails(prev => ({ ...prev, [email]: formattedEmails }));
    } catch (e) {
      console.error(`Failed to fetch emails for ${email}:`, e);
      setError(`Failed to fetch emails for ${email}. Please log in again if the token expired.`);
    } finally {
      setIsLoading(false);
    }
  };
  const fetchAllEmails = async () => {
    if (accounts.length === 0) return;
    try {
      const fetchPromises = accounts.map(async (account) => {
        const email = account.email;
        try {
          const response = await fetch(`${API_URL}/api/emails/${encodeURIComponent(email)}`);
          if (response.ok) {
            const fetchedMessages = await response.json();
            return { email, fetchedMessages };
          }
        } catch (err) {
          console.error(`Failed background fetch for ${email}:`, err);
        }
        return null;
      });
      const results = await Promise.all(fetchPromises);
      const newEmailsState = { ...emails };
      let hasUpdates = false;
      results.forEach(result => {
        if (result && result.fetchedMessages) {
          const formattedEmails = result.fetchedMessages.map(msg => {
            const senderName = msg.sender?.emailAddress?.name || msg.sender?.emailAddress?.address || 'Unknown Sender';
            const receivedDate = new Date(msg.receivedDateTime);
            return {
              id: msg.id,
              accountId: result.email,
              sender: senderName,
              subject: msg.subject || '(No Subject)',
              preview: msg.bodyPreview || '',
              body: msg.body?.content || 'No content',
              time: receivedDate.toLocaleDateString() + ' ' + receivedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              timestamp: receivedDate.getTime(),
            };
          });
          newEmailsState[result.email] = formattedEmails;
          hasUpdates = true;
        }
      });
      if (hasUpdates) {
        setEmails(newEmailsState);
      }
    } catch (e) {
      console.error('Failed to fetch all emails:', e);
    }
  };
  useEffect(() => {
    if (accounts.length > 0) {
      fetchAllEmails();
      const intervalId = setInterval(() => {
        fetchAllEmails();
      }, 30000);
      return () => clearInterval(intervalId);
    }
  }, [accounts]);
  const allEmails = useMemo(() => {
    let combined = [];
    Object.values(emails).forEach(accEmails => {
      if (Array.isArray(accEmails)) {
        combined = combined.concat(accEmails);
      }
    });
    return combined.sort((a, b) => b.timestamp - a.timestamp);
  }, [emails]);
  const handleSelectAccount = (account) => {
    setSelectedAccount(account.email);
    setSelectedEmail(null);
    if (!emails[account.email]) {
      fetchEmailsForAccount(account.email);
    }
  };
  const handleAccountSearchSubmit = (e) => {
    e.preventDefault();
    if (filteredAccounts.length > 0) {
      handleSelectAccount(filteredAccounts[0]);
    }
  };
  const fetchRules = async () => {
    try {
      const res = await fetch(`${API_URL}/api/autoforward/rules`);
      if (res.ok) {
        const data = await res.json();
        setRules(data);
      }
    } catch (err) {
      console.error("Failed to load rules", err);
    }
  };

  useEffect(() => {
    if (showAutoForwarder) {
      fetchRules();
      const interval = setInterval(fetchRules, 5000);
      return () => clearInterval(interval);
    }
  }, [showAutoForwarder, API_URL]);

  useEffect(() => {
    if (!showAutoForwarder) return;
    const timer = setTimeout(async () => {
      if (forwardSubject.trim() === '') {
        setForwardedEmailsList([]);
        return;
      }
      setIsSearching(true);
      try {
        const response = await fetch(`${API_URL}/api/forward/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subjectQuery: forwardSubject })
        });
        const data = await response.json();
        if (response.ok) {
          setForwardedEmailsList(data.matchingEmails || []);
        }
      } catch (err) {
        console.error("Search error:", err);
      } finally {
        setIsSearching(false);
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [forwardSubject, showAutoForwarder, API_URL]);

  const handleAddRule = async (e) => {
    e.preventDefault();
    if (!forwardSubject || !targetEmail) return;
    setIsAddingRule(true);
    try {
      const response = await fetch(`${API_URL}/api/autoforward/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectQuery: forwardSubject, targetEmail: targetEmail })
      });
      if (response.ok) {
        setForwardSubject('');
        setTargetEmail('');
        setForwardedEmailsList([]);
        fetchRules();
      }
    } catch (err) {
      console.error("Add rule error:", err);
    } finally {
      setIsAddingRule(false);
    }
  };

  const handleDeleteRule = async (id) => {
    try {
      await fetch(`${API_URL}/api/autoforward/rules/${id}`, { method: 'DELETE' });
      fetchRules();
    } catch (err) {
      console.error("Delete rule error:", err);
    }
  };
  const filteredAccounts = useMemo(() => {
    if (!accountSearchQuery) return accounts;
    const query = accountSearchQuery.toLowerCase();
    return accounts.filter(acc => acc.email.toLowerCase().includes(query));
  }, [accounts, accountSearchQuery]);
  const filteredAllEmails = useMemo(() => {
    if (!emailSearchQuery) return allEmails;
    const query = emailSearchQuery.toLowerCase();
    return allEmails.filter(email =>
      email.subject.toLowerCase().includes(query) ||
      email.sender.toLowerCase().includes(query) ||
      email.preview.toLowerCase().includes(query) ||
      email.accountId.toLowerCase().includes(query)
    );
  }, [allEmails, emailSearchQuery]);
  const currentAccountEmails = emails[selectedAccount] || [];
  const filteredEmails = useMemo(() => {
    if (!emailSearchQuery) return currentAccountEmails;
    const query = emailSearchQuery.toLowerCase();
    return currentAccountEmails.filter(
      email =>
        email.subject.toLowerCase().includes(query) ||
        email.sender.toLowerCase().includes(query) ||
        email.preview.toLowerCase().includes(query)
    );
  }, [currentAccountEmails, emailSearchQuery]);
  return (
    <div className="app-container">
      <div className="sidebar">
        <div className="sidebar-header">
          <Mail size={24} color="var(--accent)" />
          <span>Hotmail Manager</span>
        </div>
        <div className="sidebar-content">
          <div style={{ margin: '15px 0 10px 5px', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '600' }}>
            Added Hotmails
          </div>
          <div style={{ padding: '0 5px 15px 5px' }}>
            <div className="search-box" style={{ padding: '8px 12px', backgroundColor: 'var(--bg-dark)' }}>
              <Search size={16} color="var(--text-muted)" />
              <input
                type="text"
                placeholder="Search accounts..."
                value={accountSearchQuery}
                onChange={(e) => setAccountSearchQuery(e.target.value)}
                style={{ fontSize: '0.85rem' }}
              />
            </div>
          </div>
          {accounts.length === 0 && (
            <div style={{ padding: '10px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              No accounts added.
            </div>
          )}
          {filteredAccounts.length === 0 && accounts.length > 0 && (
            <div style={{ padding: '10px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              No accounts found.
            </div>
          )}
          {filteredAccounts.map(account => (
            <div
              key={account.email}
              className={`account-item ${selectedAccount === account.email && !showAutoForwarder ? 'active' : ''}`}
              style={{ cursor: 'pointer' }}
              onClick={() => { setShowAutoForwarder(false); handleSelectAccount(account); }}
            >
              <div className="account-info">
                <User size={18} />
                <span className="account-email" title={account.email}>{account.email}</span>
                {account.status === 'blocked' && (
                  <AlertCircle size={14} color="var(--error)" style={{ marginLeft: '4px' }} title="Account locked or requires re-authentication" />
                )}
              </div>
              <button
                className="remove-btn"
                onClick={(e) => handleLogout(account.email, e)}
                title="Remove account"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
        <div className="sidebar-footer">
          <button className="add-btn" onClick={() => { setShowAutoForwarder(true); setSelectedAccount(null); setSelectedEmail(null); }} style={{ marginBottom: '10px', backgroundColor: 'var(--accent)', color: 'white' }}>
            <Send size={18} />
            Forward
          </button>
          <button className="add-btn" onClick={handleLogin}>
            <Plus size={18} />
            Add New Hotmail
          </button>
        </div>
      </div>
      <div className="email-list-pane">
        {showAutoForwarder ? (
          <>
            <div className="list-header">
              <h2 style={{ margin: 0 }}>Forward</h2>
            </div>
            <div style={{ padding: '30px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <form onSubmit={handleAddRule}>
                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Subject Filter</label>
                    <input
                      type="text"
                      className="search-box"
                      placeholder="e.g. Important Invoice"
                      style={{ width: '100%', padding: '12px' }}
                      value={forwardSubject}
                      onChange={(e) => setForwardSubject(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Target Gmail Address</label>
                    <input
                      type="email"
                      className="search-box"
                      placeholder="e.g. my-gmail@gmail.com"
                      style={{ width: '100%', padding: '12px', marginBottom: '15px' }}
                      value={targetEmail}
                      onChange={(e) => setTargetEmail(e.target.value)}
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    className="add-btn"
                    disabled={isAddingRule || !forwardSubject || !targetEmail}
                    style={{ width: '100%', display: 'flex', justifyContent: 'center', backgroundColor: (isAddingRule || !forwardSubject || !targetEmail) ? 'var(--border)' : 'var(--accent)', color: (isAddingRule || !forwardSubject || !targetEmail) ? 'var(--text-muted)' : 'white' }}
                  >
                    {isAddingRule ? 'Adding...' : 'Add Forward Rule'}
                  </button>
                </form>
              </div>
              <button
                onClick={() => setShowAutoForwarder(false)}
                style={{ marginTop: '30px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <ArrowLeft size={18} /> Back to Accounts
              </button>
            </div>
          </>
        ) : !selectedAccount ? (
          <>
            <div className="list-header">
              <h2>Global Inbox</h2>
              <div className="search-box">
                <Search size={18} color="var(--text-muted)" />
                <input
                  type="text"
                  placeholder="Search across all accounts..."
                  value={emailSearchQuery}
                  onChange={(e) => setEmailSearchQuery(e.target.value)}
                />
              </div>
            </div>
            <div className="emails-container">
              {allEmails.length > 0 ? (
                filteredAllEmails.length > 0 ? (
                  filteredAllEmails.map(email => (
                    <div
                      key={`${email.accountId}-${email.id}`}
                      className={`email-item ${selectedEmail?.id === email.id ? 'active' : ''}`}
                      onClick={() => setSelectedEmail(email)}
                    >
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '5px', fontWeight: '500', textTransform: 'uppercase' }}>
                        {email.accountId}
                      </div>
                      <div className="email-sender">
                        <span>{email.sender}</span>
                        <span className="email-time">{email.time}</span>
                      </div>
                      <div className="email-subject">{email.subject}</div>
                      <div className="email-preview">{email.preview}</div>
                    </div>
                  ))
                ) : (
                  <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    No emails match your search.
                  </div>
                )
              ) : (
                <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  {accounts.length === 0 ? "Add an account to view your inbox." : "Loading emails..."}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="list-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
                <button
                  onClick={() => setSelectedAccount(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                >
                  <ArrowLeft size={18} />
                </button>
                <h2 style={{ margin: 0, fontSize: '1rem' }}>
                  {accounts.find(a => a.email === selectedAccount)?.email}
                </h2>
              </div>
              <div className="search-box">
                <Search size={18} color="var(--text-muted)" />
                <input
                  type="text"
                  placeholder="Search in emails..."
                  value={emailSearchQuery}
                  onChange={(e) => setEmailSearchQuery(e.target.value)}
                />
              </div>
            </div>
            <div className="emails-container">
              {error && (
                <div style={{ padding: '20px', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', margin: '10px', borderRadius: '8px', fontSize: '0.9rem' }}>
                  {error}
                </div>
              )}
              {isLoading ? (
                <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Fetching latest emails from Microsoft...
                </div>
              ) : filteredEmails.length > 0 ? (
                filteredEmails.map(email => (
                  <div
                    key={email.id}
                    className={`email-item ${selectedEmail?.id === email.id ? 'active' : ''}`}
                    onClick={() => setSelectedEmail(email)}
                  >
                    <div className="email-sender">
                      <span>{email.sender}</span>
                      <span className="email-time">{email.time}</span>
                    </div>
                    <div className="email-subject">{email.subject}</div>
                    <div className="email-preview">{email.preview}</div>
                  </div>
                ))
              ) : (
                <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  No emails found.
                </div>
              )}
            </div>
          </>
        )}
      </div>
      <div className="email-detail-pane">
        {showAutoForwarder ? (
          <div style={{ padding: '30px', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', borderBottom: '1px solid var(--border)', paddingBottom: '20px', marginBottom: '20px', flexShrink: 0 }}>
              <Send size={24} color="var(--accent)" />
              <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Active Forwarding Emails</h2>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '10px' }}>
              {isSearching ? (
                <div className="empty-state" style={{ height: '100%', justifyContent: 'center' }}>
                  <Mail size={48} color="var(--accent)" className="animate-pulse" />
                  <p>Searching all accounts for matching emails...</p>
                </div>
              ) : forwardedEmailsList.length > 0 ? (
                <div>
                  <h3 style={{ fontSize: '1rem', marginBottom: '15px', color: 'var(--text-muted)' }}>Found {forwardedEmailsList.length} matching emails (Preview):</h3>
                  <div className="emails-container" style={{ padding: 0 }}>
                    {forwardedEmailsList.map((em, index) => (
                      <div
                        key={index}
                        className={`email-item ${expandedPreviewIndex === index ? 'active' : ''}`}
                        onClick={() => setExpandedPreviewIndex(expandedPreviewIndex === index ? null : index)}
                        style={{ marginBottom: '10px', border: '1px solid var(--border)' }}
                      >
                        <div style={{ fontSize: '0.75rem', color: 'var(--accent)', marginBottom: '5px', fontWeight: 'bold', textTransform: 'uppercase' }}>
                          Found in: {em.account}
                        </div>
                        <div className="email-sender">
                          <span>{em.sender}</span>
                          <span className="email-time">{em.time}</span>
                        </div>
                        <div className="email-subject">{em.subject}</div>
                        {expandedPreviewIndex !== index ? (
                          <div className="email-preview">{em.preview}</div>
                        ) : null}
                        {expandedPreviewIndex === index && (
                          <div
                            className="detail-body"
                            style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid var(--border)', fontSize: '0.9rem', color: 'var(--text-main)', cursor: 'text' }}
                            dangerouslySetInnerHTML={{ __html: em.body }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : rules.length > 0 ? (
                <div>
                  <h3 style={{ fontSize: '1rem', marginBottom: '15px', color: 'var(--text-muted)' }}>Active Forwarding Emails:</h3>
                  <div className="emails-container" style={{ padding: 0 }}>
                    {rules.map((rule) => (
                      <div
                        key={rule._id}
                        className="email-item"
                        style={{ marginBottom: '15px', border: '1px solid var(--border)', borderRadius: '12px', padding: '15px', cursor: 'default', background: 'var(--bg-main)', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', transition: 'all 0.2s' }}
                        onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 6px 12px rgba(0,0,0,0.1)'; }}
                        onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.05)'; }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ display: 'flex', gap: '15px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: '50%', backgroundColor: 'rgba(16, 185, 129, 0.1)', flexShrink: 0 }}>
                              <Mail size={16} color="#10b981" />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                 <span style={{ fontSize: '0.95rem', color: 'var(--text-main)', fontWeight: '600' }}>Active Forwarding Email</span>
                                 <span style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 'bold', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: 'rgba(16,185,129,0.1)', padding: '2px 8px', borderRadius: '10px' }}>
                                   <span className="animate-pulse" style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981' }}></span>
                                   Monitoring 24/7
                                 </span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', fontSize: '0.9rem' }}>
                                 <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                   <span style={{ color: 'var(--text-muted)' }}>Subject matches:</span>
                                   <span style={{ backgroundColor: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '2px 8px', borderRadius: '6px', fontWeight: '600', color: '#10b981' }}>"{rule.subjectQuery}"</span>
                                 </div>
                                 <span style={{ color: 'var(--border)' }}>→</span>
                                 <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                   <span style={{ color: 'var(--text-muted)' }}>Forwards to:</span>
                                   <span style={{ backgroundColor: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '2px 8px', borderRadius: '6px', fontWeight: '600', color: '#10b981' }}>{rule.targetEmail}</span>
                                   <span style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <div style={{ width: '6px', height: '6px', backgroundColor: '#10b981', borderRadius: '50%' }}></div>
                                    Monitoring 24/7
                                  </span>
                                  {rule.forwardCount > 0 ? (
                                    <span style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }} title={`Last forwarded at: ${new Date(rule.lastForwardedAt).toLocaleString()}`}>
                                      ✅ Complete ({rule.forwardCount} forwarded)
                                    </span>
                                  ) : (
                                    <span style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                      ⏳ Pending (Listening...)
                                    </span>
                                  )}
                                 </div>
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => handleDeleteRule(rule._id)}
                            style={{ padding: '6px 10px', backgroundColor: 'var(--bg-dark)', color: 'var(--danger)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: '500', fontSize: '0.75rem', transition: 'all 0.2s', flexShrink: 0 }}
                            onMouseOver={(e) => { e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)'; }}
                            onMouseOut={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-dark)'; }}
                          >
                            <Trash2 size={14} /> Stop
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="empty-state" style={{ height: '100%', justifyContent: 'center' }}>
                  <Send size={48} color="var(--border)" />
                  <p>No active forwarding emails. Add a rule on the left.</p>
                </div>
              )}
            </div>
          </div>
        ) : selectedEmail ? (
          <>
            <div className="detail-header">
              <div className="detail-subject">{selectedEmail.subject}</div>
              <div className="detail-meta">
                <div className="avatar">
                  {selectedEmail.sender.charAt(0).toUpperCase()}
                </div>
                <div className="meta-info">
                  <span className="meta-sender">{selectedEmail.sender}</span>
                  <span className="meta-recipient">
                    To: {selectedEmail.account || (accounts.find(a => a.email === selectedEmail.accountId)?.email) || 'You'}
                  </span>
                </div>
              </div>
            </div>
            <div
              className="detail-body"
              dangerouslySetInnerHTML={{ __html: selectedEmail.body }}
            />
          </>
        ) : showAutoForwarder ? (
          <div className="empty-state">
            <Send size={48} strokeWidth={1} color="var(--accent)" />
            <p>Bots are running continuously in the background</p>
          </div>
        ) : (
          <div className="empty-state">
            <Mail size={48} strokeWidth={1} />
            <p>{selectedAccount ? "Select an email to read" : "Search and select a Hotmail account first"}</p>
          </div>
        )}
      </div>
    </div>
  );
}
