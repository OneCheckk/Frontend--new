/**
 * Synthetic Graph Data Seeder using Faker.js
 * 
 * Generates synthetic Colleges and Faculty Hashes, intentionally planting
 * a 5-college cartel (syndicate ring) sharing faculty rosters to demonstrate
 * real-time graph detection capabilities (multi-hop traversal and cycle detection).
 */

const crypto = require('crypto');
const { runCypher, isNeo4jConnected } = require('../config/neo4j');
const logger = require('../config/logger');

// Lazy load pure-ESM @faker-js/faker with CJS compatibility
let faker = null;
try {
  // eslint-disable-next-line global-require
  const fakerModule = require('@faker-js/faker');
  faker = fakerModule.faker || fakerModule.default?.faker;
} catch (_) {
  // Will load via dynamic import or fallback
}

async function loadFaker() {
  if (!faker) {
    try {
      const fakerModule = await import('@faker-js/faker');
      faker = fakerModule.faker;
    } catch (e) {
      logger.warn(`Could not load ESM @faker-js/faker: ${e.message}`);
    }
  }
  return faker;
}

// Fallback random helper if faker not yet initialized
const fakeUtil = {
  fullName: () => {
    if (faker?.person?.fullName) return faker.person.fullName();
    const first = ['Dr. Ramesh', 'Prof. Sunita', 'Dr. Arvind', 'Prof. Rajeshwari', 'Dr. Anand', 'Prof. K.'];
    const last = ['Sharma', 'Deshmukh', 'Verma', 'Natarajan', 'Patel', 'Radhakrishnan'];
    return `${first[Math.floor(Math.random() * first.length)]} ${last[Math.floor(Math.random() * last.length)]}`;
  },
  numeric: (len) => {
    if (faker?.string?.numeric) return faker.string.numeric(len);
    return Math.floor(Math.random() * 10 ** len).toString().padStart(len, '0');
  },
  int: (min, max) => {
    if (faker?.number?.int) return faker.number.int({ min, max });
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
};


// Indian States and Cities for realistic regulatory data
const LOCATIONS = [
  { state: 'Delhi NCR', city: 'Noida', region: 'NORTH' },
  { state: 'Maharashtra', city: 'Pune', region: 'WEST' },
  { state: 'Karnataka', city: 'Bengaluru', region: 'SOUTH' },
  { state: 'Tamil Nadu', city: 'Chennai', region: 'SOUTH' },
  { state: 'Gujarat', city: 'Ahmedabad', region: 'WEST' },
  { state: 'Uttar Pradesh', city: 'Lucknow', region: 'NORTH' },
  { state: 'Telangana', city: 'Hyderabad', region: 'SOUTH' },
  { state: 'West Bengal', city: 'Kolkata', region: 'EAST' },
  { state: 'Rajasthan', city: 'Jaipur', region: 'NORTH' },
  { state: 'Madhya Pradesh', city: 'Indore', region: 'CENTRAL' }
];

function generateHmacHash(rawString) {
  return crypto.createHash('sha256').update(`ONECHECK_FACULTY_${rawString}`).digest('hex');
}

/**
 * Generate synthetic graph data with an intentional 5-college cartel
 */
function generateSyntheticGraphData() {
  const colleges = [];
  const facultyHashes = [];
  const relationships = [];

  // -------------------------------------------------------------
  // 1. Plant Intentional 5-College Cartel (Syndicate Ring)
  // -------------------------------------------------------------
  const cartelCollegeDefs = [
    { id: 'COL-CARTEL-01', name: 'Apex National Institute of Technology', state: 'Delhi NCR', city: 'Noida', riskScore: 88, riskLevel: 'RED' },
    { id: 'COL-CARTEL-02', name: 'Paramount College of Engineering & Research', state: 'Maharashtra', city: 'Pune', riskScore: 84, riskLevel: 'RED' },
    { id: 'COL-CARTEL-03', name: 'Vanguard Institute of Technical Studies', state: 'Karnataka', city: 'Bengaluru', riskScore: 82, riskLevel: 'RED' },
    { id: 'COL-CARTEL-04', name: 'Horizon Institute of Management & Science', state: 'Tamil Nadu', city: 'Chennai', riskScore: 79, riskLevel: 'RED' },
    { id: 'COL-CARTEL-05', name: 'Zenith Global Engineering College', state: 'Gujarat', city: 'Ahmedabad', riskScore: 86, riskLevel: 'RED' }
  ];

  cartelCollegeDefs.forEach((c) => {
    colleges.push({
      ...c,
      isCartelMember: true,
      cartelId: 'CARTEL-RING-ALPHA',
      type: 'college',
      registrationId: `AICTE-${c.id}`,
      establishedYear: fakeUtil.int(2005, 2018)
    });
  });

  // 10 Ghost Faculty Hashes heavily recycled across all 5 cartel colleges
  const ghostFacultyDefs = [
    { name: 'Dr. Ramesh Chandra Sharma', identifierType: 'AADHAAR', rawId: '984512301122', dept: 'Computer Science' },
    { name: 'Prof. Sunita K. Deshmukh', identifierType: 'PAN', rawId: 'ABCDE1234F', dept: 'Information Technology' },
    { name: 'Dr. Arvind Kumar Verma', identifierType: 'AADHAAR', rawId: '871234567890', dept: 'Electronics & Comm.' },
    { name: 'Prof. Rajeshwari Natarajan', identifierType: 'AADHAAR', rawId: '542198763421', dept: 'Mechanical Engg' },
    { name: 'Dr. Vikramaditya Rathore', identifierType: 'PAN', rawId: 'XYZPQ5678R', dept: 'Civil Engineering' },
    { name: 'Prof. Meenakshi Sundaram', identifierType: 'AADHAAR', rawId: '334455667788', dept: 'Electrical Engg' },
    { name: 'Dr. Anand H. Patel', identifierType: 'PAN', rawId: 'JKLMN9012S', dept: 'Applied Sciences' },
    { name: 'Prof. K. Radhakrishnan', identifierType: 'AADHAAR', rawId: '667788990011', dept: 'Computer Science' },
    { name: 'Dr. Shweta Mukherjee', identifierType: 'PAN', rawId: 'QWERT4321A', dept: 'Data Science' },
    { name: 'Prof. Harishankar Tiwari', identifierType: 'AADHAAR', rawId: '112233445566', dept: 'Artificial Intelligence' }
  ];

  ghostFacultyDefs.forEach((f, idx) => {
    const hash = generateHmacHash(f.rawId);
    facultyHashes.push({
      id: `FAC-${idx + 1}`,
      hash,
      name: f.name,
      identifierType: f.identifierType,
      department: f.dept,
      type: 'faculty',
      isGhost: true
    });
  });

  // Cycle relationships across the 5 cartel colleges:
  // Each faculty is assigned to multiple colleges, creating dense pairwise overlaps
  // and multi-hop paths (A -> B -> C -> D -> E -> A)
  const cartelCollegeIds = cartelCollegeDefs.map((c) => c.id);

  // Distribute ghost faculty in interlocking cycles
  facultyHashes.forEach((fac, facIdx) => {
    // Each faculty member is shared between 2 to 4 cartel colleges
    const collegesCount = 2 + (facIdx % 3); // 2, 3, or 4 colleges
    const assignedColleges = [];
    for (let i = 0; i < collegesCount; i++) {
      const colId = cartelCollegeIds[(facIdx + i) % cartelCollegeIds.length];
      assignedColleges.push(colId);
      relationships.push({
        id: `REL-EMPLOYS-${colId}-${fac.id}`,
        source: colId,
        target: fac.id,
        relationshipType: 'EMPLOYS',
        facultyHash: fac.hash,
        facultyName: fac.name,
        identifierType: fac.identifierType
      });
    }

    // Connect colleges pairwise with SHARES_FACULTY edges
    for (let i = 0; i < assignedColleges.length; i++) {
      for (let j = i + 1; j < assignedColleges.length; j++) {
        const c1 = assignedColleges[i];
        const c2 = assignedColleges[j];
        relationships.push({
          id: `REL-SHARE-${c1}-${c2}-${fac.id}`,
          source: c1,
          target: c2,
          relationshipType: 'SHARES_FACULTY',
          facultyHash: fac.hash,
          facultyName: fac.name,
          identifierType: fac.identifierType,
          matchConfidence: 0.99
        });
      }
    }
  });

  // -------------------------------------------------------------
  // 2. Generate 10 Non-Cartel (Legitimate / Mild) Colleges
  // -------------------------------------------------------------
  const normalColleges = [
    { name: 'St. Xavier Institute of Technology', state: 'Tamil Nadu', city: 'Chennai', riskScore: 18, riskLevel: 'GREEN' },
    { name: 'Kalinga Institute of Architecture', state: 'Odisha', city: 'Bhubaneswar', riskScore: 24, riskLevel: 'GREEN' },
    { name: 'Sardar Patel College of Pharmacy', state: 'Gujarat', city: 'Ahmedabad', riskScore: 16, riskLevel: 'GREEN' },
    { name: 'Chanakya Polytechnic Institute', state: 'Karnataka', city: 'Mysuru', riskScore: 32, riskLevel: 'GREEN' },
    { name: 'Vidya Jyothi Institute of Higher Learning', state: 'Telangana', city: 'Hyderabad', riskScore: 28, riskLevel: 'GREEN' },
    { name: 'Indira Gandhi Memorial Engineering College', state: 'Madhya Pradesh', city: 'Bhopal', riskScore: 45, riskLevel: 'YELLOW' },
    { name: 'Maharaja Sayajirao Technical Academy', state: 'Gujarat', city: 'Vadodara', riskScore: 22, riskLevel: 'GREEN' },
    { name: 'Bengal Engineering & Science University', state: 'West Bengal', city: 'Howrah', riskScore: 15, riskLevel: 'GREEN' },
    { name: 'Deccan College of Engineering & Technology', state: 'Telangana', city: 'Hyderabad', riskScore: 38, riskLevel: 'YELLOW' },
    { name: 'Rajasthan Technical Institute of Research', state: 'Rajasthan', city: 'Jaipur', riskScore: 52, riskLevel: 'YELLOW' }
  ];

  normalColleges.forEach((nc, i) => {
    const colId = `COL-NORM-${i + 1}`;
    colleges.push({
      id: colId,
      name: nc.name,
      state: nc.state,
      city: nc.city,
      riskScore: nc.riskScore,
      riskLevel: nc.riskLevel,
      isCartelMember: false,
      cartelId: null,
      type: 'college',
      registrationId: `AICTE-${colId}`,
      establishedYear: fakeUtil.int(1995, 2020)
    });

    // Generate 2 legitimate faculty per normal college
    for (let f = 1; f <= 2; f++) {
      const facId = `FAC-NORM-${i + 1}-${f}`;
      const fakeName = fakeUtil.fullName();
      const fakeId = fakeUtil.numeric(12);
      const hash = generateHmacHash(fakeId);

      facultyHashes.push({
        id: facId,
        hash,
        name: fakeName,
        identifierType: f % 2 === 0 ? 'PAN' : 'AADHAAR',
        department: 'Engineering Science',
        type: 'faculty',
        isGhost: false
      });

      relationships.push({
        id: `REL-EMPLOYS-${colId}-${facId}`,
        source: colId,
        target: facId,
        relationshipType: 'EMPLOYS',
        facultyHash: hash,
        facultyName: fakeName,
        identifierType: f % 2 === 0 ? 'PAN' : 'AADHAAR'
      });
    }
  });

  // Add 1 benign single-overlap between two normal colleges (isolated, non-cartel)
  const benignFac = {
    id: 'FAC-BENIGN-01',
    hash: generateHmacHash('BENIGN-99887766'),
    name: 'Dr. Suresh V. Nair (Adjunct Visiting)',
    identifierType: 'AADHAAR',
    department: 'Visiting Faculty',
    type: 'faculty',
    isGhost: false
  };
  facultyHashes.push(benignFac);

  relationships.push(
    {
      id: `REL-EMPLOYS-COL-NORM-1-${benignFac.id}`,
      source: 'COL-NORM-1',
      target: benignFac.id,
      relationshipType: 'EMPLOYS',
      facultyHash: benignFac.hash,
      facultyName: benignFac.name,
      identifierType: benignFac.identifierType
    },
    {
      id: `REL-EMPLOYS-COL-NORM-2-${benignFac.id}`,
      source: 'COL-NORM-2',
      target: benignFac.id,
      relationshipType: 'EMPLOYS',
      facultyHash: benignFac.hash,
      facultyName: benignFac.name,
      identifierType: benignFac.identifierType
    },
    {
      id: 'REL-SHARE-COL-NORM-1-COL-NORM-2',
      source: 'COL-NORM-1',
      target: 'COL-NORM-2',
      relationshipType: 'SHARES_FACULTY',
      facultyHash: benignFac.hash,
      facultyName: benignFac.name,
      identifierType: benignFac.identifierType,
      matchConfidence: 0.82
    }
  );

  return { colleges, facultyHashes, relationships };
}

/**
 * Sync synthetic graph into live Neo4j database if connected
 */
async function syncToNeo4j(graphData) {
  if (!isNeo4jConnected()) {
    logger.info('Neo4j live instance not connected. In-memory graph engine ready.');
    return false;
  }

  try {
    logger.info('Syncing synthetic colleges, faculty hashes, and cartel edges to Neo4j...');

    // Clear previous graph
    await runCypher('MATCH (n) DETACH DELETE n');

    // Create College Nodes
    for (const c of graphData.colleges) {
      await runCypher(
        `MERGE (c:College { id: $id })
         SET c.name = $name,
             c.state = $state,
             c.city = $city,
             c.riskScore = $riskScore,
             c.riskLevel = $riskLevel,
             c.isCartelMember = $isCartelMember,
             c.cartelId = $cartelId`,
        c
      );
    }

    // Create Faculty Nodes
    for (const f of graphData.facultyHashes) {
      await runCypher(
        `MERGE (f:FacultyHash { hash: $hash })
         SET f.id = $id,
             f.name = $name,
             f.identifierType = $identifierType,
             f.department = $department,
             f.isGhost = $isGhost`,
        f
      );
    }

    // Create EMPLOYS and SHARES_FACULTY Relationships
    for (const r of graphData.relationships) {
      if (r.relationshipType === 'EMPLOYS') {
        await runCypher(
          `MATCH (c:College { id: $source }), (f:FacultyHash { id: $target })
           MERGE (c)-[:EMPLOYS]->(f)`,
          { source: r.source, target: r.target }
        );
      } else if (r.relationshipType === 'SHARES_FACULTY') {
        await runCypher(
          `MATCH (c1:College { id: $source }), (c2:College { id: $target })
           MERGE (c1)-[rel:SHARES_FACULTY { facultyHash: $facultyHash }]->(c2)
           SET rel.facultyName = $facultyName,
               rel.identifierType = $identifierType,
               rel.matchConfidence = $matchConfidence`,
          {
            source: r.source,
            target: r.target,
            facultyHash: r.facultyHash,
            facultyName: r.facultyName,
            identifierType: r.identifierType,
            matchConfidence: r.matchConfidence || 0.95
          }
        );
      }
    }

    logger.info('Neo4j graph synchronization complete.');
    return true;
  } catch (err) {
    logger.error(`Error during Neo4j sync: ${err.message}`);
    return false;
  }
}

module.exports = {
  generateSyntheticGraphData,
  syncToNeo4j
};
