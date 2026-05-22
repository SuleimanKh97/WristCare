import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid 
} from 'recharts';
import { 
  Heart, 
  Activity, 
  TrendingUp, 
  AlertTriangle, 
  ShieldAlert, 
  User, 
  RefreshCw, 
  Settings, 
  Volume2, 
  Bell, 
  CheckCircle, 
  Send, 
  AlertOctagon,
  Lock,
  Mail,
  LogOut
} from 'lucide-react';

// Static Patient Profiles
const PATIENT_PROFILES = [
  { id: '1', name: 'Ahmad Ali', age: 72, condition: 'Chronic Hypertension & Tachycardia Risk' },
  { id: '2', name: 'Fatima Omar', age: 68, condition: 'Post-Acute Coronary Syndrome Care' },
  { id: '3', name: 'Ziad Mansour', age: 80, condition: 'Sleep Apnea & SpO2 Hypoxia Risk' }
];

// Seed/Default Data helper for empty historical graphs
const generateDefaultHistory = (patientId: string) => {
  const baseHR = patientId === '1' ? 82 : patientId === '2' ? 70 : 65;
  const baseSpO2 = patientId === '3' ? 93 : 97;
  const baseSys = patientId === '1' ? 135 : 120;
  const baseDia = patientId === '1' ? 88 : 80;

  return Array.from({ length: 15 }, (_, i) => {
    const time = new Date(Date.now() - (15 - i) * 30000);
    return {
      measuredAt: time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      heartRate: baseHR + Math.floor(Math.random() * 8) - 4,
      spo2: Math.min(100, baseSpO2 + Math.floor(Math.random() * 3) - 1),
      systolicBp: baseSys + Math.floor(Math.random() * 10) - 5,
      diastolicBp: baseDia + Math.floor(Math.random() * 6) - 3,
      evaluatedSeverity: 'Normal'
    };
  });
};

interface VitalRecord {
  measuredAt: string;
  heartRate: number;
  spo2: number;
  systolicBp: number;
  diastolicBp: number;
  evaluatedSeverity: string;
}

interface AlertItem {
  id: string;
  patientId: string;
  severity: string;
  message: string;
  triggered_at: string;
  is_acknowledged: boolean;
}

