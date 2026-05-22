import express, { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import pool from '../db/pool';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'wristcare-super-secret-key-for-graduation-project';

// POST /api/auth/register: Register a new clinician/doctor
router.post('/register', async (req: Request, res: Response) => {
  const { email, password, name, role } = req.body;

  // 1. Validation checks
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Missing parameters. Email, password, and name are required.' });
  }

  try {
    // 2. Check if user already exists
    const [existingUsers] = await pool.execute(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );
    const existingList = existingUsers as any[];

    if (existingList.length > 0) {
      return res.status(400).json({ error: 'An account with this email already exists.' });
    }

    // 3. Hash the password securely using bcrypt
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    
    // 4. Generate unique UUID
    const userId = crypto.randomUUID();
    const userRole = role || 'clinician';

    // 5. Store user in MySQL database
    await pool.execute(
      'INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)',
      [userId, email, passwordHash, name, userRole]
    );

    console.log(`New clinician registered: ${name} (${email})`);

    // 6. Generate session JWT token
    const token = jwt.sign(
      { id: userId, email, name, role: userRole },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      success: true,
      token,
      user: {
        id: userId,
        email,
        name,
        role: userRole,
      }
    });

  } catch (error: any) {
    console.error('Error during registration:', error);
    res.status(500).json({ error: 'Registration failed due to a database error.' });
  }
});

// POST /api/auth/login: Login clinician and return JWT
router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;

  // 1. Validation checks
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    // 2. Query user by email
    const [users] = await pool.execute(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );
    const userList = users as any[];

    if (userList.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user = userList[0];

    // 3. Verify bcrypt password hash
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // 4. Generate signed JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log(`User logged in: ${user.name} (${user.email})`);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      }
    });

  } catch (error: any) {
    console.error('Error during login:', error);
    res.status(500).json({ error: 'Login process failed due to server error.' });
  }
});

// GET /api/auth/me: Verify active session token
router.get('/me', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization token required.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    
    // Refresh user state from database to ensure record still exists
    const [users] = await pool.execute(
      'SELECT id, email, name, role FROM users WHERE id = ?',
      [decoded.id]
    );
    const userList = users as any[];

    if (userList.length === 0) {
      return res.status(401).json({ error: 'User session no longer exists.' });
    }

    res.json({
      valid: true,
      user: userList[0]
    });

  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired session token.' });
  }
});

export default router;
