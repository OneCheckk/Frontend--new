/**
 * Syndicate Controller
 * Handles graph database queries, visual network payloads, Cypher definitions, and proof side panel queries.
 */

const graphService = require('../services/graph.service');
const ApiError = require('../utils/ApiError');

async function getSyndicateGraph(req, res, next) {
  try {
    const analysis = await graphService.analyzeGraph();
    res.status(200).json(analysis);
  } catch (err) {
    next(err);
  }
}

async function getCypherQueries(req, res, next) {
  try {
    res.status(200).json({
      success: true,
      data: graphService.CYPHER_QUERIES
    });
  } catch (err) {
    next(err);
  }
}

async function reseedSyndicate(req, res, next) {
  try {
    const result = await graphService.reseedGraph();
    res.status(200).json({
      success: true,
      message: 'Synthetic colleges and faculty hashes regenerated using Faker.js with planted 5-college cartel.',
      data: result
    });
  } catch (err) {
    next(err);
  }
}

async function getNodeProof(req, res, next) {
  try {
    const details = await graphService.getNodeDetails(req.params.id);
    if (!details) {
      throw ApiError.notFound(`Graph node ${req.params.id} not found`);
    }
    res.status(200).json({
      success: true,
      data: details
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getSyndicateGraph,
  getCypherQueries,
  reseedSyndicate,
  getNodeProof
};
