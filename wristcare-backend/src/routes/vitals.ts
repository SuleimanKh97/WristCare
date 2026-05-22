import express, { Request, Response } from 'express';
import crypto from 'crypto';
import pool from '../db/pool';

const router = express.Router();

// Severity configuration and rank helper
type SeverityLevel = 'Normal' | 'Medium' | 'High' | 'Emergency';

const SEVERITY_RANKS: Record<SeverityLevel, number> = {
  Normal: 0,
  Medium: 1,
  High: 2,
  Emergency: 3,
};

const SEVERITY_NAMES: SeverityLevel[] = ['Normal', 'Medium', 'High', 'Emergency'];

// Helper to determine severity level for Heart Rate
function evaluateHeartRate(hr: number): SeverityLevel {
  if (hr >= 60 && hr <= 100) return 'Normal';
  if ((hr >= 50 && hr <= 59) || (hr >= 101 && hr <= 120)) return 'Medium';
  if ((hr >= 40 && hr <= 49) || (hr >= 121 && hr <= 150)) return 'High';
  return 'Emergency'; // < 40 or > 150
}

// Helper to determine severity level for SpO2 (Oxygen Saturation)
function evaluateSpo2(spo2: number): SeverityLevel {
  if (spo2 >= 95 && spo2 <= 100) return 'Normal';
  if (spo2 >= 91 && spo2 <= 94) return 'Medium';
  if (spo2 >= 86 && spo2 <= 90) return 'High';
  return 'Emergency'; // <= 85
}

// Helper to determine severity level for Blood Pressure
function evaluateBloodPressure(systolic: number, diastolic: number): SeverityLevel {
  let systolicSeverity: SeverityLevel = 'Normal';
  if (systolic < 120) systolicSeverity = 'Normal';
  else if (systolic >= 120 && systolic <= 139) systolicSeverity = 'Medium';
  else if (systolic >= 140 && systolic <= 159) systolicSeverity = 'High';
  else systolicSeverity = 'Emergency'; // >= 160

  let diastolicSeverity: SeverityLevel = 'Normal';
  if (diastolic < 80) diastolicSeverity = 'Normal';
  else if (diastolic >= 80 && diastolic <= 89) diastolicSeverity = 'Medium';
  else if (diastolic >= 90 && diastolic <= 99) diastolicSeverity = 'High';
  else diastolicSeverity = 'Emergency'; // >= 100

  // Choose the higher severity level between systolic and diastolic
  const sysRank = SEVERITY_RANKS[systolicSeverity];
  const diaRank = SEVERITY_RANKS[diastolicSeverity];
  return sysRank >= diaRank ? systolicSeverity : diastolicSeverity;
}

// Comprehensive Threshold Evaluation Engine
function classifyVitals(hr: number, spo2: number, systolic: number, diastolic: number): SeverityLevel {
  const hrSeverity = evaluateHeartRate(hr);
  const spo2Severity = evaluateSpo2(spo2);
  const bpSeverity = evaluateBloodPressure(systolic, diastolic);

  // Return the maximum severity level across all evaluated metrics
  const maxRank = Math.max(
    SEVERITY_RANKS[hrSeverity],
    SEVERITY_RANKS[spo2Severity],
    SEVERITY_RANKS[bpSeverity]
  );

  return SEVERITY_NAMES[maxRank];
}

// Generate localized medical description messages for alerts
function generateAlertMessage(severity: SeverityLevel, hr: number, spo2: number, bp: string): string {
  if (severity === 'Emergency') {
    return `🚨 Critical Emergency Status (حالة طارئة)! Vitals are severely out of range: Heart Rate: ${hr} BPM, SpO2: ${spo2}%, Blood Pressure: ${bp}`;
  }
  if (severity === 'High') {
    return `⚠️ High Alert Status (حالة عالية)! Vitals indicate significant abnormalities: Heart Rate: ${hr} BPM, SpO2: ${spo2}%, Blood Pressure: ${bp}`;
  }
  return `🔔 Warning Alert Status (حالة متوسطة)! Vitals require observation: Heart Rate: ${hr} BPM, SpO2: ${spo2}%, Blood Pressure: ${bp}`;
}

// GET all vitals for a patient (MySQL Query)
router.get('/:patientId', async (req: Request, res: Response) => {
  const { patientId } = req.params;

  try {
    const [rows] = await pool.execute(
      'SELECT * FROM vital_signs WHERE patient_id = ? ORDER BY measured_at DESC LIMIT 50',
      [patientId]
    );
    res.json(rows);
  } catch (error: any) {
    console.error('Error fetching patient vitals:', error);
    res.status(500).json({ error: 'Failed to retrieve patient vitals due to database server error.' });
  }
});

