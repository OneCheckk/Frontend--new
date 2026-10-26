const express = require('express');
const auditController = require('../controllers/audit.controller');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');

const router = express.Router();

// GET /api/audit/verify (OFFICER / AUDITOR / ADMIN)
router.get(
  '/verify',
  authenticate,
  authorize('OFFICER', 'SCRUTINY_OFFICER', 'REGIONAL_DIRECTOR', 'AUDITOR', 'ADMIN'),
  auditController.verifyChain
);

// GET /api/audit (OFFICER / AUDITOR / ADMIN)
router.get(
  '/',
  authenticate,
  authorize('OFFICER', 'SCRUTINY_OFFICER', 'REGIONAL_DIRECTOR', 'AUDITOR', 'ADMIN'),
  auditController.getAuditEvents
);

// GET /api/audit/integrity (Bureau Directors / REGIONAL_DIRECTOR / OFFICER / AUDITOR / ADMIN)
router.get(
  '/integrity',
  authenticate,
  authorize('OFFICER', 'SCRUTINY_OFFICER', 'REGIONAL_DIRECTOR', 'AUDITOR', 'ADMIN'),
  auditController.runIntegrityAudit
);

// POST /api/audit/integrity
router.post(
  '/integrity',
  authenticate,
  authorize('OFFICER', 'SCRUTINY_OFFICER', 'REGIONAL_DIRECTOR', 'AUDITOR', 'ADMIN'),
  auditController.runIntegrityAudit
);

// POST /api/audit/tamper-application (Simulate direct DBA database bypass)
router.post(
  '/tamper-application',
  authenticate,
  authorize('OFFICER', 'SCRUTINY_OFFICER', 'REGIONAL_DIRECTOR', 'AUDITOR', 'ADMIN'),
  auditController.simulateDbaTamper
);

// POST /api/audit/repair-application (Re-sign application with valid cryptographic signature)
router.post(
  '/repair-application',
  authenticate,
  authorize('OFFICER', 'SCRUTINY_OFFICER', 'REGIONAL_DIRECTOR', 'AUDITOR', 'ADMIN'),
  auditController.repairApplication
);

// POST /api/audit/tamper (DEV / DEMO MODE ONLY)
router.post(
  '/tamper',
  authenticate,
  authorize('ADMIN'),
  auditController.tamperAudit
);

module.exports = router;
