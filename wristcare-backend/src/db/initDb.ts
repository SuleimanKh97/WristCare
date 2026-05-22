import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const dbHost = process.env.DB_HOST || 'localhost';
const dbUser = process.env.DB_USER || 'root';
const dbPassword = process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : '';
const dbName = process.env.DB_DATABASE || 'wristcare';
const dbPort = Number(process.env.DB_PORT) || 3306;

async function run() {
  console.log('----------------------------------------------------');
  console.log('WristCare MySQL Database Auto-Initialization Script');
  console.log('----------------------------------------------------');
  
  // 1. Establish initial connection without database to create it if not exists
  console.log(`Connecting to MySQL server at ${dbHost}:${dbPort} as "${dbUser}"...`);
  let connection;
  try {
    connection = await mysql.createConnection({
      host: dbHost,
      user: dbUser,
      password: dbPassword,
      port: dbPort,
    });
    console.log('✓ Successfully connected to MySQL server!');
  } catch (error: any) {
    console.error('✗ Failed to connect to MySQL server:', error.message);
    console.error('\nMake sure your MySQL server (XAMPP / WampServer / Local MySQL) is running.');
    console.error(`Attempted Connection Details: Host=${dbHost}, Port=${dbPort}, User=${dbUser}\n`);
    process.exit(1);
  }

  // 2. Create the database
  try {
    console.log(`Dropping database "${dbName}" if it exists...`);
    await connection.query(`DROP DATABASE IF EXISTS \`${dbName}\`;`);
    console.log(`Creating database "${dbName}"...`);
    await connection.query(`CREATE DATABASE \`${dbName}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    console.log(`✓ Database "${dbName}" is ready!`);
  } catch (error: any) {
    console.error('✗ Failed to create database:', error.message);
    await connection.end();
    process.exit(1);
  }

  await connection.end();

  // 3. Connect to the newly created database to execute the schema.sql script
  console.log(`\nConnecting to the database "${dbName}" to deploy schema tables...`);
  let dbConnection;
  try {
    dbConnection = await mysql.createConnection({
      host: dbHost,
      user: dbUser,
      password: dbPassword,
      database: dbName,
      port: dbPort,
      multipleStatements: true, // Allow multiple statements in one query execution
    });
    console.log(`✓ Connected to database "${dbName}"!`);
  } catch (error: any) {
    console.error(`✗ Failed to connect to database "${dbName}":`, error.message);
    process.exit(1);
  }

  // 4. Read schema.sql file
  const schemaPath = path.join(__dirname, 'schema.sql');
  console.log(`Reading SQL schema file from: ${schemaPath}`);
  
  let schemaSql;
  try {
    schemaSql = fs.readFileSync(schemaPath, 'utf8');
  } catch (error: any) {
    console.error('✗ Failed to read schema.sql file:', error.message);
    await dbConnection.end();
    process.exit(1);
  }

  // 5. Execute schema.sql
  try {
    console.log('Executing database schema creation (tables, foreign keys, partitions)...');
    
    // We execute the whole script because multipleStatements option is enabled
    await dbConnection.query(schemaSql);
    
    console.log('----------------------------------------------------');
    console.log('✓ SUCCESS: WristCare database tables deployed successfully!');
    console.log('----------------------------------------------------');

    // 6. Seed Demo Data to prevent foreign key errors for 'demo-p1', 'demo-p2', 'demo-p3'
    console.log('Seeding demo organizations, users, patients, and vital thresholds...');
    
    const demoOrgId = 'demo-org-1';
    await dbConnection.execute(
      `INSERT INTO organizations (id, name, license_number) 
       VALUES (?, ?, ?) 
       ON DUPLICATE KEY UPDATE name = VALUES(name)`,
      [demoOrgId, 'WristCare Demo Clinic', 'LIC-DEMO-123']
    );

    // Active subscription for demo organization
    await dbConnection.execute(
      `INSERT INTO subscriptions (id, organization_id, status, expires_at)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE status = VALUES(status)`,
      ['demo-sub-1', demoOrgId, 'Active', '2030-01-01 00:00:00']
    );

    // Seed Super Admin User
    console.log('Seeding demo Super Admin...');
    await dbConnection.execute(
      `INSERT INTO users (id, email, password_hash, role, name)
       VALUES (?, ?, ?, 'super_admin', ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name)`,
      ['demo-sa1', 'admin@wristcare.com', '$2b$10$GkyZfmWbYm5TM3zbesaPA.2z3kzlD4ndgmJ6Y13pMsslyOUWD7a5S', 'System Administrator']
    );

    // Seed Clinicians
    const cliniciansToSeed = [
      { id: 'demo-c1', userId: 'demo-cu1', email: 'suleiman.kh@wristcare.com', firstName: 'Suleiman', lastName: 'Khaled', specialty: 'Cardiology' },
      { id: 'demo-c2', userId: 'demo-cu2', email: 'sarah.omar@wristcare.com', firstName: 'Sarah', lastName: 'Omar', specialty: 'Internal Medicine' }
    ];

    for (const c of cliniciansToSeed) {
      // Seed user
      await dbConnection.execute(
        `INSERT INTO users (id, email, password_hash, role, name)
         VALUES (?, ?, ?, 'clinician', ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name)`,
        [c.userId, c.email, '$2b$10$GkyZfmWbYm5TM3zbesaPA.2z3kzlD4ndgmJ6Y13pMsslyOUWD7a5S', `${c.firstName} ${c.lastName}`]
      );

      // Seed clinician
      await dbConnection.execute(
        `INSERT INTO clinicians (id, user_id, organization_id, first_name, last_name, specialty)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE first_name = VALUES(first_name), last_name = VALUES(last_name), specialty = VALUES(specialty)`,
        [c.id, c.userId, demoOrgId, c.firstName, c.lastName, c.specialty]
      );
    }

    const patientsToSeed = [
      { id: 'demo-p1', userId: 'demo-u1', email: 'ahmad.ali@wristcare.com', firstName: 'Ahmad', lastName: 'Ali', birthDate: '1954-04-12', tier: 'Free', primaryClinicianId: 'demo-c1' },
      { id: 'demo-p2', userId: 'demo-u2', email: 'fatima.omar@wristcare.com', firstName: 'Fatima', lastName: 'Omar', birthDate: '1958-09-22', tier: 'Basic', primaryClinicianId: 'demo-c1' },
      { id: 'demo-p3', userId: 'demo-u3', email: 'ziad.mansour@wristcare.com', firstName: 'Ziad', lastName: 'Mansour', birthDate: '1946-08-15', tier: 'Premium', primaryClinicianId: 'demo-c2' }
    ];

    for (const p of patientsToSeed) {
      // Seed user
      await dbConnection.execute(
        `INSERT INTO users (id, email, password_hash, role, name)
         VALUES (?, ?, ?, 'patient', ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name)`,
        [p.userId, p.email, '$2b$10$GkyZfmWbYm5TM3zbesaPA.2z3kzlD4ndgmJ6Y13pMsslyOUWD7a5S', `${p.firstName} ${p.lastName}`]
      );

      // Seed patient
      await dbConnection.execute(
        `INSERT INTO patients (id, user_id, organization_id, primary_clinician_id, first_name, last_name, birth_date, subscription_tier)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE primary_clinician_id = VALUES(primary_clinician_id), first_name = VALUES(first_name), last_name = VALUES(last_name), subscription_tier = VALUES(subscription_tier)`,
        [p.id, p.userId, demoOrgId, p.primaryClinicianId, p.firstName, p.lastName, p.birthDate, p.tier]
      );

      // Seed default vital thresholds for patient
      const metrics = [
        { metric: 'heart_rate', min: 60.0, max: 100.0, duration: 30 },
        { metric: 'spo2', min: 95.0, max: 100.0, duration: 15 },
        { metric: 'systolic_bp', min: 90.0, max: 139.0, duration: 0 },
        { metric: 'diastolic_bp', min: 60.0, max: 89.0, duration: 0 }
      ];

      for (const item of metrics) {
        await dbConnection.execute(
          `INSERT INTO vital_thresholds (id, patient_id, metric, min_value, max_value, duration_seconds)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE min_value = VALUES(min_value), max_value = VALUES(max_value)`,
          [`threshold-${p.id}-${item.metric}`, p.id, item.metric, item.min, item.max, item.duration]
        );
      }
    }

    // Seed Family Members
    console.log('Seeding demo family member links...');
    const familyToSeed = [
      { id: 'demo-f1', userId: 'demo-fu1', email: 'family@wristcare.com', name: 'Khaled Mansour', patientId: 'demo-p3', relationship: 'Son' }
    ];

    for (const f of familyToSeed) {
      await dbConnection.execute(
        `INSERT INTO users (id, email, password_hash, role, name)
         VALUES (?, ?, ?, 'family', ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name)`,
        [f.userId, f.email, '$2b$10$GkyZfmWbYm5TM3zbesaPA.2z3kzlD4ndgmJ6Y13pMsslyOUWD7a5S', f.name]
      );

      await dbConnection.execute(
        `INSERT INTO family_members (id, user_id, patient_id, relationship)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE patient_id = VALUES(patient_id), relationship = VALUES(relationship)`,
        [f.id, f.userId, f.patientId, f.relationship]
      );
    }

    // Seed Alert History
    console.log('Seeding demo historical alerts...');
    const demoAlerts = [
      {
        id: 'alert-1',
        patient_id: 'demo-p1',
        metric: 'spo2',
        value: '91',
        severity: 'High',
        status: 'Resolved',
        clinician_notes: 'Patient was given oxygen therapy. Saturation stabilized back to 97%.',
        triggered_at: new Date(Date.now() - 3600000 * 4), // 4 hours ago
        resolved_at: new Date(Date.now() - 3600000 * 3.5),
        resolved_by: null
      },
      {
        id: 'alert-2',
        patient_id: 'demo-p2',
        metric: 'heart_rate',
        value: '112',
        severity: 'Critical',
        status: 'Triggered',
        clinician_notes: null,
        triggered_at: new Date(Date.now() - 1800000), // 30 mins ago
        resolved_at: null,
        resolved_by: null
      },
      {
        id: 'alert-3',
        patient_id: 'demo-p3',
        metric: 'systolic_bp',
        value: '148',
        severity: 'Medium',
        status: 'Acknowledged',
        clinician_notes: 'Contacted patient. Confirmed they forgot morning dose of medication. Instructed to take immediately.',
        triggered_at: new Date(Date.now() - 3600000 * 2), // 2 hours ago
        resolved_at: null,
        resolved_by: null
      }
    ];

    for (const a of demoAlerts) {
      await dbConnection.execute(
        `INSERT INTO alert_history (id, patient_id, metric, value, severity, status, clinician_notes, triggered_at, resolved_at, resolved_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE value = VALUES(value), status = VALUES(status), status = VALUES(status), clinician_notes = VALUES(clinician_notes)`,
        [a.id, a.patient_id, a.metric, a.value, a.severity, a.status, a.clinician_notes, a.triggered_at, a.resolved_at, a.resolved_by]
      );
    }

    // Seed Vitals Telemetry
    console.log('Seeding demo historical vitals telemetry (30 days)...');
    const patients = ['demo-p1', 'demo-p2', 'demo-p3'];
    const timeOffsetsHours = [1, 4, 8, 12, 24, 36, 48, 72, 96, 120, 144, 168, 200, 240, 300, 360, 420, 480, 540, 600, 660, 700];
    
    let seedCount = 0;
    for (const pId of patients) {
      for (const offset of timeOffsetsHours) {
        const measuredAt = new Date(Date.now() - 3600000 * offset);
        
        // Base normal metrics, with slight random variance
        const hr = Math.floor(65 + Math.random() * 20); // 65-85 BPM
        const spo2 = Math.floor(95 + Math.random() * 5); // 95-99%
        const sys = Math.floor(110 + Math.random() * 20); // 110-130
        const dia = Math.floor(70 + Math.random() * 15); // 70-85
        
        seedCount++;
        await dbConnection.execute(
          `INSERT INTO vitals_telemetry (id, patient_id, heart_rate, spo2, systolic_bp, diastolic_bp, measured_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE heart_rate = VALUES(heart_rate), spo2 = VALUES(spo2), systolic_bp = VALUES(systolic_bp), diastolic_bp = VALUES(diastolic_bp)`,
          [`tel-${pId}-${seedCount}`, pId, hr, spo2, sys, dia, measuredAt]
        );
      }
    }
    
    console.log('----------------------------------------------------');
    console.log('✓ SUCCESS: Demo database profiles and alerts seeded successfully!');
    console.log('----------------------------------------------------');
    console.log('You can now start your backend with "npm run dev".');
    console.log('----------------------------------------------------');
  } catch (error: any) {
    console.error('✗ Error occurred while executing schema or seeding queries:', error.message);
    console.error('Error details:', error);
    process.exit(1);
  } finally {
    await dbConnection.end();
  }
}

run();
