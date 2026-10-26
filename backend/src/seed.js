const mongoose = require('mongoose');
const crypto = require('crypto');
const { connectDB, disconnectDB } = require('./config/database');
const {
  User,
  Institution,
  Application,
  Document,
  RiskScore,
  Alert,
  AuditLog,
  Claim,
  Finding,
  VerificationEntry,
  Rulepack,
  Checklist,
  Letter,
  AicteRecord,
  IssuerRegistry,
  AuditEvent,
  FacultyHash
} = require('./models');
const logger = require('./config/logger');
const { logEvent } = require('./services/audit.service');

const DEFAULT_RULEPACK_YAML = `rulepack_id: onecheck-demo
version: 2026.1-demo
params:
  area_tolerance_pct: 2
  ocr_conf_min: 0.80
  expiry_warn_days: 90
  fsr_max_students_per_faculty: 20
placeholder_params: [fsr_max_students_per_faculty]
rules:
  - id: AREA-CONSIST-001
    title: Laboratory area differs between application form and building plan
    clause_ref: HANDBOOK-REF-TBD
    placeholder: true
    severity: HIGH
    applies_to: [EOA_CONTINUATION, EOA_INTAKE_INCREASE, EOA_NEW_COURSE]
    reads: [lab_area_sqm_total]
    inputs:
      form: { predicate: lab_area_sqm_total, doc_types: [SELF_DISCLOSURE_FORM] }
      plan: { predicate: lab_area_sqm_total, doc_types: [BUILDING_PLAN] }
    check: { op: approx_equal, a: form, b: plan, tolerance_pct: $area_tolerance_pct }
    on_fail: MISMATCH_DETECTED
    message: 'Laboratory area is {form.value} sqm in the form but {plan.value} sqm in the plan (difference {delta_pct}%).'

  - id: INTAKE-CONT-002
    title: Requested intake differs from the previous approved intake
    clause_ref: HANDBOOK-REF-TBD
    placeholder: false
    severity: HIGH
    applies_to: [EOA_CONTINUATION]
    reads: [intake_requested, intake_prev_approved]
    inputs:
      intake: { predicate: intake_requested, doc_types: [SELF_DISCLOSURE_FORM] }
      prev: { predicate: intake_prev_approved, origin: RECORD }
    check: { op: equal, a: intake, b: prev }
    on_fail: MISMATCH_DETECTED
    message: 'Requested intake {intake.value} does not match previous approved intake {prev.value}.'

  - id: FSR-004
    title: Declared intake is not supported by the listed faculty
    clause_ref: HANDBOOK-REF-TBD
    placeholder: true
    severity: HIGH
    applies_to: [EOA_INTAKE_INCREASE]
    reads: [intake_requested, faculty_count_listed]
    inputs:
      intake: { predicate: intake_requested, doc_types: [SELF_DISCLOSURE_FORM] }
      faculty: { predicate: faculty_count_listed, doc_types: [FACULTY_LIST] }
    check: { op: expr, formula: 'intake / faculty <= $fsr_max_students_per_faculty' }
    on_fail: MISMATCH_DETECTED
    message: 'Requested intake {intake.value} over {faculty.value} listed faculty gives {computed} students per faculty; the configured maximum is {param.fsr_max_students_per_faculty}.'

  - id: TER-STATUS-006
    title: TER payment status mismatch between form and AICTE record
    clause_ref: HANDBOOK-REF-TBD
    placeholder: false
    severity: HIGH
    applies_to: [EOA_CONTINUATION, EOA_INTAKE_INCREASE, EOA_NEW_COURSE]
    reads: [ter_payment_status_claimed, ter_payment_status_record]
    inputs:
      claimed: { predicate: ter_payment_status_claimed, doc_types: [SELF_DISCLOSURE_FORM] }
      record: { predicate: ter_payment_status_record, origin: RECORD }
    check: { op: equal, a: claimed, b: record }
    on_fail: MISMATCH_DETECTED
    message: 'TER payment status is {claimed.value} in the form but {record.value} in the AICTE system.'
`;

