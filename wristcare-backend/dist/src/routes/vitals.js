"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const crypto_1 = __importDefault(require("crypto"));
const pool_1 = __importDefault(require("../db/pool"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
// Function to classify vitals against customized thresholds
function evaluateMetric(val, metric, thresholds, patientName) {
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
router.get('/:patientId', authMiddleware_1.verifyToken, authMiddleware_1.checkSubscription, authMiddleware_1.requireFamilyLink, async (req, res) => {
    const { patientId } = req.params;
    try {
        const [rows] = await pool_1.default.execute('SELECT * FROM vitals_telemetry WHERE patient_id = ? ORDER BY measured_at DESC LIMIT 50', [patientId]);
        res.json(rows);
    }
    catch (error) {
        console.error('Error fetching patient vitals:', error);
        res.status(500).json({ error: 'Failed to retrieve patient vitals due to database server error.' });
    }
});
// GET latest vital signs for a patient (Secure)
router.get('/:patientId/latest', authMiddleware_1.verifyToken, authMiddleware_1.checkSubscription, authMiddleware_1.requireFamilyLink, async (req, res) => {
    const { patientId } = req.params;
    try {
        const [rows] = await pool_1.default.execute('SELECT * FROM vitals_telemetry WHERE patient_id = ? ORDER BY measured_at DESC LIMIT 1', [patientId]);
        const results = rows;
        if (results.length === 0) {
            return res.status(404).json({ message: 'No vitals found for this patient.' });
        }
        res.json(results[0]);
    }
    catch (error) {
        console.error('Error fetching latest vitals:', error);
        res.status(500).json({ error: 'Failed to retrieve latest vitals due to database server error.' });
    }
});
// GET customized thresholds for a patient (Secure)
router.get('/patients/:patientId/thresholds', authMiddleware_1.verifyToken, authMiddleware_1.checkSubscription, authMiddleware_1.requireFamilyLink, async (req, res) => {
    const { patientId } = req.params;
    try {
        const [rows] = await pool_1.default.execute('SELECT * FROM vital_thresholds WHERE patient_id = ?', [patientId]);
        res.json(rows);
    }
    catch (error) {
        console.error('Error fetching patient thresholds:', error);
        res.status(500).json({ error: 'Failed to retrieve vital thresholds limits.' });
    }
});
// PUT update thresholds for a patient (Clinicians/Doctors only!)
router.put('/patients/:patientId/thresholds', authMiddleware_1.verifyToken, authMiddleware_1.checkSubscription, (0, authMiddleware_1.requireRole)(['clinician']), async (req, res) => {
    const { patientId } = req.params;
    const { thresholds } = req.body; // Expects array of { metric, min_value, max_value, duration_seconds }
    if (!thresholds || !Array.isArray(thresholds)) {
        return res.status(400).json({ error: 'Missing or invalid thresholds array parameter.' });
    }
    const connection = await pool_1.default.getConnection();
    try {
        await connection.beginTransaction();
        for (const item of thresholds) {
            const { metric, min_value, max_value, duration_seconds } = item;
            // Upsert threshold record
            await connection.execute(`INSERT INTO vital_thresholds (id, patient_id, metric, min_value, max_value, duration_seconds)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE min_value = VALUES(min_value), max_value = VALUES(max_value), duration_seconds = VALUES(duration_seconds)`, [crypto_1.default.randomUUID(), patientId, metric, min_value, max_value, duration_seconds || 0]);
        }
        await connection.commit();
        res.json({ success: true, message: '✓ Patient vital threshold configurations successfully updated.' });
    }
    catch (err) {
        await connection.rollback();
        console.error('Error updating patient thresholds:', err);
        res.status(500).json({ error: 'Failed to update thresholds due to server error: ' + err.message });
    }
    finally {
        connection.release();
    }
});
// GET complete institutional alerts log (Clinicians only)
router.get('/alerts/all/log', authMiddleware_1.verifyToken, authMiddleware_1.checkSubscription, (0, authMiddleware_1.requireRole)(['clinician']), async (req, res) => {
    try {
        const orgId = req.user?.organizationId;
        let query = `
      SELECT ah.*, p.first_name, p.last_name 
      FROM alert_history ah
      LEFT JOIN patients p ON ah.patient_id = p.id
      ORDER BY ah.triggered_at DESC 
      LIMIT 100
    `;
        let params = [];
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
        const [rows] = await pool_1.default.execute(query, params);
        res.json(rows);
    }
    catch (error) {
        console.error('Error fetching all alerts:', error);
        res.status(500).json({ error: 'Failed to retrieve complete alerts history log.' });
    }
});
// GET alert history for a patient (Secure)
router.get('/alerts/:patientId', authMiddleware_1.verifyToken, authMiddleware_1.checkSubscription, authMiddleware_1.requireFamilyLink, async (req, res) => {
    const { patientId } = req.params;
    try {
        const [rows] = await pool_1.default.execute('SELECT * FROM alert_history WHERE patient_id = ? ORDER BY triggered_at DESC LIMIT 50', [patientId]);
        res.json(rows);
    }
    catch (error) {
        console.error('Error fetching patient alerts:', error);
        res.status(500).json({ error: 'Failed to retrieve alert history log.' });
    }
});
// PUT acknowledge alert (Clinicians only)
router.put('/alerts/:alertId/acknowledge', authMiddleware_1.verifyToken, authMiddleware_1.checkSubscription, (0, authMiddleware_1.requireRole)(['clinician']), async (req, res) => {
    const { alertId } = req.params;
    const clinicianName = req.user?.name || 'Clinician';
    try {
        await pool_1.default.execute(`UPDATE alert_history 
       SET status = 'Acknowledged', resolved_at = CURRENT_TIMESTAMP, clinician_notes = ?
       WHERE id = ?`, [`Acknowledged by ${clinicianName}`, alertId]);
        // Get the updated alert record to broadcast changes
        const [rows] = await pool_1.default.execute('SELECT * FROM alert_history WHERE id = ?', [alertId]);
        const list = rows;
        const io = req.app.get('io');
        if (io && list.length > 0) {
            io.emit('alert_acknowledged', list[0]);
        }
        res.json({ success: true, message: '✓ Alert successfully acknowledged.', alert: list[0] });
    }
    catch (err) {
        console.error('Error acknowledging alert:', err);
        res.status(500).json({ error: 'Failed to acknowledge alert due to server error.' });
    }
});
// PUT resolve alert (Clinicians only)
router.put('/alerts/:alertId/resolve', authMiddleware_1.verifyToken, authMiddleware_1.checkSubscription, (0, authMiddleware_1.requireRole)(['clinician']), async (req, res) => {
    const { alertId } = req.params;
    const clinicianName = req.user?.name || 'Clinician';
    const { notes } = req.body;
    try {
        await pool_1.default.execute(`UPDATE alert_history 
       SET status = 'Resolved', resolved_at = CURRENT_TIMESTAMP, clinician_notes = ?
       WHERE id = ?`, [notes || `Resolved by ${clinicianName}`, alertId]);
        // Get the updated alert record to broadcast changes
        const [rows] = await pool_1.default.execute('SELECT * FROM alert_history WHERE id = ?', [alertId]);
        const list = rows;
        const io = req.app.get('io');
        if (io && list.length > 0) {
            io.emit('alert_resolved', list[0]);
        }
        res.json({ success: true, message: '✓ Alert successfully resolved.', alert: list[0] });
    }
    catch (err) {
        console.error('Error resolving alert:', err);
        res.status(500).json({ error: 'Failed to resolve alert due to server error.' });
    }
});
// GET Super Admin Clinics / Billing manager (Super Admin only!)
router.get('/admin/organizations', authMiddleware_1.verifyToken, (0, authMiddleware_1.requireRole)(['super_admin']), async (req, res) => {
    try {
        // Retrieve organizations, active subscription details, patient counts, clinician counts
        const query = `
      SELECT o.id, o.name, o.license_number, o.created_at, s.status AS sub_status, s.expires_at,
             (SELECT COUNT(*) FROM patients p WHERE p.organization_id = o.id) AS patient_count,
             (SELECT COUNT(*) FROM clinicians c WHERE c.organization_id = o.id) AS clinician_count
      FROM organizations o
      LEFT JOIN subscriptions s ON o.id = s.organization_id;
    `;
        const [rows] = await pool_1.default.execute(query);
        res.json(rows);
    }
    catch (error) {
        console.error('Error fetching admin organizations list:', error);
        res.status(500).json({ error: 'Failed to retrieve organizations telemetry statistics.' });
    }
});
// PUT Super Admin Billing status toggle (Super Admin only!)
router.put('/admin/subscriptions/:organizationId', authMiddleware_1.verifyToken, (0, authMiddleware_1.requireRole)(['super_admin']), async (req, res) => {
    const { organizationId } = req.params;
    const { status, expires_at } = req.body; // Expects status ('Active', 'Past_Due', 'Canceled') and expiry calendar string
    if (!status || !expires_at) {
        return res.status(400).json({ error: 'Missing status or expires_at parameter.' });
    }
    try {
        // Upsert subscription record
        await pool_1.default.execute(`INSERT INTO subscriptions (id, organization_id, status, expires_at)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE status = VALUES(status), expires_at = VALUES(expires_at)`, [crypto_1.default.randomUUID(), organizationId, status, expires_at]);
        res.json({ success: true, message: `✓ Organization subscription updated to [${status}] successfully.` });
    }
    catch (err) {
        console.error('Error updating subscriptions:', err);
        res.status(500).json({ error: 'Failed to update subscription tier due to server error.' });
    }
});
// POST /api/vitals: Real-time Ingestion & Classification
router.post('/', async (req, res) => {
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
            const [pRows] = await pool_1.default.execute('SELECT first_name, last_name FROM patients WHERE id = ?', [patientId]);
            const pList = pRows;
            if (pList.length > 0) {
                patientName = `${pList[0].first_name} ${pList[0].last_name}`;
            }
            else {
                if (patientId === 'demo-p1')
                    patientName = 'Ahmad Ali';
                else if (patientId === 'demo-p2')
                    patientName = 'Fatima Omar';
                else if (patientId === 'demo-p3')
                    patientName = 'Ziad Mansour';
            }
        }
        catch (nameErr) {
            console.error('Error fetching patient name:', nameErr);
        }
        // 2. Fetch custom thresholds configured for this patient
        const [thresholdsRows] = await pool_1.default.execute('SELECT * FROM vital_thresholds WHERE patient_id = ?', [patientId]);
        const thresholds = thresholdsRows;
        // 3. Evaluate each vital sign against customized threshold bounds
        const hrEval = evaluateMetric(hrVal, 'heart_rate', thresholds, patientName);
        const spo2Eval = evaluateMetric(spo2Val, 'spo2', thresholds, patientName);
        const sysEval = evaluateMetric(systolic, 'systolic_bp', thresholds, patientName);
        const diaEval = evaluateMetric(diastolic, 'diastolic_bp', thresholds, patientName);
        // 4. Resolve overall severity
        const evaluationResults = [hrEval, spo2Eval, sysEval, diaEval];
        const severities = evaluationResults.map(r => r.severity);
        const messages = evaluationResults.map(r => r.msg).filter(msg => msg !== '');
        let finalSeverity = 'Normal';
        if (severities.includes('Emergency')) {
            finalSeverity = 'Emergency';
        }
        else if (severities.includes('High')) {
            finalSeverity = 'High';
        }
        else if (severities.includes('Medium')) {
            finalSeverity = 'Medium';
        }
        const connection = await pool_1.default.getConnection();
        try {
            await connection.beginTransaction();
            const telemetryId = crypto_1.default.randomUUID();
            const measuredTime = new Date();
            // 5. Bulk insert vital sign telemetry into partitioned InnoDB table
            await connection.execute(`INSERT INTO vitals_telemetry (id, patient_id, heart_rate, spo2, systolic_bp, diastolic_bp, measured_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`, [telemetryId, patientId, hrVal, spo2Val, systolic, diastolic, measuredTime]);
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
            const savedAlerts = [];
            // 6. Persist any threshold breaches as audit log entries in alert_history
            if (finalSeverity !== 'Normal') {
                // Map individual metrics that failed
                const breachMetrics = [];
                if (hrEval.severity !== 'Normal')
                    breachMetrics.push('heart_rate');
                if (spo2Eval.severity !== 'Normal')
                    breachMetrics.push('spo2');
                if (sysEval.severity !== 'Normal')
                    breachMetrics.push('systolic_bp');
                if (diaEval.severity !== 'Normal')
                    breachMetrics.push('diastolic_bp');
                for (const metric of breachMetrics) {
                    const alertId = crypto_1.default.randomUUID();
                    const metricVal = metric === 'heart_rate' ? `${hrVal} BPM` : metric === 'spo2' ? `${spo2Val}%` : metric === 'systolic_bp' ? `${systolic} mmHg` : `${diastolic} mmHg`;
                    const metricSev = metric === 'heart_rate' ? hrEval.severity : metric === 'spo2' ? spo2Eval.severity : metric === 'systolic_bp' ? sysEval.severity : diaEval.severity;
                    const metricMsg = metric === 'heart_rate' ? hrEval.msg : metric === 'spo2' ? spo2Eval.msg : metric === 'systolic_bp' ? sysEval.msg : diaEval.msg;
                    await connection.execute(`INSERT INTO alert_history (id, patient_id, metric, value, severity, status, clinician_notes, triggered_at)
             VALUES (?, ?, ?, ?, ?, 'Triggered', NULL, ?)`, [alertId, patientId, metric, metricVal, metricSev, measuredTime]);
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
        }
        catch (txErr) {
            await connection.rollback();
            throw txErr;
        }
        finally {
            connection.release();
        }
    }
    catch (error) {
        console.error('Error during telemetry ingestion:', error);
        res.status(500).json({ error: 'Data persistence failed due to internal server error: ' + error.message });
    }
});
// Emergency SOS manual trigger
router.post('/sos', async (req, res) => {
    const { patientId } = req.body;
    if (!patientId) {
        return res.status(400).json({ error: 'Missing parameter: patientId.' });
    }
    // Resolve patient's real name
    let patientName = `Patient ${patientId}`;
    try {
        const [pRows] = await pool_1.default.execute('SELECT first_name, last_name FROM patients WHERE id = ?', [patientId]);
        const pList = pRows;
        if (pList.length > 0) {
            patientName = `${pList[0].first_name} ${pList[0].last_name}`;
        }
        else {
            if (patientId === 'demo-p1')
                patientName = 'Ahmad Ali';
            else if (patientId === 'demo-p2')
                patientName = 'Fatima Omar';
            else if (patientId === 'demo-p3')
                patientName = 'Ziad Mansour';
        }
    }
    catch (err) {
        console.error('Error fetching patient name for SOS:', err);
    }
    const io = req.app.get('io');
    const alertId = crypto_1.default.randomUUID();
    const measuredTime = new Date();
    try {
        // Record SOS alert into audit log
        await pool_1.default.execute(`INSERT INTO alert_history (id, patient_id, metric, value, severity, status, clinician_notes, triggered_at)
       VALUES (?, ?, 'heart_rate', 'SOS', 'Critical', 'Triggered', 'Patient manual panic button triggered', ?)`, [alertId, patientId, measuredTime]);
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
    }
    catch (err) {
        console.error('Error triggering manual SOS:', err);
        res.status(500).json({ error: 'Failed to record SOS event.' });
    }
});
exports.default = router;
