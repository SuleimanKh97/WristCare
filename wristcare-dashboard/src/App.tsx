import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import Swal from 'sweetalert2';
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
  ShieldAlert, 
  User, 
  Bell, 
  CheckCircle, 
  Send, 
  AlertOctagon,
  Lock,
  Mail,
  LogOut,
  Building,
  UserCheck,
  Eye,
  Sliders,
  X
} from 'lucide-react';

const API_BASE = 'http://localhost:3000';

interface VitalRecord {
  id?: string;
  measured_at?: string;
  measuredAt?: string;
  heart_rate: number;
  heartRate?: number;
  spo2: number;
  systolic_bp: number;
  systolicBp?: number;
  diastolic_bp: number;
  diastolicBp?: number;
  evaluated_severity?: string;
}

interface AlertItem {
  id: string;
  patient_id?: string;
  patientId?: string;
  metric: string;
  value: string;
  severity: string;
  status: string;
  message?: string;
  clinician_notes?: string;
  triggered_at: string;
}

interface OrganizationItem {
  id: string;
  name: string;
  license_number: string;
  created_at: string;
  sub_status: string;
  expires_at: string;
  patient_count: number;
  clinician_count: number;
}

function App() {
  const socketRef = useRef<Socket | null>(null);

  // Connection and Session States
  const [isConnected, setIsConnected] = useState(false);
  const [token, setToken] = useState<string | null>(localStorage.getItem('wristcare_token'));
  const [user, setUser] = useState<any | null>(
    localStorage.getItem('wristcare_user') ? JSON.parse(localStorage.getItem('wristcare_user') || '') : null
  );

  // Authenticated Profile State
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [regRole, setRegRole] = useState<'clinician' | 'patient' | 'family' | 'super_admin'>('clinician');
  
  // Base Registration Fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  
  // Role Conditional Registration Fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [orgField, setOrgField] = useState(''); // Holds clinic name or ID
  const [specialty] = useState('General Practice');
  const [birthDate, setBirthDate] = useState('');
  const [familyPatientId, setFamilyPatientId] = useState('');
  const [relationship, setRelationship] = useState('Son');
  const [adminToken, setAdminToken] = useState('');

  // UI status feedbacks
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [vitalsSyncMsg, setVitalsSyncMsg] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

  // Real-Time Telemetry and Alarm states
  const [activeAlerts, setActiveAlerts] = useState<AlertItem[]>([]);
  const [telemetryHistory, setTelemetryHistory] = useState<VitalRecord[]>([]);


  // Simulation forms states
  const [simHR, setSimHR] = useState('72');
  const [simSpO2, setSimSpO2] = useState('98');
  const [simBP, setSimBP] = useState('120/80');

  // Personalized thresholds bounds (for Clinicians)
  const [threshMinHR, setThreshMinHR] = useState('60');
  const [threshMaxHR, setThreshMaxHR] = useState('100');
  const [threshMinSpO2, setThreshMinSpO2] = useState('95');
  const [threshMaxSystolic, setThreshMaxSystolic] = useState('139');
  
  // Super Admin organizations grid
  const [organizations, setOrganizations] = useState<OrganizationItem[]>([]);
  const [selectedOrgSub, setSelectedOrgSub] = useState<OrganizationItem | null>(null);
  const [newSubStatus, setNewSubStatus] = useState('Active');
  const [newSubExpiry, setNewSubExpiry] = useState('');

  // Clinician patient directory
  const [clinicianPatients, setClinicianPatients] = useState<any[]>([
    { id: 'demo-p1', firstName: 'Ahmad', lastName: 'Ali', birth_date: '1954-04-12' },
    { id: 'demo-p2', firstName: 'Fatima', lastName: 'Omar', birth_date: '1958-09-22' }
  ]);
  const [selectedPatientId, setSelectedPatientId] = useState('demo-p1');
  const clinicianPatientsRef = useRef(clinicianPatients);
  useEffect(() => {
    clinicianPatientsRef.current = clinicianPatients;
  }, [clinicianPatients]);
  const selectedPatientIdRef = useRef(selectedPatientId);
  useEffect(() => {
    selectedPatientIdRef.current = selectedPatientId;
  }, [selectedPatientId]);
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // Alerts log history states
  const [viewMode, setViewMode] = useState<'monitor' | 'alerts_history' | 'profile'>('monitor');
  const [allAlertsLog, setAllAlertsLog] = useState<any[]>([]);
  const [isFetchingAllAlerts, setIsFetchingAllAlerts] = useState(false);
  const [selectedLetterAlert, setSelectedLetterAlert] = useState<any | null>(null);

  // Profile and Connections Dynamic States
  const [allClinicians, setAllClinicians] = useState<any[]>([]);
  const [allPatients, setAllPatients] = useState<any[]>([]);
  const [userConnections, setUserConnections] = useState<any>({ doctor: null, family: [], patients: [] });
  const [isFetchingConnections, setIsFetchingConnections] = useState(false);

  // Profile Update Form States
  const [profileName, setProfileName] = useState(user ? user.name : '');
  const [profileEmail, setProfileEmail] = useState(user ? user.email : '');
  const [profileSpecialty, setProfileSpecialty] = useState(user && user.role === 'clinician' ? (user.details?.specialty || 'General Practice') : '');
  const [profileBirthDate, setProfileBirthDate] = useState(user && user.role === 'patient' && user.details?.birth_date ? user.details.birth_date.split('T')[0] : '');
  const [profilePrimaryClinicianId, setProfilePrimaryClinicianId] = useState(user && user.role === 'patient' && user.details?.primary_clinician_id ? user.details.primary_clinician_id : '');
  const [profilePatientId, setProfilePatientId] = useState(user && user.role === 'family' && user.details?.patient_id ? user.details.patient_id : '');
  const [profileRelationship, setProfileRelationship] = useState(user && user.role === 'family' && user.details?.relationship ? user.details.relationship : 'Son');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  // Sync Form States on User Load
  useEffect(() => {
    if (user) {
      setProfileName(user.name || '');
      setProfileEmail(user.email || '');
      if (user.role === 'clinician') {
        setProfileSpecialty(user.details?.specialty || 'General Practice');
      } else if (user.role === 'patient') {
        setProfileBirthDate(user.details?.birth_date ? user.details.birth_date.split('T')[0] : '');
        setProfilePrimaryClinicianId(user.details?.primary_clinician_id || '');
      } else if (user.role === 'family') {
        setProfilePatientId(user.details?.patient_id || '');
        setProfileRelationship(user.details?.relationship || 'Son');
      }
    }
  }, [user]);

  // Fetch Available Clinicians (Doctors)
  const fetchAllClinicians = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/auth/clinicians`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAllClinicians(data);
      }
    } catch (e) {
      console.error('Error fetching clinicians:', e);
    }
  };

  // Fetch Available Patients
  const fetchAllPatients = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/auth/patients`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAllPatients(data);
      }
    } catch (e) {
      console.error('Error fetching patients:', e);
    }
  };

  // Fetch Active Role Connections
  const fetchUserConnections = async () => {
    if (!token) return;
    setIsFetchingConnections(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/connections`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUserConnections(data);
      }
    } catch (e) {
      console.error('Error fetching connections:', e);
    } finally {
      setIsFetchingConnections(false);
    }
  };

  // Execute Dynamic Profile and Connection updates
  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setIsUpdatingProfile(true);

    try {
      const payload: any = {
        name: profileName,
        email: profileEmail
      };

      if (user.role === 'clinician') {
        payload.specialty = profileSpecialty;
      } else if (user.role === 'patient') {
        payload.birthDate = profileBirthDate;
        payload.primaryClinicianId = profilePrimaryClinicianId;
      } else if (user.role === 'family') {
        payload.patientId = profilePatientId;
        payload.relationship = profileRelationship;
      }

      const res = await fetch(`${API_BASE}/api/auth/profile/update`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update profile.');
      }

      // Save credentials locally
      localStorage.setItem('wristcare_user', JSON.stringify(data.user));
      setUser(data.user);

      // Refresh listings
      await Promise.all([
        fetchUserConnections(),
        fetchAllPatients(),
        fetchAllClinicians(),
        fetchClinicianData()
      ]);

      Swal.fire({
        icon: 'success',
        title: 'Profile Updated',
        text: 'Your profile settings and connections have been securely updated.',
        customClass: {
          popup: 'swal-custom-popup',
          title: 'swal-custom-title',
          htmlContainer: 'swal-custom-html',
          confirmButton: 'swal-custom-confirm-btn'
        },
        buttonsStyling: false
      });
    } catch (err: any) {
      Swal.fire({
        icon: 'error',
        title: 'Update Failed',
        text: err.message || 'An error occurred during updating.',
        customClass: {
          popup: 'swal-custom-popup',
          title: 'swal-custom-title',
          htmlContainer: 'swal-custom-html',
          confirmButton: 'swal-custom-confirm-btn'
        },
        buttonsStyling: false
      });
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  // Populate Dropdown Meta-data on token detection
  useEffect(() => {
    if (token && user) {
      if (user.role !== 'super_admin') {
        fetchAllPatients();
        fetchAllClinicians();
        fetchUserConnections();
      }
    }
  }, [token, user]);

  const getPatientBirthDate = (pId: string) => {
    if (!pId) return 'N/A';
    const match = clinicianPatients.find(p => p.id === pId);
    if (match && match.birth_date) return match.birth_date;
    if (pId === 'demo-p1') return '1954-04-12';
    if (pId === 'demo-p2') return '1958-09-22';
    if (pId === 'demo-p3') return '1946-08-15';
    return 'N/A';
  };

  const getPatientName = (pId: string) => {
    if (!pId) return 'Unknown Patient';
    
    // Check in clinician's directory
    const match = clinicianPatients.find(p => p.id === pId);
    if (match) {
      return `${match.firstName} ${match.lastName}`;
    }
    
    // Check if logged-in user is this patient
    if (user && user.role === 'patient' && user.details?.id === pId) {
      return user.name;
    }

    // Check if relationship is mapped
    if (user && user.role === 'family' && user.details?.patient_id === pId) {
      return `${user.details?.rel_first_name || ''} ${user.details?.rel_last_name || 'Relative'}`.trim() || user.name;
    }

    // Mappings for dev/demo fallbacks
    if (pId === 'demo-p1') return 'Ahmad Ali';
    if (pId === 'demo-p2') return 'Fatima Omar';
    if (pId === 'demo-p3') return 'Ziad Mansour';
    if (pId === '1') return 'Ahmad Ali';
    if (pId === '3') return 'Ziad Mansour';

    return `Patient ${pId}`;
  };

  const fetchAllAlertsLog = async () => {
    if (!token) return;
    setIsFetchingAllAlerts(true);
    try {
      const res = await fetch(`${API_BASE}/api/vitals/alerts/all/log`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAllAlertsLog(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsFetchingAllAlerts(false);
    }
  };

  // Initialize WebSockets
  useEffect(() => {
    const socket = io(API_BASE, {
      transports: ['websocket', 'polling']
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      console.log('✓ Socket connected to WristCare Server.');
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      console.log('✗ Socket disconnected from WristCare Server.');
    });

    // Handle incoming telemetry events
    socket.on('vitals_update', (data: any) => {
      const { patientId, vitalSign } = data;
      
      // If we are showing this patient's details
      if (patientId === selectedPatientId || (user && user.role === 'patient' && user.details?.id === patientId)) {
        setTelemetryHistory(prev => {
          const updated = [...prev, {
            id: vitalSign.id,
            measured_at: vitalSign.measured_at,
            heart_rate: vitalSign.heart_rate,
            spo2: vitalSign.spo2,
            systolic_bp: vitalSign.systolic_bp,
            diastolic_bp: vitalSign.diastolic_bp,
            evaluated_severity: vitalSign.evaluated_severity
          }].slice(-25);
          return updated;
        });
      }
    });

    // Handle critical threshold warning notifications
    socket.on('new_vitals_alert', (data: any) => {
      const { patientId, alert } = data;
      
      // Format alert
      const newAlert: AlertItem = {
        id: alert.id || Math.random().toString(),
        patient_id: patientId,
        metric: alert.metric,
        value: alert.value,
        severity: alert.severity,
        status: alert.status,
        triggered_at: alert.triggered_at,
        message: alert.message || `${alert.severity} threshold breach on ${alert.metric}: ${alert.value}`
      };

      // Add to alert listings
      setActiveAlerts(prev => [newAlert, ...prev].slice(0, 50));

      // Add to full alerts log in real-time
      setAllAlertsLog(prev => [
        {
          ...newAlert,
          first_name: getPatientName(patientId).split(' ')[0],
          last_name: getPatientName(patientId).split(' ')[1] || ''
        },
        ...prev
      ]);

      // Trigger a beautiful SweetAlert2 notification overlay matching design specs
      const latestPatients = clinicianPatientsRef.current;
      const name = latestPatients.find(cp => cp.id === patientId)
        ? `${latestPatients.find(cp => cp.id === patientId).firstName} ${latestPatients.find(cp => cp.id === patientId).lastName}`
        : getPatientName(patientId);

      const patientDetails = latestPatients.find(cp => cp.id === patientId);
      const age = patientDetails?.birth_date 
        ? new Date().getFullYear() - new Date(patientDetails.birth_date).getFullYear()
        : null;

      const patientFileHtml = `
        <div style="font-weight: 600; color: #fca5a5; margin-bottom: 14px; text-align: center; font-size: 15px; font-family: var(--font-sans);">
          ⚠️ ${newAlert.message || `${newAlert.severity} threshold breach on ${newAlert.metric}: ${newAlert.value}`}
        </div>
        <div class="glass-panel" style="
          margin: 16px 0 8px 0; 
          padding: 12px 16px; 
          border-radius: 12px; 
          background: rgba(255, 255, 255, 0.03); 
          border: 1px solid rgba(255, 255, 255, 0.05);
          font-size: 12px;
          line-height: 1.5;
          text-align: left;
        ">
          <div style="font-weight: 700; color: #f3f4f6; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 6px; margin-bottom: 6px; font-family: var(--font-heading);">
            👤 Clinical Patient File
          </div>
          <div><strong style="color: #9ca3af;">Full Name:</strong> <span style="color: #fff; font-weight: 700;">${name}</span></div>
          <div><strong style="color: #9ca3af;">Patient ID:</strong> <code style="color: var(--primary); font-weight: 600;">${patientId}</code></div>
          ${age ? `<div><strong style="color: #9ca3af;">Age / DOB:</strong> <span style="color: #fff;">${age} years old (${patientDetails.birth_date})</span></div>` : ''}
        </div>
      `;

      Swal.fire({
        title: `${newAlert.severity} Warning Triggered`,
        html: patientFileHtml,
        icon: 'error',
        confirmButtonText: 'Dismiss Warning Banner',
        customClass: {
          popup: 'swal-custom-popup',
          title: 'swal-custom-title',
          htmlContainer: 'swal-custom-html',
          confirmButton: 'swal-custom-dismiss-btn'
        },
        buttonsStyling: false
      });
    });

    socket.on('alert_acknowledged', (updatedAlert: any) => {
      setActiveAlerts(prev => 
        prev.map(a => a.id === updatedAlert.id ? { ...a, status: 'Acknowledged' } : a)
      );
      setAllAlertsLog(prev => 
        prev.map(a => a.id === updatedAlert.id ? { ...a, status: 'Acknowledged', clinician_notes: updatedAlert.clinician_notes } : a)
      );
      // Wait 5 seconds (faded visual) and then remove from active alerts feed
      setTimeout(() => {
        setActiveAlerts(prev => prev.filter(a => a.id !== updatedAlert.id));
      }, 5000);
    });

    socket.on('alert_resolved', (updatedAlert: any) => {
      setActiveAlerts(prev => 
        prev.map(a => a.id === updatedAlert.id ? { ...a, status: 'Resolved' } : a)
      );
      setAllAlertsLog(prev => 
        prev.map(a => a.id === updatedAlert.id ? { ...a, status: 'Resolved', clinician_notes: updatedAlert.clinician_notes } : a)
      );
      // Wait 5 seconds (faded visual) and then remove from active alerts feed
      setTimeout(() => {
        setActiveAlerts(prev => prev.filter(a => a.id !== updatedAlert.id));
      }, 5000);
    });

    return () => {
      socket.disconnect();
    };
  }, [selectedPatientId, user]);

  // Load telemetry and alerts based on role selection
  useEffect(() => {
    if (!token || !user) return;

    if (user.role === 'super_admin') {
      fetchAdminStats();
    } else if (user.role === 'clinician') {
      fetchClinicianData();
    } else if (user.role === 'patient') {
      fetchPatientVitals(user.details?.id);
      fetchPatientThresholds(user.details?.id);
    } else if (user.role === 'family') {
      const targetId = user.details?.patient_id;
      if (targetId) {
        setSelectedPatientId(targetId);
        fetchPatientVitals(targetId);
        fetchPatientThresholds(targetId);
      }
    }
  }, [token, user, selectedPatientId]);

  const fetchAdminStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/vitals/admin/organizations`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setOrganizations(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchClinicianData = async () => {
    try {
      // Fetch clinic patients from DB
      const res = await fetch(`${API_BASE}/api/auth/patients`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0) {
          const mapped = data.map((p: any) => ({
            id: p.id,
            firstName: p.first_name,
            lastName: p.last_name,
            birth_date: p.birth_date ? p.birth_date.split('T')[0] : 'N/A',
            email: p.email,
            primaryClinicianId: p.primary_clinician_id
          }));
          setClinicianPatients(mapped);
          
          // Use selectedPatientId if it's already in the list, otherwise pick the first one
          const exists = mapped.find((p: any) => p.id === selectedPatientId);
          if (!exists) {
            setSelectedPatientId(mapped[0].id);
          }
        } else {
          // Fallback to demo patients so demo is always rich
          const demoPatients = [
            { id: 'demo-p1', firstName: 'Ahmad', lastName: 'Ali', birth_date: '1954-04-12' },
            { id: 'demo-p2', firstName: 'Fatima', lastName: 'Omar', birth_date: '1958-09-22' },
            { id: 'demo-p3', firstName: 'Ziad', lastName: 'Mansour', birth_date: '1946-08-15' }
          ];
          setClinicianPatients(demoPatients);
        }
      }
      
      // Read historical vitals for active selection
      if (selectedPatientId) {
        fetchPatientVitals(selectedPatientId);
        fetchPatientThresholds(selectedPatientId);
      }
    } catch (e) {
      console.error('Error in fetchClinicianData:', e);
    }
  };

  const fetchPatientVitals = async (pId: string) => {
    if (!pId) return;
    try {
      const res = await fetch(`${API_BASE}/api/vitals/${pId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTelemetryHistory(data.reverse());
      }
      
      // Also fetch alerts for this patient
      const resAlerts = await fetch(`${API_BASE}/api/vitals/alerts/${pId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resAlerts.ok) {
        const alerts = await resAlerts.json();
        setActiveAlerts(alerts.filter((a: any) => a.status !== 'Resolved'));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchPatientThresholds = async (pId: string) => {
    if (!pId) return;
    try {
      const res = await fetch(`${API_BASE}/api/vitals/patients/${pId}/thresholds`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const list = await res.json();
        const hr = list.find((t: any) => t.metric === 'heart_rate');
        const spo2 = list.find((t: any) => t.metric === 'spo2');
        const sys = list.find((t: any) => t.metric === 'systolic_bp');

        if (hr) { setThreshMinHR(hr.min_value); setThreshMaxHR(hr.max_value); }
        if (spo2) { setThreshMinSpO2(spo2.min_value); }
        if (sys) { setThreshMaxSystolic(sys.max_value); }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateThresholds = async () => {
    try {
      const payload = {
        thresholds: [
          { metric: 'heart_rate', min_value: parseFloat(threshMinHR), max_value: parseFloat(threshMaxHR), duration_seconds: 30 },
          { metric: 'spo2', min_value: parseFloat(threshMinSpO2), max_value: 100, duration_seconds: 15 },
          { metric: 'systolic_bp', min_value: 90, max_value: parseFloat(threshMaxSystolic), duration_seconds: 0 },
          { metric: 'diastolic_bp', min_value: 60, max_value: 89, duration_seconds: 0 }
        ]
      };

      const res = await fetch(`${API_BASE}/api/vitals/patients/${selectedPatientId}/thresholds`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        Swal.fire({
          icon: 'success',
          title: 'Saved Successfully',
          text: 'Customized clinical vital thresholds saved successfully.',
          customClass: {
            popup: 'swal-custom-popup',
            title: 'swal-custom-title',
            htmlContainer: 'swal-custom-html',
            confirmButton: 'swal-custom-confirm-btn'
          },
          buttonsStyling: false
        });
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Save Failed',
          text: 'Failed to save vital configurations.',
          customClass: {
            popup: 'swal-custom-popup',
            title: 'swal-custom-title',
            htmlContainer: 'swal-custom-html',
            confirmButton: 'swal-custom-confirm-btn'
          },
          buttonsStyling: false
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgSub) return;
    try {
      const res = await fetch(`${API_BASE}/api/vitals/admin/subscriptions/${selectedOrgSub.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          status: newSubStatus,
          expires_at: newSubExpiry
        })
      });

      if (res.ok) {
        setSelectedOrgSub(null);
        fetchAdminStats();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAcknowledgeAlert = async (id: string) => {
    try {
      await fetch(`${API_BASE}/api/vitals/alerts/${id}/acknowledge`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleResolveAlert = async (id: string) => {
    const { value: notes } = await Swal.fire({
      title: 'Resolve Alert',
      text: 'Enter clinical resolution notes:',
      input: 'text',
      inputPlaceholder: 'Type clinical notes here...',
      showCancelButton: true,
      confirmButtonText: 'Resolve Alert',
      cancelButtonText: 'Cancel',
      customClass: {
        popup: 'swal-custom-popup',
        title: 'swal-custom-title',
        htmlContainer: 'swal-custom-html',
        confirmButton: 'swal-custom-confirm-btn',
        cancelButton: 'swal-custom-cancel-btn',
        input: 'swal-custom-input'
      },
      buttonsStyling: false,
      inputValidator: (value) => {
        if (!value) {
          return 'You must enter clinical notes to resolve this alert!';
        }
      }
    });

    if (!notes) return;
    try {
      await fetch(`${API_BASE}/api/vitals/alerts/${id}/resolve`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ notes })
      });
    } catch (e) {
      console.error(e);
    }
  };

  // Simulating watch inputs to Backend REST endpoint
  const handleIngestSimulation = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSyncing(true);
    setVitalsSyncMsg('Syncing telemetry telemetry packet...');

    try {
      const response = await fetch(`${API_BASE}/api/vitals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: selectedPatientId,
          heartRate: parseInt(simHR),
          spo2: parseInt(simSpO2),
          bloodPressure: simBP
        })
      });

      const resJson = await response.json();
      if (response.ok) {
        setVitalsSyncMsg(`✓ Upload Sync success! Evaluated as [${resJson.vitalSign?.evaluated_severity}]`);
        fetchPatientVitals(selectedPatientId);
      } else {
        setVitalsSyncMsg(`✗ Ingest Error: ${resJson.error || 'Server error'}`);
      }
    } catch (err: any) {
      setVitalsSyncMsg(`✗ Ingestion failed: ${err.message}`);
    } finally {
      setIsSyncing(false);
      setTimeout(() => setVitalsSyncMsg(''), 5000);
    }
  };

  const handleSOSPanic = async () => {
    setVitalsSyncMsg('🚨 Triggering panic manual SOS dispatch...');
    try {
      const response = await fetch(`${API_BASE}/api/vitals/sos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientId: selectedPatientId })
      });
      if (response.ok) {
        setVitalsSyncMsg('✓ Critical SOS broadcast sent successfully.');
        fetchPatientVitals(selectedPatientId);
      }
    } catch (err: any) {
      setVitalsSyncMsg(`✗ SOS error: ${err.message}`);
    }
    setTimeout(() => setVitalsSyncMsg(''), 5000);
  };

  // Form Submissions
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');
    setIsAuthenticating(true);

    try {
      if (authMode === 'login') {
        const response = await fetch(`${API_BASE}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Invalid credentials.');
        
        localStorage.setItem('wristcare_token', data.token);
        localStorage.setItem('wristcare_user', JSON.stringify(data.user));
        
        setToken(data.token);
        setUser(data.user);
      } else {
        // Register Role Payload conditional assignment
        const payload: any = { email, password, name, role: regRole };
        if (regRole === 'clinician') {
          payload.firstName = firstName;
          payload.lastName = lastName;
          payload.organizationId = orgField;
          payload.specialty = specialty;
        } else if (regRole === 'patient') {
          payload.firstName = firstName;
          payload.lastName = lastName;
          payload.organizationId = orgField;
          payload.birthDate = birthDate;
        } else if (regRole === 'family') {
          payload.firstName = firstName;
          payload.lastName = lastName;
          payload.patientId = familyPatientId;
          payload.relationship = relationship;
        } else if (regRole === 'super_admin') {
          payload.adminToken = adminToken;
        }

        const response = await fetch(`${API_BASE}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Registration failed.');

        setAuthSuccess('✓ Registration successful! Authenticating user profile...');
        localStorage.setItem('wristcare_token', data.token);
        localStorage.setItem('wristcare_user', JSON.stringify(data.user));
        
        setToken(data.token);
        setUser(data.user);
      }
    } catch (e: any) {
      setAuthError(e.message || 'Server authentication blocked.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('wristcare_token');
    localStorage.removeItem('wristcare_user');
    setToken(null);
    setUser(null);
    setTelemetryHistory([]);
    setActiveAlerts([]);
  };



  // Rendering CSS Styles Class generator
  const getOverallSeverity = (val: string | undefined) => {
    if (!val) return 'normal';
    if (val === 'Medium') return 'medium';
    if (val === 'High') return 'high';
    if (val === 'Emergency' || val === 'Critical') return 'emergency';
    return 'normal';
  };

  // Auth Layout (Slate Theme Glassmorphism Input drawers)
  if (!token || !user) {
    return (
      <div className="auth-overlay">
        <div className="auth-card glass-panel" style={{ maxWidth: '480px' }}>
          <div className="auth-header-section">
            <Activity className="auth-logo" size={48} style={{ color: 'var(--primary)', filter: 'drop-shadow(0 0 12px rgba(99, 102, 241, 0.4))' }} />
            <h1 className="auth-title">WristCare</h1>
            <p className="auth-subtitle">Remote Elderly Health Monitoring Platform</p>
          </div>

          <div className="auth-tabs">
            <button 
              className={`auth-tab-btn ${authMode === 'login' ? 'active' : ''}`}
              onClick={() => { setAuthMode('login'); setAuthError(''); setAuthSuccess(''); }}
            >
              Sign In
            </button>
            <button 
              className={`auth-tab-btn ${authMode === 'register' ? 'active' : ''}`}
              onClick={() => { setAuthMode('register'); setAuthError(''); setAuthSuccess(''); }}
            >
              Sign Up
            </button>
          </div>

          {authError && <div className="auth-error"><ShieldAlert size={16} /><span>{authError}</span></div>}
          {authSuccess && <div className="auth-success" style={{ padding: '10px 14px', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '8px', color: '#10b981', fontSize: '12px', display: 'flex', gap: '8px' }}><CheckCircle size={16} /><span>{authSuccess}</span></div>}

          <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {authMode === 'register' && (
              <>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Account Role Type</label>
                  <select 
                    className="form-control" 
                    value={regRole} 
                    onChange={(e: any) => setRegRole(e.target.value)}
                    style={{ background: 'var(--slate-900)', color: 'var(--text-primary)' }}
                  >
                    <option value="clinician">Doctor / Medical Clinician</option>
                    <option value="patient">Elderly Patient</option>
                    <option value="family">Family Relative / Guardian</option>
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Full Name</label>
                  <div style={{ position: 'relative' }}>
                    <User size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input 
                      type="text" 
                      className="form-control" 
                      value={name}
                      onChange={(e) => setName(e.target.value)} 
                      placeholder="e.g. Ahmad Suleiman" 
                      style={{ paddingLeft: '38px' }}
                      required
                    />
                  </div>
                </div>

                {/* Role Conditional Fields */}
                {regRole === 'clinician' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>First Name</label>
                      <input type="text" className="form-control" placeholder="Dr. Ahmad" value={firstName} onChange={e => setFirstName(e.target.value)} required />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>Last Name</label>
                      <input type="text" className="form-control" placeholder="Suleiman" value={lastName} onChange={e => setLastName(e.target.value)} required />
                    </div>
                    <div className="form-group" style={{ gridColumn: 'span 2', marginBottom: 0 }}>
                      <label>Clinic / Hospital Name</label>
                      <input type="text" className="form-control" placeholder="e.g. General Hospital" value={orgField} onChange={e => setOrgField(e.target.value)} required />
                    </div>
                  </div>
                )}

                {regRole === 'patient' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>First Name</label>
                      <input type="text" className="form-control" placeholder="e.g. Suleiman" value={firstName} onChange={e => setFirstName(e.target.value)} required />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>Last Name</label>
                      <input type="text" className="form-control" placeholder="e.g. Mansour" value={lastName} onChange={e => setLastName(e.target.value)} required />
                    </div>
                    <div className="form-group" style={{ gridColumn: 'span 2', marginBottom: 0 }}>
                      <label>Assigned Clinic Name</label>
                      <input type="text" className="form-control" placeholder="e.g. Geriatric Center" value={orgField} onChange={e => setOrgField(e.target.value)} required />
                    </div>
                    <div className="form-group" style={{ gridColumn: 'span 2', marginBottom: 0 }}>
                      <label>Date of Birth</label>
                      <input type="date" className="form-control" value={birthDate} onChange={e => setBirthDate(e.target.value)} required />
                    </div>
                  </div>
                )}

                {regRole === 'family' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>First Name</label>
                      <input type="text" className="form-control" placeholder="e.g. Samer" value={firstName} onChange={e => setFirstName(e.target.value)} required />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>Last Name</label>
                      <input type="text" className="form-control" placeholder="e.g. Suleiman" value={lastName} onChange={e => setLastName(e.target.value)} required />
                    </div>
                    <div className="form-group" style={{ gridColumn: 'span 2', marginBottom: 0 }}>
                      <label>Patient ID / Code to Link</label>
                      <input type="text" className="form-control" placeholder="e.g. Patient Name or Code" value={familyPatientId} onChange={e => setFamilyPatientId(e.target.value)} required />
                    </div>
                    <div className="form-group" style={{ gridColumn: 'span 2', marginBottom: 0 }}>
                      <label>Relationship Type</label>
                      <select className="form-control" value={relationship} onChange={e => setRelationship(e.target.value)}>
                        <option value="Son">Son (ابن)</option>
                        <option value="Daughter">Daughter (ابنة)</option>
                        <option value="Spouse">Spouse (زوج/زوجة)</option>
                        <option value="Guardian">Legal Guardian (وصي)</option>
                      </select>
                    </div>
                  </div>
                )}

                {regRole === 'super_admin' && (
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Master Authorization Token</label>
                    <input type="password" className="form-control" placeholder="Enter super admin token" value={adminToken} onChange={e => setAdminToken(e.target.value)} required />
                  </div>
                )}
              </>
            )}

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Email Address</label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input 
                  type="email" 
                  className="form-control" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)} 
                  placeholder="name@wristcare.com" 
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
                  value={password}
                  onChange={(e) => setPassword(e.target.value)} 
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
              {isAuthenticating ? 'Authorizing Session...' : authMode === 'login' ? 'Authenticate Access' : 'Create Secured Profile'}
            </button>
          </form>

          <div className="auth-footer" style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '14px', marginTop: '6px' }}>
            <p>Authorized access points only. All activities are monitored, encrypted, and compiled under compliance with international HIPAA and data privacy guidelines.</p>
          </div>
        </div>
      </div>
    );
  }

  // Active user details
  const latestVital: VitalRecord = telemetryHistory[telemetryHistory.length - 1] || {
    heart_rate: 0,
    spo2: 0,
    systolic_bp: 0,
    diastolic_bp: 0,
    evaluated_severity: 'Normal'
  };

  return (
    <div className="app-container">
      {/* Dynamic Header Component */}
      <header className="clinical-header glass-panel">
        <div className="brand-section">
          <Activity className="logo-icon" size={32} style={{ color: 'var(--primary)', filter: 'drop-shadow(0 0 8px rgba(99, 102, 241, 0.3))' }} />
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
                  {user.name}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '1px' }}>
                  Role: {user.role?.replace('_', ' ')}
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
              >
                <LogOut size={13} />
                <span>SIGN OUT</span>
              </button>
            </div>
          )}

          <div className={`status-badge ${isConnected ? 'live' : 'offline'}`}>
            <span className="status-indicator-dot"></span>
            {isConnected ? 'LIVE CLOUD LINKED' : 'DISCONNECTED'}
          </div>
        </div>
      </header>

      {/* RENDER TAILORED ROLE-BASED DASHBOARD SCREEN */}
      {user.role === 'super_admin' ? (
        // ==========================================
        // 1. SUPER ADMIN VIEW
        // ==========================================
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '24px 0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
            <div className="vital-card glass-panel normal">
              <h4 style={{ color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase' }}>Registered Organizations</h4>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '10px' }}>
                <Building size={24} style={{ color: 'var(--primary)' }} />
                <span style={{ fontSize: '32px', fontWeight: 800 }}>{organizations.length}</span>
              </div>
            </div>
            <div className="vital-card glass-panel normal">
              <h4 style={{ color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase' }}>Active Clinicians Directory</h4>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '10px' }}>
                <UserCheck size={24} style={{ color: 'var(--normal)' }} />
                <span style={{ fontSize: '32px', fontWeight: 800 }}>
                  {organizations.reduce((acc, o) => acc + Number(o.clinician_count), 0)}
                </span>
              </div>
            </div>
            <div className="vital-card glass-panel normal">
              <h4 style={{ color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase' }}>Total Patients Enrolled</h4>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '10px' }}>
                <Activity size={24} style={{ color: 'var(--primary)' }} />
                <span style={{ fontSize: '32px', fontWeight: 800 }}>
                  {organizations.reduce((acc, o) => acc + Number(o.patient_count), 0)}
                </span>
              </div>
            </div>
          </div>

          <div className="charts-panel glass-panel" style={{ width: '100%' }}>
            <div className="panel-header">
              <h2>Hospital Registry & Subscription Billing Manager</h2>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Tenant Status Overview Console</span>
            </div>

            <div style={{ overflowX: 'auto', marginTop: '15px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-glass)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '12px' }}>Organization / Clinic</th>
                    <th style={{ padding: '12px' }}>License Number</th>
                    <th style={{ padding: '12px' }}>Enrolled Patients</th>
                    <th style={{ padding: '12px' }}>Clinicians Staff</th>
                    <th style={{ padding: '12px' }}>Subscription Status</th>
                    <th style={{ padding: '12px' }}>Expiry Date</th>
                    <th style={{ padding: '12px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {organizations.map(org => (
                    <tr key={org.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <td style={{ padding: '12px', fontWeight: 700 }}>{org.name}</td>
                      <td style={{ padding: '12px', color: 'var(--text-muted)' }}>{org.license_number}</td>
                      <td style={{ padding: '12px' }}>{org.patient_count}</td>
                      <td style={{ padding: '12px' }}>{org.clinician_count}</td>
                      <td style={{ padding: '12px' }}>
                        <span style={{ 
                          padding: '3px 8px', 
                          borderRadius: '12px', 
                          fontSize: '11px', 
                          fontWeight: 700,
                          background: org.sub_status === 'Active' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(244, 63, 94, 0.1)',
                          color: org.sub_status === 'Active' ? 'var(--normal)' : 'var(--emergency)'
                        }}>
                          {org.sub_status || 'Active'}
                        </span>
                      </td>
                      <td style={{ padding: '12px', color: 'var(--text-muted)' }}>
                        {org.expires_at ? new Date(org.expires_at).toLocaleDateString() : 'N/A'}
                      </td>
                      <td style={{ padding: '12px' }}>
                        <button 
                          className="btn-ack" 
                          onClick={() => {
                            setSelectedOrgSub(org);
                            setNewSubStatus(org.sub_status || 'Active');
                            setNewSubExpiry(org.expires_at ? new Date(org.expires_at).toISOString().split('T')[0] : '');
                          }}
                          style={{ padding: '4px 8px', fontSize: '11px' }}
                        >
                          Configure Billing
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {selectedOrgSub && (
            <div className="auth-overlay">
              <div className="auth-card glass-panel" style={{ maxWidth: '400px' }}>
                <h3 style={{ color: 'var(--text-primary)', marginBottom: '14px' }}>Configure Subscription tier</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>Adjust subscription tier status and validity dates for <strong>{selectedOrgSub.name}</strong>.</p>
                <form onSubmit={handleUpdateSubscription} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div className="form-group">
                    <label>Billing Tier Status</label>
                    <select className="form-control" value={newSubStatus} onChange={e => setNewSubStatus(e.target.value)}>
                      <option value="Active">Active (فعال)</option>
                      <option value="Past_Due">Past Due (متأخر)</option>
                      <option value="Canceled">Canceled (ملغي)</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Subscription Expiration</label>
                    <input type="date" className="form-control" value={newSubExpiry} onChange={e => setNewSubExpiry(e.target.value)} required />
                  </div>
                  <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                    <button type="submit" className="btn btn-primary">Update Subscription</button>
                    <button type="button" className="btn btn-secondary" onClick={() => setSelectedOrgSub(null)}>Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      ) : user.role === 'clinician' ? (
        // ==========================================
        // 2. CLINICIAN DASHBOARD VIEW
        // ==========================================
        <>
          {/* Dashboard View Mode Toggle */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '16px', flexWrap: 'wrap' }}>
            <div className="glass-panel" style={{ display: 'inline-flex', padding: '4px', borderRadius: '10px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-glass)' }}>
              <button 
                className={`auth-tab-btn ${viewMode === 'monitor' ? 'active' : ''}`}
                onClick={() => setViewMode('monitor')}
                style={{ padding: '8px 18px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, border: 0, cursor: 'pointer', transition: 'var(--transition-smooth)' }}
              >
                Patient Vital Monitor
              </button>
              <button 
                className={`auth-tab-btn ${viewMode === 'alerts_history' ? 'active' : ''}`}
                onClick={() => { setViewMode('alerts_history'); fetchAllAlertsLog(); }}
                style={{ padding: '8px 18px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, border: 0, cursor: 'pointer', transition: 'var(--transition-smooth)' }}
              >
                Comprehensive Alerts History Log
              </button>
              <button 
                className={`auth-tab-btn ${viewMode === 'profile' ? 'active' : ''}`}
                onClick={() => setViewMode('profile')}
                style={{ padding: '8px 18px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, border: 0, cursor: 'pointer', transition: 'var(--transition-smooth)' }}
              >
                My Profile & Patient Directory
              </button>
            </div>

            {viewMode === 'monitor' && (
              <section className="patient-selector-bar glass-panel" style={{ margin: 0, padding: '6px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="selector-label" style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Active Patient:</span>
                <div className="patient-chips" style={{ display: 'flex', gap: '8px' }}>
                  {clinicianPatients.map(p => (
                    <button
                      key={p.id}
                      className={`patient-chip ${selectedPatientId === p.id ? 'active' : ''}`}
                      onClick={() => setSelectedPatientId(p.id)}
                      style={{ padding: '6px 12px', fontSize: '11px', borderRadius: '6px' }}
                    >
                      {p.firstName} {p.lastName}
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>

          {viewMode === 'alerts_history' ? (
            <div className="charts-panel glass-panel" style={{ width: '100%', padding: '24px', animation: 'fadeIn 0.4s ease' }}>
              <div className="panel-header" style={{ marginBottom: '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: 800 }}>Institutional Alerts & Warnings History Log</h2>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Complete database audit trail log of all historical vital signs violations</span>
                </div>
                <button 
                  className="btn-ack" 
                  onClick={fetchAllAlertsLog} 
                  disabled={isFetchingAllAlerts}
                  style={{ padding: '8px 14px', fontSize: '12px', fontWeight: 600 }}
                >
                  {isFetchingAllAlerts ? 'RELOAD DISPATCHED...' : 'REFRESH STREAM'}
                </button>
              </div>

              {isFetchingAllAlerts ? (
                <div className="no-data">Fetching all clinical alerts history stream...</div>
              ) : allAlertsLog.length === 0 ? (
                <div className="no-data">No alerts logged in the historical database.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-glass)', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '12px' }}>Patient Name</th>
                        <th style={{ padding: '12px' }}>Telemetry Metric</th>
                        <th style={{ padding: '12px' }}>Recorded Value</th>
                        <th style={{ padding: '12px' }}>Severity Level</th>
                        <th style={{ padding: '12px' }}>Current Status</th>
                        <th style={{ padding: '12px' }}>Timestamp</th>
                        <th style={{ padding: '12px' }}>Clinical Resolution Notes</th>
                        <th style={{ padding: '12px' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allAlertsLog.map(alert => {
                        const isDimmed = alert.status === 'Acknowledged' || alert.status === 'Resolved';
                        return (
                          <tr 
                            key={alert.id} 
                            style={{ 
                              borderBottom: '1px solid rgba(255,255,255,0.03)', 
                              opacity: isDimmed ? 0.6 : 1,
                              background: alert.status === 'Triggered' ? 'rgba(239, 68, 68, 0.01)' : 'transparent',
                              transition: 'all 0.3s ease'
                            }}
                          >
                            <td style={{ padding: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                              {alert.first_name && alert.last_name 
                                ? `${alert.first_name} ${alert.last_name}`
                                : getPatientName(alert.patient_id || alert.patientId || '')}
                            </td>
                            <td style={{ padding: '12px', textTransform: 'capitalize', color: 'var(--text-secondary)' }}>
                              {alert.metric?.replace('_', ' ')}
                            </td>
                            <td style={{ padding: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>{alert.value}</td>
                            <td style={{ padding: '12px' }}>
                              <span style={{ 
                                padding: '3px 8px', 
                                borderRadius: '12px', 
                                fontSize: '11px', 
                                fontWeight: 700,
                                background: alert.severity === 'Emergency' || alert.severity === 'Critical'
                                  ? 'rgba(244, 63, 94, 0.1)' 
                                  : alert.severity === 'High'
                                    ? 'rgba(245, 158, 11, 0.1)' 
                                    : 'rgba(59, 130, 246, 0.1)',
                                color: alert.severity === 'Emergency' || alert.severity === 'Critical'
                                  ? 'var(--emergency)'
                                  : alert.severity === 'High'
                                    ? 'var(--warning)'
                                    : 'var(--primary)'
                              }}>
                                {alert.severity}
                              </span>
                            </td>
                            <td style={{ padding: '12px' }}>
                              <span style={{ 
                                padding: '3px 8px', 
                                borderRadius: '12px', 
                                fontSize: '11px', 
                                fontWeight: 700,
                                background: alert.status === 'Triggered' 
                                  ? 'rgba(239, 68, 68, 0.15)' 
                                  : alert.status === 'Acknowledged' 
                                    ? 'rgba(245, 158, 11, 0.15)' 
                                    : 'rgba(16, 185, 129, 0.15)',
                                color: alert.status === 'Triggered' 
                                  ? '#f87171' 
                                  : alert.status === 'Acknowledged' 
                                    ? '#fbbf24' 
                                    : '#34d399'
                              }}>
                                {alert.status}
                              </span>
                            </td>
                            <td style={{ padding: '12px', color: 'var(--text-muted)' }}>
                              {new Date(alert.triggered_at).toLocaleString()}
                            </td>
                            <td style={{ padding: '12px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                              {alert.clinician_notes || '--'}
                            </td>
                            <td style={{ padding: '12px' }}>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                {alert.status === 'Triggered' && (
                                  <button className="btn-ack" onClick={() => handleAcknowledgeAlert(alert.id)} style={{ padding: '4px 8px', fontSize: '11px' }}>Acknowledge</button>
                                )}
                                {alert.status !== 'Resolved' && (
                                  <button className="btn-ack" onClick={() => handleResolveAlert(alert.id)} style={{ padding: '4px 8px', fontSize: '11px' }}>Resolve</button>
                                )}
                                <button className="btn-ack" onClick={() => setSelectedLetterAlert(alert)} style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--normal)' }}>Clinical Letter</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : viewMode === 'profile' ? (
            <div className="charts-panel glass-panel" style={{ width: '100%', padding: '24px', animation: 'fadeIn 0.4s ease' }}>
              <div className="panel-header" style={{ marginBottom: '24px' }}>
                <div>
                  <h2 style={{ fontSize: '20px', fontWeight: 800 }}>Dr. {user.name} - Account Profile & Attending Registry</h2>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Manage clinician credentials and view organization connected patient details</span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px', alignItems: 'start' }}>
                {/* Profile Form */}
                <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '16px', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-glass)', paddingBottom: '8px' }}>
                    Clinician Credentials
                  </h3>
                  <form onSubmit={handleProfileUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div className="form-group">
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Full Name</label>
                      <input 
                        type="text" 
                        className="form-control" 
                        value={profileName} 
                        onChange={e => setProfileName(e.target.value)} 
                        required 
                      />
                    </div>
                    <div className="form-group">
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Email Address</label>
                      <input 
                        type="email" 
                        className="form-control" 
                        value={profileEmail} 
                        onChange={e => setProfileEmail(e.target.value)} 
                        required 
                      />
                    </div>
                    <div className="form-group">
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Specialty / Area of Practice</label>
                      <input 
                        type="text" 
                        className="form-control" 
                        value={profileSpecialty} 
                        onChange={e => setProfileSpecialty(e.target.value)} 
                        placeholder="e.g. Cardiology, General Medicine"
                        required 
                      />
                    </div>
                    <button 
                      type="submit" 
                      className="btn btn-primary" 
                      disabled={isUpdatingProfile}
                      style={{ marginTop: '10px' }}
                    >
                      {isUpdatingProfile ? 'Saving Changes...' : 'Update Account'}
                    </button>
                  </form>
                </div>

                {/* Patient Directory */}
                <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '16px', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-glass)', paddingBottom: '8px' }}>
                    Attending Patient Registry ({userConnections.patients?.length || 0})
                  </h3>
                  
                  {isFetchingConnections ? (
                    <div className="no-data">Fetching connection listings...</div>
                  ) : !userConnections.patients || userConnections.patients.length === 0 ? (
                    <div className="no-data" style={{ padding: '40px 20px', textAlign: 'center' }}>
                      <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0 }}>
                        No connected patients registered under your clinic account directory.
                      </p>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '11px', marginTop: '6px' }}>
                        Provide your clinic/organization registration ID to patients. Once they select you as their primary attending clinician, they will appear dynamically in your dashboard.
                      </p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {userConnections.patients.map((pat: any) => (
                        <div key={pat.id} className="glass-panel" style={{ padding: '14px', borderRadius: '8px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: '10px' }}>
                            <div>
                              <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{pat.first_name} {pat.last_name}</h4>
                              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                Born: {pat.birth_date ? pat.birth_date.split('T')[0] : 'N/A'} • Email: {pat.email}
                              </p>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                                <span style={{ fontSize: '10px', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.04)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                  ID: <code style={{ color: 'var(--primary)' }}>{pat.id}</code>
                                </span>
                                <button 
                                  onClick={() => {
                                    navigator.clipboard.writeText(pat.id);
                                    Swal.fire({
                                      icon: 'success',
                                      title: 'Copied!',
                                      text: 'Patient connection ID copied to clipboard.',
                                      timer: 1500,
                                      showConfirmButton: false,
                                      customClass: {
                                        popup: 'swal-custom-popup',
                                        title: 'swal-custom-title',
                                        htmlContainer: 'swal-custom-html'
                                      }
                                    });
                                  }}
                                  style={{ padding: '2px 6px', fontSize: '9px', borderRadius: '4px', cursor: 'pointer', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-secondary)' }}
                                >
                                  Copy ID
                                </button>
                              </div>
                            </div>

                            {/* Family contact block */}
                            <div style={{ minWidth: '180px' }}>
                              <h5 style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>Authorized Guardians:</h5>
                              {!pat.family || pat.family.length === 0 ? (
                                <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No family guardians linked</span>
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  {pat.family.map((f: any, idx: number) => (
                                    <div key={idx} style={{ fontSize: '10px', background: 'rgba(99, 102, 241, 0.05)', padding: '4px 8px', borderRadius: '4px', border: '1px solid rgba(99,102,241,0.1)' }}>
                                      <strong style={{ color: 'var(--primary)' }}>{f.relationship}:</strong> {f.name}
                                      <div style={{ color: 'var(--text-muted)', fontSize: '9px', marginTop: '1px' }}>{f.email}</div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <>

          <section className="vitals-grid">
            <div className={`vital-card glass-panel ${getOverallSeverity(latestVital.evaluated_severity)}`}>
              <div className="vital-card-header">
                <div className="vital-title-group">
                  <Heart className="vital-icon" size={20} style={{ animation: latestVital.heart_rate > 100 ? 'pulse-icon 0.6s infinite alternate' : 'none' }} />
                  <h3>Heart Rate</h3>
                </div>
                <span className={`severity-badge ${getOverallSeverity(latestVital.evaluated_severity)}`}>
                  {latestVital.evaluated_severity === 'Normal' ? 'Stable' : latestVital.evaluated_severity || 'Stable'}
                </span>
              </div>
              <div className="vital-value-display">
                <span className="vital-numeric">{latestVital.heart_rate || '--'}</span>
                <span className="vital-unit">bpm</span>
              </div>
              <div className="vital-card-footer">
                <span>Allowed: {threshMinHR} - {threshMaxHR} bpm</span>
                <span>Measured: {latestVital.measured_at ? new Date(latestVital.measured_at).toLocaleTimeString() : 'N/A'}</span>
              </div>
            </div>

            <div className={`vital-card glass-panel ${getOverallSeverity(latestVital.spo2 < 95 ? 'Emergency' : 'Normal')}`}>
              <div className="vital-card-header">
                <div className="vital-title-group">
                  <TrendingUp className="vital-icon" size={20} />
                  <h3>Oxygen Saturation (SpO2)</h3>
                </div>
                <span className={`severity-badge ${latestVital.spo2 >= 95 ? 'normal' : 'emergency'}`}>
                  {latestVital.spo2 >= 95 ? 'Normal' : 'Hypoxia'}
                </span>
              </div>
              <div className="vital-value-display">
                <span className="vital-numeric">{latestVital.spo2 || '--'}</span>
                <span className="vital-unit">%</span>
              </div>
              <div className="vital-card-footer">
                <span>Allowed: &gt;= {threshMinSpO2}%</span>
                <span>Measured: {latestVital.measured_at ? new Date(latestVital.measured_at).toLocaleTimeString() : 'N/A'}</span>
              </div>
            </div>

            <div className={`vital-card glass-panel ${getOverallSeverity(latestVital.systolic_bp >= 140 ? 'Emergency' : 'Normal')}`}>
              <div className="vital-card-header">
                <div className="vital-title-group">
                  <Activity className="vital-icon" size={20} />
                  <h3>Blood Pressure</h3>
                </div>
                <span className={`severity-badge ${latestVital.systolic_bp < 140 ? 'normal' : 'emergency'}`}>
                  {latestVital.systolic_bp < 120 ? 'Optimal' : latestVital.systolic_bp < 140 ? 'Elevated' : 'Hypertensive'}
                </span>
              </div>
              <div className="vital-value-display">
                <span className="vital-numeric">
                  {latestVital.systolic_bp && latestVital.diastolic_bp 
                    ? `${latestVital.systolic_bp}/${latestVital.diastolic_bp}` 
                    : '--/--'}
                </span>
                <span className="vital-unit">mmHg</span>
              </div>
              <div className="vital-card-footer">
                <span>Allowed: &lt; {threshMaxSystolic} mmHg</span>
                <span>Measured: {latestVital.measured_at ? new Date(latestVital.measured_at).toLocaleTimeString() : 'N/A'}</span>
              </div>
            </div>
          </section>

          <section className="dashboard-content">
            <div className="charts-panel glass-panel">
              <div className="panel-header">
                <h2>Real-Time Vital Timeline Graphs</h2>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Auto-updating Wearable Stream</span>
              </div>

              {telemetryHistory.length === 0 ? (
                <div className="no-data">No active telemetry packets recorded for this patient.</div>
              ) : (
                <div className="chart-wrapper">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={telemetryHistory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
                      <XAxis dataKey="measured_at" stroke="var(--text-muted)" fontSize={11} tickFormatter={(val) => val ? new Date(val).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''} />
                      <YAxis domain={[50, 180]} stroke="var(--text-muted)" fontSize={11} />
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: 'var(--border-glass)', borderRadius: '8px' }} />
                      <Area type="monotone" name="Heart Rate (bpm)" dataKey="heart_rate" stroke="var(--primary)" strokeWidth={2} fill="url(#colorHR)" />
                      <Area type="monotone" name="Oxygen SpO2 (%)" dataKey="spo2" stroke="var(--normal)" strokeWidth={2} fill="url(#colorSpO2)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="sidebar-panel">
              <div className="alerts-panel glass-panel">
                <div className="panel-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Bell size={18} color="var(--emergency)" />
                    <h2>Active Vital Warnings Feed</h2>
                  </div>
                </div>

                <div className="alert-list">
                  {activeAlerts.length === 0 ? (
                    <div className="no-data">No active severity alerts recorded.</div>
                  ) : (
                    activeAlerts.map(alert => {
                      const isDimmed = alert.status === 'Acknowledged' || alert.status === 'Resolved';
                      return (
                        <div 
                          key={alert.id} 
                          className={`alert-item ${alert.severity}`}
                          style={{
                            opacity: isDimmed ? 0.35 : 1,
                            transition: 'opacity 0.8s ease-in-out, transform 0.5s ease',
                            pointerEvents: isDimmed ? 'none' : 'auto'
                          }}
                        >
                          <div className="alert-icon-wrapper">
                            <ShieldAlert size={18} />
                          </div>
                          <div className="alert-details">
                            <p className="alert-message">{alert.message || `${alert.severity} status on ${alert.metric}: ${alert.value}`}</p>
                            <div className="alert-meta">
                              <span style={{ fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '3px' }}>
                                Patient: {getPatientName(alert.patient_id || alert.patientId || '')}
                              </span>
                              <span>{new Date(alert.triggered_at).toLocaleTimeString()} • {alert.status}</span>
                              <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                                {alert.status === 'Triggered' && (
                                  <button className="btn-ack" onClick={() => handleAcknowledgeAlert(alert.id)}>Acknowledge</button>
                                )}
                                {alert.status !== 'Resolved' && (
                                  <button className="btn-ack" onClick={() => handleResolveAlert(alert.id)}>Resolve</button>
                                )}
                                <button className="btn-ack" onClick={() => setSelectedLetterAlert(alert)} style={{ color: 'var(--normal)' }}>Clinical Letter</button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* SIMULATION & THRESHOLD BOXES */}
              <div className="controls-panel glass-panel">
                <h3 style={{ borderBottom: '1px solid var(--border-glass)', paddingBottom: '8px', marginBottom: '12px', fontSize: '14px', display: 'flex', gap: '8px' }}><Sliders size={16} /> Clinical Parameters Configurator</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>Min Heart Rate</label>
                      <input type="number" className="form-control" value={threshMinHR} onChange={e => setThreshMinHR(e.target.value)} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>Max Heart Rate</label>
                      <input type="number" className="form-control" value={threshMaxHR} onChange={e => setThreshMaxHR(e.target.value)} />
                    </div>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>SpO2 Hypoxia Limit (%)</label>
                    <input type="number" className="form-control" value={threshMinSpO2} onChange={e => setThreshMinSpO2(e.target.value)} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Max Systolic Blood Pressure</label>
                    <input type="number" className="form-control" value={threshMaxSystolic} onChange={e => setThreshMaxSystolic(e.target.value)} />
                  </div>
                  <button type="button" className="btn btn-secondary" onClick={handleUpdateThresholds}>
                    <CheckCircle size={14} /> Update Vital Limits
                  </button>
                </div>
              </div>

              <div className="controls-panel glass-panel" style={{ marginTop: '16px' }}>
                <h3 style={{ borderBottom: '1px solid var(--border-glass)', paddingBottom: '8px', marginBottom: '12px', fontSize: '14px' }}>Wearable Simulator Console</h3>
                <form onSubmit={handleIngestSimulation}>
                  <div className="form-group">
                    <label>Heart Rate (bpm)</label>
                    <input type="number" className="form-control" value={simHR} onChange={e => setSimHR(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>SpO2 (%)</label>
                    <input type="number" className="form-control" value={simSpO2} onChange={e => setSimSpO2(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Blood Pressure (systolic/diastolic)</label>
                    <input type="text" className="form-control" value={simBP} onChange={e => setSimBP(e.target.value)} />
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                    <button type="submit" className="btn btn-primary" disabled={isSyncing}>
                      <Send size={12} /> Sync Telemetry
                    </button>
                    <button type="button" className="btn btn-danger" onClick={handleSOSPanic}>
                      <AlertOctagon size={12} /> SOS Panic
                    </button>
                  </div>
                  {vitalsSyncMsg && (
                    <div style={{ marginTop: '10px', fontSize: '11px', color: vitalsSyncMsg.includes('✗') ? 'var(--emergency)' : 'var(--normal)' }}>{vitalsSyncMsg}</div>
                  )}
                </form>
              </div>

            </div>
          </section>
        </>
      )}
    </>
      ) : user.role === 'patient' ? (
        // ==========================================
        // 3. PATIENT DASHBOARD VIEW
        // ==========================================
        <div style={{ padding: '24px 0', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div className="glass-panel" style={{ display: 'inline-flex', padding: '4px', borderRadius: '10px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-glass)' }}>
              <button 
                className={`auth-tab-btn ${viewMode === 'monitor' ? 'active' : ''}`}
                onClick={() => setViewMode('monitor')}
                style={{ padding: '8px 18px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, border: 0, cursor: 'pointer', transition: 'var(--transition-smooth)' }}
              >
                شاشة المراقبة الطبية (Monitor)
              </button>
              <button 
                className={`auth-tab-btn ${viewMode === 'profile' ? 'active' : ''}`}
                onClick={() => setViewMode('profile')}
                style={{ padding: '8px 18px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, border: 0, cursor: 'pointer', transition: 'var(--transition-smooth)' }}
              >
                الملف الشخصي والروابط الطبية (Profile & Connections)
              </button>
            </div>
          </div>

          {viewMode === 'profile' ? (
            <div className="charts-panel glass-panel" style={{ width: '100%', padding: '24px', animation: 'fadeIn 0.4s ease' }}>
              <div className="panel-header" style={{ marginBottom: '24px' }}>
                <div>
                  <h2 style={{ fontSize: '20px', fontWeight: 800 }}>تعديل الملف الشخصي والربط الطبي • Profile & Connections</h2>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>قم بتعديل بياناتك وتحديد طبيبك المتابع واستعراض أفراد العائلة المشتركين</span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'start' }}>
                {/* Account Details Form */}
                <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '16px', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-glass)', paddingBottom: '8px' }}>
                    بيانات الحساب الشخصي (Personal Details)
                  </h3>
                  <form onSubmit={handleProfileUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div className="form-group">
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>الاسم الكامل (Full Name)</label>
                      <input 
                        type="text" 
                        className="form-control" 
                        value={profileName} 
                        onChange={e => setProfileName(e.target.value)} 
                        required 
                      />
                    </div>
                    <div className="form-group">
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>البريد الإلكتروني (Email Address)</label>
                      <input 
                        type="email" 
                        className="form-control" 
                        value={profileEmail} 
                        onChange={e => setProfileEmail(e.target.value)} 
                        required 
                      />
                    </div>
                    <div className="form-group">
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>تاريخ الميلاد (Date of Birth)</label>
                      <input 
                        type="date" 
                        className="form-control" 
                        value={profileBirthDate} 
                        onChange={e => setProfileBirthDate(e.target.value)} 
                        required 
                      />
                    </div>
                    <button 
                      type="submit" 
                      className="btn btn-primary" 
                      disabled={isUpdatingProfile}
                      style={{ marginTop: '10px' }}
                    >
                      {isUpdatingProfile ? 'جاري الحفظ...' : 'حفظ البيانات والتغييرات'}
                    </button>
                  </form>
                </div>

                {/* Connection details */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* Doctor connection Card */}
                  <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '16px', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-glass)', paddingBottom: '8px' }}>
                      المرشد الطبي المتابع (Primary Clinician)
                    </h3>
                    
                    {userConnections.doctor ? (
                      <div className="glass-panel" style={{ padding: '14px', borderRadius: '8px', background: 'rgba(99, 102, 241, 0.05)', border: '1px solid rgba(99,102,241,0.1)', marginBottom: '16px' }}>
                        <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                          Dr. {userConnections.doctor.firstName} {userConnections.doctor.lastName}
                        </h4>
                        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                          Specialty: <strong style={{ color: 'var(--primary)' }}>{userConnections.doctor.specialty}</strong>
                        </p>
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          Email: {userConnections.doctor.email}
                        </p>
                      </div>
                    ) : (
                      <div className="glass-panel" style={{ padding: '14px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239,68,68,0.1)', marginBottom: '16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                        لم يتم ربط طبيب متابع بحسابك بعد. يرجى اختيار طبيب لتسهيل مراقبة علاماتك الحيوية.
                      </div>
                    )}

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>تغيير الطبيب المتابع (Change Attending Clinician)</label>
                      <select 
                        className="form-control" 
                        value={profilePrimaryClinicianId} 
                        onChange={e => setProfilePrimaryClinicianId(e.target.value)}
                        style={{ background: 'var(--bg-glass)', color: 'var(--text-primary)' }}
                      >
                        <option value="" style={{ background: '#0f172a' }}>-- اختر الطبيب المعالج --</option>
                        {allClinicians.map(c => (
                          <option key={c.id} value={c.id} style={{ background: '#0f172a' }}>
                            Dr. {c.firstName} {c.lastName} ({c.specialty})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Family connections Card */}
                  <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '16px', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-glass)', paddingBottom: '8px' }}>
                      المراقبون من أفراد العائلة (Family Monitors)
                    </h3>
                    
                    {!userConnections.family || userConnections.family.length === 0 ? (
                      <div style={{ color: 'var(--text-muted)', fontSize: '12px', padding: '10px 0' }}>
                        لم يتم ربط أي أفراد عائلة بحسابك بعد.
                        <div style={{ fontSize: '12px', marginTop: '10px', color: 'var(--text-secondary)' }}>
                          كود الربط الخاص بك لمشاركته مع العائلة:
                        </div>
                        <div style={{ 
                          marginTop: '8px', 
                          padding: '8px 12px', 
                          background: 'rgba(255,255,255,0.03)', 
                          border: '1px solid rgba(255,255,255,0.08)', 
                          borderRadius: '8px', 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center',
                          direction: 'ltr'
                        }}>
                          <span style={{ color: 'var(--primary)', fontWeight: 700, fontSize: '12px', fontFamily: 'monospace' }}>
                            {user.details?.id || 'N/A'}
                          </span>
                          <button 
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(user.details?.id || '');
                              Swal.fire({
                                icon: 'success',
                                title: 'نسخ الكود',
                                text: 'تم نسخ كود الربط العائلي بنجاح!',
                                timer: 1500,
                                showConfirmButton: false,
                                customClass: {
                                  popup: 'swal-custom-popup',
                                  title: 'swal-custom-title',
                                  htmlContainer: 'swal-custom-html'
                                }
                              });
                            }}
                            style={{ 
                              padding: '4px 10px', 
                              fontSize: '10px', 
                              borderRadius: '6px', 
                              cursor: 'pointer', 
                              background: 'rgba(99, 102, 241, 0.15)', 
                              border: '1px solid rgba(99, 102, 241, 0.3)', 
                              color: 'var(--primary)',
                              fontWeight: 600
                            }}
                          >
                            Copy Code
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          كود الربط العائلي الخاص بك لمشاركته مع العائلة:
                        </div>
                        <div style={{ 
                          padding: '8px 12px', 
                          background: 'rgba(255,255,255,0.03)', 
                          border: '1px solid rgba(255,255,255,0.08)', 
                          borderRadius: '8px', 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center',
                          direction: 'ltr',
                          marginBottom: '8px'
                        }}>
                          <span style={{ color: 'var(--primary)', fontWeight: 700, fontSize: '12px', fontFamily: 'monospace' }}>
                            {user.details?.id || 'N/A'}
                          </span>
                          <button 
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(user.details?.id || '');
                              Swal.fire({
                                icon: 'success',
                                title: 'نسخ الكود',
                                text: 'تم نسخ كود الربط العائلي بنجاح!',
                                timer: 1500,
                                showConfirmButton: false,
                                customClass: {
                                  popup: 'swal-custom-popup',
                                  title: 'swal-custom-title',
                                  htmlContainer: 'swal-custom-html'
                                }
                              });
                            }}
                            style={{ 
                              padding: '4px 10px', 
                              fontSize: '10px', 
                              borderRadius: '6px', 
                              cursor: 'pointer', 
                              background: 'rgba(99, 102, 241, 0.15)', 
                              border: '1px solid rgba(99, 102, 241, 0.3)', 
                              color: 'var(--primary)',
                              fontWeight: 600
                            }}
                          >
                            Copy Code
                          </button>
                        </div>
                        {userConnections.family.map((f: any) => (
                          <div key={f.id} className="glass-panel" style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div>
                                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{f.name}</span>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{f.email}</div>
                              </div>
                              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--primary)', background: 'rgba(99, 102, 241, 0.1)', padding: '2px 8px', borderRadius: '12px' }}>
                                {f.relationship === 'Son' ? 'ابن / ابنہ' : f.relationship === 'Spouse' ? 'زوج / زوجة' : f.relationship}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="glass-panel" style={{ padding: '20px', borderRadius: '16px', background: 'rgba(99, 102, 241, 0.05)', border: '1px solid rgba(99,102,241,0.1)' }}>
                <h2>أهلاً بك يا {user.name} 👋</h2>
                <p style={{ color: 'var(--text-secondary)', marginTop: '6px' }}>حالتك الصحية مراقبة مباشرة من خلال ساعتك الذكية. يتم إرسال نبضات القلب ونسبة الأكسجين لمركز المتابعة الطبي الخاص بك تلقائياً.</p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
                {/* Heart Rate Card */}
                <div className={`vital-card glass-panel ${getOverallSeverity(latestVital.evaluated_severity)}`} style={{ padding: '30px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <Heart size={28} className="vital-icon" style={{ animation: latestVital.heart_rate > 100 ? 'pulse-icon 0.6s infinite alternate' : 'none', color: 'var(--primary)' }} />
                      <h3 style={{ fontSize: '20px' }}>معدل نبضات القلب</h3>
                    </div>
                    <span className={`severity-badge ${getOverallSeverity(latestVital.evaluated_severity)}`} style={{ fontSize: '12px', padding: '4px 10px' }}>
                      {latestVital.evaluated_severity === 'Normal' ? 'مستقر' : 'غير مستقر'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', margin: '24px 0' }}>
                    <span style={{ fontSize: '64px', fontWeight: 900 }}>{latestVital.heart_rate || '--'}</span>
                    <span style={{ fontSize: '18px', color: 'var(--text-muted)' }}>نبضة / دقيقة</span>
                  </div>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>المعدل الطبيعي: 60 - 100 نبضة</p>
                </div>

                {/* SpO2 Card */}
                <div className={`vital-card glass-panel ${getOverallSeverity(latestVital.spo2 < 95 ? 'Emergency' : 'Normal')}`} style={{ padding: '30px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <TrendingUp size={28} style={{ color: 'var(--normal)' }} />
                      <h3 style={{ fontSize: '20px' }}>نسبة الأكسجين بالدم</h3>
                    </div>
                    <span className={`severity-badge ${latestVital.spo2 >= 95 ? 'normal' : 'emergency'}`} style={{ fontSize: '12px', padding: '4px 10px' }}>
                      {latestVital.spo2 >= 95 ? 'ممتاز' : 'منخفض'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', margin: '24px 0' }}>
                    <span style={{ fontSize: '64px', fontWeight: 900 }}>{latestVital.spo2 || '--'}</span>
                    <span style={{ fontSize: '18px', color: 'var(--text-muted)' }}>%</span>
                  </div>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>النسبة الطبيعية: 95% - 100%</p>
                </div>

                {/* Blood Pressure Card */}
                <div className={`vital-card glass-panel ${getOverallSeverity(latestVital.systolic_bp >= 140 ? 'Emergency' : 'Normal')}`} style={{ padding: '30px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <Activity size={28} style={{ color: 'var(--normal)' }} />
                      <h3 style={{ fontSize: '20px' }}>ضغط الدم</h3>
                    </div>
                    <span className={`severity-badge ${latestVital.systolic_bp < 140 ? 'normal' : 'emergency'}`} style={{ fontSize: '12px', padding: '4px 10px' }}>
                      {latestVital.systolic_bp < 140 ? 'طبيعي' : 'مرتفع'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', margin: '24px 0' }}>
                    <span style={{ fontSize: '64px', fontWeight: 900 }}>
                      {latestVital.systolic_bp && latestVital.diastolic_bp ? `${latestVital.systolic_bp}/${latestVital.diastolic_bp}` : '--/--'}
                    </span>
                    <span style={{ fontSize: '18px', color: 'var(--text-muted)' }}>mmHg</span>
                  </div>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>الضغط المثالي: أقل من 120/80</p>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px' }}>
                <button 
                  onClick={handleSOSPanic} 
                  className="btn btn-danger" 
                  style={{ padding: '16px 40px', fontSize: '18px', borderRadius: '12px', display: 'flex', gap: '10px', alignItems: 'center', boxShadow: '0 0 20px rgba(244, 63, 94, 0.4)' }}
                >
                  <AlertOctagon size={24} />
                  <span>إرسال نداء استغاثة فوري (SOS)</span>
                </button>
              </div>
              {vitalsSyncMsg && (
                <div style={{ textAlign: 'center', fontSize: '14px', color: 'var(--normal)' }}>{vitalsSyncMsg}</div>
              )}
            </>
          )}
        </div>
      ) : (
        // ==========================================
        // 4. FAMILY MEMBER VIEW (READ ONLY)
        // ==========================================
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '24px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div className="glass-panel" style={{ display: 'inline-flex', padding: '4px', borderRadius: '10px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-glass)' }}>
              <button 
                className={`auth-tab-btn ${viewMode === 'monitor' ? 'active' : ''}`}
                onClick={() => setViewMode('monitor')}
                style={{ padding: '8px 18px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, border: 0, cursor: 'pointer', transition: 'var(--transition-smooth)' }}
              >
                Patient Vital Monitor
              </button>
              <button 
                className={`auth-tab-btn ${viewMode === 'profile' ? 'active' : ''}`}
                onClick={() => setViewMode('profile')}
                style={{ padding: '8px 18px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, border: 0, cursor: 'pointer', transition: 'var(--transition-smooth)' }}
              >
                Profile & Family Connection
              </button>
            </div>
          </div>

          {viewMode === 'profile' ? (
            <div className="charts-panel glass-panel" style={{ width: '100%', padding: '24px', animation: 'fadeIn 0.4s ease' }}>
              <div className="panel-header" style={{ marginBottom: '24px' }}>
                <div>
                  <h2 style={{ fontSize: '20px', fontWeight: 800 }}>Family Settings & Monitored Patient Connection</h2>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Configure your credentials and link your profile to your relative's wearable ID</span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'start' }}>
                {/* Credentials Card */}
                <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '16px', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-glass)', paddingBottom: '8px' }}>
                    Family Guardian Credentials
                  </h3>
                  <form onSubmit={handleProfileUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div className="form-group">
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Full Name</label>
                      <input 
                        type="text" 
                        className="form-control" 
                        value={profileName} 
                        onChange={e => setProfileName(e.target.value)} 
                        required 
                      />
                    </div>
                    <div className="form-group">
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Email Address</label>
                      <input 
                        type="email" 
                        className="form-control" 
                        value={profileEmail} 
                        onChange={e => setProfileEmail(e.target.value)} 
                        required 
                      />
                    </div>
                    <div className="form-group">
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Relationship to Patient</label>
                      <select 
                        className="form-control" 
                        value={profileRelationship} 
                        onChange={e => setProfileRelationship(e.target.value)}
                        style={{ background: 'var(--bg-glass)', color: 'var(--text-primary)' }}
                        required
                      >
                        <option value="Son" style={{ background: '#0f172a' }}>Son</option>
                        <option value="Daughter" style={{ background: '#0f172a' }}>Daughter</option>
                        <option value="Spouse" style={{ background: '#0f172a' }}>Spouse</option>
                        <option value="Parent" style={{ background: '#0f172a' }}>Parent</option>
                        <option value="Guardian" style={{ background: '#0f172a' }}>Guardian</option>
                        <option value="Other" style={{ background: '#0f172a' }}>Other</option>
                      </select>
                    </div>
                    <button 
                      type="submit" 
                      className="btn btn-primary" 
                      disabled={isUpdatingProfile}
                      style={{ marginTop: '10px' }}
                    >
                      {isUpdatingProfile ? 'Saving Settings...' : 'Update Settings'}
                    </button>
                  </form>
                </div>

                {/* Patient Connection Board */}
                <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '16px', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-glass)', paddingBottom: '8px' }}>
                    Monitored Relative Connection
                  </h3>
                  
                  {user.details?.patient_id ? (
                    <div className="glass-panel" style={{ padding: '14px', borderRadius: '8px', background: 'rgba(99, 102, 241, 0.05)', border: '1px solid rgba(99,102,241,0.1)', marginBottom: '16px' }}>
                      <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {user.details?.rel_first_name || 'Relative'} {user.details?.rel_last_name || 'Patient'}
                      </h4>
                      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        Relationship: <strong style={{ color: 'var(--primary)' }}>{user.details?.relationship}</strong>
                      </p>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Patient ID / Connection Code: <code style={{ color: 'var(--primary)' }}>{user.details?.patient_id}</code>
                      </p>
                    </div>
                  ) : (
                    <div className="glass-panel" style={{ padding: '14px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239,68,68,0.1)', marginBottom: '16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      No relative is currently linked. Connect to a patient's smart wearable by choosing their name below.
                    </div>
                  )}

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Choose Organization Patient to Monitor</label>
                    <select 
                      className="form-control" 
                      value={profilePatientId} 
                      onChange={e => setProfilePatientId(e.target.value)}
                      style={{ background: 'var(--bg-glass)', color: 'var(--text-primary)' }}
                    >
                      <option value="" style={{ background: '#0f172a' }}>-- Select Patient --</option>
                      {allPatients.map(p => (
                        <option key={p.id} value={p.id} style={{ background: '#0f172a' }}>
                          {p.first_name} {p.last_name} (ID: {p.id.slice(0, 8)}...)
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div style={{ padding: '16px 20px', background: 'rgba(99, 102, 241, 0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: '12px' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><Eye size={18} style={{ color: 'var(--primary)' }} /> Secure Family Access Hub</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '4px' }}>
                  Monitoring relative: <strong>{user.details?.rel_first_name || 'Relative'} {user.details?.rel_last_name || 'Patient'}</strong> (Relationship: {user.details?.relationship}). Shared health statistics are strictly read-only per medical privacy regulations.
                </p>
              </div>

              <section className="vitals-grid">
                <div className={`vital-card glass-panel ${getOverallSeverity(latestVital.evaluated_severity)}`}>
                  <div className="vital-card-header">
                    <h3>Relative Heart Rate</h3>
                    <span className={`severity-badge ${getOverallSeverity(latestVital.evaluated_severity)}`}>
                      {latestVital.evaluated_severity === 'Normal' ? 'Stable' : latestVital.evaluated_severity || 'Stable'}
                    </span>
                  </div>
                  <div className="vital-value-display">
                    <span className="vital-numeric">{latestVital.heart_rate || '--'}</span>
                    <span className="vital-unit">bpm</span>
                  </div>
                </div>

                <div className={`vital-card glass-panel ${getOverallSeverity(latestVital.spo2 < 95 ? 'Emergency' : 'Normal')}`}>
                  <div className="vital-card-header">
                    <h3>Relative Oxygen Level</h3>
                    <span className={`severity-badge ${latestVital.spo2 >= 95 ? 'normal' : 'emergency'}`}>
                      {latestVital.spo2 >= 95 ? 'Normal' : 'Low SpO2'}
                    </span>
                  </div>
                  <div className="vital-value-display">
                    <span className="vital-numeric">{latestVital.spo2 || '--'}</span>
                    <span className="vital-unit">%</span>
                  </div>
                </div>

                <div className={`vital-card glass-panel ${getOverallSeverity(latestVital.systolic_bp >= 140 ? 'Emergency' : 'Normal')}`}>
                  <div className="vital-card-header">
                    <h3>Relative Blood Pressure</h3>
                    <span className={`severity-badge ${latestVital.systolic_bp < 140 ? 'normal' : 'emergency'}`}>
                      {latestVital.systolic_bp < 140 ? 'Normal' : 'Abnormal'}
                    </span>
                  </div>
                  <div className="vital-value-display">
                    <span className="vital-numeric">
                      {latestVital.systolic_bp && latestVital.diastolic_bp ? `${latestVital.systolic_bp}/${latestVital.diastolic_bp}` : '--/--'}
                    </span>
                    <span className="vital-unit">mmHg</span>
                  </div>
                </div>
              </section>

              <section className="dashboard-content">
                <div className="charts-panel glass-panel" style={{ gridColumn: 'span 2' }}>
                  <div className="panel-header">
                    <h2>Health History Graph</h2>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Latest Wearable Sync Records</span>
                  </div>

                  {telemetryHistory.length === 0 ? (
                    <div className="no-data">No active telemetry packets recorded for this patient.</div>
                  ) : (
                    <div className="chart-wrapper">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={telemetryHistory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
                          <XAxis dataKey="measured_at" stroke="var(--text-muted)" fontSize={11} tickFormatter={(val) => val ? new Date(val).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''} />
                          <YAxis domain={[50, 180]} stroke="var(--text-muted)" fontSize={11} />
                          <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: 'var(--border-glass)', borderRadius: '8px' }} />
                          <Area type="monotone" name="Heart Rate (bpm)" dataKey="heart_rate" stroke="var(--primary)" strokeWidth={2} fill="url(#colorHR)" />
                          <Area type="monotone" name="Oxygen SpO2 (%)" dataKey="spo2" stroke="var(--normal)" strokeWidth={2} fill="url(#colorSpO2)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                <div className="sidebar-panel">
                  <div className="alerts-panel glass-panel">
                    <div className="panel-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Bell size={18} color="var(--emergency)" />
                        <h2>Warnings Feed (Read-Only)</h2>
                      </div>
                    </div>

                    <div className="alert-list">
                      {activeAlerts.length === 0 ? (
                        <div className="no-data">All vitals are stable. No alerts recorded.</div>
                      ) : (
                        activeAlerts.map(alert => (
                          <div key={alert.id} className={`alert-item ${alert.severity}`}>
                            <div className="alert-icon-wrapper">
                              <ShieldAlert size={18} />
                            </div>
                            <div className="alert-details">
                              <p className="alert-message">{alert.message || `${alert.severity} status on ${alert.metric}: ${alert.value}`}</p>
                              <div className="alert-meta">
                                <span style={{ fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '3px' }}>
                                  Patient: {getPatientName(alert.patient_id || alert.patientId || '')}
                                </span>
                                <span>{new Date(alert.triggered_at).toLocaleTimeString()} • {alert.status}</span>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
      )}



      {/* Professional Clinical Letter Generator Modal */}
      {selectedLetterAlert && (() => {
        const alertItem = selectedLetterAlert;
        const patientId = alertItem.patient_id || alertItem.patientId || '';
        const patientName = getPatientName(patientId);
        const dob = getPatientBirthDate(patientId);
        
        // Find safe bounds configured for the patient
        const metricName = alertItem.metric === 'heart_rate' ? 'Heart Rate' 
          : alertItem.metric === 'spo2' ? 'Oxygen SpO2' 
          : alertItem.metric === 'systolic_bp' ? 'Systolic BP' 
          : 'Diastolic BP';

        const safeRange = alertItem.metric === 'heart_rate' ? '60 - 100 BPM'
          : alertItem.metric === 'spo2' ? '95 - 100%'
          : alertItem.metric === 'systolic_bp' ? '90 - 139 mmHg'
          : '60 - 89 mmHg';

        const formalRecommendations = alertItem.severity === 'Emergency' || alertItem.severity === 'Critical'
          ? 'Mandatory immediate clinical review and physician response. The patient\'s telemetry data indicates a high-risk condition. Rest, continuous monitoring, and urgent medical intervention are required.'
          : alertItem.severity === 'High'
          ? 'Urgent consultation with the attending physician is advised within 24 hours. Attending nurse staff should evaluate potential modifications to standard pharmacotherapy or clinical care routines.'
          : 'Standard clinical telemetry follow-up. Standard monitoring protocols are sufficient. Regular review during scheduled visits is recommended.';

        const generatedRefCode = `WC-REF-${alertItem.id?.slice(0, 8).toUpperCase()}`;

        return (
          <div className="modal-overlay" onClick={() => setSelectedLetterAlert(null)}>
            <div className="modal-container" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>📋 Attending Physician Clinical Letter Generator</h3>
                <button className="modal-close-btn" onClick={() => setSelectedLetterAlert(null)}>
                  <X size={20} />
                </button>
              </div>
              <div className="modal-content-scroll">
                <div className="clinical-letter-paper">
                  <div className="clinical-letter-header">
                    <div className="clinical-letter-title-section">
                      <h1>WRISTCARE MEDICAL MONITORING CENTER</h1>
                      <p>Official Patient Telemetry Warning Report</p>
                    </div>
                    <div className="clinical-letter-meta-block">
                      <strong>Ref Code:</strong> {generatedRefCode}<br />
                      <strong>Date Generated:</strong> {new Date().toLocaleDateString()}<br />
                      <strong>Status:</strong> <span className={`severity-indicator ${alertItem.status}`}>{alertItem.status}</span>
                    </div>
                  </div>

                  <div className="clinical-letter-grid">
                    <div className="clinical-letter-grid-col">
                      <label>Patient Information</label>
                      <span>{patientName}</span><br />
                      <span style={{ fontSize: '11px', color: '#64748b' }}>Date of Birth: {dob}</span>
                    </div>
                    <div className="clinical-letter-grid-col">
                      <label>Issuing Institution</label>
                      <span>{user?.details?.organizationId ? `Clinic ID: ${user.details.organizationId.slice(0,8).toUpperCase()}` : 'General Telemetry Facility'}</span><br />
                      <span style={{ fontSize: '11px', color: '#64748b' }}>Provider: Dr. {user?.name || 'Attending Clinician'}</span>
                    </div>
                  </div>

                  <div className="clinical-letter-body">
                    <h3>1. Telemetry Breach Event Notification</h3>
                    <p>
                      This official document serves as a formal medical notification regarding the continuous remote telemetry monitoring of patient <strong>{patientName}</strong>. 
                      On <strong>{new Date(alertItem.triggered_at).toLocaleDateString()}</strong> at <strong>{new Date(alertItem.triggered_at).toLocaleTimeString()}</strong>, the WristCare wearable sensory device registered a clear threshold violation for the patient's vital metric: <strong>{metricName}</strong>.
                    </p>
                    <p>
                      The telemetry reading was recorded at <strong style={{ color: 'var(--emergency)' }}>{alertItem.value}</strong>, which deviates from the patient's customized safe limits of <strong>{safeRange}</strong>. This threshold breach is officially designated at a severity level of: <span className={`severity-indicator ${alertItem.severity}`}>{alertItem.severity}</span>.
                    </p>

                    <h3>2. Clinical Assessment & Attending Action Items</h3>
                    <p>
                      <strong>Diagnostic Assessment Remarks:</strong> The system has logged this event with the clinical alert message: <em>"{alertItem.message || `${alertItem.severity} breach detected on ${metricName}: ${alertItem.value}`}"</em>.
                    </p>
                    <p>
                      <strong>Attending Clinician Remarks:</strong> {alertItem.clinician_notes || 'Pending clinician assessment review. Rest is recommended.'}
                    </p>

                    <h3>3. Formal Clinical Recommendations</h3>
                    <p>{formalRecommendations}</p>
                    <p>
                      Attending medical professionals are requested to merge this notice sheet directly into the patient's Electronic Health Record (EHR) database in compliance with international health telemetry guidelines.
                    </p>
                  </div>

                  <div className="clinical-letter-signatures">
                    <div className="signature-block">
                      <div className="signature-line"></div>
                      <div className="signature-title">WristCare Ingestion System Signature</div>
                    </div>
                    <div className="signature-block">
                      <div className="signature-line"></div>
                      <div className="signature-title">Attending Doctor / Clinician Signature</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button 
                  className="btn btn-secondary" 
                  onClick={() => setSelectedLetterAlert(null)}
                  style={{ width: 'auto', padding: '8px 16px' }}
                >
                  Close Editor
                </button>
                <button 
                  className="btn btn-primary" 
                  onClick={() => window.print()}
                  style={{ width: 'auto', padding: '8px 16px' }}
                >
                  🖨️ Print Clinical Letter
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default App;
