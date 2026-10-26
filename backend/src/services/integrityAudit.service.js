/**
 * Cryptographic Ledger Integrity Audit Service
 * 
 * Verifies the mathematical integrity of Application rows against direct database modifications
 * (e.g. DBA bypass / insider threats) using the Node.js crypto module and SECRET_SERVER_SALT.
 * 
 * Exact specification payload:
 * Application_ID + Risk_Score + Risk_Level + Status + previousHash + SECRET_SERVER_SALT
 */

const crypto = require('crypto');
const { Application } = require('../models');
const env = require('../config/env');
const logger = require('../config/logger');

/**
 * Recalculate hash for an application row using the exact specification formula
 */
function recalculateApplicationHash(app, secretSalt = env.SECRET_SERVER_SALT) {
  const appId = (app.applicationNumber || app._id).toString();
  const riskScore = app.riskScore !== null && app.riskScore !== undefined ? String(app.riskScore) : '0';
  const riskLevel = app.riskLevel || 'NONE';
  const status = app.status || 'DRAFT';
  const prevHash = app.previousHash || '0000000000000000000000000000000000000000000000000000000000000000';
  
  const payload = `${appId}${riskScore}${riskLevel}${status}${prevHash}${secretSalt}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Perform a full database scan to recalculate hashes and expose tampered records
 */
async function runIntegrityAudit() {
  const applications = await Application.find().populate('institution', 'name registrationId aicteId state');

  const tamperedRecords = [];
  const verifiedRecords = [];
  let unhashedCount = 0;

  for (const app of applications) {
    // If the application doesn't have a currentHash yet (e.g. seeded before migration), calculate and persist it
    if (!app.currentHash) {
      unhashedCount++;
      const expected = recalculateApplicationHash(app);
      app.currentHash = expected;
      await Application.updateOne(
        { _id: app._id },
        { 
          $set: { 
            currentHash: expected, 
            previousHash: app.previousHash || '0000000000000000000000000000000000000000000000000000000000000000',
            ledgerUpdatedAt: new Date()
          } 
        }
      );
      verifiedRecords.push({
        applicationId: app._id,
        applicationNumber: app.applicationNumber,
        status: app.status,
        riskScore: app.riskScore,
        riskLevel: app.riskLevel,
        currentHash: expected
      });
      continue;
    }

    const expectedHash = recalculateApplicationHash(app);
    const storedHash = app.currentHash;

    if (expectedHash !== storedHash) {
      logger.warn(`[CRYPTOGRAPHIC BREACH] Hash mismatch detected for application ${app.applicationNumber}! Stored: ${storedHash}, Recalculated: ${expectedHash}`);
      tamperedRecords.push({
        applicationId: app._id,
        applicationNumber: app.applicationNumber,
        institutionName: app.institution?.name || 'Unknown Institution',
        state: app.institution?.state || 'Unknown State',
        status: app.status,
        riskScore: app.riskScore,
        riskLevel: app.riskLevel,
        storedHash,
        recalculatedHash: expectedHash,
        previousHash: app.previousHash,
        tamperedReason: 'Stored cryptographic hash does not match computed signature. Row was directly manipulated in database storage bypassing the Node.js API layer (DBA bypass attack).'
      });
    } else {
      verifiedRecords.push({
        applicationId: app._id,
        applicationNumber: app.applicationNumber,
        status: app.status,
        riskScore: app.riskScore,
        riskLevel: app.riskLevel,
        currentHash: storedHash
      });
    }
  }

  const breachDetected = tamperedRecords.length > 0;

  return {
    success: true,
    intact: !breachDetected,
    breachDetected,
    status: breachDetected ? 'CRYPTOGRAPHIC BREACH' : 'VERIFIED_INTACT',
    alert: breachDetected ? 'CRYPTOGRAPHIC BREACH' : null,
    message: breachDetected
      ? `CRYPTOGRAPHIC BREACH DETECTED: ${tamperedRecords.length} application record(s) have mismatched cryptographic signatures. Unauthorized direct database tampering detected.`
      : `Integrity Audit passed successfully. All ${applications.length} application records match their immutable cryptographic signatures.`,
    summary: {
      totalApplications: applications.length,
      verifiedCount: verifiedRecords.length,
      tamperedCount: tamperedRecords.length,
      autoInitializedCount: unhashedCount
    },
    tamperedRecords,
    auditedAt: new Date().toISOString()
  };
}

/**
 * Simulates a DBA bribe attack by executing direct MongoDB updateOne query,
 * bypassing Mongoose pre-save middleware to leave currentHash stagnant.
 */
async function simulateDbaTamper(applicationNumberOrId, updates = {}) {
  let targetApp = null;
  if (applicationNumberOrId) {
    targetApp = await Application.findByIdOrNumber(applicationNumberOrId);
  }
  if (!targetApp) {
    targetApp = await Application.findOne().sort({ createdAt: -1 });
  }

  if (!targetApp) {
    throw new Error('No applications available in database to tamper');
  }

  // Ensure application has a baseline hash first
  if (!targetApp.currentHash) {
    targetApp.currentHash = recalculateApplicationHash(targetApp);
    await targetApp.save();
  }

  const stagnantHash = targetApp.currentHash;

  // Direct MongoDB update bypassing Mongoose pre-save middleware!
  const newScore = updates.riskScore !== undefined ? updates.riskScore : 95;
  const newLevel = updates.riskLevel !== undefined ? updates.riskLevel : 'GREEN';
  const newStatus = updates.status !== undefined ? updates.status : 'APPROVED';

  await Application.collection.updateOne(
    { _id: targetApp._id },
    {
      $set: {
        riskScore: newScore,
        riskLevel: newLevel,
        status: newStatus,
        'summary.band': newLevel
      }
    }
  );

  logger.warn(`[DEMO TAMPER] Bypassed Node.js middleware for application ${targetApp.applicationNumber}. Changed riskScore to ${newScore}, riskLevel to ${newLevel}, leaving currentHash stagnant at ${stagnantHash}`);

  return {
    applicationId: targetApp._id,
    applicationNumber: targetApp.applicationNumber,
    tamperedFields: {
      oldScore: targetApp.riskScore,
      newScore,
      oldLevel: targetApp.riskLevel,
      newLevel,
      oldStatus: targetApp.status,
      newStatus
    },
    stagnantHash,
    message: 'Direct MongoDB update executed. Mongoose pre-save middleware was bypassed. Data is altered but hash is stagnant.'
  };
}

/**
 * Re-signs a tampered application by invoking Mongoose save(), recalculating valid hash with secret salt
 */
async function repairApplication(applicationNumberOrId) {
  const app = await Application.findByIdOrNumber(applicationNumberOrId);
  if (!app) {
    throw new Error('Application not found');
  }

  // Invoking .save() triggers pre-save middleware, moving old hash to previousHash and generating new currentHash
  await app.save();

  return {
    applicationId: app._id,
    applicationNumber: app.applicationNumber,
    newHash: app.currentHash,
    previousHash: app.previousHash,
    message: 'Application cryptographic signature successfully recomputed and sealed with SECRET_SERVER_SALT.'
  };
}

module.exports = {
  recalculateApplicationHash,
  runIntegrityAudit,
  simulateDbaTamper,
  repairApplication
};
