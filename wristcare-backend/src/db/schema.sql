-- WristCare MySQL/MariaDB Database Schema
-- Production-grade, Optimized for Remote Patient Telemetry and XAMPP
-- Expands to support 4-Role RBAC authorization matrices and tenant configurations

-- Disable foreign key checks during schema creation to prevent ordering issues
SET FOREIGN_KEY_CHECKS = 0;

-- 1. Organizations (Multi-tenant facilities or clinics)
CREATE TABLE IF NOT EXISTS organizations (
    id VARCHAR(36) NOT NULL,
    name VARCHAR(255) NOT NULL,
    license_number VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_license_number (license_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Subscriptions (Tiered Billing for Organizations)
CREATE TABLE IF NOT EXISTS subscriptions (
    id VARCHAR(36) NOT NULL,
    organization_id VARCHAR(36) NOT NULL,
    status ENUM('Active', 'Past_Due', 'Canceled') NOT NULL DEFAULT 'Active',
    expires_at DATETIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_subscriptions_organization_id FOREIGN KEY (organization_id) 
        REFERENCES organizations (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Users (System-wide Accounts with RBAC)
-- Roles supported: 'super_admin' (system control), 'clinician' (doctor), 'patient' (elderly), 'family' (guardians)
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role ENUM('super_admin', 'clinician', 'patient', 'family') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_user_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Clinicians (Hospital or Clinic Medical Staff)
CREATE TABLE IF NOT EXISTS clinicians (
    id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    organization_id VARCHAR(36) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    specialty VARCHAR(100) DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_clinician_user (user_id),
    CONSTRAINT fk_clinicians_user_id FOREIGN KEY (user_id) 
        REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_clinicians_organization_id FOREIGN KEY (organization_id) 
        REFERENCES organizations (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Patients (Monitored Individuals)
CREATE TABLE IF NOT EXISTS patients (
    id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    organization_id VARCHAR(36) NOT NULL,
    primary_clinician_id VARCHAR(36) DEFAULT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    birth_date DATE NOT NULL,
    subscription_tier ENUM('Free', 'Basic', 'Premium') NOT NULL DEFAULT 'Free',
    PRIMARY KEY (id),
    UNIQUE KEY uq_patient_user (user_id),
    CONSTRAINT fk_patients_user_id FOREIGN KEY (user_id) 
        REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_patients_organization_id FOREIGN KEY (organization_id) 
        REFERENCES organizations (id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_patients_clinician_id FOREIGN KEY (primary_clinician_id) 
        REFERENCES clinicians (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Family Members (Links Family Accounts to Patients they monitor)
CREATE TABLE IF NOT EXISTS family_members (
    id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36) NOT NULL, -- Links to users where role = 'family'
    patient_id VARCHAR(36) NOT NULL, -- Links to patients being monitored
    relationship VARCHAR(100) DEFAULT NULL, -- e.g., 'Son', 'Daughter', 'Spouse', 'Guardian'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_family_patient (user_id, patient_id),
    CONSTRAINT fk_family_user_id FOREIGN KEY (user_id) 
        REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_family_patient_id FOREIGN KEY (patient_id) 
        REFERENCES patients (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Vital Thresholds (Customizable limits for alerting)
CREATE TABLE IF NOT EXISTS vital_thresholds (
    id VARCHAR(36) NOT NULL,
    patient_id VARCHAR(36) NOT NULL,
    metric ENUM('heart_rate', 'spo2', 'systolic_bp', 'diastolic_bp') NOT NULL,
    min_value DOUBLE NOT NULL,
    max_value DOUBLE NOT NULL,
    duration_seconds INT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uq_patient_metric (patient_id, metric),
    CONSTRAINT fk_vital_thresholds_patient_id FOREIGN KEY (patient_id) 
        REFERENCES patients (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Vitals Telemetry (Time-Series Table: Partitioned by RANGE COLUMNS)
-- NOTE: In MySQL, all partitioning keys must be part of any unique/primary keys.
-- Therefore, the Primary Key is a composite of (patient_id, measured_at, id).
CREATE TABLE IF NOT EXISTS vitals_telemetry (
    id VARCHAR(36) NOT NULL,
    patient_id VARCHAR(36) NOT NULL,
    heart_rate INT DEFAULT NULL,
    spo2 INT DEFAULT NULL,
    systolic_bp INT DEFAULT NULL,
    diastolic_bp INT DEFAULT NULL,
    measured_at DATETIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (patient_id, measured_at, id),
    KEY idx_telemetry_id (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
PARTITION BY RANGE COLUMNS(measured_at) (
    PARTITION p2026_01 VALUES LESS THAN ('2026-02-01 00:00:00'),
    PARTITION p2026_02 VALUES LESS THAN ('2026-03-01 00:00:00'),
    PARTITION p2026_03 VALUES LESS THAN ('2026-04-01 00:00:00'),
    PARTITION p2026_04 VALUES LESS THAN ('2026-05-01 00:00:00'),
    PARTITION p2026_05 VALUES LESS THAN ('2026-06-01 00:00:00'),
    PARTITION p2026_06 VALUES LESS THAN ('2026-07-01 00:00:00'),
    PARTITION pmax VALUES LESS THAN MAXVALUE
);

-- 9. Alert History (Audit log of triggered events)
CREATE TABLE IF NOT EXISTS alert_history (
    id VARCHAR(36) NOT NULL,
    patient_id VARCHAR(36) NOT NULL,
    metric ENUM('heart_rate', 'spo2', 'systolic_bp', 'diastolic_bp') NOT NULL,
    value VARCHAR(50) NOT NULL,
    severity ENUM('Low', 'Medium', 'High', 'Critical') NOT NULL,
    status ENUM('Triggered', 'Acknowledged', 'Resolved') NOT NULL DEFAULT 'Triggered',
    clinician_notes TEXT DEFAULT NULL,
    triggered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME DEFAULT NULL,
    resolved_by VARCHAR(36) DEFAULT NULL,
    PRIMARY KEY (id),
    KEY idx_alert_history_patient_time (patient_id, triggered_at DESC),
    CONSTRAINT fk_alerts_patient_id FOREIGN KEY (patient_id) 
        REFERENCES patients (id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_alerts_resolved_by FOREIGN KEY (resolved_by) 
        REFERENCES clinicians (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