async function seedDatabase(uri) {
  try {
    await connectDB(uri);
    logger.info('Starting comprehensive multi-persona database seeding...');

    // ---------------------------------------------------------
    // 1. Password Hashes (Supports role-specific password or universal Password123!)
    // ---------------------------------------------------------
    const commonHash = await User.hashPassword('Password123!');
    const adminPassword = await User.hashPassword('Admin@123456');
    const officerPassword = await User.hashPassword('Officer@123456');
    const directorPassword = await User.hashPassword('Director@123456');
    const auditorPassword = await User.hashPassword('Auditor@123456');
    const institutionPassword = await User.hashPassword('Institution@123456');

    // ---------------------------------------------------------
    // 2. Ensure Admin User exists for createdBy references
    // ---------------------------------------------------------
    let adminUser = await User.findOne({ email: 'admin@onecheck.gov.in' });
    if (!adminUser) {
      adminUser = await User.create({
        name: 'National System Administrator',
        email: 'admin@onecheck.gov.in',
        passwordHash: adminPassword,
        role: 'ADMIN',
        isActive: true,
      });
      logger.info('Created Initial Admin User for record authorship');
    }

    // ---------------------------------------------------------
    // 3. Institutions across India
    // ---------------------------------------------------------
    const institutionDefs = [
      {
        regId: 'AICTE-DEL-2026-01',
        name: 'Apex Institute of Technology (Synthetic)',
        aicteId: 'AICTE-DEL-2026-01',
        address: 'Sector 62, Institutional Area, Noida',
        state: 'Uttar Pradesh',
        region: 'NORTH',
        lat: 28.628,
        lng: 77.3649,
      },
      {
        regId: 'AICTE-MAH-2026-02',
        name: 'Bharti Institute of Science & Research (Synthetic)',
        aicteId: 'AICTE-MAH-2026-02',
        address: 'Shivaji Nagar, Pune',
        state: 'Maharashtra',
        region: 'WEST',
        lat: 18.5204,
        lng: 73.8567,
      },
      {
        regId: 'AICTE-KAR-2026-03',
        name: 'Chanakya Engineering College (Synthetic)',
        aicteId: 'AICTE-KAR-2026-03',
        address: 'Whitefield Industrial Zone, Bengaluru',
        state: 'Karnataka',
        region: 'SOUTH',
        lat: 12.9716,
        lng: 77.5946,
      },
      {
        regId: 'AICTE-TN-2026-04',
        name: 'St. Xavier Institute of Management & Technology',
        aicteId: 'AICTE-TN-2026-04',
        address: 'OMR IT Expressway, Chennai',
        state: 'Tamil Nadu',
        region: 'SOUTH',
        lat: 13.0827,
        lng: 80.2707,
      },
      {
        regId: 'AICTE-GUJ-2026-05',
        name: 'Sardar Patel College of Pharmacy',
        aicteId: 'AICTE-GUJ-2026-05',
        address: 'Navrangpura, Ahmedabad',
        state: 'Gujarat',
        region: 'WEST',
        lat: 23.0225,
        lng: 72.5714,
      },
      {
        regId: 'AICTE-ODI-2026-06',
        name: 'Kalinga Institute of Architecture & Planning',
        aicteId: 'AICTE-ODI-2026-06',
        address: 'Patia Institutional Area, Bhubaneswar',
        state: 'Odisha',
        region: 'EAST',
        lat: 20.2961,
        lng: 85.8245,
      },
    ];

    const instMap = {};
    for (const d of institutionDefs) {
      let inst = await Institution.findOne({ registrationId: d.regId });
      if (!inst) {
        inst = await Institution.create({
          name: d.name,
          registrationId: d.regId,
          aicteId: d.aicteId,
          address: d.address,
          state: d.state,
          region: d.region,
          latitude: d.lat,
          longitude: d.lng,
          site: { lat: d.lat, lng: d.lng, radiusM: 500 },
          verificationStatus: 'VERIFIED',
          createdBy: adminUser._id,
        });
        logger.info(`Created Institution: ${d.name}`);
      } else {
        inst.aicteId = d.aicteId;
        await inst.save();
      }
      instMap[d.regId] = inst;
    }

    // ---------------------------------------------------------
    // 3. Platform Users for Every Role
    // ---------------------------------------------------------
    const userDefs = [
      // Administrators
      {
        email: 'admin@onecheck.gov.in',
        name: 'National System Administrator',
        role: 'ADMIN',
        hash: adminPassword,
      },
      {
        email: 'admin@aicte.gov.in',
        name: 'AICTE Central Portal Admin',
        role: 'ADMIN',
        hash: adminPassword,
      },
      // Scrutiny Officers
      {
        email: 'officer@onecheck.gov.in',
        name: 'Shri V. S. Rao (Senior Scrutiny Officer)',
        role: 'OFFICER',
        hash: officerPassword,
      },
      {
        email: 'officer.meenakshi@onecheck.gov.in',
        name: 'Smt. Meenakshi Sundaram (Verification Officer)',
        role: 'OFFICER',
        hash: officerPassword,
      },
      {
        email: 'officer.arvind@onecheck.gov.in',
        name: 'Dr. Arvind Kumar (Technical Scrutiny Officer)',
        role: 'OFFICER',
        hash: officerPassword,
      },
      // Regional Directors
      {
        email: 'director.regional@onecheck.gov.in',
        name: 'Dr. Sunita Deshmukh (Northern Regional Director)',
        role: 'REGIONAL_DIRECTOR',
        hash: directorPassword,
      },
      {
        email: 'director.south@onecheck.gov.in',
        name: 'Dr. K. Radhakrishnan (Southern Regional Director)',
        role: 'REGIONAL_DIRECTOR',
        hash: directorPassword,
      },
      // Auditors
      {
        email: 'auditor@onecheck.gov.in',
        name: 'Shri K. Ramanathan (CAG Senior Auditor)',
        role: 'AUDITOR',
        hash: auditorPassword,
      },
      {
        email: 'auditor.neha@onecheck.gov.in',
        name: 'Ms. Neha Gupta (Compliance Assurance Auditor)',
        role: 'AUDITOR',
        hash: auditorPassword,
      },
      // Institution Users
      {
        email: 'director@apex-tech.edu.in',
        name: 'Dr. Ramesh Sharma (Director, Apex Institute)',
        role: 'INSTITUTION_USER',
        hash: institutionPassword,
        instKey: 'AICTE-DEL-2026-01',
      },
      {
        email: 'institution@apex-tech.edu.in',
        name: 'Apex Institute Compliance Cell',
        role: 'INSTITUTION_USER',
        hash: institutionPassword,
        instKey: 'AICTE-DEL-2026-01',
      },
      {
        email: 'director@bharti-sci.edu.in',
        name: 'Dr. Anand Patil (Principal, Bharti Institute)',
        role: 'INSTITUTION_USER',
        hash: institutionPassword,
        instKey: 'AICTE-MAH-2026-02',
      },
      {
        email: 'admin@chanakya.ac.in',
        name: 'Prof. S. R. Venkatesh (Registrar, Chanakya College)',
        role: 'INSTITUTION_USER',
        hash: institutionPassword,
        instKey: 'AICTE-KAR-2026-03',
      },
      {
        email: 'director@xavier-mgmt.edu.in',
        name: 'Fr. Thomas Matthew (Dean, St. Xavier Management)',
        role: 'INSTITUTION_USER',
        hash: institutionPassword,
        instKey: 'AICTE-TN-2026-04',
      },
      {
        email: 'principal@sp-pharmacy.edu.in',
        name: 'Dr. Nita Patel (Principal, Sardar Patel Pharmacy)',
        role: 'INSTITUTION_USER',
        hash: institutionPassword,
        instKey: 'AICTE-GUJ-2026-05',
      },
      {
        email: 'dean@kalinga-arch.edu.in',
        name: 'Ar. B. K. Mohapatra (Dean, Kalinga Architecture)',
        role: 'INSTITUTION_USER',
        hash: institutionPassword,
        instKey: 'AICTE-ODI-2026-06',
      },
    ];

    const userMap = {};
    for (const u of userDefs) {
      let user = await User.findOne({ email: u.email });
      const instRef = u.instKey ? instMap[u.instKey]._id : null;
      if (!user) {
        user = await User.create({
          name: u.name,
          email: u.email,
          passwordHash: u.hash,
          role: u.role,
          institution: instRef,
          institutionId: instRef,
          isActive: true,
        });
        logger.info(`Created User: ${u.email} (${u.role})`);
      } else {
        user.passwordHash = u.hash;
        if (instRef) {
          user.institution = instRef;
          user.institutionId = instRef;
        }
        await user.save();
      }
      userMap[u.email] = user;
    }

    // ---------------------------------------------------------
    // 4. Rulepack & Checklists
    // ---------------------------------------------------------
    let rulepack = await Rulepack.findOne({ version: '2026.1-demo' });
    if (!rulepack) {
      const sha256 = crypto.createHash('sha256').update(DEFAULT_RULEPACK_YAML).digest('hex');
      rulepack = await Rulepack.create({
        version: '2026.1-demo',
        yamlText: DEFAULT_RULEPACK_YAML,
        sha256,
        active: true,
        createdBy: userMap['admin@onecheck.gov.in']._id,
        notes: 'Comprehensive demo rulepack matching national AICTE handbook rules',
      });
      logger.info('Created Rulepack 2026.1-demo');
    }

    const commonChecklistItems = [
      { id: 'CHK-01', label: 'Self-Disclosure Application Form', docTypes: ['SELF_DISCLOSURE_FORM'], required: true, clauseRef: 'AICTE-APH-CH2-01', placeholder: false },
      { id: 'CHK-02', label: 'Fire Safety NOC', docTypes: ['FIRE_NOC'], required: true, clauseRef: 'AICTE-APH-CH2-04', placeholder: false },
      { id: 'CHK-03', label: 'Approved Building Plan & Area Statement', docTypes: ['BUILDING_PLAN'], required: true, clauseRef: 'AICTE-APH-CH2-05', placeholder: false },
      { id: 'CHK-04', label: 'Complete Faculty List with Cadre Ratios', docTypes: ['FACULTY_LIST'], required: true, clauseRef: 'AICTE-APH-CH2-07', placeholder: false },
      { id: 'CHK-05', label: 'TER Regulatory Processing Fee Receipt', docTypes: ['TER_PAYMENT_RECEIPT'], required: true, clauseRef: 'AICTE-APH-CH2-09', placeholder: false }
    ];

    const categories = ['EOA_CONTINUATION', 'EOA_INTAKE_INCREASE', 'EOA_NEW_COURSE', 'NEW_INSTITUTION', 'EXTENSION_OF_APPROVAL'];
    for (const cat of categories) {
      let chk = await Checklist.findOne({ category: cat, version: '2026.1' });
      const items = [...commonChecklistItems];
      if (cat === 'EOA_INTAKE_INCREASE' || cat === 'EOA_NEW_COURSE') {
        items.push({
          id: 'CHK-06',
          label: 'NBA / NAAC Accreditation Certificate',
          docTypes: ['ACCREDITATION_CERT'],
          required: true,
          clauseRef: 'AICTE-APH-CH2-12',
          placeholder: false
        });
      }
      if (!chk) {
        await Checklist.create({
          category: cat,
          version: '2026.1',
          active: true,
          items,
        });
      } else {
        chk.items = items;
        await chk.save();
      }
    }

    // ---------------------------------------------------------
    // 5. Issuer Registry Mock (NOC Lookup)
    // ---------------------------------------------------------
    const registryEntries = [
      {
        docType: 'FIRE_NOC',
        referenceNo: 'NOC-UP-2024-9988',
        behavior: 'MATCH',
        data: { certificateNo: 'NOC-UP-2024-9988', issueDate: '2024-01-15', validUntil: '2027-01-14', authority: 'Chief Fire Officer Noida' },
      },
      {
        docType: 'FIRE_NOC',
        referenceNo: 'NOC-MAH-2024-1122',
        behavior: 'MISMATCH',
        data: { certificateNo: 'NOC-MAH-2024-1122', issueDate: '2023-01-15', validUntil: '2025-01-14', authority: 'Pune Municipal Fire Service' },
      },
      {
        docType: 'FIRE_NOC',
        referenceNo: 'NOC-KAR-2024-7744',
        behavior: 'MATCH',
        data: { certificateNo: 'NOC-KAR-2024-7744', issueDate: '2024-06-01', validUntil: '2027-05-31', authority: 'Karnataka State Fire and Emergency Services' },
      },
      {
        docType: 'FIRE_NOC',
        referenceNo: 'NOC-TN-2024-5533',
        behavior: 'TIMEOUT',
        data: {},
      },
    ];

    for (const entry of registryEntries) {
      let reg = await IssuerRegistry.findOne({ docType: entry.docType, referenceNo: entry.referenceNo });
      if (!reg) {
        await IssuerRegistry.create(entry);
      }
    }

    // 5b. Seed AICTE Records (Ground Truth)
    let aicteRec1 = await AicteRecord.findOne({ institutionId: 'AICTE-DEL-2026-01' });
    if (!aicteRec1) {
      await AicteRecord.create({
        institutionId: 'AICTE-DEL-2026-01',
        sourceLabel: 'DEMO ADAPTER - simulated AICTE record',
        bundle: {
          institutionId: 'AICTE-DEL-2026-01',
          institutionName: 'Apex Institute of Technology (Synthetic)',
          prevEoa: {
            academicYear: '2025-2026',
            courses: [
              { name: 'Computer Science and Engineering', level: 'UG', approvedIntake: 120 }
            ]
          },
          ter: {
            status: 'PENDING'
          },
          deficiencies: [
            { id: 'DEF-01', text: 'Cadre ratio shortfall in Department of Mechanical Engineering', status: 'OPEN' }
          ],
          faculty: [
            { key: 'dr-ramesh-sharma', name: 'Dr. Ramesh Sharma', designation: 'Professor & Director', idHmac: 'hmac_sharma_98765' }
          ],
          site: { lat: 28.628, lng: 77.3649, radiusM: 500 },
          history: [
            { year: '2025-2026', type: 'EOA_CONTINUATION', outcome: 'APPROVED' }
          ]
        }
      });
      logger.info('Created seed AicteRecord for Apex Institute');
    }

    // ---------------------------------------------------------
    // 6. Comprehensive Applications (Full suite in dev/demo, focused fixture in test)
    // ---------------------------------------------------------
    const officer1 = userMap['officer@onecheck.gov.in'];
    const officer2 = userMap['officer.meenakshi@onecheck.gov.in'];
    const officer3 = userMap['officer.arvind@onecheck.gov.in'];

    const applicationDefs = [
      {
        appNo: 'APP-2026-000101',
        instKey: 'AICTE-DEL-2026-01',
        category: 'EOA_INTAKE_INCREASE',
        academicYear: '2026-2027',
        status: 'SUBMITTED',
        band: 'RED',
        riskScore: 82,
        riskLevel: 'RED',
        maxSeverity: 'HIGH',
        openFindings: 3,
        needsConfirmation: 1,
        pendingSources: 1,
        officer: officer1,
        submittedAt: new Date(Date.now() - 3 * 86400000),
      },
      {
        appNo: 'APP-2026-000102',
        instKey: 'AICTE-DEL-2026-01',
        category: 'EOA_CONTINUATION',
        academicYear: '2026-2027',
        status: 'APPROVED',
        band: 'GREEN',
        riskScore: 14,
        riskLevel: 'GREEN',
        maxSeverity: 'INFO',
        openFindings: 0,
        needsConfirmation: 0,
        pendingSources: 0,
        officer: officer1,
        decision: { outcome: 'APPROVE', reason: 'Full infrastructure and faculty cadre norms satisfied', at: new Date() },
        submittedAt: new Date(Date.now() - 15 * 86400000),
      },
      {
        appNo: 'APP-2026-000201',
        instKey: 'AICTE-MAH-2026-02',
        category: 'EOA_NEW_COURSE',
        academicYear: '2026-2027',
        status: 'UNDER_SCRUTINY',
        band: 'YELLOW',
        riskScore: 48,
        riskLevel: 'YELLOW',
        maxSeverity: 'MEDIUM',
        openFindings: 2,
        needsConfirmation: 1,
        pendingSources: 1,
        officer: officer2,
        submittedAt: new Date(Date.now() - 5 * 86400000),
      },
      {
        appNo: 'APP-2026-000202',
        instKey: 'AICTE-MAH-2026-02',
        category: 'EOA_CONTINUATION',
        academicYear: '2026-2027',
        status: 'DRAFT',
        band: null,
        riskScore: null,
        riskLevel: null,
        maxSeverity: null,
        openFindings: 0,
        needsConfirmation: 0,
        pendingSources: 0,
        officer: null,
        submittedAt: null,
      },
      {
        appNo: 'APP-2026-000301',
        instKey: 'AICTE-KAR-2026-03',
        category: 'EOA_INTAKE_INCREASE',
        academicYear: '2026-2027',
        status: 'DEFICIENCY_RAISED',
        band: 'RED',
        riskScore: 78,
        riskLevel: 'RED',
        maxSeverity: 'CRITICAL',
        openFindings: 4,
        needsConfirmation: 0,
        pendingSources: 0,
        officer: officer1,
        submittedAt: new Date(Date.now() - 8 * 86400000),
      },
      {
        appNo: 'APP-2026-000302',
        instKey: 'AICTE-KAR-2026-03',
        category: 'EXTENSION_OF_APPROVAL',
        academicYear: '2026-2027',
        status: 'VERIFIED',
        band: 'GREEN',
        riskScore: 22,
        riskLevel: 'GREEN',
        maxSeverity: 'LOW',
        openFindings: 1,
        needsConfirmation: 0,
        pendingSources: 0,
        officer: officer3,
        submittedAt: new Date(Date.now() - 10 * 86400000),
      },
      {
        appNo: 'APP-2026-000401',
        instKey: 'AICTE-TN-2026-04',
        category: 'NEW_INSTITUTION',
        academicYear: '2026-2027',
        status: 'CLARIFICATION_REQUESTED',
        band: 'YELLOW',
        riskScore: 55,
        riskLevel: 'YELLOW',
        maxSeverity: 'MEDIUM',
        openFindings: 2,
        needsConfirmation: 1,
        pendingSources: 1,
        officer: officer2,
        submittedAt: new Date(Date.now() - 6 * 86400000),
      },
      {
        appNo: 'APP-2026-000402',
        instKey: 'AICTE-TN-2026-04',
        category: 'EOA_CONTINUATION',
        academicYear: '2026-2027',
        status: 'REJECTED',
        band: 'RED',
        riskScore: 95,
        riskLevel: 'RED',
        maxSeverity: 'CRITICAL',
        openFindings: 5,
        needsConfirmation: 0,
        pendingSources: 0,
        officer: officer1,
        decision: { outcome: 'REJECT', reason: 'Unverified fire safety and duplicate faculty submission', at: new Date() },
        submittedAt: new Date(Date.now() - 20 * 86400000),
      },
      {
        appNo: 'APP-2026-000501',
        instKey: 'AICTE-GUJ-2026-05',
        category: 'EOA_CONTINUATION',
        academicYear: '2026-2027',
        status: 'READY_FOR_REVIEW',
        band: 'GREEN',
        riskScore: 16,
        riskLevel: 'GREEN',
        maxSeverity: 'INFO',
        openFindings: 0,
        needsConfirmation: 0,
        pendingSources: 0,
        officer: officer3,
        submittedAt: new Date(Date.now() - 2 * 86400000),
      },
      {
        appNo: 'APP-2026-000601',
        instKey: 'AICTE-ODI-2026-06',
        category: 'EOA_NEW_COURSE',
        academicYear: '2026-2027',
        status: 'PROCESSING',
        band: 'YELLOW',
        riskScore: 42,
        riskLevel: 'YELLOW',
        maxSeverity: 'MEDIUM',
        openFindings: 1,
        needsConfirmation: 1,
        pendingSources: 1,
        officer: officer2,
        submittedAt: new Date(Date.now() - 1 * 86400000),
      },
    ];

    const isTest = process.env.NODE_ENV === 'test';
    const activeAppDefs = isTest ? [applicationDefs[0]] : applicationDefs;

    const appMap = {};
    for (const a of activeAppDefs) {
      let app = await Application.findOne({ applicationNumber: a.appNo });
      const inst = instMap[a.instKey];
      if (!app) {
        app = await Application.create({
          applicationNumber: a.appNo,
          appNo: a.appNo,
          institution: inst._id,
          institutionId: inst._id,
          category: a.category,
          academicYear: a.academicYear,
          status: a.status,
          synthetic: true,
          submittedAt: a.submittedAt,
          decisionDate: a.decision?.at || null,
          approvalPeriod: { start: '2026-07-01', end: '2027-06-30' },
          checklistVersion: '2026.1',
          rulepackVersion: '2026.1-demo',
          assignedOfficer: a.officer ? a.officer._id : null,
          assignedOfficerId: a.officer ? a.officer._id : null,
          summary: {
            band: a.band,
            maxSeverity: a.maxSeverity,
            openFindings: a.openFindings,
            needsConfirmation: a.needsConfirmation,
            pendingSources: a.pendingSources,
            sortKey: `${String(a.openFindings).padStart(2, '0')}-${String(a.riskScore || 0).padStart(2, '0')}-20260630`,
          },
          riskScore: a.riskScore,
          riskLevel: a.riskLevel,
          decision: a.decision || null,
        });
        logger.info(`Created Application: ${a.appNo} (${a.category} - ${a.status})`);
      } else {
        app.status = a.status;
        app.summary.band = a.band;
        app.summary.maxSeverity = a.maxSeverity;
        app.summary.openFindings = a.openFindings;
        app.riskScore = a.riskScore;
        app.riskLevel = a.riskLevel;
        if (a.decision) app.decision = a.decision;
        if (a.officer) {
          app.assignedOfficer = a.officer._id;
          app.assignedOfficerId = a.officer._id;
        }
        await app.save();
      }
      appMap[a.appNo] = app;
    }

    if (!isTest) {
      // ---------------------------------------------------------
      // 7. Seed Documents for Applications
      // ---------------------------------------------------------
    const docTemplates = [
      { docType: 'SELF_DISCLOSURE_FORM', originalName: 'AICTE_Self_Disclosure_Signed.pdf', mimeType: 'application/pdf', size: 1048576 },
      { docType: 'FIRE_NOC', originalName: 'Fire_Safety_NOC_Certificate.pdf', mimeType: 'application/pdf', size: 524288 },
      { docType: 'BUILDING_PLAN', originalName: 'Sanctioned_Building_Plan_Architect.pdf', mimeType: 'application/pdf', size: 2097152 },
      { docType: 'FACULTY_LIST', originalName: 'Faculty_Cadre_List_Roster.pdf', mimeType: 'application/pdf', size: 655360 },
      { docType: 'TER_PAYMENT_RECEIPT', originalName: 'TER_Processing_Fee_Challan.pdf', mimeType: 'application/pdf', size: 327680 },
      { docType: 'LAND_TITLE_DEED', originalName: 'Registered_Land_Title_Deed.pdf', mimeType: 'application/pdf', size: 1572864 },
    ];

    const docMap = {};
    for (const [appNo, app] of Object.entries(appMap)) {
      if (app.status === 'DRAFT') continue;
      for (const t of docTemplates) {
        const key = `${appNo}-${t.docType}`;
        let doc = await Document.findOne({ storageKey: key });
        if (!doc) {
          doc = await Document.create({
            application: app._id,
            applicationId: app._id,
            documentType: t.docType,
            docType: t.docType,
            typeConfidence: 0.98,
            originalName: t.originalName,
            storageKey: key,
            storagePath: `/mock-docs/D1.pdf`,
            fileSize: t.size,
            sizeBytes: t.size,
            mimeType: t.mimeType,
            mime: t.mimeType,
            pageCount: 4,
            uploadStatus: 'STORED',
            verificationStatus: app.status === 'APPROVED' ? 'VERIFIED' : 'PENDING',
            uploadedBy: adminUser._id,
            sha256FileHash: crypto.createHash('sha256').update(key).digest('hex'),
            sha256: crypto.createHash('sha256').update(key).digest('hex'),
          });
        }
        docMap[key] = doc;
      }
    }
    logger.info('Created Documents across applications');

    // ---------------------------------------------------------
    // 8. Seed Claims & Findings
    // ---------------------------------------------------------
    const primaryApp = appMap['APP-2026-000101'];
    if (primaryApp) {
      // Claims
      const claimsData = [
        {
          claimId: 'CLM-000101-01',
          applicationId: primaryApp._id,
          subject: 'institution',
          predicate: 'lab_area_sqm_total',
          value: 850,
          unit: 'sqm',
          confidence: 0.95,
          origin: 'DOCUMENT',
          source: { docId: 'D3', page: 2, bbox: [0.1, 0.2, 0.45, 0.35], snippet: 'Total instructional computer laboratory carpet area: 850.00 sq.m', docType: 'SELF_DISCLOSURE_FORM' },
          method: 'OCR',
        },
        {
          claimId: 'CLM-000101-02',
          applicationId: primaryApp._id,
          subject: 'institution',
          predicate: 'intake_requested',
          value: 180,
          unit: 'seats',
          confidence: 0.98,
          origin: 'DOCUMENT',
          source: { docId: 'D1', page: 1, bbox: [0.15, 0.4, 0.5, 0.48], snippet: 'Proposed UG intake for CSE: 180 seats (Increase from 120)', docType: 'SELF_DISCLOSURE_FORM' },
          method: 'TEXT_LAYER',
        },
        {
          claimId: 'CLM-000101-03',
          applicationId: primaryApp._id,
          subject: 'institution',
          predicate: 'faculty_count_listed',
          value: 12,
          unit: 'faculty',
          confidence: 0.94,
          origin: 'DOCUMENT',
          source: { docId: 'D2', page: 1, bbox: [0.05, 0.1, 0.9, 0.85], snippet: 'Total available approved cadre faculty: 12 members', docType: 'FACULTY_LIST' },
          method: 'TEXT_LAYER',
        },
        {
          claimId: 'CLM-000101-04',
          applicationId: primaryApp._id,
          subject: 'institution',
          predicate: 'ter_payment_status_claimed',
          value: 'PAID',
          confidence: 0.99,
          origin: 'DOCUMENT',
          source: { docId: 'D1', page: 3, bbox: [0.1, 0.7, 0.6, 0.78], snippet: 'TER Processing Fee of Rs 2,50,000 paid via NEFT Ref 88392019', docType: 'SELF_DISCLOSURE_FORM' },
          method: 'TEXT_LAYER',
        },
      ];

      for (const c of claimsData) {
        let clm = await Claim.findOne({ claimId: c.claimId });
        if (!clm) {
          await Claim.create(c);
        }
      }

      // Findings
      const findingsData = [
        {
          findingId: 'FND-000101-01',
          applicationId: primaryApp._id,
          ruleId: 'AREA-CONSIST-001',
          ruleVersion: '1',
          rulepackVersion: '2026.1-demo',
          clauseRef: 'AICTE-APH-CH2-05',
          placeholder: false,
          status: 'MISMATCH_DETECTED',
          severity: 'HIGH',
          state: 'OPEN',
          title: 'Laboratory Carpet Area Discrepancy',
          message: 'Laboratory area is 850 sqm in the self-disclosure form but 720 sqm in the architect-sanctioned building plan (difference 15.3%).',
          claimIds: ['CLM-000101-01'],
          proof: {
            statement: 'Computed variance exceeds configured regulatory threshold of 2.0%.',
            evidence: [
              {
                label: 'Self-Disclosure Carpet Area',
                value: 850,
                unit: 'sqm',
                confidence: 0.96,
                source: { docId: 'D3', page: 2, bbox: [0.1, 0.2, 0.45, 0.35], snippet: 'Total instructional computer laboratory carpet area: 850.00 sq.m', docType: 'SELF_DISCLOSURE_FORM' },
              },
              {
                label: 'Building Plan Carpet Area',
                value: 720,
                unit: 'sqm',
                confidence: 0.99,
                source: { docId: 'D2', page: 4, bbox: [0.3, 0.5, 0.7, 0.65], snippet: 'Total Lab Area Approved = 720.00 SQM', docType: 'BUILDING_PLAN' },
              },
            ],
            computation: { formula: '|form - plan| / plan * 100', inputs: { form: 850, plan: 720 }, result: '15.3%' },
          },
        },
        {
          findingId: 'FND-000101-02',
          applicationId: primaryApp._id,
          ruleId: 'FSR-004',
          ruleVersion: '1',
          rulepackVersion: '2026.1-demo',
          clauseRef: 'AICTE-APH-CH2-07',
          placeholder: false,
          status: 'MISMATCH_DETECTED',
          severity: 'HIGH',
          state: 'OPEN',
          title: 'Faculty Student Ratio (FSR) Shortfall for Proposed Intake',
          message: 'Requested intake 180 seats over 12 listed faculty gives 25:1 student-to-faculty ratio; maximum allowed is 20:1 under AICTE Chapter II.',
          claimIds: ['CLM-000101-02', 'CLM-000101-03'],
          proof: {
            statement: 'Shortfall of at least 3 approved Assistant Professors in the Department of Computer Science.',
            evidence: [],
            computation: { formula: 'intake / faculty <= 20', inputs: { intake: 180, faculty: 12 }, result: '25.0' },
          },
        },
        {
          findingId: 'FND-000101-03',
          applicationId: primaryApp._id,
          ruleId: 'TER-STATUS-006',
          ruleVersion: '1',
          rulepackVersion: '2026.1-demo',
          clauseRef: 'AICTE-APH-CH2-09',
          placeholder: false,
          status: 'MISMATCH_DETECTED',
          severity: 'HIGH',
          state: 'OPEN',
          title: 'TER Processing Fee Unconfirmed in Central AICTE Ledger',
          message: 'Self-disclosure claims fee PAID, but National Portal Bank Reconciliation record reflects PENDING status.',
          claimIds: ['CLM-000101-04'],
          proof: {
            statement: 'Bank transaction reference UTR-88392019 awaiting final clearance from SBI e-Pay gateway.',
            evidence: [],
          },
        },
      ];

      for (const f of findingsData) {
        let fnd = await Finding.findOne({ findingId: f.findingId });
        if (!fnd) {
          await Finding.create(f);
        }
      }

      // Risk score breakdown
      let rs = await RiskScore.findOne({ application: primaryApp._id });
      if (!rs) {
        await RiskScore.create({
          application: primaryApp._id,
          runId: 'RUN-2026-000101-A',
          totalScore: 82,
          riskLevel: 'RED',
          pillarScores: {
            documentCompleteness: 85,
            anomalyFlags: 30,
            sourceVerification: 40,
            historicalCompliance: 90,
          },
          deductions: [
            { ruleId: 'AREA-CONSIST-001', pillar: 'Physical Infrastructure', points: 30, explanation: '15.3% built-up lab shortfall' },
            { ruleId: 'FSR-004', pillar: 'Faculty Adequacy', points: 25, explanation: 'FSR 25:1 violates 20:1 ceiling' },
            { ruleId: 'TER-STATUS-006', pillar: 'Financial Regulatory', points: 15, explanation: 'TER fee unconfirmed in central portal' },
          ],
        });
      }
    }

    // ---------------------------------------------------------
    // 8b. Seed Faculty Hashes for Duplication Collision Detection
    // ---------------------------------------------------------
    const { generateIdentifierHmac } = require('./utils/hmac');
    const app1 = appMap['APP-2026-000101'];
    const app3 = appMap['APP-2026-000301'];
    if (app1 && app3) {
      const { hmac: hmacSharma } = generateIdentifierHmac('112233445566');
      const { hmac: hmacVerma } = generateIdentifierHmac('987654321098');

      const facultySeeds = [
        {
          application: app1._id,
          institution: app1.institution,
          nameNormalized: 'dr. ramesh sharma',
          identifierType: 'AADHAAR',
          identifierHmac: hmacSharma,
          keyVersion: 'v1',
          isGhostFlagged: false
        },
        {
          application: app1._id,
          institution: app1.institution,
          nameNormalized: 'dr. k. s. verma',
          identifierType: 'AADHAAR',
          identifierHmac: hmacVerma,
          keyVersion: 'v1',
          isGhostFlagged: false
        },
        {
          application: app3._id,
          institution: app3.institution,
          nameNormalized: 'dr. k. s. verma',
          identifierType: 'AADHAAR',
          identifierHmac: hmacVerma,
          keyVersion: 'v1',
          isGhostFlagged: true,
          matchInstitution: app1.institution,
          matchApplication: app1._id,
          matchConfidence: 1.0
        }
      ];

      for (const fs of facultySeeds) {
        const existing = await FacultyHash.findOne({
          application: fs.application,
          identifierHmac: fs.identifierHmac
        });
        if (!existing) {
          await FacultyHash.create(fs);
        }
      }
      logger.info('Seeded FacultyHash records with cross-institution collision');
    }

    // ---------------------------------------------------------
    // 9. Alerts Queue Across Multiple Severities & Roles
    // ---------------------------------------------------------
    const alertDefs = [
      {
        appNo: 'APP-2026-000101',
        type: 'INFRASTRUCTURE_MISMATCH',
        severity: 'HIGH',
        title: 'Laboratory Area Shortfall Detected',
        message: 'Discrepancy of 130 sq.m identified in Apex Institute of Technology CSE Lab building plan.',
        status: 'OPEN',
      },
      {
        appNo: 'APP-2026-000101',
        type: 'FEE_RECONCILIATION',
        severity: 'HIGH',
        title: 'TER Processing Fee Unreconciled',
        message: 'Payment verification failed for application APP-2026-000101 against AICTE central bank ledger.',
        status: 'OPEN',
      },
      {
        appNo: 'APP-2026-000301',
        type: 'FACULTY_DUPLICATION',
        severity: 'CRITICAL',
        title: 'Duplicate Faculty PAN/Aadhaar Hash Found',
        message: 'Dr. K. S. Verma appears simultaneously listed in Chanakya Engineering College and Apex Institute roster.',
        status: 'OPEN',
      },
      {
        appNo: 'APP-2026-000201',
        type: 'FIRE_SAFETY_EXPIRY',
        severity: 'MEDIUM',
        title: 'Fire Safety NOC Approaching Expiry',
        message: 'Bharti Institute Fire NOC expires within 60 days (valid until 2026-11-30). Renewal certificate required.',
        status: 'OPEN',
      },
      {
        appNo: 'APP-2026-000401',
        type: 'GEO_COORDINATE_OFFSET',
        severity: 'LOW',
        title: 'Campus Perimeter Boundary Minor Offset',
        message: 'St. Xavier Institute survey coordinates show 4.2m offset from municipal Master Plan satellite baseline.',
        status: 'ACKNOWLEDGED',
      },
      {
        appNo: 'APP-2026-000501',
        type: 'COMPLIANCE_MILESTONE',
        severity: 'INFO',
        title: 'Annual Regulatory Self-Disclosure Filed',
        message: 'Sardar Patel College of Pharmacy successfully submitted clean annual EoA continuation disclosure.',
        status: 'RESOLVED',
      },
    ];

    for (const a of alertDefs) {
      const app = appMap[a.appNo];
      if (!app) continue;
      let alt = await Alert.findOne({ title: a.title, application: app._id });
      if (!alt) {
        await Alert.create({
          application: app._id,
          applicationId: app._id,
          type: a.type,
          severity: a.severity,
          title: a.title,
          message: a.message,
          status: a.status,
          audience: ['SCRUTINY_OFFICER', 'REGIONAL_DIRECTOR'],
        });
      }
    }
    logger.info('Created Alerts Queue');

    // ---------------------------------------------------------
    // 10. Deficiency Letters
    // ---------------------------------------------------------
    const letterApp = appMap['APP-2026-000301'];
    if (letterApp) {
      let letter = await Letter.findOne({ applicationId: letterApp._id });
      if (!letter) {
        await Letter.create({
          applicationId: letterApp._id,
          findingIds: ['FND-000301-01', 'FND-000301-02'],
          body: `ALL INDIA COUNCIL FOR TECHNICAL EDUCATION
Nelson Mandela Marg, Vasant Kunj, New Delhi-110070

DEFICIENCY COMMUNICATED FOR ACADEMIC YEAR 2026-2027

To,
The Chairman / Secretary,
Chanakya Engineering College (Synthetic),
Whitefield Industrial Zone, Bengaluru, Karnataka.

Subject: Scrutiny of Application No. APP-2026-000301 under AICTE Approval Process Handbook.

Sir/Madam,
During the automated verification and scrutiny of your submitted application for Extension of Approval with Intake Increase, the following deficiencies were observed by the scrutiny cell:

1. Duplicate Faculty Detection: Faculty members submitted in your CSE roster were simultaneously registered in active rosters of another technical institute.
2. Land Conversion Order: The submitted Land Use Certificate does not contain the mandatory endorsement from the District Revenue Authority.

You are requested to rectify these deficiencies and submit your compliance through the OneCheck portal within fifteen (15) days of receipt of this notice, failing which your application shall be processed on merit based on existing records.

Yours faithfully,
Shri V. S. Rao
Senior Scrutiny Officer, AICTE`,
          status: 'SENT',
          createdBy: officer1._id,
          sentAt: new Date(Date.now() - 4 * 86400000),
        });
        logger.info('Created Sent Deficiency Letter for Chanakya Engineering');
      }
    }

    // ---------------------------------------------------------
    // 11. Source Verification Ledger (VerificationEntry)
    // ---------------------------------------------------------
    const verificationEntries = [
      {
        appNo: 'APP-2026-000101',
        checkType: 'ISSUER_LOOKUP',
        status: 'VERIFIED',
        source: { label: 'State Fire Service Online Registry', kind: 'LIVE' },
        requestSummary: 'Query NOC-UP-2024-9988 at CFO Noida Portal',
        responseSummary: 'Certificate Valid until 2027-01-14. Status: ACTIVE',
      },
      {
        appNo: 'APP-2026-000101',
        checkType: 'RECORD_MATCH',
        status: 'MISMATCH_DETECTED',
        source: { label: 'AICTE National Treasury ERP', kind: 'LIVE' },
        requestSummary: 'Reconciliation of UTR-88392019 for Rs 2,50,000',
        responseSummary: 'Payment status returned PENDING by central clearing house',
      },
      {
        appNo: 'APP-2026-000201',
        checkType: 'QR_DECODE',
        status: 'VERIFIED',
        source: { label: 'DigiLocker Regulatory Verification Gateway', kind: 'LIVE' },
        requestSummary: 'Cryptographic QR verification of NBA Tier-1 Accreditation',
        responseSummary: 'Digital signature verified with valid NIC Root CA',
      },
      {
        appNo: 'APP-2026-000301',
        checkType: 'SIGNATURE_CHECK',
        status: 'MISMATCH_DETECTED',
        source: { label: 'e-Mudhra DSC Verification API', kind: 'LIVE' },
        requestSummary: 'Verification of digital signature on Land Title Deed',
        responseSummary: 'Signing certificate expired on 2024-12-31',
      },
    ];

    for (const v of verificationEntries) {
      const app = appMap[v.appNo];
      if (!app) continue;
      let entry = await VerificationEntry.findOne({ applicationId: app._id, requestSummary: v.requestSummary });
      if (!entry) {
        await VerificationEntry.create({
          applicationId: app._id,
          checkType: v.checkType,
          status: v.status,
          source: v.source,
          requestedAt: new Date(Date.now() - 2 * 86400000),
          respondedAt: new Date(Date.now() - 2 * 86400000 + 3600000),
          requestSummary: v.requestSummary,
          responseSummary: v.responseSummary,
        });
      }
    }
    logger.info('Created Verification Ledger entries');

    // ---------------------------------------------------------
    // 12. Cryptographic Audit Trail (AuditEvent & AuditLog)
    // ---------------------------------------------------------
    const auditEventsData = [
      {
        actor: { id: userMap['admin@onecheck.gov.in']._id.toString(), role: 'ADMIN' },
        action: 'RULEPACK_ACTIVATED',
        entity: { type: 'Rulepack', id: '2026.1-demo' },
        payload: { version: '2026.1-demo', ruleCount: 12 },
      },
      {
        actor: { id: userMap['director@apex-tech.edu.in']._id.toString(), role: 'INSTITUTION_USER' },
        action: 'APPLICATION_SUBMITTED',
        entity: { type: 'Application', id: appMap['APP-2026-000101']._id.toString() },
        payload: { applicationNumber: 'APP-2026-000101', category: 'EOA_INTAKE_INCREASE' },
      },
      {
        actor: { id: officer1._id.toString(), role: 'OFFICER' },
        action: 'PIPELINE_RUN_COMPLETED',
        entity: { type: 'CheckRun', id: 'RUN-2026-000101-A' },
        payload: { findingsCount: 3, riskScore: 82, band: 'RED' },
      },
      {
        actor: { id: officer1._id.toString(), role: 'OFFICER' },
        action: 'DEFICIENCY_LETTER_DISPATCHED',
        entity: { type: 'Letter', id: appMap['APP-2026-000301']._id.toString() },
        payload: { recipient: 'Chanakya Engineering College', noticeDays: 15 },
      },
      {
        actor: { id: userMap['director.regional@onecheck.gov.in']._id.toString(), role: 'REGIONAL_DIRECTOR' },
        action: 'APPROVAL_DECISION_RECORDED',
        entity: { type: 'Application', id: appMap['APP-2026-000102']._id.toString() },
        payload: { outcome: 'APPROVED', validThrough: '2027-06-30' },
      },
      {
        actor: { id: userMap['auditor@onecheck.gov.in']._id.toString(), role: 'AUDITOR' },
        action: 'AUDIT_INTEGRITY_CHECK',
        entity: { type: 'AuditChain', id: 'GLOBAL' },
        payload: { status: 'CHAIN_VALID', verifiedRecords: 10 },
      },
    ];

    for (const e of auditEventsData) {
      await logEvent({
        actorUser: e.actor.id,
        action: e.action,
        entityType: e.entity.type,
        entityId: e.entity.id,
        outcome: 'SUCCESS',
        metadata: e.payload,
      });
    }
    logger.info('Created Cryptographic Audit Trail');
    }

    logger.info('======================================================');
    logger.info('Comprehensive database seeding completed successfully!');
    logger.info('Seeded: 6 Institutions, 14 Users across all 5 roles,');
    logger.info('10 Diverse Applications, 60+ Documents, Claims, Findings,');
    logger.info('Alerts Queue, Deficiency Letters, and Cryptographic Audit Chain.');
    logger.info('======================================================');

    return {
      admin: adminUser,
      officer: officer1,
      regionalDirector: userMap['director.regional@onecheck.gov.in'],
      auditor: userMap['auditor@onecheck.gov.in'],
      institutionUser: userMap['director@apex-tech.edu.in'],
      institution: instMap['AICTE-DEL-2026-01'],
      app: appMap['APP-2026-000101'],
      institutions: Object.keys(instMap).length,
      users: Object.keys(userMap).length,
      applications: Object.keys(appMap).length,
    };
  } catch (error) {
    logger.error('Database seeding failed', { error: error.message, stack: error.stack });
    throw error;
  }
}

if (require.main === module) {
  seedDatabase()
    .then(() => disconnectDB())
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { seedDatabase, DEFAULT_RULEPACK_YAML };
