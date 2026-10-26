/**
 * Syndicate Routes
 * Exposes graph visualization data, Cypher queries, seeder trigger, and node details.
 */

const express = require('express');
const syndicateController = require('../controllers/syndicate.controller');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');

const router = express.Router();

// GET /api/syndicate/graph (Accessible to Bureau Directors, Officers, Auditors, Admins)
router.get(
  '/graph',
  authenticate,
  authorize('OFFICER', 'SCRUTINY_OFFICER', 'REGIONAL_DIRECTOR', 'AUDITOR', 'ADMIN'),
  syndicateController.getSyndicateGraph
);

// GET /api/syndicate/cypher-queries
router.get(
  '/cypher-queries',
  authenticate,
  authorize('OFFICER', 'SCRUTINY_OFFICER', 'REGIONAL_DIRECTOR', 'AUDITOR', 'ADMIN'),
  syndicateController.getCypherQueries
);

// GET /api/syndicate/node/:id (Proof dossier for side panel)
router.get(
  '/node/:id',
  authenticate,
  authorize('OFFICER', 'SCRUTINY_OFFICER', 'REGIONAL_DIRECTOR', 'AUDITOR', 'ADMIN'),
  syndicateController.getNodeProof
);

// POST /api/syndicate/seed (Reseed using Faker.js)
router.post(
  '/seed',
  authenticate,
  authorize('ADMIN', 'OFFICER', 'REGIONAL_DIRECTOR'),
  syndicateController.reseedSyndicate
);

module.exports = router;
