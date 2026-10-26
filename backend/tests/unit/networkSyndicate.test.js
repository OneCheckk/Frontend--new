const { generateSyntheticGraphData } = require('../../src/seeders/syndicate.seeder');
const { analyzeGraph, getNodeDetails, CYPHER_QUERIES } = require('../../src/services/graph.service');

describe('Feature 1: Network Syndicate Graph & Cartel Detection Engine', () => {
  it('generates synthetic colleges and hashes with intentionally planted 5-college cartel', () => {
    const data = generateSyntheticGraphData();

    expect(data.colleges.length).toBeGreaterThanOrEqual(15);
    expect(data.facultyHashes.length).toBeGreaterThanOrEqual(20);

    const cartelMembers = data.colleges.filter((c) => c.isCartelMember);
    expect(cartelMembers.length).toBe(5);

    // Verify all 5 cartel colleges are present
    const expectedCartelIds = [
      'COL-CARTEL-01',
      'COL-CARTEL-02',
      'COL-CARTEL-03',
      'COL-CARTEL-04',
      'COL-CARTEL-05'
    ];
    expect(cartelMembers.map((c) => c.id)).toEqual(expectedCartelIds);

    // Verify ghost faculty hashes shared across cartel colleges
    const ghostHashes = data.facultyHashes.filter((f) => f.isGhost);
    expect(ghostHashes.length).toBe(10);
  });

  it('exposes accurate Cypher queries for multi-hop relationships and cycles', () => {
    expect(CYPHER_QUERIES.detectMultiHop).toContain('MATCH path = (start:College)-[:SHARES_FACULTY*2..4]->(target:College)');
    expect(CYPHER_QUERIES.detectCycles).toContain('MATCH cyclePath = (c:College)-[r:SHARES_FACULTY*3..6]->(c)');
    expect(CYPHER_QUERIES.aggregateSeverity).toContain('count(DISTINCT r.facultyHash) AS severityWeight');
    expect(CYPHER_QUERIES.detectCartelClique).toContain('size(syndicatePartners) >= 4');
  });

  it('detects 5-college cartel ring and calculates shared resource severity thickness', async () => {
    const analysis = await analyzeGraph();

    expect(analysis.success).toBe(true);
    expect(analysis.cartel).toBeDefined();
    expect(analysis.cartel.size).toBe(5);
    expect(analysis.cartel.riskLevel).toBe('CRITICAL');

    // Verify elements for Cytoscape.js: Blue college nodes, Red faculty nodes
    const collegeNodes = analysis.graph.elements.filter((el) => el.data.nodeType === 'college');
    const facultyNodes = analysis.graph.elements.filter((el) => el.data.nodeType === 'faculty');
    const severityEdges = analysis.graph.elements.filter((el) => el.data.edgeType === 'shared_severity');

    expect(collegeNodes.length).toBeGreaterThanOrEqual(15);
    expect(facultyNodes.length).toBeGreaterThanOrEqual(20);

    // Colleges must have blue colors
    expect(collegeNodes[0].data.color).toMatch(/#(2563eb|3b82f6)/);

    // Faculty hashes must have red colors
    expect(facultyNodes[0].data.color).toMatch(/#(ef4444|f87171)/);

    // Severity edges must have thickness proportional to count
    expect(severityEdges.length).toBeGreaterThan(0);
    const criticalEdge = severityEdges.find((e) => e.data.severityBand === 'CRITICAL' || e.data.severityCount >= 3);
    expect(criticalEdge).toBeDefined();
    expect(criticalEdge.data.width).toBeGreaterThanOrEqual(4);
  });

  it('retrieves definitive proof dossier for clicked college and faculty nodes', async () => {
    // Click cartel college
    const collegeProof = await getNodeDetails('COL-CARTEL-01');
    expect(collegeProof).toBeDefined();
    expect(collegeProof.type).toBe('college');
    expect(collegeProof.isCartelMember).toBe(true);
    expect(collegeProof.colludingInstitutions.length).toBe(4);
    expect(collegeProof.definitiveProof.statement).toContain('participates in a closed 5-node cartel syndicate');

    // Click ghost faculty
    const facultyProof = await getNodeDetails('FAC-1');
    expect(facultyProof).toBeDefined();
    expect(facultyProof.type).toBe('faculty');
    expect(facultyProof.isGhost).toBe(true);
    expect(facultyProof.associatedColleges.length).toBeGreaterThanOrEqual(2);
    expect(facultyProof.definitiveProof.collisionDetected).toBe(true);
  });
});
