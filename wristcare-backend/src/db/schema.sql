-- WristCare MySQL/MariaDB Database Schema
-- Production-grade, Optimized for Remote Patient Telemetry and XAMPP

-- 1. Create Database and Switch to it
CREATE DATABASE IF NOT EXISTS `wristcare` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `wristcare`;

-- 2. Create vital_signs Table
-- Stores raw vital readings collected from Samsung Galaxy Watch 4 via Health Connect API
CREATE TABLE IF NOT EXISTS `vital_signs` (
    `id` VARCHAR(36) PRIMARY KEY,
    `patient_id` VARCHAR(100) NOT NULL, -- UUID or unique identifier from Auth/Android companion
    `heart_rate` INT NOT NULL,
    `spo2` INT NOT NULL,
    `blood_pressure` VARCHAR(20) NOT NULL, -- Format: "systolic/diastolic" (e.g. "120/80")
    `systolic_bp` INT NOT NULL, -- Extracted dynamically for optimized threshold querying
    `diastolic_bp` INT NOT NULL, -- Extracted dynamically for optimized threshold querying
    `evaluated_severity` ENUM('Normal', 'Medium', 'High', 'Emergency') NOT NULL DEFAULT 'Normal',
    `measured_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 3. Create alerts Table
-- Automatically generated when vital signs evaluation yields Medium, High, or Emergency status
CREATE TABLE IF NOT EXISTS `alerts` (
    `id` VARCHAR(36) PRIMARY KEY,
    `patient_id` VARCHAR(100) NOT NULL,
    `vital_sign_id` VARCHAR(36) NOT NULL,
    `severity` ENUM('Normal', 'Medium', 'High', 'Emergency') NOT NULL,
    `message` VARCHAR(255) NOT NULL, -- Descriptive alert details
    `is_acknowledged` BOOLEAN DEFAULT FALSE,
    `triggered_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `acknowledged_at` TIMESTAMP NULL DEFAULT NULL,
    `acknowledged_by` VARCHAR(100) DEFAULT NULL, -- Clinician or system operator
    FOREIGN KEY (`vital_sign_id`) REFERENCES `vital_signs` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 4. Create users Table
-- Stores user credentials for clinicians/doctors/administrators
CREATE TABLE IF NOT EXISTS `users` (
    `id` VARCHAR(36) PRIMARY KEY,
    `email` VARCHAR(255) UNIQUE NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `role` VARCHAR(50) NOT NULL DEFAULT 'clinician',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 5. Database Optimization Indexes
-- Fast lookup index for retrieving patient vitals over timeline queries (e.g. Dashboard live charts)
CREATE INDEX `idx_vital_signs_patient_time` ON `vital_signs` (`patient_id`, `measured_at`);

-- Fast lookup for unresolved alert events
CREATE INDEX `idx_alerts_unresolved` ON `alerts` (`patient_id`, `is_acknowledged`);

-- Fast lookup for user email logins
CREATE INDEX `idx_users_email` ON `users` (`email`);
