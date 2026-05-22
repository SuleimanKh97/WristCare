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

    const patientsToSeed = [
      { id: 'demo-p1', userId: 'demo-u1', email: 'ahmad.ali@wristcare.com', firstName: 'Ahmad', lastName: 'Ali', birthDate: '1954-04-12' },
      { id: 'demo-p2', userId: 'demo-u2', email: 'fatima.omar@wristcare.com', firstName: 'Fatima', lastName: 'Omar', birthDate: '1958-09-22' },
      { id: 'demo-p3', userId: 'demo-u3', email: 'ziad.mansour@wristcare.com', firstName: 'Ziad', lastName: 'Mansour', birthDate: '1946-08-15' }
    ];

    for (const p of patientsToSeed) {
      // Seed user
      await dbConnection.execute(
        `INSERT INTO users (id, email, password_hash, role, name)
         VALUES (?, ?, ?, 'patient', ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name)`,
        [p.userId, p.email, '$2b$12$demoHashNotRealPasswordUsedForSeedingDataPlaceholder', `${p.firstName} ${p.lastName}`]
      );

      // Seed patient
      await dbConnection.execute(
        `INSERT INTO patients (id, user_id, organization_id, primary_clinician_id, first_name, last_name, birth_date)
         VALUES (?, ?, ?, NULL, ?, ?, ?)
         ON DUPLICATE KEY UPDATE first_name = VALUES(first_name), last_name = VALUES(last_name)`,
        [p.id, p.userId, demoOrgId, p.firstName, p.lastName, p.birthDate]
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
    
    console.log('----------------------------------------------------');
    console.log('✓ SUCCESS: Demo database profiles seeded successfully!');
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
