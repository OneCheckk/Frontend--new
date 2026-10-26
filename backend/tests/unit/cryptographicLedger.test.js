const crypto = require('crypto');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { Application, Institution, User } = require('../../src/models');
const { runIntegrityAudit, simulateDbaTamper, repairApplication, recalculateApplicationHash } = require('../../src/services/integrityAudit.service');
const env = require('../../src/config/env');

describe('Feature 3: Cryptographic Ledger & Integrity Audit', () => {
  let mongoServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it('generates SHA-256 currentHash on creation and moves old hash to previousHash on update', async () => {
    const dummyUser = await User.create({
      name: 'Test Officer',
      email: 'officer.test@onecheck.gov.in',
      passwordHash: 'hashed_password',
      role: 'OFFICER'
    });

    const inst = await Institution.create({
      name: 'National Test Institute',
      state: 'Delhi',
      registrationId: 'TEST-INST-001',
      createdBy: dummyUser._id
    });

    const app = new Application({
      applicationNumber: 'APP-TEST-001',
      institution: inst._id,
      category: 'EOA_CONTINUATION',
      status: 'SUBMITTED',
      riskScore: 25,
      riskLevel: 'GREEN'
    });

    await app.save();

    expect(app.previousHash).toBe('0000000000000000000000000000000000000000000000000000000000000000');
    expect(app.currentHash).toBeDefined();
    expect(app.currentHash.length).toBe(64);

    const firstHash = app.currentHash;

    // Verify exact formula: Application_ID + Risk_Score + Risk_Level + Status + previousHash + SECRET_SERVER_SALT
    const expectedInitialPayload = `APP-TEST-00125GREENSUBMITTED0000000000000000000000000000000000000000000000000000000000000000${env.SECRET_SERVER_SALT}`;
    const expectedInitialHash = crypto.createHash('sha256').update(expectedInitialPayload).digest('hex');
    expect(firstHash).toBe(expectedInitialHash);

    // Update through Mongoose: status moves to APPROVED, score moves to 30
    app.status = 'APPROVED';
    app.riskScore = 30;
    await app.save();

    // Previous hash should now be the old firstHash
    expect(app.previousHash).toBe(firstHash);
    expect(app.currentHash).not.toBe(firstHash);

    const expectedSecondPayload = `APP-TEST-00130GREENAPPROVED${firstHash}${env.SECRET_SERVER_SALT}`;
    const expectedSecondHash = crypto.createHash('sha256').update(expectedSecondPayload).digest('hex');
    expect(app.currentHash).toBe(expectedSecondHash);
  });

  it('detects DBA bypass and flags CRYPTOGRAPHIC BREACH', async () => {
    // Audit before tamper: should be intact
    const cleanAudit = await runIntegrityAudit();
    expect(cleanAudit.intact).toBe(true);
    expect(cleanAudit.breachDetected).toBe(false);

    // Simulate DBA direct MongoDB modification bypassing Mongoose middleware
    const tamperResult = await simulateDbaTamper('APP-TEST-001', { riskScore: 99, riskLevel: 'RED' });
    expect(tamperResult.stagnantHash).toBeDefined();

    // Now run Integrity Audit
    const breachAudit = await runIntegrityAudit();
    expect(breachAudit.intact).toBe(false);
    expect(breachAudit.breachDetected).toBe(true);
    expect(breachAudit.status).toBe('CRYPTOGRAPHIC BREACH');
    expect(breachAudit.alert).toBe('CRYPTOGRAPHIC BREACH');
    expect(breachAudit.tamperedRecords.length).toBeGreaterThan(0);
    expect(breachAudit.tamperedRecords[0].applicationNumber).toBe('APP-TEST-001');

    // Repair application
    await repairApplication('APP-TEST-001');

    const repairedAudit = await runIntegrityAudit();
    expect(repairedAudit.intact).toBe(true);
    expect(repairedAudit.breachDetected).toBe(false);
  });
});
