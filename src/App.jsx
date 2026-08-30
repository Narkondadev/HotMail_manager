import React, { useState, useEffect, useMemo } from 'react';
import { Mail, Search, Plus, Trash2, User, LogOut, ArrowLeft, Send, AlertCircle, CheckCircle2, Clock, Lock, KeyRound, RefreshCw, ShieldAlert, Users, Pencil } from 'lucide-react';
import './index.css';

function EmailSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '5px' }}>
      {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
        <div
          key={i}
          style={{
            padding: '15px',
            backgroundColor: 'var(--bg-main)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="skeleton-box" style={{ width: '130px', height: '14px' }} />
            <div className="skeleton-box" style={{ width: '70px', height: '12px' }} />
          </div>
          <div className="skeleton-box" style={{ width: '70%', height: '16px' }} />
          <div className="skeleton-box" style={{ width: '90%', height: '12px' }} />
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(localStorage.getItem('isLoggedIn') === 'true');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [accountSearchQuery, setAccountSearchQuery] = useState('');
  const [emailSearchQuery, setEmailSearchQuery] = useState('');
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [emails, setEmails] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // --- OTP SHARE STATE VARIABLES ---
  const isClientPortal = window.location.pathname === '/users';
  const isAdminLoginPath = window.location.pathname === '/login';
  const [showSharePanel, setShowSharePanel] = useState(false);
  const [shareSubject, setShareSubject] = useState('');
  const [customOtp, setCustomOtp] = useState('');
  const [shareHotmail, setShareHotmail] = useState('');
  const [shares, setShares] = useState([]);
  const [isAddingShare, setIsAddingShare] = useState(false);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');

  // --- CUSTOMER MANAGEMENT STATE VARIABLES ---
  const [showCustomerPanel, setShowCustomerPanel] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerOtp, setCustomerOtp] = useState('');
  const [customerHotmails, setCustomerHotmails] = useState([]);
  const [customerAccountSearch, setCustomerAccountSearch] = useState('');
  const [customers, setCustomers] = useState([]);
  const [isAddingCustomer, setIsAddingCustomer] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [customerMobileTab, setCustomerMobileTab] = useState('form');
  const [shareMobileTab, setShareMobileTab] = useState('form');

  // Client Portal specific state
  const [isSecurityVerified, setIsSecurityVerified] = useState(false);
  const [securityOtp, setSecurityOtp] = useState('');
  const [clientHotmail, setClientHotmail] = useState('');
  const [clientOtp, setClientOtp] = useState('');
  const [clientVerified, setClientVerified] = useState(false);
  const [clientShareInfo, setClientShareInfo] = useState(null);
  const [clientCustomerInfo, setClientCustomerInfo] = useState(null);
  const [clientAssignedHotmails, setClientAssignedHotmails] = useState([]);
  const [clientEmails, setClientEmails] = useState([]);
  const [clientLoading, setClientLoading] = useState(false);
  const [clientError, setClientError] = useState('');
  const [selectedClientEmail, setSelectedClientEmail] = useState(null);
  const [testingEmail, setTestingEmail] = useState(null);

  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const API_URL = isLocalhost ? 'http://localhost:5001' : 'https://hotmail-manager-ppna.onrender.com';

  const adminFetch = async (url, options = {}) => {
    const token = localStorage.getItem('adminToken');
    const headers = {
      ...options.headers,
      'Authorization': `Bearer ${token}`
    };
    return fetch(url, { ...options, headers });
  };

  useEffect(() => {
    if (isClientPortal) return; // Client portal does not need admin accounts
    if (!isLoggedIn) return;
    adminFetch(`${API_URL}/api/accounts`)
      .then(res => res.json())
      .then(data => setAccounts(data))
      .catch(err => console.error("Failed to load accounts", err));
  }, [isLoggedIn]);
  const handleLogin = () => {
    window.location.href = `${API_URL}/api/auth/login`;
  };
  const handleLogout = async (email, e) => {
    e.stopPropagation();
    try {
      await adminFetch(`${API_URL}/api/accounts/${encodeURIComponent(email)}`, {
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
      const response = await adminFetch(`${API_URL}/api/emails/${encodeURIComponent(email)}`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        setAccounts(prev => prev.map(acc => acc.email === email ? { ...acc, status: 'blocked' } : acc));
        throw new Error(errData.error || 'Failed to fetch emails');
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
      setError(e.message || `Failed to fetch emails for ${email}.`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectAccount = (account) => {
    setSelectedAccount(account.email);
    setSelectedEmail(null);
    setShowSharePanel(false);
    setShowCustomerPanel(false);
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

  // --- OTP SHARE API ACTIONS ---
  const fetchShares = async () => {
    try {
      const res = await adminFetch(`${API_URL}/api/shares`);
      if (res.ok) {
        const data = await res.json();
        setShares(data);
      }
    } catch (err) {
      console.error("Failed to load shares", err);
    }
  };

  useEffect(() => {
    if (!isLoggedIn || isClientPortal) return;
    fetchShares();
  }, [isLoggedIn]);

  const handleAddShare = async (e) => {
    e.preventDefault();
    if (!shareSubject || !customOtp) return;
    setIsAddingShare(true);
    try {
      const response = await adminFetch(`${API_URL}/api/shares`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjectQuery: shareSubject,
          customOtp: customOtp.trim()
        })
      });
      if (response.ok) {
        setShareSubject('');
        setCustomOtp('');
        fetchShares();
      }
    } catch (err) {
      console.error("Add share error:", err);
    } finally {
      setIsAddingShare(false);
    }
  };

  const handleDeleteShare = async (id) => {
    try {
      await adminFetch(`${API_URL}/api/shares/${id}`, { method: 'DELETE' });
      fetchShares();
    } catch (err) {
      console.error("Delete share error:", err);
    }
  };

  // --- CUSTOMER API ACTIONS ---
  const fetchCustomers = async () => {
    try {
      const res = await adminFetch(`${API_URL}/api/customers`);
      if (res.ok) {
        const data = await res.json();
        setCustomers(data);
      }
    } catch (err) {
      console.error("Failed to load customers", err);
    }
  };

  useEffect(() => {
    if (!isLoggedIn || isClientPortal) return;
    fetchShares();
    fetchCustomers();
  }, [isLoggedIn]);

  const handleEditCustomer = (cust) => {
    setEditingCustomer(cust);
    setCustomerName(cust.name);
    setCustomerOtp(cust.otp);
    setCustomerHotmails(cust.hotmailEmails || []);
    setShowCustomerPanel(true);
    setShowSharePanel(false);
  };

  const cancelEditCustomer = () => {
    setEditingCustomer(null);
    setCustomerName('');
    setCustomerOtp('');
    setCustomerHotmails([]);
  };

  const handleAddCustomer = async (e) => {
    e.preventDefault();
    if (!customerName || !customerOtp || customerHotmails.length === 0) return;
    setIsAddingCustomer(true);
    try {
      const url = editingCustomer
        ? `${API_URL}/api/customers/${editingCustomer._id}`
        : `${API_URL}/api/customers`;
      const method = editingCustomer ? 'PUT' : 'POST';

      const response = await adminFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: customerName,
          otp: customerOtp.trim(),
          hotmailEmails: customerHotmails
        })
      });
      if (response.ok) {
        cancelEditCustomer();
        fetchCustomers();
      }
    } catch (err) {
      console.error("Save customer error:", err);
    } finally {
      setIsAddingCustomer(false);
    }
  };

  const handleDeleteCustomer = async (id) => {
    try {
      await adminFetch(`${API_URL}/api/customers/${id}`, { method: 'DELETE' });
      if (editingCustomer && editingCustomer._id === id) {
        cancelEditCustomer();
      }
      fetchCustomers();
    } catch (err) {
      console.error("Delete customer error:", err);
    }
  };

  const toggleCustomerHotmailSelection = (email) => {
    setCustomerHotmails(prev =>
      prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]
    );
  };

  // --- CLIENT PORTAL API ACTIONS ---
  const handleSecurityGateLogin = async (e) => {
    e.preventDefault();
    setClientLoading(true);
    setClientError('');
    try {
      const res = await fetch(`${API_URL}/api/customers/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp: securityOtp.trim() })
      });
      const data = await res.json();
      if (res.ok) {
        setClientCustomerInfo(data.customer);
        setClientAssignedHotmails(data.customer.hotmailEmails || []);
        setIsSecurityVerified(true);
      } else {
        setClientError(data.error || 'Invalid Customer Access Security OTP code.');
      }
    } catch (err) {
      setClientError('Server error, please try again.');
    } finally {
      setClientLoading(false);
    }
  };

  const handleClientLogin = async (e) => {
    e.preventDefault();
    setClientLoading(true);
    setClientError('');
    try {
      // 1. Try Customer Unlock Endpoint if Security Gate was used
      if (clientCustomerInfo && securityOtp) {
        const custRes = await fetch(`${API_URL}/api/customers/unlock-inbox`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerOtp: securityOtp.trim(),
            hotmailEmail: clientHotmail.trim(),
            shareOtp: clientOtp.trim()
          })
        });
        const custData = await custRes.json();
        if (custRes.ok) {
          setClientShareInfo(custData.share);
          const formatted = custData.emails.map(msg => {
            const senderName = msg.sender?.emailAddress?.name || msg.sender?.emailAddress?.address || 'Unknown Sender';
            const receivedDate = new Date(msg.receivedDateTime);
            return {
              id: msg.id,
              sender: senderName,
              subject: msg.subject || '(No Subject)',
              preview: msg.bodyPreview || '',
              body: msg.body?.content || 'No content',
              time: receivedDate.toLocaleDateString() + ' ' + receivedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            };
          });
          setClientEmails(formatted);
          setClientVerified(true);
          return;
        } else {
          setClientError(custData.error || 'Failed to unlock inbox.');
          return;
        }
      }

      // 2. Fallback to single Hotmail share OTP verification
      const res = await fetch(`${API_URL}/api/shares/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hotmailEmail: clientHotmail.trim(), otp: clientOtp.trim() })
      });
      const data = await res.json();
      if (res.ok) {
        setClientCustomerInfo(null);
        setClientAssignedHotmails([]);
        setClientShareInfo(data.share);
        setClientVerified(true);
        fetchClientEmails(data.share.hotmailEmail, data.share.otp);
        return;
      } else {
        setClientError(data.error || 'Invalid login details.');
      }
    } catch (err) {
      setClientError('Server error, please try again.');
    } finally {
      setClientLoading(false);
    }
  };

  const fetchClientEmails = async (email, otp) => {
    setClientLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/shares/emails?hotmailEmail=${encodeURIComponent(email)}&otp=${encodeURIComponent(otp)}`);
      const data = await res.json();
      if (res.ok) {
        const formatted = data.map(msg => {
          const senderName = msg.sender?.emailAddress?.name || msg.sender?.emailAddress?.address || 'Unknown Sender';
          const receivedDate = new Date(msg.receivedDateTime);
          return {
            id: msg.id,
            sender: senderName,
            subject: msg.subject || '(No Subject)',
            preview: msg.bodyPreview || '',
            body: msg.body?.content || 'No content',
            time: receivedDate.toLocaleDateString() + ' ' + receivedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          };
        });
        setClientEmails(formatted);
      }
    } catch (err) {
      console.error("Failed to fetch client emails", err);
    } finally {
      setClientLoading(false);
    }
  };


  const expiredCount = useMemo(() => accounts.filter(acc => acc.status === 'blocked').length, [accounts]);

  const filteredAccounts = useMemo(() => {
    let list = accounts;
    if (statusFilter === 'expired') {
      list = list.filter(acc => acc.status === 'blocked');
    }
    if (!accountSearchQuery) return list;
    const query = accountSearchQuery.toLowerCase();
    return list.filter(acc => acc.email.toLowerCase().includes(query));
  }, [accounts, accountSearchQuery, statusFilter]);



  const handleTestSingleAccount = async (email, e) => {
    e.stopPropagation();
    setTestingEmail(email);
    try {
      const res = await adminFetch(`${API_URL}/api/accounts/verify-one`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      if (res.ok) {
        const data = await res.json();
        setAccounts(prev => prev.map(acc => acc.email === data.email ? { ...acc, status: data.status } : acc));
      }
    } catch (err) {
      console.error("Failed to test account:", err);
    } finally {
      setTestingEmail(null);
    }
  };

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
  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError('');
    try {
      const res = await fetch(`${API_URL}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword })
      });
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('adminToken', data.token);
        setIsLoggedIn(true);
        window.location.href = '/';
      } else {
        setLoginError('Incorrect email or password');
      }
    } catch (err) {
      setLoginError('Server error, try again later');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // --- CLIENT PORTAL RENDERING ---
  if (isClientPortal) {
    if (!isSecurityVerified) {
      return (
        <div className="auth-page-container">
          <div className="auth-card">
            <div style={{ width: '64px', height: '64px', backgroundColor: 'rgba(16, 185, 129, 0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <KeyRound size={32} color="var(--accent)" />
            </div>
            <h1 style={{ fontSize: '1.5rem', marginBottom: '10px', color: 'var(--text-main)', fontWeight: '700' }}>Security Gate</h1>
            <p style={{ color: 'var(--text-muted)', marginBottom: '25px', fontSize: '0.9rem' }}>Enter your 6-Digit Customer Access Security OTP code to proceed.</p>

            <form onSubmit={handleSecurityGateLogin}>
              <div style={{ marginBottom: '20px' }}>
                <input
                  type="text"
                  placeholder="Enter 6-Digit Security OTP"
                  value={securityOtp}
                  onChange={(e) => setSecurityOtp(e.target.value)}
                  required
                  maxLength={6}
                  style={{ width: '100%', padding: '14px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '1.2rem', outline: 'none', backgroundColor: 'var(--bg-main)', letterSpacing: '3px', textAlign: 'center', fontWeight: 'bold', boxSizing: 'border-box' }}
                />
              </div>
              {clientError && <div style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: '20px' }}>{clientError}</div>}

              <button
                type="submit"
                disabled={clientLoading || !securityOtp}
                style={{ width: '100%', padding: '14px', backgroundColor: 'var(--accent)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '1rem', fontWeight: '600', cursor: clientLoading ? 'not-allowed' : 'pointer', opacity: clientLoading ? 0.7 : 1 }}
              >
                {clientLoading ? 'Verifying...' : 'Verify & Access Portal'}
              </button>
            </form>
          </div>
        </div>
      );
    }

    if (!clientVerified) {
      return (
        <div className="auth-page-container">
          <div className="auth-card">
            <div style={{ width: '64px', height: '64px', backgroundColor: 'rgba(16, 185, 129, 0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <Mail size={32} color="var(--accent)" />
            </div>
            <h1 style={{ fontSize: '1.5rem', marginBottom: '10px', color: 'var(--text-main)', fontWeight: '700' }}>User Portal</h1>
            <p style={{ color: 'var(--text-muted)', marginBottom: '25px', fontSize: '0.9rem' }}>Welcome {clientCustomerInfo?.name}! Enter your Hotmail address and OTP code to unlock your inbox.</p>

            <form onSubmit={handleClientLogin}>
              <div style={{ marginBottom: '15px' }}>
                <input
                  type="email"
                  placeholder="Enter Hotmail Address"
                  value={clientHotmail}
                  onChange={(e) => setClientHotmail(e.target.value)}
                  required
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '1rem', outline: 'none', backgroundColor: 'var(--bg-main)', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ marginBottom: '20px' }}>
                <input
                  type="text"
                  placeholder="Enter 6-Digit OTP / Subject Code"
                  value={clientOtp}
                  onChange={(e) => setClientOtp(e.target.value)}
                  required
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '1rem', outline: 'none', backgroundColor: 'var(--bg-main)', letterSpacing: '1px', textAlign: 'center', fontWeight: 'bold', boxSizing: 'border-box' }}
                />
              </div>
              {clientError && <div style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: '20px' }}>{clientError}</div>}

              <button
                type="submit"
                disabled={clientLoading || !clientHotmail || !clientOtp}
                style={{ width: '100%', padding: '14px', backgroundColor: 'var(--accent)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '1rem', fontWeight: '600', cursor: clientLoading ? 'not-allowed' : 'pointer', opacity: clientLoading ? 0.7 : 1 }}
              >
                {clientLoading ? 'Verifying...' : 'Unlock Inbox'}
              </button>
            </form>
          </div>
        </div>
      );
    }

    const clientLogout = () => {
      setIsSecurityVerified(false); setSecurityOtp('');
      setClientVerified(false); setClientShareInfo(null);
      setClientCustomerInfo(null); setClientAssignedHotmails([]);
      setClientHotmail(''); setClientOtp(''); setSelectedClientEmail(null);
    };

    return (
      <div className="app-container">
        {/* Inbox list — hidden on mobile when reading an email */}
        <div className={`sidebar ${selectedClientEmail ? 'mobile-hidden' : ''}`} style={{ width: '380px', minWidth: '280px' }}>
          <div className="sidebar-header" style={{ justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Mail size={22} color="var(--accent)" />
              <span>{clientCustomerInfo ? clientCustomerInfo.name : 'Shared Inbox'}</span>
            </div>
            <button
              onClick={clientLogout}
              title="Exit portal"
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.82rem', fontWeight: '600', padding: '6px 10px', borderRadius: '8px', transition: 'background 0.15s' }}
            >
              <LogOut size={15} /> Exit
            </button>
          </div>

          <div className="sidebar-content" style={{ padding: '16px' }}>
            {/* Account info card */}
            <div style={{ marginBottom: '16px', padding: '14px', backgroundColor: 'rgba(16,185,129,0.06)', borderRadius: '12px', border: '1px solid rgba(16,185,129,0.12)' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.05em', marginBottom: '4px' }}>Target Account</div>
              <div style={{ fontSize: '0.88rem', fontWeight: '600', color: 'var(--text-main)', wordBreak: 'break-all', marginBottom: '10px' }}>{clientShareInfo?.hotmailEmail}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.05em', marginBottom: '4px' }}>Subject Filter</div>
              <span style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#059669', padding: '3px 10px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: '700' }}>
                "{clientShareInfo?.subjectQuery}"
              </span>
            </div>

            {/* Inbox header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.05em' }}>Messages ({clientEmails.length})</div>
              <button
                onClick={() => handleClientLogin({ preventDefault: () => {} })}
                disabled={clientLoading}
                style={{ background: 'none', border: '1px solid var(--border-strong)', padding: '4px 10px', borderRadius: '6px', color: 'var(--accent)', cursor: clientLoading ? 'not-allowed' : 'pointer', fontSize: '0.72rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.15s' }}
              >
                <RefreshCw size={11} style={{ animation: clientLoading ? 'spin 1s linear infinite' : 'none' }} />
                {clientLoading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>

            {/* Email list */}
            <div className="emails-container" style={{ padding: 0 }}>
              {clientLoading ? (
                <EmailSkeleton />
              ) : clientEmails.length > 0 ? (
                clientEmails.map(email => (
                  <div
                    key={email.id}
                    className={`email-item ${selectedClientEmail?.id === email.id ? 'active' : ''}`}
                    onClick={() => setSelectedClientEmail(email)}
                    style={{ border: '1px solid var(--border)', borderRadius: '10px', marginBottom: '8px' }}
                  >
                    <div className="email-sender">
                      <span style={{ fontWeight: '600' }}>{email.sender}</span>
                      <span className="email-time">{email.time}</span>
                    </div>
                    <div className="email-subject">{email.subject}</div>
                    <div className="email-preview">{email.preview}</div>
                  </div>
                ))
              ) : (
                <div style={{ padding: '30px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.88rem' }}>No messages found.</div>
              )}
            </div>
          </div>
        </div>

        {/* Email detail pane */}
        <div className={`email-detail-pane ${!selectedClientEmail ? 'mobile-hidden' : ''}`} style={{ flex: 1 }}>
          {selectedClientEmail ? (
            <>
              <div className="detail-header">
                <button className="mobile-back-btn" onClick={() => setSelectedClientEmail(null)}>
                  <ArrowLeft size={15} /> Back to Messages
                </button>
                <div className="detail-subject">{selectedClientEmail.subject}</div>
                <div className="detail-meta">
                  <div className="avatar">{selectedClientEmail.sender.charAt(0).toUpperCase()}</div>
                  <div className="meta-info">
                    <span className="meta-sender">{selectedClientEmail.sender}</span>
                    <span className="meta-recipient">To: {clientShareInfo?.hotmailEmail}</span>
                  </div>
                </div>
              </div>
              <div className="detail-body" dangerouslySetInnerHTML={{ __html: selectedClientEmail.body }} />
            </>
          ) : (
            <div className="empty-state">
              <Mail size={44} strokeWidth={1} />
              <p>Select an email to view its content</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Redirect to dashboard if logged in and trying to access /login
  if (isLoggedIn && isAdminLoginPath) {
    window.location.href = '/';
    return null;
  }

  // Redirect to login if trying to access root dashboard / and not logged in
  if (!isLoggedIn && !isAdminLoginPath) {
    window.location.href = '/login';
    return null;
  }

  // Show login form if at /login and not logged in
  if (!isLoggedIn && isAdminLoginPath) {
    return (
      <div className="auth-page-container">
        <div className="auth-card">
          <div style={{ width: '64px', height: '64px', backgroundColor: 'rgba(16, 185, 129, 0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <Lock size={32} color="var(--accent)" />
          </div>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '10px', color: 'var(--text-main)', fontWeight: '700' }}>Admin Login</h1>
          <p style={{ color: 'var(--text-muted)', marginBottom: '30px', fontSize: '0.9rem' }}>Please enter the password to access the dashboard.</p>

          <form onSubmit={handleAdminLogin}>
            <div style={{ position: 'relative', marginBottom: '15px' }}>
              <User size={20} color="var(--text-muted)" style={{ position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="email"
                placeholder="Enter admin email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                style={{ width: '100%', padding: '12px 12px 12px 45px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '1rem', outline: 'none', transition: 'border-color 0.2s', backgroundColor: 'var(--bg-main)', boxSizing: 'border-box' }}
                autoFocus
                required
              />
            </div>
            <div style={{ position: 'relative', marginBottom: '20px' }}>
              <KeyRound size={20} color="var(--text-muted)" style={{ position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="password"
                placeholder="Enter password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                style={{ width: '100%', padding: '12px 12px 12px 45px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '1rem', outline: 'none', transition: 'border-color 0.2s', backgroundColor: 'var(--bg-main)', boxSizing: 'border-box' }}
                required
              />
            </div>
            {loginError && <div style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: '20px' }}>{loginError}</div>}

            <button
              type="submit"
              disabled={isLoggingIn || !loginEmail || !loginPassword}
              style={{ width: '100%', padding: '14px', backgroundColor: 'var(--accent)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '1rem', fontWeight: '600', cursor: isLoggingIn || !loginEmail || !loginPassword ? 'not-allowed' : 'pointer', opacity: isLoggingIn || !loginEmail || !loginPassword ? 0.7 : 1, transition: 'all 0.2s' }}
            >
              {isLoggingIn ? 'Verifying...' : 'Access Dashboard'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Determine which pane is active on mobile for admin dashboard
  const mobilePaneActive = selectedEmail ? 'detail'
    : (selectedAccount || showCustomerPanel || showSharePanel) ? 'list'
    : 'sidebar';

  return (
    <div className="app-container">
      {/* ===== SIDEBAR ===== */}
      <div className={`sidebar ${mobilePaneActive !== 'sidebar' ? 'mobile-hidden' : ''}`}>
        <div className="sidebar-header">
          <Mail size={22} color="var(--accent)" />
          <span>Hotmail Manager</span>
        </div>
        <div className="sidebar-content">
          {/* Filter + search */}
          <div style={{ padding: '0 4px 12px 4px', borderBottom: '1px solid var(--border)', marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.05em' }}>
                Hotmail Accounts
              </span>
            </div>

            {accounts.length > 0 && (
              <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                <button
                  onClick={() => setStatusFilter('all')}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                    padding: '6px 8px', borderRadius: '6px',
                    border: statusFilter === 'all' ? '1px solid var(--accent)' : '1px solid var(--border-strong)',
                    fontSize: '0.73rem', fontWeight: '600', cursor: 'pointer',
                    backgroundColor: statusFilter === 'all' ? 'var(--accent)' : 'var(--bg-dark)',
                    color: statusFilter === 'all' ? 'white' : 'var(--text-muted)', transition: 'all 0.2s'
                  }}
                >
                  <CheckCircle2 size={12} /> All ({accounts.length})
                </button>
                <button
                  onClick={() => setStatusFilter('expired')}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                    padding: '6px 8px', borderRadius: '6px',
                    border: statusFilter === 'expired' ? '1px solid var(--danger)' : '1px solid var(--border-strong)',
                    fontSize: '0.73rem', fontWeight: '600', cursor: 'pointer',
                    backgroundColor: statusFilter === 'expired' ? 'var(--danger)' : 'var(--bg-dark)',
                    color: statusFilter === 'expired' ? 'white' : 'var(--text-muted)', transition: 'all 0.2s'
                  }}
                >
                  <ShieldAlert size={12} color={statusFilter === 'expired' ? 'white' : 'var(--danger)'} />
                  Expired ({expiredCount})
                </button>
              </div>
            )}

            <div className="search-box" style={{ padding: '8px 12px' }}>
              <Search size={15} color="var(--text-muted)" />
              <input
                type="text"
                placeholder="Search accounts..."
                value={accountSearchQuery}
                onChange={(e) => setAccountSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Account list */}
          {accounts.length === 0 && (
            <div style={{ padding: '10px 4px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              No accounts added yet.
            </div>
          )}
          {filteredAccounts.length === 0 && accounts.length > 0 && (
            <div style={{ padding: '10px 4px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              No accounts found.
            </div>
          )}
          {filteredAccounts.map(account => (
            <div
              key={account.email}
              className={`account-item ${selectedAccount === account.email ? 'active' : ''}`}
              onClick={() => handleSelectAccount(account)}
            >
              <div className="account-info">
                <User size={16} style={{ flexShrink: 0 }} />
                <span className="account-email" title={account.email}>{account.email}</span>
                {account.status === 'blocked' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }} title="Token Expired">
                    <div style={{ width: '7px', height: '7px', backgroundColor: '#ef4444', borderRadius: '50%', boxShadow: '0 0 5px rgba(239,68,68,0.6)' }} />
                    <span style={{ fontSize: '0.68rem', color: '#ef4444', fontWeight: '700' }}>Exp</span>
                  </div>
                ) : (
                  <div style={{ width: '7px', height: '7px', backgroundColor: '#10b981', borderRadius: '50%', flexShrink: 0, boxShadow: '0 0 5px rgba(16,185,129,0.5)' }} title="Active" />
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
                <button
                  onClick={(e) => handleTestSingleAccount(account.email, e)}
                  disabled={testingEmail === account.email}
                  title="Test Microsoft connection"
                  style={{
                    display: 'flex', alignItems: 'center', gap: '3px',
                    padding: '3px 7px', borderRadius: '5px',
                    border: '1px solid var(--border-strong)',
                    backgroundColor: 'var(--bg-dark)',
                    color: testingEmail === account.email ? 'var(--text-muted)' : '#0ea5e9',
                    fontSize: '0.7rem', fontWeight: '600',
                    cursor: testingEmail === account.email ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  <RefreshCw size={11} style={{ animation: testingEmail === account.email ? 'spin 1s linear infinite' : 'none' }} />
                  {testingEmail === account.email ? '...' : 'Test'}
                </button>
                <button className="remove-btn" onClick={(e) => handleLogout(account.email, e)} title="Remove">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop sidebar footer — hidden on mobile (replaced by bottom nav) */}
        <div className="sidebar-footer">
          <button className="add-btn" style={{ backgroundColor: 'var(--accent)', color: 'white' }}
            onClick={() => { setShowCustomerPanel(true); setShowSharePanel(false); setSelectedAccount(null); setSelectedEmail(null); setCustomerMobileTab('form'); }}>
            <Users size={16} /> Manage Customers
          </button>
          <button className="add-btn" style={{ backgroundColor: 'var(--accent)', color: 'white' }}
            onClick={() => { setShowSharePanel(true); setShowCustomerPanel(false); setSelectedAccount(null); setSelectedEmail(null); setShareMobileTab('form'); }}>
            <KeyRound size={16} /> Share to Client
          </button>
          <button className="add-btn" onClick={handleLogin}>
            <Plus size={16} /> Add New Hotmail
          </button>
        </div>
      </div>

      {/* ===== MOBILE BOTTOM NAV ===== */}
      <nav className="mobile-bottom-nav">
        <button
          className={`mobile-nav-btn ${mobilePaneActive === 'sidebar' && !showCustomerPanel && !showSharePanel ? 'active' : ''}`}
          onClick={() => { setSelectedAccount(null); setSelectedEmail(null); setShowCustomerPanel(false); setShowSharePanel(false); }}
        >
          <Mail size={20} />
          Accounts
        </button>
        <button
          className={`mobile-nav-btn ${showCustomerPanel ? 'active' : ''}`}
          onClick={() => { setShowCustomerPanel(true); setShowSharePanel(false); setSelectedAccount(null); setSelectedEmail(null); setCustomerMobileTab('form'); }}
        >
          <Users size={20} />
          Customers
        </button>
        <button
          className={`mobile-nav-btn ${showSharePanel ? 'active' : ''}`}
          onClick={() => { setShowSharePanel(true); setShowCustomerPanel(false); setSelectedAccount(null); setSelectedEmail(null); setShareMobileTab('form'); }}
        >
          <KeyRound size={20} />
          Share
        </button>
        <button
          className="mobile-nav-btn"
          onClick={handleLogin}
        >
          <Plus size={20} />
          Add
        </button>
      </nav>

      {/* ===== EMAIL LIST / PANEL PANE ===== */}
      <div className={`email-list-pane ${mobilePaneActive !== 'list' ? 'mobile-hidden' : ''}`}>
        {showCustomerPanel ? (
          <>
            <div className="list-header">
              <button
                className="mobile-back-btn"
                onClick={() => { setShowCustomerPanel(false); setEditingCustomer(null); }}
              >
                <ArrowLeft size={16} /> Back to Accounts
              </button>
              <h2 style={{ margin: 0 }}>{editingCustomer ? 'Edit Customer Profile' : 'Customer Access'}</h2>
            </div>
            <div className="mobile-tab-bar">
              <button
                className={`mobile-tab-btn ${customerMobileTab === 'form' ? 'active' : ''}`}
                onClick={() => setCustomerMobileTab('form')}
              >
                {editingCustomer ? '✏️ Edit Profile' : '➕ Add Profile'}
              </button>
              <button
                className={`mobile-tab-btn ${customerMobileTab === 'list' ? 'active' : ''}`}
                onClick={() => setCustomerMobileTab('list')}
              >
                👥 Active ({customers.length})
              </button>
            </div>
            <div className={`sidebar-content ${customerMobileTab === 'list' ? 'mobile-hidden' : ''}`} style={{ padding: '20px', overflowY: 'auto' }}>
              <form onSubmit={handleAddCustomer} style={{ backgroundColor: 'var(--bg-panel)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-strong)' }}>
                <h3 style={{ marginTop: 0, marginBottom: '15px', fontSize: '1rem', color: 'var(--accent)' }}>{editingCustomer ? 'Edit Customer Access' : 'Create New Customer Access'}</h3>
                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Customer Name (Required)</label>
                  <input
                    type="text"
                    className="search-box"
                    placeholder="e.g. John Doe / Client A"
                    style={{ width: '100%', padding: '10px' }}
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    required
                  />
                </div>
                <div style={{ marginBottom: '15px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>6-Digit Access OTP Code (Required)</label>
                    <button
                      type="button"
                      onClick={() => setCustomerOtp(Math.floor(100000 + Math.random() * 900000).toString())}
                      style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold' }}
                    >
                      ⚡ Auto-Generate OTP
                    </button>
                  </div>
                  <input
                    type="text"
                    className="search-box"
                    placeholder="e.g. 654321"
                    style={{ width: '100%', padding: '10px', letterSpacing: '2px', textAlign: 'center', fontWeight: 'bold' }}
                    maxLength={6}
                    value={customerOtp}
                    onChange={(e) => setCustomerOtp(e.target.value)}
                    required
                  />
                </div>
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 'bold' }}>
                      Select Hotmails ({customerHotmails.length}):
                    </label>
                    {customerHotmails.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setCustomerHotmails([])}
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold' }}
                      >
                        Clear Selection
                      </button>
                    )}
                  </div>
                  <div style={{ marginBottom: '10px' }}>
                    <input
                      type="text"
                      className="search-box"
                      placeholder="🔍 Search Hotmail accounts..."
                      value={customerAccountSearch}
                      onChange={(e) => setCustomerAccountSearch(e.target.value)}
                      style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem' }}
                    />
                  </div>
                  <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1px solid var(--border-strong)', borderRadius: '8px', padding: '10px', backgroundColor: 'var(--bg-dark)' }}>
                    {accounts.length === 0 ? (
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No Hotmail accounts available. Add accounts first.</div>
                    ) : (
                      accounts
                        .filter(acc => acc.email.toLowerCase().includes(customerAccountSearch.toLowerCase()))
                        .map(acc => (
                          <label key={acc.email} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 0', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-main)', borderBottom: '1px dashed var(--border)' }}>
                            <input
                              type="checkbox"
                              checked={customerHotmails.includes(acc.email)}
                              onChange={() => toggleCustomerHotmailSelection(acc.email)}
                            />
                            <span style={{ wordBreak: 'break-all' }}>{acc.email}</span>
                          </label>
                        ))
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button
                    type="submit"
                    className="add-btn"
                    disabled={isAddingCustomer || !customerName || !customerOtp || customerHotmails.length === 0}
                    style={{ flex: 1, backgroundColor: 'var(--accent)', color: 'white', padding: '12px', borderRadius: '8px', fontWeight: '600' }}
                  >
                    {isAddingCustomer ? (editingCustomer ? 'Updating...' : 'Creating...') : (editingCustomer ? 'Update Access' : 'Create Access')}
                  </button>
                  {editingCustomer && (
                    <button
                      type="button"
                      onClick={cancelEditCustomer}
                      style={{ backgroundColor: 'var(--bg-dark)', color: 'var(--text-muted)', border: '1px solid var(--border-strong)', padding: '12px 16px', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            </div>
          </>
        ) : showSharePanel ? (
          <>
            <div className="list-header">
              <button
                className="mobile-back-btn"
                onClick={() => setShowSharePanel(false)}
              >
                <ArrowLeft size={16} /> Back to Accounts
              </button>
              <h2 style={{ margin: 0 }}>Share to Client</h2>
            </div>
            <div className="mobile-tab-bar">
              <button
                className={`mobile-tab-btn ${shareMobileTab === 'form' ? 'active' : ''}`}
                onClick={() => setShareMobileTab('form')}
              >
                ⚡ Create OTP
              </button>
              <button
                className={`mobile-tab-btn ${shareMobileTab === 'list' ? 'active' : ''}`}
                onClick={() => setShareMobileTab('list')}
              >
                🔑 Active OTPs ({shares.length})
              </button>
            </div>
            <div className={`sidebar-content ${shareMobileTab === 'list' ? 'mobile-hidden' : ''}`} style={{ padding: '24px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <form onSubmit={handleAddShare}>
                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Subject Filter</label>
                    <input
                      type="text"
                      className="search-box"
                      placeholder="e.g. Netflix"
                      style={{ width: '100%', padding: '12px' }}
                      value={shareSubject}
                      onChange={(e) => setShareSubject(e.target.value)}
                      required
                    />
                  </div>
                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>OTP Code (Required)</label>
                    <input
                      type="text"
                      className="search-box"
                      placeholder="e.g. 123456"
                      style={{ width: '100%', padding: '12px' }}
                      value={customOtp}
                      onChange={(e) => setCustomOtp(e.target.value)}
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    className="add-btn"
                    disabled={isAddingShare || !shareSubject || !customOtp}
                    style={{ width: '100%', display: 'flex', justifyContent: 'center', backgroundColor: (isAddingShare || !shareSubject || !customOtp) ? 'var(--border-strong)' : 'var(--accent)', color: (isAddingShare || !shareSubject || !customOtp) ? 'var(--text-muted)' : 'white' }}
                  >
                    {isAddingShare ? 'Creating...' : 'Create Share OTP'}
                  </button>
                </form>
              </div>
              <button
                onClick={() => setShowSharePanel(false)}
                style={{ marginTop: '24px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}
              >
                <ArrowLeft size={16} /> Back to Accounts
              </button>
            </div>
          </>
        ) : !selectedAccount ? (
          <>
            <div className="list-header">
              <h2>Select Account</h2>
            </div>
            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Select a Hotmail account from the sidebar to view its inbox.
            </div>
          </>
        ) : (
          <>
            <div className="list-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <button
                  onClick={() => setSelectedAccount(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px' }}
                  title="Back to account list"
                >
                  <ArrowLeft size={18} />
                </button>
                <h2 style={{ margin: 0, fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
                <div style={{ padding: '16px', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', margin: '10px', borderRadius: '8px', fontSize: '0.85rem' }}>
                  {error}
                </div>
              )}
              {isLoading ? (
                <EmailSkeleton />
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

      <div className={`email-detail-pane ${mobilePaneActive !== 'detail' ? 'mobile-hidden' : ''}`}>
        {showCustomerPanel ? (
          <div style={{ padding: '24px', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', borderBottom: '1px solid var(--border-strong)', paddingBottom: '16px', marginBottom: '16px', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Users size={22} color="var(--accent)" />
                <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Active Customer Profiles ({customers.length})</h2>
              </div>
              <button
                className="mobile-back-btn"
                onClick={() => setCustomerMobileTab('form')}
                style={{ margin: 0 }}
              >
                + Add Profile
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
              {customers.length > 0 ? (
                <div className="emails-container" style={{ padding: 0 }}>
                  {customers.map((cust) => (
                    <div
                      key={cust._id}
                      className="email-item"
                      style={{ marginBottom: '12px', border: '1px solid var(--border-strong)', borderRadius: '12px', padding: '14px', cursor: 'default', background: 'var(--bg-panel)', boxShadow: '0 2px 4px rgba(0,0,0,0.03)' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                        <div style={{ display: 'flex', gap: '12px', flex: 1, overflow: 'hidden' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: '50%', backgroundColor: 'rgba(16, 185, 129, 0.1)', flexShrink: 0 }}>
                            <User size={18} color="#10b981" />
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, overflow: 'hidden' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '0.95rem', color: 'var(--text-main)', fontWeight: '700' }}>{cust.name}</span>
                              <span style={{ fontSize: '0.8rem', color: 'white', backgroundColor: 'var(--accent)', padding: '2px 8px', borderRadius: '6px', fontWeight: 'bold', letterSpacing: '1px' }}>
                                OTP: {cust.otp}
                              </span>
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                              Assigned Hotmails ({cust.hotmailEmails ? cust.hotmailEmails.length : 0}):
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                              {cust.hotmailEmails && cust.hotmailEmails.map(e => (
                                <span key={e} style={{ backgroundColor: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem', color: 'var(--text-main)', fontWeight: '500', wordBreak: 'break-all' }}>{e}</span>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                          <button
                            onClick={() => { handleEditCustomer(cust); setCustomerMobileTab('form'); }}
                            style={{ padding: '5px 8px', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: 'var(--accent)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px', fontWeight: '500', fontSize: '0.72rem', transition: 'all 0.2s' }}
                            title="Edit customer details"
                          >
                            <Pencil size={13} /> Edit
                          </button>
                          <button
                            onClick={() => handleDeleteCustomer(cust._id)}
                            style={{ padding: '5px 8px', backgroundColor: 'var(--bg-dark)', color: 'var(--danger)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px', fontWeight: '500', fontSize: '0.72rem', transition: 'all 0.2s' }}
                            title="Delete customer profile"
                          >
                            <Trash2 size={13} /> Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '16px', opacity: 0.35, minHeight: '200px' }}>
                  <Users size={48} color="var(--accent)" />
                  <p style={{ margin: 0, fontSize: '0.9rem' }}>No customer profiles created yet.</p>
                </div>
              )}
            </div>
          </div>
        ) : showSharePanel ? (
          <div style={{ padding: '24px', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', borderBottom: '1px solid var(--border-strong)', paddingBottom: '16px', marginBottom: '16px', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <KeyRound size={22} color="var(--accent)" />
                <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Active Customer Shares (OTP)</h2>
              </div>
              <button
                className="mobile-back-btn"
                onClick={() => setShareMobileTab('form')}
                style={{ margin: 0 }}
              >
                + Create OTP
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
              {shares.length > 0 ? (
                <div>
                  <h3 style={{ fontSize: '0.9rem', marginBottom: '12px', color: 'var(--text-muted)' }}>Active OTP Access Codes:</h3>
                  <div className="emails-container" style={{ padding: 0 }}>
                    {shares.map((share) => (
                      <div
                        key={share._id}
                        className="email-item"
                        style={{ marginBottom: '12px', border: '1px solid var(--border-strong)', borderRadius: '12px', padding: '14px', cursor: 'default', background: 'var(--bg-panel)', boxShadow: '0 2px 4px rgba(0,0,0,0.03)' }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                          <div style={{ display: 'flex', gap: '12px', flex: 1, overflow: 'hidden' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: '50%', backgroundColor: 'rgba(16, 185, 129, 0.1)', flexShrink: 0 }}>
                              <KeyRound size={16} color="#10b981" />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, overflow: 'hidden' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.9rem', color: 'var(--text-main)', fontWeight: '600' }}>Active OTP Session</span>
                                <span style={{ fontSize: '0.95rem', color: 'white', backgroundColor: 'var(--accent)', padding: '2px 8px', borderRadius: '6px', fontWeight: 'bold', letterSpacing: '1px' }}>
                                  {share.otp}
                                </span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '0.82rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <span style={{ color: 'var(--text-muted)' }}>Filter:</span>
                                  <span style={{ backgroundColor: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '2px 6px', borderRadius: '4px', fontWeight: '600', color: '#10b981' }}>"{share.subjectQuery}"</span>
                                </div>
                                <span style={{ color: 'var(--border-strong)' }}>•</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <span style={{ color: 'var(--text-muted)' }}>Created:</span>
                                  <span style={{ color: 'var(--text-main)', fontSize: '0.8rem' }}>
                                    {new Date(share.createdAt).toLocaleDateString()} {new Date(share.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => handleDeleteShare(share._id)}
                            style={{ padding: '5px 8px', backgroundColor: 'var(--bg-dark)', color: 'var(--danger)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px', fontWeight: '500', fontSize: '0.72rem', transition: 'all 0.2s', flexShrink: 0 }}
                            title="Delete customer share"
                          >
                            <Trash2 size={13} /> Stop
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '16px', opacity: 0.35, minHeight: '200px' }}>
                  <KeyRound size={48} color="var(--accent)" />
                  <p style={{ margin: 0, fontSize: '0.9rem' }}>No active shares created yet.</p>
                </div>
              )}
            </div>
          </div>
        ) : selectedEmail ? (
          <>
            <div className="detail-header">
              <button
                className="mobile-back-btn"
                onClick={() => setSelectedEmail(null)}
              >
                <ArrowLeft size={16} /> Back to Messages
              </button>
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
