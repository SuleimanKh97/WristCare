import express, { Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import pool from '../db/pool';
import { verifyToken, requireRole, requireFamilyLink, checkSubscription, AuthenticatedRequest } from '../middleware/authMiddleware';
import { generateAndSendWeeklyReports } from '../services/reportService';

const router = express.Router();

type SeverityLevel = 'Normal' | 'Medium' | 'High' | 'Emergency';

interface Threshold {
  metric: 'heart_rate' | 'spo2' | 'systolic_bp' | 'diastolic_bp';
  min_value: number;
  max_value: number;
  duration_seconds: number;
}

// Function to classify vitals against customized thresholds
function evaluateMetric(val: number, metric: 'heart_rate' | 'spo2' | 'systolic_bp' | 'diastolic_bp', thresholds: Threshold[], patientName: string): { severity: SeverityLevel; msg: string } {
  const match = thresholds.find(t => t.metric === metric);
  const min = match ? match.min_value : (metric === 'heart_rate' ? 60 : metric === 'spo2' ? 95 : metric === 'systolic_bp' ? 90 : 60);
  const max = match ? match.max_value : (metric === 'heart_rate' ? 100 : metric === 'spo2' ? 100 : metric === 'systolic_bp' ? 139 : 89);
  
  // Emergency overrides (Instant bypass criteria)
  if (metric === 'heart_rate' && (val > 180 || val < 40)) {
    return { severity: 'Emergency', msg: `🚨 CRITICAL HEART RATE EMERGENCY: ${patientName}'s heart rate of ${val} BPM is highly critical!` };
  }
  if (metric === 'spo2' && val < 80) {
    return { severity: 'Emergency', msg: `🚨 CRITICAL HYPOXIA EMERGENCY: ${patientName}'s SpO2 is dangerously low at ${val}%!` };
  }
  if (metric === 'systolic_bp' && val >= 180) {
    return { severity: 'Emergency', msg: `🚨 HYPERTENSIVE CRISIS EMERGENCY: ${patientName}'s Systolic BP is extremely high at ${val} mmHg!` };
  }

  // Regular threshold breaches
  if (val < min || val > max) {
    const severity = (metric === 'spo2' && val < 90) || (metric === 'heart_rate' && (val > 130 || val < 45)) ? 'High' : 'Medium';
    const textMetric = metric === 'heart_rate' ? 'Heart Rate' : metric === 'spo2' ? 'Oxygen SpO2' : metric === 'systolic_bp' ? 'Systolic BP' : 'Diastolic BP';
    return { 
      severity, 
      msg: `⚠️ Abnormal ${textMetric} detected for ${patientName}: ${val} (Allowed range: ${min} - ${max})` 
    };
  }

  return { severity: 'Normal', msg: '' };
}

// GET all vitals for a patient (Secure)
router.get('/:patientId', verifyToken, checkSubscription, requireFamilyLink, async (req: AuthenticatedRequest, res: Response) => {
  const { patientId } = req.params;
  const range = req.query.range as string || '24h';

  try {
    // 1. Fetch patient's subscription tier
    const [patRows] = await pool.execute(
      'SELECT subscription_tier FROM patients WHERE id = ?',
      [patientId]
    );
    const patList = patRows as any[];
    let tier = 'Free';
    if (patList.length > 0) {
      tier = patList[0].subscription_tier || 'Free';
    } else {
      // Fallback for demo patients to ensure flawless graduation demo
      if (patientId === 'demo-p1') tier = 'Free';
      else if (patientId === 'demo-p2') tier = 'Basic';
      else if (patientId === 'demo-p3') tier = 'Premium';
    }

    // 2. Build query based on range and tier limits
    let query = 'SELECT * FROM vitals_telemetry WHERE patient_id = ?';
    const params: any[] = [patientId];
    let limitWarning = false;
    let finalRange = range;

    if (range === '24h') {
      query += ' AND measured_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)';
    } else if (range === '7d') {
      query += ' AND measured_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
    } else if (range === '30d') {
      if (tier === 'Free') {
        query += ' AND measured_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
        limitWarning = true;
        finalRange = '7d';
      } else {
        query += ' AND measured_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)';
      }
    } else { // 'all' or others
      if (tier === 'Free') {
        query += ' AND measured_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
        limitWarning = true;
        finalRange = '7d';
      } else if (tier === 'Basic') {
        query += ' AND measured_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)';
        limitWarning = true;
        finalRange = '30d';
      } else {
        // Premium: no cutoff limit, fetch last 90 days as standard window
        query += ' AND measured_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)';
      }
    }

    query += ' ORDER BY measured_at DESC LIMIT 200';

    const [rows] = await pool.execute(query, params);

    res.json({
      telemetry: rows,
      tier,
      activeRange: finalRange,
      limitWarning
    });
  } catch (error: any) {
    console.error('Error fetching patient vitals:', error);
    res.status(500).json({ error: 'Failed to retrieve patient vitals due to database server error.' });
  }
});

// GET latest vital signs for a patient (Secure)
router.get('/:patientId/latest', verifyToken, checkSubscription, requireFamilyLink, async (req: AuthenticatedRequest, res: Response) => {
  const { patientId } = req.params;

  try {
    const [rows] = await pool.execute(
      'SELECT * FROM vitals_telemetry WHERE patient_id = ? ORDER BY measured_at DESC LIMIT 1',
      [patientId]
    );
    const results = rows as any[];

    if (results.length === 0) {
      return res.status(404).json({ message: 'No vitals found for this patient.' });
    }

    res.json(results[0]);
  } catch (error: any) {
    console.error('Error fetching latest vitals:', error);
    res.status(500).json({ error: 'Failed to retrieve latest vitals due to database server error.' });
  }
});

// GET customized thresholds for a patient (Secure)
router.get('/patients/:patientId/thresholds', verifyToken, checkSubscription, requireFamilyLink, async (req: AuthenticatedRequest, res: Response) => {
  const { patientId } = req.params;

  try {
    const [rows] = await pool.execute(
      'SELECT * FROM vital_thresholds WHERE patient_id = ?',
      [patientId]
    );
    res.json(rows);
  } catch (error: any) {
    console.error('Error fetching patient thresholds:', error);
    res.status(500).json({ error: 'Failed to retrieve vital thresholds limits.' });
  }
});

// PUT update thresholds for a patient (Clinicians/Doctors only!)
router.put('/patients/:patientId/thresholds', verifyToken, checkSubscription, requireRole(['clinician']), async (req: AuthenticatedRequest, res: Response) => {
  const { patientId } = req.params;
  const { thresholds } = req.body; // Expects array of { metric, min_value, max_value, duration_seconds }

  if (!thresholds || !Array.isArray(thresholds)) {
    return res.status(400).json({ error: 'Missing or invalid thresholds array parameter.' });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    for (const item of thresholds) {
      const { metric, min_value, max_value, duration_seconds } = item;
      
      // Upsert threshold record
      await connection.execute(
        `INSERT INTO vital_thresholds (id, patient_id, metric, min_value, max_value, duration_seconds)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE min_value = VALUES(min_value), max_value = VALUES(max_value), duration_seconds = VALUES(duration_seconds)`,
        [crypto.randomUUID(), patientId, metric, min_value, max_value, duration_seconds || 0]
      );
    }

    await connection.commit();
    res.json({ success: true, message: '✓ Patient vital threshold configurations successfully updated.' });
  } catch (err: any) {
    await connection.rollback();
    console.error('Error updating patient thresholds:', err);
    res.status(500).json({ error: 'Failed to update thresholds due to server error: ' + err.message });
  } finally {
    connection.release();
  }
});

// GET complete institutional alerts log (Clinicians only)
router.get('/alerts/all/log', verifyToken, checkSubscription, requireRole(['clinician']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const orgId = req.user?.organizationId;
    
    let query = `
      SELECT ah.*, p.first_name, p.last_name 
      FROM alert_history ah
      LEFT JOIN patients p ON ah.patient_id = p.id
      ORDER BY ah.triggered_at DESC 
      LIMIT 100
    `;
    let params: any[] = [];
    
    if (orgId) {
      query = `
        SELECT ah.*, p.first_name, p.last_name 
        FROM alert_history ah
        LEFT JOIN patients p ON ah.patient_id = p.id
        WHERE p.organization_id = ? OR p.organization_id IS NULL OR ah.patient_id LIKE 'demo-%'
        ORDER BY ah.triggered_at DESC 
        LIMIT 100
      `;
      params = [orgId];
    }
    
    const [rows] = await pool.execute(query, params);
    res.json(rows);
  } catch (error: any) {
    console.error('Error fetching all alerts:', error);
    res.status(500).json({ error: 'Failed to retrieve complete alerts history log.' });
  }
});

