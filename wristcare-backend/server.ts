import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import { Server } from 'socket.io';

import vitalsRouter from './src/routes/vitals';
import authRouter from './src/routes/auth';
import pool from './src/db/pool';
import { initReportCron } from './src/services/reportService';

dotenv.config();

// Initialize weekly CRON reports service
initReportCron();

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'WristCare API is running!' });
});

app.use('/api/vitals', vitalsRouter);
app.use('/api/auth', authRouter);

// Wrap Express with HTTP Server for Socket.io
const server = http.createServer(app);

// Initialize Socket.io Server
const io = new Server(server, {
  cors: {
    origin: '*', // Allow all origins for graduation mockup, restrict in production
    methods: ['GET', 'POST']
  }
});

// Attach Socket.io to Express application context to share with router
app.set('io', io);

io.on('connection', (socket) => {
  console.log(`Dashboard client connected: ${socket.id}`);
  
  socket.on('disconnect', () => {
    console.log(`Dashboard client disconnected: ${socket.id}`);
  });
});

// Test MySQL connection pool on startup
pool.query('SELECT 1')
  .then(() => {
    console.log('✓ Successfully connected to the XAMPP MySQL database [wristcare]!');
  })
  .catch((err: any) => {
    console.error('✗ Failed to connect to the XAMPP MySQL database:', err.message);
    console.error('Make sure XAMPP MySQL is running on port 3306 and the database name is "wristcare".');
  });

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`WristCare server running on port ${PORT}`);
});