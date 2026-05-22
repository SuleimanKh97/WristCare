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
    console.log(`Creating database "${dbName}" if it does not exist...`);
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
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
    console.log('You can now start your backend with "npm run dev".');
    console.log('----------------------------------------------------');
  } catch (error: any) {
    console.error('✗ Error occurred while executing schema queries:', error.message);
    console.error('Error details:', error);
  } finally {
    await dbConnection.end();
  }
}

run();
