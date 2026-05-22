import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../db/pool';

const JWT_SECRET = process.env.JWT_SECRET || 'wristcare-super-secret-key-for-graduation-project';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
    role: 'super_admin' | 'clinician' | 'patient' | 'family';
    organizationId?: string | null;
  };
}

export const verifyToken = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization token required. Access denied.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = {
      id: decoded.id,
      email: decoded.email,
      name: decoded.name,
      role: decoded.role,
      organizationId: decoded.organizationId || null
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session token. Access denied.' });
  }
};

export const requireRole = (allowedRoles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: `Forbidden: Access restricted to roles: [${allowedRoles.join(', ')}].` });
    }

    next();
  };
};

export const requireFamilyLink = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  if (req.user.role === 'family') {
    const { patientId } = req.params; // Target patient ID
    if (!patientId) {
      return res.status(400).json({ error: 'Missing patient ID for family validation.' });
    }

    try {
      const [linkRows] = await pool.execute(
        'SELECT id FROM family_members WHERE user_id = ? AND patient_id = ?',
        [req.user.id, patientId]
      );
      const links = linkRows as any[];

      if (links.length === 0) {
        return res.status(403).json({ error: 'Access Denied: You do not have permissions to monitor this patient.' });
      }
    } catch (err) {
      console.error('Error verifying family-patient relationship:', err);
      return res.status(500).json({ error: 'Failed to verify relationship due to database error.' });
    }
  }
  
  next();
};

export const checkSubscription = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  // Super Admins bypass billing checks
  if (req.user.role === 'super_admin') {
    return next();
  }

  // Get user's organizationId. Patients, Clinicians, and Family are bound to an organization
  let orgId: string | null = req.user.organizationId || null;

  try {
    // If not in token, attempt to resolve organization ID from the database depending on role
    if (!orgId) {
      if (req.user.role === 'clinician') {
        const [rows] = await pool.execute('SELECT organization_id FROM clinicians WHERE user_id = ?', [req.user.id]);
        const list = rows as any[];
        if (list.length > 0) orgId = list[0].organization_id;
      } else if (req.user.role === 'patient') {
        const [rows] = await pool.execute('SELECT organization_id FROM patients WHERE user_id = ?', [req.user.id]);
        const list = rows as any[];
        if (list.length > 0) orgId = list[0].organization_id;
      } else if (req.user.role === 'family') {
        // Find patient organization
        const [rows] = await pool.execute(
          'SELECT p.organization_id FROM family_members fm INNER JOIN patients p ON fm.patient_id = p.id WHERE fm.user_id = ?',
          [req.user.id]
        );
        const list = rows as any[];
        if (list.length > 0) orgId = list[0].organization_id;
      }
    }

    if (!orgId) {
      return res.status(400).json({ error: 'User is not linked to any clinic/organization.' });
    }

    // Bind resolved organization ID to user context
    req.user.organizationId = orgId;

    // Check organization subscription status
    const [subRows] = await pool.execute(
      'SELECT status, expires_at FROM subscriptions WHERE organization_id = ? ORDER BY created_at DESC LIMIT 1',
      [orgId]
    );
    const subs = subRows as any[];

    if (subs.length > 0) {
      const sub = subs[0];
      const expired = new Date(sub.expires_at) < new Date();
      if ((sub.status === 'Canceled' || sub.status === 'Past_Due') || expired) {
        return res.status(402).json({ 
          error: 'Payment Required: Clinic subscription is inactive, past due, or expired.',
          subscriptionStatus: sub.status,
          expiresAt: sub.expires_at
        });
      }
    }
  } catch (err) {
    console.error('Error enforcing subscription billing:', err);
    return res.status(500).json({ error: 'Failed to verify subscription status.' });
  }

  next();
};