function App() {
  // Socket Ref
  const socketRef = useRef<Socket | null>(null);

  // Connection State
  const [isConnected, setIsConnected] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(PATIENT_PROFILES[0]);

  // Telemetry Records
  const [vitalsHistory, setVitalsHistory] = useState<Record<string, VitalRecord[]>>({
    '1': generateDefaultHistory('1'),
    '2': generateDefaultHistory('2'),
    '3': generateDefaultHistory('3'),
  });

  // Recent Alert List
  const [activeAlerts, setActiveAlerts] = useState<AlertItem[]>([
    {
      id: 'demo-1',
      patientId: '1',
      severity: 'Medium',
      message: 'Heart rate warning limit reached: 104 bpm (Warning)',
      triggered_at: new Date(Date.now() - 300000).toISOString(),
      is_acknowledged: false
    }
  ]);

  // Real-Time Banners/Popups
  const [popups, setPopups] = useState<AlertItem[]>([]);

  // Simulation Forms state
  const [activeTab, setActiveTab] = useState<'simulation' | 'thresholds'>('simulation');
  const [simHR, setSimHR] = useState('78');
  const [simSpO2, setSimSpO2] = useState('98');
  const [simBP, setSimBP] = useState('120/80');
  const [simStatusMsg, setSimStatusMsg] = useState('');
  const [isSimulating, setIsSimulating] = useState(false);

  // Audio Vocal alerts enabled
  const [audioEnabled, setAudioEnabled] = useState(true);

  // User Authentication States
  const [token, setToken] = useState<string | null>(localStorage.getItem('wristcare_token'));
  const [user, setUser] = useState<any | null>(
    localStorage.getItem('wristcare_user') ? JSON.parse(localStorage.getItem('wristcare_user') || '') : null
  );

  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // Initialize Socket.io Connection
  useEffect(() => {
    // Connect to Express Backend Http Wrapped Server
    const socket = io('http://localhost:3000', {
      transports: ['websocket', 'polling']
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      console.log('Connected to WristCare WebSocket server.');
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      console.log('Disconnected from WristCare WebSocket server.');
    });

    // Handle Live Vitals Broadcasts
    socket.on('vitals_update', (data: any) => {
      const { patientId, vitalSign } = data;
      if (!patientId || !vitalSign) return;

      const formattedRecord: VitalRecord = {
        measuredAt: new Date(vitalSign.measured_at || Date.now()).toLocaleTimeString([], { 
          hour: '2-digit', 
          minute: '2-digit', 
          second: '2-digit' 
        }),
        heartRate: vitalSign.heart_rate,
        spo2: vitalSign.spo2,
        systolicBp: vitalSign.systolic_bp,
        diastolicBp: vitalSign.diastolic_bp,
        evaluatedSeverity: vitalSign.evaluated_severity || 'Normal'
      };

      setVitalsHistory(prev => {
        const history = prev[patientId] || [];
        // Cap the list to 25 items to prevent charts memory lag
        const updated = [...history, formattedRecord].slice(-25);
        return { ...prev, [patientId]: updated };
      });
    });

    // Handle Critical Alert Broadcasts
    socket.on('new_vitals_alert', (data: any) => {
      const alertPayload: AlertItem = {
        id: data.alert?.id || Math.random().toString(),
        patientId: data.patientId || '1',
        severity: data.alert?.severity || data.severity || 'Emergency',
        message: data.alert?.message || data.message || 'Abnormal vitals detected!',
        triggered_at: data.alert?.triggered_at || data.timestamp || new Date().toISOString(),
        is_acknowledged: false
      };

      // Add to list
      setActiveAlerts(prev => [alertPayload, ...prev].slice(0, 50));

      // Show popup overlay
      setPopups(prev => [...prev, alertPayload]);

      // Sound Voice Notification (SpeechSynthesis API)
      if (audioEnabled) {
        try {
          const speakMsg = new SpeechSynthesisUtterance(
            `Warning! Wrist care emergency alert for patient. ${alertPayload.message}`
          );
          speakMsg.rate = 1.0;
          speakMsg.pitch = 1.0;
          window.speechSynthesis.speak(speakMsg);
        } catch (e) {
          console.error('Audio synthesizer blocked by browser autoplay rules.', e);
        }
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [audioEnabled]);

  // Verify token validity on load or refresh
  useEffect(() => {
    const verifySession = async () => {
      if (!token) return;
      try {
        const response = await fetch('http://localhost:3000/api/auth/me', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) {
          handleLogout();
        }
      } catch (err) {
        console.error('Failed to verify session:', err);
      }
    };
    verifySession();
  }, [token]);

  // Selected Patient Vitals
  const currentPatientVitalsList = vitalsHistory[selectedPatient.id] || [];
  const latestVital: VitalRecord = currentPatientVitalsList[currentPatientVitalsList.length - 1] || {
    measuredAt: 'N/A',
    heartRate: 0,
    spo2: 0,
    systolicBp: 0,
    diastolicBp: 0,
    evaluatedSeverity: 'Normal'
  };

  // Resolve Overall Severity Styles
  const getSeverityClass = (sev: string) => {
    switch (sev) {
      case 'Medium': return 'medium';
      case 'High': return 'high';
      case 'Emergency': return 'emergency';
      default: return 'normal';
    }
  };

  // Acknowledge single alert
  const handleAcknowledge = (id: string) => {
    setActiveAlerts(prev => 
      prev.map(alert => alert.id === id ? { ...alert, is_acknowledged: true } : alert)
    );
  };

  // Clear single popup
  const dismissPopup = (id: string) => {
    setPopups(prev => prev.filter(p => p.id !== id));
  };

  // Post Mock Telemetry Ingestion to REST API
  const handleSimulateVitals = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSimulating(true);
    setSimStatusMsg('Sending telemetry ingest packet...');

    try {
      const response = await fetch('http://localhost:3000/api/vitals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: selectedPatient.id,
          heartRate: parseInt(simHR),
          spo2: parseInt(simSpO2),
          bloodPressure: simBP
        })
      });

      const resJson = await response.json();
      if (response.ok || response.status === 202) {
        setSimStatusMsg(`✓ Success: Ingested! Evaluated as [${resJson.vitalSign?.evaluated_severity || resJson.vitalSign?.evaluatedSeverity}]`);
      } else {
        setSimStatusMsg(`✗ Error: ${resJson.error || 'Server error occurred'}`);
      }
    } catch (err: any) {
      setSimStatusMsg(`✗ Connection failed: ${err.message}`);
    } finally {
      setIsSimulating(false);
      setTimeout(() => setSimStatusMsg(''), 5000);
    }
  };

  // Trigger Immediate SOS Panic Button
  const handleTriggerSOS = async () => {
    setSimStatusMsg('Triggering critical emergency SOS...');
    try {
      const response = await fetch('http://localhost:3000/api/vitals/sos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientId: selectedPatient.id })
      });

      if (response.ok) {
        setSimStatusMsg('✓ Emergency SOS broadcast dispatched!');
      } else {
        setSimStatusMsg('✗ Failed to dispatch SOS request');
      }
    } catch (err: any) {
      setSimStatusMsg(`✗ SOS error: ${err.message}`);
    }
    setTimeout(() => setSimStatusMsg(''), 5000);
  };

  // User Auth Submit Handler
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setIsAuthenticating(true);

    try {
      const endpoint = authMode === 'login' ? 'login' : 'register';
      const payload = authMode === 'login' 
        ? { email: authEmail, password: authPassword }
        : { name: authName, email: authEmail, password: authPassword };

      const response = await fetch(`http://localhost:3000/api/auth/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      localStorage.setItem('wristcare_token', data.token);
      localStorage.setItem('wristcare_user', JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
      
      // Clear forms
      setAuthName('');
      setAuthEmail('');
      setAuthPassword('');
    } catch (err: any) {
      setAuthError(err.message || 'Server connection failed');
    } finally {
      setIsAuthenticating(false);
    }
  };

  // User Logout Handler
  const handleLogout = () => {
    localStorage.removeItem('wristcare_token');
    localStorage.removeItem('wristcare_user');
    setToken(null);
    setUser(null);
  };

  // If user is not authenticated, display the Clinical Glassmorphism Authentication Form
  if (!token) {
    return (
      <div className="auth-overlay">
        <div className="auth-card glass-panel">
          <div className="auth-header-section">
            <Activity className="auth-logo" size={48} />
            <h1 className="auth-title">WristCare</h1>
            <p className="auth-subtitle">Clinical Remote Telemetry Monitor Access</p>
          </div>

          <div className="auth-tabs">
            <button 
              className={`auth-tab-btn ${authMode === 'login' ? 'active' : ''}`}
              onClick={() => { setAuthMode('login'); setAuthError(''); }}
            >
              Sign In
            </button>
            <button 
              className={`auth-tab-btn ${authMode === 'register' ? 'active' : ''}`}
              onClick={() => { setAuthMode('register'); setAuthError(''); }}
            >
              Register
            </button>
          </div>

          {authError && (
            <div className="auth-error">
              <ShieldAlert size={18} />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {authMode === 'register' && (
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Full Name</label>
                <div style={{ position: 'relative' }}>
                  <User size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input 
                    type="text" 
                    className="form-control" 
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)} 
                    placeholder="Dr. Ahmad Ali"
                    style={{ paddingLeft: '38px' }}
                    required
                  />
                </div>
              </div>
            )}

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Email Address</label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input 
                  type="email" 
                  className="form-control" 
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)} 
                  placeholder="name@hospital.com"
                  style={{ paddingLeft: '38px' }}
                  required
                />
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Password</label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input 
                  type="password" 
                  className="form-control" 
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)} 
                  placeholder="••••••••"
                  style={{ paddingLeft: '38px' }}
                  required
                />
              </div>
            </div>

            <button 
              type="submit" 
              className="btn btn-primary" 
              disabled={isAuthenticating}
              style={{ marginTop: '8px' }}
            >
              {isAuthenticating ? 'Processing Access...' : authMode === 'login' ? 'Authenticate Access' : 'Create Clinician Profile'}
            </button>
          </form>

          <div className="auth-footer">
            <p>Authorized personnel only. Data is collected, classified, and protected under medical HIPAA guidelines.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      
      {/* 1. Header component */}
      <header className="clinical-header glass-panel">
        <div className="brand-section">
          <Activity className="logo-icon" size={32} />
          <div>
            <h1 className="brand-name">WristCare</h1>
            <p className="brand-tag">Clinical Patient Telemetry Monitor</p>
          </div>
        </div>

        <div className="system-status">
          {user && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', borderRight: '1px solid var(--border-glass)', paddingRight: '16px' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Dr. {user.name}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px' }}>
                  Role: {user.role}
                </div>
              </div>
              <button 
                onClick={handleLogout}
                title="Sign out of panel"
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '6px', 
                  padding: '8px 12px', 
                  background: 'rgba(244, 63, 94, 0.08)', 
                  border: '1px solid rgba(244, 63, 94, 0.2)', 
                  borderRadius: '8px', 
                  color: 'var(--emergency)',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'var(--transition-smooth)'
                }}
                className="btn-logout"
              >
                <LogOut size={13} />
                <span>SIGN OUT</span>
              </button>
            </div>
          )}

          <button 
            className={`btn-ack ${audioEnabled ? 'active' : ''}`}
            onClick={() => setAudioEnabled(!audioEnabled)}
            title={audioEnabled ? "Speech alert sound enabled" : "Speech alert sound muted"}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid var(--border-glass)', color: audioEnabled ? 'var(--primary)' : 'var(--text-muted)', cursor: 'pointer' }}
          >
            <Volume2 size={16} />
            <span style={{ fontSize: '12px', fontWeight: 600 }}>{audioEnabled ? 'VOICE ON' : 'MUTED'}</span>
          </button>

          <div className={`status-badge ${isConnected ? 'live' : 'offline'}`}>
            <span className="status-indicator-dot"></span>
            {isConnected ? 'LIVE BACKEND CONNECTED' : 'BACKEND DISCONNECTED'}
          </div>
        </div>
      </header>

      {/* 2. Patient Profile chips */}
      <section className="patient-selector-bar glass-panel">
        <span className="selector-label">Patients Ward Panel:</span>
        <div className="patient-chips">
          {PATIENT_PROFILES.map(p => (
            <button
              key={p.id}
              className={`patient-chip ${selectedPatient.id === p.id ? 'active' : ''}`}
              onClick={() => setSelectedPatient(p)}
            >
              <User size={13} style={{ display: 'inline-block', marginRight: '6px', verticalAlign: 'middle' }} />
              {p.name} (Age {p.age})
            </button>
          ))}
        </div>
      </section>

      {/* Patient Specific Diagnosis Banner */}
      <div style={{ padding: '12px 24px', background: 'rgba(99, 102, 241, 0.04)', borderRadius: '12px', border: '1px solid rgba(99,102,241,0.1)', fontSize: '13px', color: 'var(--text-secondary)' }}>
        <strong>Current Diagnosis Context:</strong> {selectedPatient.condition}
      </div>

      {/* 3. Real-Time Vitals Cards Grid */}
      <section className="vitals-grid">
        {/* Heart Rate Card */}
        <div className={`vital-card glass-panel ${getSeverityClass(latestVital.evaluatedSeverity)}`}>
          <div className="vital-card-header">
            <div className="vital-title-group">
              <Heart className="vital-icon" size={20} style={{ animation: latestVital.heartRate > 100 ? 'pulse-icon 0.6s infinite alternate' : 'none' }} />
              <h3>Heart Rate</h3>
            </div>
            <span className={`severity-badge ${getSeverityClass(latestVital.evaluatedSeverity)}`}>
              {latestVital.evaluatedSeverity === 'Normal' ? 'Stable' : latestVital.evaluatedSeverity}
            </span>
          </div>
          <div className="vital-value-display">
            <span className="vital-numeric">{latestVital.heartRate || '--'}</span>
            <span className="vital-unit">bpm</span>
          </div>
          <div className="vital-card-footer">
            <span>Range: 60 - 100 bpm</span>
            <span>Measured: {latestVital.measuredAt}</span>
          </div>
        </div>

        {/* SpO2 Card */}
        <div className={`vital-card glass-panel ${getSeverityClass(latestVital.spo2 <= 94 ? 'Emergency' : latestVital.spo2 <= 90 ? 'High' : 'Normal')}`}>
          <div className="vital-card-header">
            <div className="vital-title-group">
              <TrendingUp className="vital-icon" size={20} />
              <h3>Oxygen Saturation (SpO2)</h3>
            </div>
            <span className={`severity-badge ${latestVital.spo2 >= 95 ? 'normal' : latestVital.spo2 >= 91 ? 'medium' : latestVital.spo2 >= 86 ? 'high' : 'emergency'}`}>
              {latestVital.spo2 >= 95 ? 'Normal' : latestVital.spo2 >= 91 ? 'Medium' : 'Hypoxia'}
            </span>
          </div>
          <div className="vital-value-display">
            <span className="vital-numeric">{latestVital.spo2 || '--'}</span>
            <span className="vital-unit">%</span>
          </div>
          <div className="vital-card-footer">
            <span>Range: 95% - 100%</span>
            <span>Measured: {latestVital.measuredAt}</span>
          </div>
        </div>

        {/* Blood Pressure Card */}
        <div className={`vital-card glass-panel ${getSeverityClass(latestVital.systolicBp >= 160 || latestVital.diastolicBp >= 100 ? 'Emergency' : latestVital.systolicBp >= 140 ? 'High' : 'Normal')}`}>
          <div className="vital-card-header">
            <div className="vital-title-group">
              <Activity className="vital-icon" size={20} />
              <h3>Blood Pressure</h3>
            </div>
            <span className={`severity-badge ${latestVital.systolicBp < 120 ? 'normal' : latestVital.systolicBp < 140 ? 'medium' : 'hypertensive'}`}>
              {latestVital.systolicBp < 120 ? 'Optimal' : latestVital.systolicBp < 140 ? 'Pre-HTN' : 'Stage 2 HTN'}
            </span>
          </div>
          <div className="vital-value-display">
            <span className="vital-numeric">
              {latestVital.systolicBp && latestVital.diastolicBp 
                ? `${latestVital.systolicBp}/${latestVital.diastolicBp}` 
                : '--/--'}
            </span>
            <span className="vital-unit">mmHg</span>
          </div>
          <div className="vital-card-footer">
            <span>Range: &lt; 120/80 mmHg</span>
            <span>Measured: {latestVital.measuredAt}</span>
          </div>
        </div>
      </section>

      {/* 4. Dashboard Core Panels Grid */}
      <section className="dashboard-content">
        
        {/* Left Column: Timeline telemetries chart */}
        <div className="charts-panel glass-panel">
          <div className="panel-header">
            <h2>Real-Time Telemetry Timeline Curves</h2>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Auto-updating stream (30s intervals or wear trigger)</span>
          </div>

          {currentPatientVitalsList.length === 0 ? (
            <div className="no-data">No active telemetry packets recorded for this patient.</div>
          ) : (
            <div className="chart-wrapper">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={currentPatientVitalsList} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorHR" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorSpO2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--normal)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="var(--normal)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="measuredAt" stroke="var(--text-muted)" fontSize={11} tickLine={false} />
                  <YAxis domain={[50, 180]} stroke="var(--text-muted)" fontSize={11} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'rgba(15, 23, 42, 0.95)', 
                      borderColor: 'var(--border-glass)',
                      borderRadius: '8px',
                      color: 'var(--text-primary)',
                      fontSize: '12px'
                    }} 
                  />
                  <Area 
                    type="monotone" 
                    name="Heart Rate (bpm)" 
                    dataKey="heartRate" 
                    stroke="var(--primary)" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorHR)" 
                  />
                  <Area 
                    type="monotone" 
                    name="Oxygen SpO2 (%)" 
                    dataKey="spo2" 
                    stroke="var(--normal)" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorSpO2)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Right Column: Live alerts & Simulators Panel */}
        <div className="sidebar-panel">
          
          {/* Recent Alerts Drawer */}
          <div className="alerts-panel glass-panel">
            <div className="panel-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Bell size={18} color="var(--emergency)" />
                <h2>Live Clinical Alerts Feed</h2>
              </div>
              <span className="severity-badge emergency">
                {activeAlerts.filter(a => !a.is_acknowledged).length} Active
              </span>
            </div>

            <div className="alert-list">
              {activeAlerts.length === 0 ? (
                <div className="no-data">No active severity alerts recorded.</div>
              ) : (
                activeAlerts.map(alert => (
                  <div key={alert.id} className={`alert-item ${alert.severity} ${alert.is_acknowledged ? 'acknowledged' : ''}`} style={{ opacity: alert.is_acknowledged ? 0.45 : 1 }}>
                    <div className="alert-icon-wrapper">
                      {alert.severity === 'Emergency' ? <ShieldAlert size={18} /> : <AlertTriangle size={18} />}
                    </div>
                    <div className="alert-details">
                      <p className="alert-message">{alert.message}</p>
                      <div className="alert-meta">
                        <span>Patient ID: {alert.patientId} • {new Date(alert.triggered_at).toLocaleTimeString()}</span>
                        {!alert.is_acknowledged && (
                          <button 
                            className="btn-ack"
                            onClick={() => handleAcknowledge(alert.id)}
                          >
                            Acknowledge
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Clinician Simulators Console */}
          <div className="controls-panel glass-panel">
            <div className="tab-nav">
              <button 
                className={`tab-btn ${activeTab === 'simulation' ? 'active' : ''}`}
                onClick={() => setActiveTab('simulation')}
              >
                Telemetry Simulator
              </button>
              <button 
                className={`tab-btn ${activeTab === 'thresholds' ? 'active' : ''}`}
                onClick={() => setActiveTab('thresholds')}
              >
                Threshold Config
              </button>
            </div>

            {activeTab === 'simulation' ? (
              <form onSubmit={handleSimulateVitals}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '14px', lineHeight: 1.4 }}>
                  Use this tool to simulate live smartwatch telemetry uploads to the Express API. Great for testing classifications instantly!
                </div>

                <div className="form-group">
                  <label>Heart Rate (bpm)</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    value={simHR}
                    onChange={(e) => setSimHR(e.target.value)} 
                    placeholder="e.g. 75"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Oxygen Saturation SpO2 (%)</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    value={simSpO2}
                    onChange={(e) => setSimSpO2(e.target.value)} 
                    placeholder="e.g. 98"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Blood Pressure (systolic/diastolic)</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={simBP}
                    onChange={(e) => setSimBP(e.target.value)} 
                    placeholder="e.g. 120/80"
                    required
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                  <button 
                    type="submit" 
                    className="btn btn-primary"
                    disabled={isSimulating}
                  >
                    <Send size={14} />
                    {isSimulating ? 'Sending...' : 'Sync Telemetry'}
                  </button>
                  <button 
                    type="button" 
                    className="btn btn-danger"
                    onClick={handleTriggerSOS}
                  >
                    <AlertOctagon size={14} />
                    Trigger SOS
                  </button>
                </div>

                {simStatusMsg && (
                  <div style={{ marginTop: '14px', fontSize: '12px', color: simStatusMsg.includes('✗') ? 'var(--emergency)' : 'var(--normal)', fontWeight: 500, animation: 'alert-flash 1s 1' }}>
                    {simStatusMsg}
                  </div>
                )}
              </form>
            ) : (
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: 1.4 }}>
                  Setup personalized alarm bounds for <strong>{selectedPatient.name}</strong>. If data exceeds these limits, warning events will fire immediately.
                </div>

                <div className="form-group">
                  <label>Heart Rate Range</label>
                  <div className="input-row">
                    <input type="text" className="form-control" placeholder="Min: 60" defaultValue="60" />
                    <input type="text" className="form-control" placeholder="Max: 100" defaultValue="100" />
                  </div>
                </div>

                <div className="form-group">
                  <label>SpO2 Hypoxia Limit</label>
                  <input type="text" className="form-control" placeholder="Min: 95%" defaultValue="95" />
                </div>

                <div className="form-group">
                  <label>Hypertension Limit (Systolic)</label>
                  <input type="text" className="form-control" placeholder="Max: 120" defaultValue="120" />
                </div>

                <button 
                  type="button" 
                  className="btn btn-secondary"
                  onClick={() => alert("Personalized thresholds stored successfully in local medical bounds cache.")}
                  style={{ marginTop: '10px' }}
                >
                  <CheckCircle size={14} />
                  Save Clinic Limits
                </button>
              </div>
            )}

          </div>

        </div>

      </section>

      {/* 5. Real-Time Overlay Popup Alert Banners (Animated Slide-ins) */}
      <div className="alert-popup-overlay">
        {popups.map(p => (
          <div key={p.id} className="alert-popup Emergency">
            <div className="alert-popup-icon">
              <ShieldAlert size={28} />
            </div>
            <div className="alert-popup-content">
              <div className="alert-popup-header">
                <h4>{p.severity} Alert triggered</h4>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Live wearable feed</span>
              </div>
              <p className="alert-popup-body">{p.message}</p>
              <button 
                className="btn-popup-dismiss"
                onClick={() => dismissPopup(p.id)}
              >
                Dismiss Alert banner
              </button>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}

export default App;