// GET alert history for a patient (Secure)
router.get('/alerts/:patientId', verifyToken, checkSubscription, requireFamilyLink, async (req: AuthenticatedRequest, res: Response) => {
  const { patientId } = req.params;

  try {
    const [rows] = await pool.execute(
      'SELECT * FROM alert_history WHERE patient_id = ? ORDER BY triggered_at DESC LIMIT 50',
      [patientId]
    );
    res.json(rows);
  } catch (error: any) {
    console.error('Error fetching patient alerts:', error);
    res.status(500).json({ error: 'Failed to retrieve alert history log.' });
  }
});

// PUT acknowledge alert (Clinicians only)
router.put('/alerts/:alertId/acknowledge', verifyToken, checkSubscription, requireRole(['clinician']), async (req: AuthenticatedRequest, res: Response) => {
  const { alertId } = req.params;
  const clinicianName = req.user?.name || 'Clinician';

  try {
    await pool.execute(
      `UPDATE alert_history 
       SET status = 'Acknowledged', resolved_at = CURRENT_TIMESTAMP, clinician_notes = ?
       WHERE id = ?`,
      [`Acknowledged by ${clinicianName}`, alertId]
    );

    // Get the updated alert record to broadcast changes
    const [rows] = await pool.execute('SELECT * FROM alert_history WHERE id = ?', [alertId]);
    const list = rows as any[];
    
    const io = req.app.get('io');
    if (io && list.length > 0) {
      io.emit('alert_acknowledged', list[0]);
    }

    res.json({ success: true, message: '✓ Alert successfully acknowledged.', alert: list[0] });
  } catch (err: any) {
    console.error('Error acknowledging alert:', err);
    res.status(500).json({ error: 'Failed to acknowledge alert due to server error.' });
  }
});

