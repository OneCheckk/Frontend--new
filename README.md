# OneCheck — Regulatory Compliance & AI Verification Platform

OneCheck is an automated compliance verification, forensics, and fraud detection platform designed for technical education regulatory scrutiny (AICTE/Approvals).

---

## 📁 Repository Structure

```text
Frontend--new/
├── 🌐 frontend/              # Client application (React + Vite + TypeScript)
│   ├── apps/
│   │   └── web/              # Main web portal (Tailwind CSS, TanStack Query)
│   ├── contracts/            # DTOs & TypeScript schemas
│   └── package.json
│
└── ⚙️ backend/               # Server API (Node.js + Express + MongoDB)
    ├── src/
    │   ├── controllers/      # Route handlers
    │   ├── models/           # Mongoose schemas (Application, FacultyHash, Alert, etc.)
    │   ├── routes/           # REST endpoints
    │   ├── services/         # ML verification, HMAC collision check, ELA analysis
    │   └── utils/            # Cryptographic & audit utilities
    ├── tests/                # Jest integration & unit test suites
    └── package.json
```

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Node.js** v18+ or v20+
- **MongoDB** (local or MongoDB Atlas connection URI)

---

### 2. Backend Setup & Run

```bash
cd backend
npm install

# Configure environment
cp .env.example .env
# Update MONGODB_URI and JWT_SECRET in .env

# (Optional) Seed realistic test data
npm run seed

# Start development server on http://localhost:3000
npm run dev
```

---

### 3. Frontend Setup & Run

```bash
cd frontend
npm install

# Start Vite development server on http://localhost:5173
npm run dev
```

The frontend will run on **`http://localhost:5173`** and communicate with the backend on **`http://localhost:3000`**.

---

## 🔒 Key Capabilities
- **Faculty Duplication / Ghost Faculty Detection:** Privacy-preserving salted HMAC-SHA256 matching across technical institutions without exposing raw Aadhaar/PAN.
- **Forensics Suite:** PDF revision tampering inspection, Error Level Analysis (ELA), perceptual image hashing, and campus geofencing.
- **Cryptographic Audit Trail:** Monotonic sequence hash chain ensuring immutability across all officer and applicant actions.
- **Risk Scoring & Decision Guard:** 5-pillar compliance scoring with deficiency letter generation.