// GET latest vital signs with status check
router.get('/:patientId/latest', async (req: Request, res: Response) => {
  const { patientId } = req.params;

  try {
    const [rows] = await pool.execute(
      'SELECT * FROM vital_signs WHERE patient_id = ? ORDER BY measured_at DESC LIMIT 1',
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

// POST /api/vitals: Data Ingestion & Evaluation Route
router.post('/', async (req: Request, res: Response) => {
  const { patientId, heartRate, spo2, bloodPressure } = req.body;

  // 1. Inputs validation & sanity checks suitable for a healthcare system
  if (!patientId || heartRate === undefined || spo2 === undefined || !bloodPressure) {
    return res.status(400).json({ error: 'Missing required parameters. Include: patientId, heartRate, spo2, bloodPressure.' });
  }

  // Parse blood pressure (Format: "systolic/diastolic")
  const bpParts = String(bloodPressure).split('/');
  if (bpParts.length !== 2) {
    return res.status(400).json({ error: 'Invalid bloodPressure format. Use "systolic/diastolic" (e.g. "120/80").' });
  }

  const systolic = parseInt(bpParts[0], 10);
  const diastolic = parseInt(bpParts[1], 10);

  if (isNaN(systolic) || isNaN(diastolic) || systolic <= 0 || diastolic <= 0) {
    return res.status(400).json({ error: 'Invalid bloodPressure values. Systolic and diastolic must be positive integers.' });
  }

  const hrVal = Number(heartRate);
  const spo2Val = Number(spo2);

  if (isNaN(hrVal) || hrVal <= 0 || isNaN(spo2Val) || spo2Val <= 0 || spo2Val > 100) {
    return res.status(400).json({ error: 'Invalid values. Heart rate must be positive, and SpO2 must be between 1 and 100.' });
  }

  // 2. Execute Threshold Evaluation Engine classification
  const severity: SeverityLevel = classifyVitals(hrVal, spo2Val, systolic, diastolic);

  // Acquire database connection from pool to execute transaction
  const connection = await pool.getConnection();

  try {
    // Start transactional block to ensure data consistency
    await connection.beginTransaction();

    const vitalSignId = crypto.randomUUID();

    // 3. Store raw vital signs in MySQL database
    const insertVitalsQuery = `
      INSERT INTO vital_signs (id, patient_id, heart_rate, spo2, blood_pressure, systolic_bp, diastolic_bp, evaluated_severity)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?);
    `;
    await connection.execute(insertVitalsQuery, [
      vitalSignId,
      patientId,
      hrVal,
      spo2Val,
      bloodPressure,
      systolic,
      diastolic,
      severity,
    ]);

    const savedVital = {
      id: vitalSignId,
      patient_id: patientId,
      heart_rate: hrVal,
      spo2: spo2Val,
      blood_pressure: bloodPressure,
      systolic_bp: systolic,
      diastolic_bp: diastolic,
      evaluated_severity: severity,
      measured_at: new Date(),
      created_at: new Date(),
    };

    let savedAlert: any = null;

    // 4. If status is Medium, High, or Emergency, generate Alert record in DB
    if (severity !== 'Normal') {
      const alertId = crypto.randomUUID();
      const alertMsg = generateAlertMessage(severity, hrVal, spo2Val, bloodPressure);
      const insertAlertQuery = `
        INSERT INTO alerts (id, patient_id, vital_sign_id, severity, message)
        VALUES (?, ?, ?, ?, ?);
      `;
      await connection.execute(insertAlertQuery, [
        alertId,
        patientId,
        vitalSignId,
        severity,
        alertMsg,
      ]);

      savedAlert = {
        id: alertId,
        patient_id: patientId,
        vital_sign_id: vitalSignId,
        severity,
        message: alertMsg,
        is_acknowledged: false,
        triggered_at: new Date(),
        acknowledged_at: null,
        acknowledged_by: null,
      };
    }

    // Commit db operations
    await connection.commit();

    // Retrieve Socket.io server from app configuration context
    const io = req.app.get('io');

    // 5. Emit processed result and alerts in real-time to dashboard client sockets
    const broadcastPayload = {
      patientId,
      vitalSign: savedVital,
      alert: savedAlert,
      timestamp: new Date().toISOString(),
    };

    if (io) {
      // Emit generic vitals telemetry update event
      io.emit('vitals_update', broadcastPayload);
      console.log(`Live telemetry broadcasted to clients for patient ${patientId}`);

      // If alert triggered, broadcast to dedicated emergency event channel
      if (severity !== 'Normal') {
        io.emit('new_vitals_alert', broadcastPayload);
        console.log(`🚨 Live alert broadcasted: ${severity} status for patient ${patientId}`);
      }
    }

    // Return response indicating successful ingestion & ingestion outcomes
    res.status(202).json({
      success: true,
      vitalSign: savedVital,
      alert: savedAlert,
    });

  } catch (dbError: any) {
    // Rollback operations in case of db errors
    await connection.rollback();
    console.error('Database transaction failed. Rolling back...', dbError);
    res.status(500).json({ error: 'Data persistence failed due to internal database transactional error.' });
  } finally {
    // Always release db connection back to pool
    connection.release();
  }
});

// Emergency SOS endpoint triggers immediate high severity socket alerts
router.post('/sos', async (req: Request, res: Response) => {
  const { patientId } = req.body;

  if (!patientId) {
    return res.status(400).json({ error: 'Missing parameter: patientId is required to trigger emergency SOS.' });
  }

  const io = req.app.get('io');
  const sosPayload = {
    patientId,
    alertType: 'SOS',
    severity: 'Emergency',
    message: `🚨 CRITICAL EMERGENCY: Patient ${patientId} triggered an immediate manual SOS alert!`,
    timestamp: new Date().toISOString(),
  };

  if (io) {
    io.emit('new_vitals_alert', sosPayload);
  }

  res.json({
    success: true,
    message: 'Emergency SOS alert triggered successfully.',
    alert: sosPayload,
  });
});

export default router;