// PUT resolve alert (Clinicians only)
router.put('/alerts/:alertId/resolve', verifyToken, checkSubscription, requireRole(['clinician']), async (req: AuthenticatedRequest, res: Response) => {
  const { alertId } = req.params;
  const clinicianName = req.user?.name || 'Clinician';
  const { notes } = req.body;

  try {
    await pool.execute(
      `UPDATE alert_history 
       SET status = 'Resolved', resolved_at = CURRENT_TIMESTAMP, clinician_notes = ?
       WHERE id = ?`,
      [notes || `Resolved by ${clinicianName}`, alertId]
    );

    // Get the updated alert record to broadcast changes
    const [rows] = await pool.execute('SELECT * FROM alert_history WHERE id = ?', [alertId]);
    const list = rows as any[];

    const io = req.app.get('io');
    if (io && list.length > 0) {
      io.emit('alert_resolved', list[0]);
    }

    res.json({ success: true, message: '✓ Alert successfully resolved.', alert: list[0] });
  } catch (err: any) {
    console.error('Error resolving alert:', err);
    res.status(500).json({ error: 'Failed to resolve alert due to server error.' });
  }
});

// GET Super Admin Clinics / Billing manager (Super Admin only!)
router.get('/admin/organizations', verifyToken, requireRole(['super_admin']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Retrieve organizations, active subscription details, patient counts, clinician counts
    const query = `
      SELECT o.id, o.name, o.license_number, o.created_at, s.status AS sub_status, s.expires_at,
             (SELECT COUNT(*) FROM patients p WHERE p.organization_id = o.id) AS patient_count,
             (SELECT COUNT(*) FROM clinicians c WHERE c.organization_id = o.id) AS clinician_count
      FROM organizations o
      LEFT JOIN subscriptions s ON o.id = s.organization_id;
    `;
    const [rows] = await pool.execute(query);
    res.json(rows);
  } catch (error: any) {
    console.error('Error fetching admin organizations list:', error);
    res.status(500).json({ error: 'Failed to retrieve organizations telemetry statistics.' });
  }
});

// PUT Super Admin Billing status toggle (Super Admin only!)
router.put('/admin/subscriptions/:organizationId', verifyToken, requireRole(['super_admin']), async (req: AuthenticatedRequest, res: Response) => {
  const { organizationId } = req.params;
  const { status, expires_at } = req.body; // Expects status ('Active', 'Past_Due', 'Canceled') and expiry calendar string

  if (!status || !expires_at) {
    return res.status(400).json({ error: 'Missing status or expires_at parameter.' });
  }

  try {
    // Upsert subscription record
    await pool.execute(
      `INSERT INTO subscriptions (id, organization_id, status, expires_at)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE status = VALUES(status), expires_at = VALUES(expires_at)`,
      [crypto.randomUUID(), organizationId, status, expires_at]
    );

    res.json({ success: true, message: `✓ Organization subscription updated to [${status}] successfully.` });
  } catch (err: any) {
    console.error('Error updating subscriptions:', err);
    res.status(500).json({ error: 'Failed to update subscription tier due to server error.' });
  }
});

// =========================================================================
// SUPER ADMIN CRUD OPERATIONS (Clinicians, Patients, Family Guardians)
// =========================================================================

// --- CLINICIANS CRUD ---

// 1. GET Clinicians List
router.get('/admin/clinicians', verifyToken, requireRole(['super_admin']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const query = `
      SELECT c.id, c.user_id, c.first_name, c.last_name, c.specialty, c.organization_id, 
             u.email, u.name, o.name AS organization_name
      FROM clinicians c
      INNER JOIN users u ON c.user_id = u.id
      INNER JOIN organizations o ON c.organization_id = o.id
      ORDER BY c.last_name, c.first_name;
    `;
    const [rows] = await pool.execute(query);
    res.json(rows);
  } catch (error: any) {
    console.error('Error fetching admin clinicians list:', error);
    res.status(500).json({ error: 'Failed to retrieve clinicians directory.' });
  }
});

