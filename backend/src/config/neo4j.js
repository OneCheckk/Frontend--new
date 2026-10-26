/**
 * Neo4j Database Connection & Session Manager
 * Connects to Neo4j / AuraDB instance if available, with resilient fallback.
 */

const neo4j = require('neo4j-driver');
const env = require('./env');
const logger = require('./logger');

let driver = null;
let isConnected = false;

function getNeo4jDriver() {
  if (!driver) {
    try {
      driver = neo4j.driver(
        env.NEO4J_URI,
        neo4j.auth.basic(env.NEO4J_USER, env.NEO4J_PASSWORD),
        {
          maxConnectionLifetime: 3 * 60 * 60 * 1000, // 3 hours
          maxConnectionPoolSize: 50,
          connectionAcquisitionTimeout: 5000 // 5 seconds
        }
      );
      logger.info(`Neo4j driver initialized for URI: ${env.NEO4J_URI}`);
    } catch (err) {
      logger.warn(`Failed to initialize Neo4j driver: ${err.message}. Operating in fallback graph engine mode.`);
      driver = null;
    }
  }
  return driver;
}

async function verifyNeo4jConnectivity() {
  const d = getNeo4jDriver();
  if (!d) return false;
  try {
    const serverInfo = await d.getServerInfo();
    isConnected = true;
    logger.info(`Neo4j connected successfully: ${serverInfo.agent} at ${serverInfo.address}`);
    return true;
  } catch (err) {
    isConnected = false;
    logger.info(`Neo4j live instance not reachable (${err.message}). Using high-fidelity in-memory graph engine.`);
    return false;
  }
}

async function runCypher(query, params = {}) {
  const d = getNeo4jDriver();
  if (!d || !isConnected) {
    return null; // Signals caller to use internal graph query engine
  }

  const session = d.session({ database: env.NEO4J_DATABASE });
  try {
    const result = await session.run(query, params);
    return result.records;
  } finally {
    await session.close();
  }
}

async function closeNeo4j() {
  if (driver) {
    await driver.close();
    driver = null;
    isConnected = false;
  }
}

module.exports = {
  getNeo4jDriver,
  verifyNeo4jConnectivity,
  runCypher,
  closeNeo4j,
  isNeo4jConnected: () => isConnected
};