// 2. CREATE Clinician
router.post('/admin/clinicians', verifyToken, requireRole(['super_admin']), async (req: AuthenticatedRequest, res: Response) => {
  const { email, password, name, firstName, lastName, specialty, organizationId } = req.body;

  if (!email || !password || !name || !firstName || !lastName || !organizationId) {
    return res.status(400).json({ error: 'Email, password, name, firstName, lastName, and clinic (organizationId) are required.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Check email uniqueness
    const [exists] = await connection.execute('SELECT id FROM users WHERE email = ?', [email]);
    if ((exists as any[]).length > 0) {
      connection.release();
      return res.status(400).json({ error: 'A user account with this email already exists.' });
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    const userId = crypto.randomUUID();
    const clinicianId = crypto.randomUUID();

    // Insert user
    await connection.execute(
      'INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, "clinician")',
      [userId, email, passwordHash, name]
    );

    // Insert clinician
    await connection.execute(
      'INSERT INTO clinicians (id, user_id, organization_id, first_name, last_name, specialty) VALUES (?, ?, ?, ?, ?, ?)',
      [clinicianId, userId, organizationId, firstName, lastName, specialty || 'General Practice']
    );

    await connection.commit();
    connection.release();

    res.json({ success: true, message: `✓ Doctor ${name} successfully registered.` });
  } catch (error: any) {
    await connection.rollback();
    connection.release();
    console.error('Error creating clinician:', error);
    res.status(500).json({ error: 'Failed to create clinician due to database error.' });
  }
});

// 3. UPDATE Clinician
router.put('/admin/clinicians/:id', verifyToken, requireRole(['super_admin']), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params; // Clinician profile UUID
  const { email, password, name, firstName, lastName, specialty, organizationId } = req.body;

  if (!email || !name || !firstName || !lastName || !organizationId) {
    return res.status(400).json({ error: 'Email, name, firstName, lastName, and clinic (organizationId) are required.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Get clinician userId
    const [clinRows] = await connection.execute('SELECT user_id FROM clinicians WHERE id = ?', [id]);
    const clinicians = clinRows as any[];
    if (clinicians.length === 0) {
      connection.release();
      return res.status(404).json({ error: 'Clinician profile not found.' });
    }
    const userId = clinicians[0].user_id;

    // Check email unique for other users
    const [exists] = await connection.execute('SELECT id FROM users WHERE email = ? AND id != ?', [email, userId]);
    if ((exists as any[]).length > 0) {
      connection.release();
      return res.status(400).json({ error: 'Email is already taken by another account.' });
    }

    // Update clinician details
    await connection.execute(
      'UPDATE clinicians SET first_name = ?, last_name = ?, specialty = ?, organization_id = ? WHERE id = ?',
      [firstName, lastName, specialty || 'General Practice', organizationId, id]
    );

    // Update base user details
    if (password) {
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(password, saltRounds);
      await connection.execute(
        'UPDATE users SET email = ?, name = ?, password_hash = ? WHERE id = ?',
        [email, name, passwordHash, userId]
      );
    } else {
      await connection.execute(
        'UPDATE users SET email = ?, name = ? WHERE id = ?',
        [email, name, userId]
      );
    }

    await connection.commit();
    connection.release();

    res.json({ success: true, message: `✓ Clinician details successfully updated.` });
  } catch (error: any) {
    await connection.rollback();
    connection.release();
    console.error('Error updating clinician:', error);
    res.status(500).json({ error: 'Failed to update clinician due to database error.' });
  }
});

// 4. DELETE Clinician
router.delete('/admin/clinicians/:id', verifyToken, requireRole(['super_admin']), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  try {
    const [clinRows] = await pool.execute('SELECT user_id FROM clinicians WHERE id = ?', [id]);
    const clinicians = clinRows as any[];
    if (clinicians.length === 0) {
      return res.status(404).json({ error: 'Clinician not found.' });
    }

    const userId = clinicians[0].user_id;

    // Delete base user. ON DELETE CASCADE cleans up clinicians profile automatically,
    // and sets patients' primary_clinician_id to NULL.
    await pool.execute('DELETE FROM users WHERE id = ?', [userId]);

    res.json({ success: true, message: `✓ Doctor profile and account successfully deleted.` });
  } catch (error: any) {
    console.error('Error deleting clinician:', error);
    res.status(500).json({ error: 'Failed to delete clinician.' });
  }
});


// --- PATIENTS CRUD ---

// 1. GET Patients List
router.get('/admin/patients', verifyToken, requireRole(['super_admin']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const query = `
      SELECT p.id, p.user_id, p.first_name, p.last_name, p.birth_date, p.subscription_tier, p.organization_id, p.primary_clinician_id,
             u.email, u.name, o.name AS organization_name,
             CONCAT(c.first_name, ' ', c.last_name) AS primary_clinician_name
      FROM patients p
      INNER JOIN users u ON p.user_id = u.id
      INNER JOIN organizations o ON p.organization_id = o.id
      LEFT JOIN clinicians c ON p.primary_clinician_id = c.id
      ORDER BY p.last_name, p.first_name;
    `;
    const [rows] = await pool.execute(query);
    res.json(rows);
  } catch (error: any) {
    console.error('Error fetching admin patients list:', error);
    res.status(500).json({ error: 'Failed to retrieve patient registry.' });
  }
});

// 2. CREATE Patient
router.post('/admin/patients', verifyToken, requireRole(['super_admin']), async (req: AuthenticatedRequest, res: Response) => {
  const { email, password, name, firstName, lastName, birthDate, subscriptionTier, organizationId, primaryClinicianId } = req.body;

  if (!email || !password || !name || !firstName || !lastName || !birthDate || !organizationId) {
    return res.status(400).json({ error: 'Email, password, name, firstName, lastName, birthDate, and clinic (organizationId) are required.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Check email uniqueness
    const [exists] = await connection.execute('SELECT id FROM users WHERE email = ?', [email]);
    if ((exists as any[]).length > 0) {
      connection.release();
      return res.status(400).json({ error: 'A user account with this email already exists.' });
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    const userId = crypto.randomUUID();
    const patientId = crypto.randomUUID();

    // Insert user
    await connection.execute(
      'INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, "patient")',
      [userId, email, passwordHash, name]
    );

    // Insert patient
    await connection.execute(
      'INSERT INTO patients (id, user_id, organization_id, primary_clinician_id, first_name, last_name, birth_date, subscription_tier) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [patientId, userId, organizationId, primaryClinicianId || null, firstName, lastName, birthDate, subscriptionTier || 'Free']
    );

    // Prepopulate vital thresholds
    const metrics = [
      { metric: 'heart_rate', min: 60.0, max: 100.0, duration: 30 },
      { metric: 'spo2', min: 95.0, max: 100.0, duration: 15 },
      { metric: 'systolic_bp', min: 90.0, max: 139.0, duration: 0 },
      { metric: 'diastolic_bp', min: 60.0, max: 89.0, duration: 0 }
    ];

    for (const item of metrics) {
      await connection.execute(
        'INSERT INTO vital_thresholds (id, patient_id, metric, min_value, max_value, duration_seconds) VALUES (?, ?, ?, ?, ?, ?)',
        [crypto.randomUUID(), patientId, item.metric, item.min, item.max, item.duration]
      );
    }

    await connection.commit();
    connection.release();

    res.json({ success: true, message: `✓ Patient ${name} successfully registered.` });
  } catch (error: any) {
    await connection.rollback();
    connection.release();
    console.error('Error creating patient:', error);
    res.status(500).json({ error: 'Failed to create patient profile.' });
  }
});

// 3. UPDATE Patient
router.put('/admin/patients/:id', verifyToken, requireRole(['super_admin']), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params; // Patient profile UUID
  const { email, password, name, firstName, lastName, birthDate, subscriptionTier, organizationId, primaryClinicianId } = req.body;

  if (!email || !name || !firstName || !lastName || !birthDate || !organizationId) {
    return res.status(400).json({ error: 'Email, name, firstName, lastName, birthDate, and clinic (organizationId) are required.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Get patient userId
    const [patRows] = await connection.execute('SELECT user_id FROM patients WHERE id = ?', [id]);
    const patients = patRows as any[];
    if (patients.length === 0) {
      connection.release();
      return res.status(404).json({ error: 'Patient profile not found.' });
    }
    const userId = patients[0].user_id;

    // Check email unique
    const [exists] = await connection.execute('SELECT id FROM users WHERE email = ? AND id != ?', [email, userId]);
    if ((exists as any[]).length > 0) {
      connection.release();
      return res.status(400).json({ error: 'Email is already taken by another account.' });
    }

    // Update patient table
    await connection.execute(
      'UPDATE patients SET first_name = ?, last_name = ?, birth_date = ?, subscription_tier = ?, organization_id = ?, primary_clinician_id = ? WHERE id = ?',
      [firstName, lastName, birthDate, subscriptionTier || 'Free', organizationId, primaryClinicianId || null, id]
    );

    // Update base user details
    if (password) {
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(password, saltRounds);
      await connection.execute(
        'UPDATE users SET email = ?, name = ?, password_hash = ? WHERE id = ?',
        [email, name, passwordHash, userId]
      );
    } else {
      await connection.execute(
        'UPDATE users SET email = ?, name = ? WHERE id = ?',
        [email, name, userId]
      );
    }

    await connection.commit();
    connection.release();

    res.json({ success: true, message: `✓ Patient details successfully updated.` });
  } catch (error: any) {
    await connection.rollback();
    connection.release();
    console.error('Error updating patient:', error);
    res.status(500).json({ error: 'Failed to update patient details.' });
  }
});

// 4. DELETE Patient
router.delete('/admin/patients/:id', verifyToken, requireRole(['super_admin']), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params; // Patient UUID

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [patRows] = await connection.execute('SELECT user_id FROM patients WHERE id = ?', [id]);
    const patients = patRows as any[];
    if (patients.length === 0) {
      connection.release();
      return res.status(404).json({ error: 'Patient not found.' });
    }

    const userId = patients[0].user_id;

    // Delete telemetry records first since they are not constrained by cascading deletes
    await connection.execute('DELETE FROM vitals_telemetry WHERE patient_id = ?', [id]);

    // Delete base user. ON DELETE CASCADE will wipe patient profile, thresholds, alert logs, and family connections.
    await connection.execute('DELETE FROM users WHERE id = ?', [userId]);

    await connection.commit();
    connection.release();

    res.json({ success: true, message: `✓ Patient profile, vitals history, and user account deleted.` });
  } catch (error: any) {
    await connection.rollback();
    connection.release();
    console.error('Error deleting patient:', error);
    res.status(500).json({ error: 'Failed to delete patient account.' });
  }
});


// --- FAMILY MEMBERS CRUD ---

// 1. GET Family Members List
router.get('/admin/family', verifyToken, requireRole(['super_admin']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const query = `
      SELECT fm.id, fm.user_id, fm.patient_id, fm.relationship,
             u.email, u.name,
             CONCAT(p.first_name, ' ', p.last_name) AS patient_name
      FROM family_members fm
      INNER JOIN users u ON fm.user_id = u.id
      INNER JOIN patients p ON fm.patient_id = p.id
      ORDER BY u.name;
    `;
    const [rows] = await pool.execute(query);
    res.json(rows);
  } catch (error: any) {
    console.error('Error fetching admin family list:', error);
    res.status(500).json({ error: 'Failed to retrieve family contacts directory.' });
  }
});

// 2. CREATE Family Member
router.post('/admin/family', verifyToken, requireRole(['super_admin']), async (req: AuthenticatedRequest, res: Response) => {
  const { email, password, name, firstName, lastName, patientId, relationship } = req.body;

  if (!email || !password || !name || !firstName || !lastName || !patientId || !relationship) {
    return res.status(400).json({ error: 'Email, password, name, firstName, lastName, patientId, and relationship are required.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Check email uniqueness
    const [exists] = await connection.execute('SELECT id FROM users WHERE email = ?', [email]);
    if ((exists as any[]).length > 0) {
      connection.release();
      return res.status(400).json({ error: 'A user account with this email already exists.' });
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    const userId = crypto.randomUUID();
    const familyId = crypto.randomUUID();

    // Insert user
    await connection.execute(
      'INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, "family")',
      [userId, email, passwordHash, name]
    );

    // Insert family member link
    await connection.execute(
      'INSERT INTO family_members (id, user_id, patient_id, relationship) VALUES (?, ?, ?, ?)',
      [familyId, userId, patientId, relationship]
    );

    await connection.commit();
    connection.release();

    res.json({ success: true, message: `✓ Family guardian ${name} successfully registered.` });
  } catch (error: any) {
    await connection.rollback();
    connection.release();
    console.error('Error creating family member:', error);
    res.status(500).json({ error: 'Failed to create family contact.' });
  }
});

// 3. UPDATE Family Member
router.put('/admin/family/:id', verifyToken, requireRole(['super_admin']), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params; // Family member profile UUID
  const { email, password, name, firstName, lastName, patientId, relationship } = req.body;

  if (!email || !name || !patientId || !relationship) {
    return res.status(400).json({ error: 'Email, name, patientId, and relationship are required.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Get family userId
    const [famRows] = await connection.execute('SELECT user_id FROM family_members WHERE id = ?', [id]);
    const familyMembers = famRows as any[];
    if (familyMembers.length === 0) {
      connection.release();
      return res.status(404).json({ error: 'Family member profile not found.' });
    }
    const userId = familyMembers[0].user_id;

    // Check email unique
    const [exists] = await connection.execute('SELECT id FROM users WHERE email = ? AND id != ?', [email, userId]);
    if ((exists as any[]).length > 0) {
      connection.release();
      return res.status(400).json({ error: 'Email is already taken by another account.' });
    }

    // Update family_members table
    await connection.execute(
      'UPDATE family_members SET patient_id = ?, relationship = ? WHERE id = ?',
      [patientId, relationship, id]
    );

    // Update base user details
    if (password) {
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(password, saltRounds);
      await connection.execute(
        'UPDATE users SET email = ?, name = ?, password_hash = ? WHERE id = ?',
        [email, name, passwordHash, userId]
      );
    } else {
      await connection.execute(
        'UPDATE users SET email = ?, name = ? WHERE id = ?',
        [email, name, userId]
      );
    }

    await connection.commit();
    connection.release();

    res.json({ success: true, message: `✓ Family guardian details successfully updated.` });
  } catch (error: any) {
    await connection.rollback();
    connection.release();
    console.error('Error updating family member:', error);
    res.status(500).json({ error: 'Failed to update family member details.' });
  }
});

// 4. DELETE Family Member
router.delete('/admin/family/:id', verifyToken, requireRole(['super_admin']), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  try {
    const [famRows] = await pool.execute('SELECT user_id FROM family_members WHERE id = ?', [id]);
    const familyMembers = famRows as any[];
    if (familyMembers.length === 0) {
      return res.status(404).json({ error: 'Family guardian not found.' });
    }

    const userId = familyMembers[0].user_id;

    // Delete base user. ON DELETE CASCADE handles the family profile link automatically.
    await pool.execute('DELETE FROM users WHERE id = ?', [userId]);

    res.json({ success: true, message: `✓ Family member profile and account successfully deleted.` });
  } catch (error: any) {
    console.error('Error deleting family member:', error);
    res.status(500).json({ error: 'Failed to delete family member.' });
  }
});

// POST /api/vitals: Real-time Ingestion & Classification
router.post('/', async (req: Request, res: Response) => {
  const { patientId, heartRate, spo2, bloodPressure } = req.body;

  // 1. Inputs validation
  if (!patientId || heartRate === undefined || spo2 === undefined || !bloodPressure) {
    return res.status(400).json({ error: 'Missing parameters: patientId, heartRate, spo2, bloodPressure.' });
  }

  const bpParts = String(bloodPressure).split('/');
  if (bpParts.length !== 2) {
    return res.status(400).json({ error: 'Invalid bloodPressure format. Use "systolic/diastolic" (e.g. "120/80").' });
  }

  const systolic = parseInt(bpParts[0], 10);
  const diastolic = parseInt(bpParts[1], 10);
  const hrVal = Number(heartRate);
  const spo2Val = Number(spo2);

  if (isNaN(systolic) || isNaN(diastolic) || isNaN(hrVal) || isNaN(spo2Val)) {
    return res.status(400).json({ error: 'Vital signs metrics must be valid numeric values.' });
  }

  try {
    // Fetch patient name to format custom alerts properly
    let patientName = `Patient ${patientId}`;
    try {
      const [pRows] = await pool.execute(
        'SELECT first_name, last_name FROM patients WHERE id = ?',
        [patientId]
      );
      const pList = pRows as any[];
      if (pList.length > 0) {
        patientName = `${pList[0].first_name} ${pList[0].last_name}`;
      } else {
        if (patientId === 'demo-p1') patientName = 'Ahmad Ali';
        else if (patientId === 'demo-p2') patientName = 'Fatima Omar';
        else if (patientId === 'demo-p3') patientName = 'Ziad Mansour';
      }
    } catch (nameErr) {
      console.error('Error fetching patient name:', nameErr);
    }

    // 2. Fetch custom thresholds configured for this patient
    const [thresholdsRows] = await pool.execute(
      'SELECT * FROM vital_thresholds WHERE patient_id = ?',
      [patientId]
    );
    const thresholds = thresholdsRows as Threshold[];

    // 3. Evaluate each vital sign against customized threshold bounds
    const hrEval = evaluateMetric(hrVal, 'heart_rate', thresholds, patientName);
    const spo2Eval = evaluateMetric(spo2Val, 'spo2', thresholds, patientName);
    const sysEval = evaluateMetric(systolic, 'systolic_bp', thresholds, patientName);
    const diaEval = evaluateMetric(diastolic, 'diastolic_bp', thresholds, patientName);

    // 4. Resolve overall severity
    const evaluationResults = [hrEval, spo2Eval, sysEval, diaEval];
    const severities = evaluationResults.map(r => r.severity);
    const messages = evaluationResults.map(r => r.msg).filter(msg => msg !== '');

    let finalSeverity: SeverityLevel = 'Normal';
    if (severities.includes('Emergency')) {
      finalSeverity = 'Emergency';
    } else if (severities.includes('High')) {
      finalSeverity = 'High';
    } else if (severities.includes('Medium')) {
      finalSeverity = 'Medium';
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const telemetryId = crypto.randomUUID();
      const measuredTime = new Date();

      // 5. Bulk insert vital sign telemetry into partitioned InnoDB table
      await connection.execute(
        `INSERT INTO vitals_telemetry (id, patient_id, heart_rate, spo2, systolic_bp, diastolic_bp, measured_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [telemetryId, patientId, hrVal, spo2Val, systolic, diastolic, measuredTime]
      );

      const savedTelemetry = {
        id: telemetryId,
        patient_id: patientId,
        heart_rate: hrVal,
        spo2: spo2Val,
        blood_pressure: bloodPressure,
        systolic_bp: systolic,
        diastolic_bp: diastolic,
        evaluated_severity: finalSeverity,
        measured_at: measuredTime,
      };

      const savedAlerts: any[] = [];

      // 6. Persist any threshold breaches as audit log entries in alert_history
      if (finalSeverity !== 'Normal') {
        // Map individual metrics that failed
        const breachMetrics: ('heart_rate' | 'spo2' | 'systolic_bp' | 'diastolic_bp')[] = [];
        if (hrEval.severity !== 'Normal') breachMetrics.push('heart_rate');
        if (spo2Eval.severity !== 'Normal') breachMetrics.push('spo2');
        if (sysEval.severity !== 'Normal') breachMetrics.push('systolic_bp');
        if (diaEval.severity !== 'Normal') breachMetrics.push('diastolic_bp');

        for (const metric of breachMetrics) {
          const alertId = crypto.randomUUID();
          const metricVal = metric === 'heart_rate' ? `${hrVal} BPM` : metric === 'spo2' ? `${spo2Val}%` : metric === 'systolic_bp' ? `${systolic} mmHg` : `${diastolic} mmHg`;
          const metricSev = metric === 'heart_rate' ? hrEval.severity : metric === 'spo2' ? spo2Eval.severity : metric === 'systolic_bp' ? sysEval.severity : diaEval.severity;
          const metricMsg = metric === 'heart_rate' ? hrEval.msg : metric === 'spo2' ? spo2Eval.msg : metric === 'systolic_bp' ? sysEval.msg : diaEval.msg;

          await connection.execute(
            `INSERT INTO alert_history (id, patient_id, metric, value, severity, status, clinician_notes, triggered_at)
             VALUES (?, ?, ?, ?, ?, 'Triggered', NULL, ?)`,
            [alertId, patientId, metric, metricVal, metricSev, measuredTime]
          );

          savedAlerts.push({
            id: alertId,
            patient_id: patientId,
            metric,
            value: metricVal,
            severity: metricSev,
            message: metricMsg,
            status: 'Triggered',
            triggered_at: measuredTime
          });
        }
      }

      await connection.commit();

      // Emit live updates to Socket.io namespace/rooms
      const io = req.app.get('io');
      if (io) {
        // Broad broadcast for live dashboard demonstration
        io.emit('vitals_update', {
          patientId,
          vitalSign: savedTelemetry,
          timestamp: measuredTime.toISOString()
        });

        // Emit alerts
        for (const alert of savedAlerts) {
          io.emit('new_vitals_alert', {
            patientId,
            alert,
            severity: alert.severity,
            message: alert.message,
            timestamp: measuredTime.toISOString()
          });
        }
      }

      res.status(202).json({
        success: true,
        vitalSign: savedTelemetry,
        alerts: savedAlerts
      });

    } catch (txErr: any) {
      await connection.rollback();
      throw txErr;
    } finally {
      connection.release();
    }

  } catch (error: any) {
    console.error('Error during telemetry ingestion:', error);
    res.status(500).json({ error: 'Data persistence failed due to internal server error: ' + error.message });
  }
});

// Emergency SOS manual trigger
router.post('/sos', async (req: Request, res: Response) => {
  const { patientId } = req.body;

  if (!patientId) {
    return res.status(400).json({ error: 'Missing parameter: patientId.' });
  }

  // Resolve patient's real name
  let patientName = `Patient ${patientId}`;
  try {
    const [pRows] = await pool.execute(
      'SELECT first_name, last_name FROM patients WHERE id = ?',
      [patientId]
    );
    const pList = pRows as any[];
    if (pList.length > 0) {
      patientName = `${pList[0].first_name} ${pList[0].last_name}`;
    } else {
      if (patientId === 'demo-p1') patientName = 'Ahmad Ali';
      else if (patientId === 'demo-p2') patientName = 'Fatima Omar';
      else if (patientId === 'demo-p3') patientName = 'Ziad Mansour';
    }
  } catch (err) {
    console.error('Error fetching patient name for SOS:', err);
  }

  const io = req.app.get('io');
  const alertId = crypto.randomUUID();
  const measuredTime = new Date();

  try {
    // Record SOS alert into audit log
    await pool.execute(
      `INSERT INTO alert_history (id, patient_id, metric, value, severity, status, clinician_notes, triggered_at)
       VALUES (?, ?, 'heart_rate', 'SOS', 'Critical', 'Triggered', 'Patient manual panic button triggered', ?)`,
      [alertId, patientId, measuredTime]
    );

    const sosPayload = {
      patientId,
      alert: {
        id: alertId,
        patient_id: patientId,
        metric: 'heart_rate',
        value: 'SOS',
        severity: 'Emergency',
        message: `🚨 MANUAL SOS CRITICAL: ${patientName} triggered an immediate manual SOS alert!`,
        status: 'Triggered',
        triggered_at: measuredTime
      },
      severity: 'Emergency',
      message: `🚨 MANUAL SOS CRITICAL: ${patientName} triggered an immediate manual SOS alert!`,
      timestamp: measuredTime.toISOString(),
    };

    if (io) {
      io.emit('new_vitals_alert', sosPayload);
    }

    res.json({
      success: true,
      message: 'Emergency SOS alert triggered successfully.',
      alert: sosPayload.alert,
    });
  } catch (err: any) {
    console.error('Error triggering manual SOS:', err);
    res.status(500).json({ error: 'Failed to record SOS event.' });
  }
});

// GET /api/vitals/admin/test-weekly-reports: Manually trigger report generation
router.get('/admin/test-weekly-reports', async (req: Request, res: Response) => {
  try {
    const results = await generateAndSendWeeklyReports();
    res.json({
      success: true,
      message: `✓ Successfully completed manual execution of weekly health reports. Reports generated and sent for ${results.length} family links.`,
      dispatched: results
    });
  } catch (error: any) {
    console.error('Error triggering manual weekly reports:', error);
    res.status(500).json({ error: 'Failed to manually run report generation worker: ' + error.message });
  }
});

export default router;