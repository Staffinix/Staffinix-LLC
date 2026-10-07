# Staffinix Platform: System Documentation & Presentation Script

---

## Part 1: Comprehensive System Documentation

### 1. Executive Summary & Platform Purpose

**Staffinix** is an enterprise-grade AI-powered IT Staffing, Sourcing, and Vendor Operations SaaS Platform. It unifies the end-to-end recruitment lifecycle across multi-tenant organizations—from high-level SaaS tenant management down to AI-driven resume tailoring and candidate pipeline progression.

---

### 2. Current Application Stack & Architecture

- **Core Framework**: React 19 + TypeScript + TanStack Start SSR + Vite
- **Routing & Data Loading**: TanStack Router (file-based routing) + TanStack Query + authenticated server functions
- **Styling & UI Components**: Tailwind CSS v4 + Shadcn UI + Lucide Icons + Radix UI Primitives
- **Persistence & Isolation**: Supabase Auth, Postgres, Storage, tenant-scoped RLS, and versioned migrations
- **AI & Document Boundaries**: Server-only AI gateway, scheduled embedding task, and an isolated malware-scanned document worker
- **Notifications & Feedback**: Sonner Toaster (2-second global duration standard)

---

### 3. Future Backend Architecture & 7-Step AI Pipeline

The upcoming Staffinix backend infrastructure is architected as an asynchronous, high-throughput micro-service ecosystem:

#### Technical Infrastructure Gist

- **Core Framework**: **FastAPI (Python 3.12)** for high-performance async REST APIs and OpenAPI schema generation.
- **Database & ORM**: **PostgreSQL** for relational persistence and **SQLAlchemy 2.0** for type-safe transactional operations.
- **Caching & Async Workers**: **Redis** for response caching and **FastAPI Background Tasks / Celery** for asynchronous job execution.
- **DevOps & Deployment**: **Docker**, **Docker Compose**, and **GitHub Actions CI/CD** for containerized automated deployments.

#### 7-Step Data & AI Pipeline Specification

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ STEP 1: EMAIL INGESTION & DEDUP (Gmail/Outlook API, pdfplumber, hashlib, FAISS)       │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ STEP 2: EXTRACTING JOB DETAILS (LLM + Pydantic JSON parsing, Redis/Postgres Caching)  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ STEP 3: BENCH SEARCH & MATCHING (Local Sentence Transformers, PII Privacy, Pinecone)   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ STEP 4: ATS RESUME TAILORING (Tesseract OCR, Source Anchors, python-docx, WeasyPrint)  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ STEP 5: DRAFT GENERATION (DB Record Assembly, Template Formatting, Mail API Dispatch)  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ STEP 6: SUBMISSION LIFECYCLE TRACKING (PostgreSQL + SQLAlchemy Transaction Ledger)     │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ STEP 7: AI ASSISTANT (RAG Intent Parsing, PostgreSQL Vector Retrieval, Cited Answers) │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

1. **Step 1 — Ingesting Emails & Deduplication**:
   - Connects to Gmail or Microsoft Outlook APIs to automatically ingest incoming job emails.
   - Uses `pdfplumber` and `PyPDF` for layout-aware text extraction from job description (JD) attachments.
   - Computes `hashlib` SHA-256 hashes for exact duplicate prevention.
   - Runs `SentenceTransformers` embeddings backed by `FAISS`/`ChromaDB` vector search to detect and link reworded or duplicate JDs.
2. **Step 2 — Extracting Job Details**:
   - Queries LLM APIs with strict `Pydantic` schemas to parse unstructured JDs into validated JSON structures.
   - Identifies missing fields or null values for recruiter review.
   - Caches parsed JDs using Redis and PostgreSQL for instant retrieval.
3. **Step 3 — Bench Search & Matching**:
   - Executes `SentenceTransformers` locally to guarantee strict privacy and protection of candidates' PII.
   - Leverages `FAISS` and `Pinecone` vector indices synced with PostgreSQL source records.
   - Applies custom Python filtering functions for hard constraints (Work Authorization, Geographic Location, Rate Caps) combined with semantic relevance scoring.
4. **Step 4 — ATS Resume Tailoring**:
   - Uses `Tesseract OCR` for comprehensive text extraction from original candidate resume PDFs.
   - Applies a custom verification layer that validates tailored resume bullet points against source PDF anchors to eliminate AI hallucinations.
   - Utilizes `python-docx` and `WeasyPrint` to render approved drafts into pixel-perfect Word (`.docx`) and PDF formats.
5. **Step 5 — Draft Generation**:
   - Assembles email subjects and body copy dynamically from database records into structured templates.
   - Connects to Gmail/Outlook APIs for 1-click dispatch.
6. **Step 6 — Tracking Candidate Status & Submission Lifecycle**:
   - Utilizes PostgreSQL for verifying submission records and SQLAlchemy for atomic database transactions across all 6 pipeline stages.
7. **Step 7 — AI Assistant (RAG Pipeline)**:
   - Implements a Retrieval-Augmented Generation (RAG) workflow to parse user intent, fetch matching database records, and feed retrieved context to the LLM API for accurate, cited answers.

---

### 4. Detailed 4-Tier Role-Based Access Control (RBAC) & Module Deep Dive

```
┌────────────────────────────────────────────────────────────────────────┐
│ LEVEL 1: SUPER ADMIN (SaaS Platform Console & Governance)              │
├────────────────────────────────────────────────────────────────────────┤
│ LEVEL 2: ORG ADMIN / VP RECRUITING (Accounts, Vendors & Placements)     │
├────────────────────────────────────────────────────────────────────────┤
│ LEVEL 3: RECRUITING MANAGER (Requisitions, Bench & Matching)            │
├────────────────────────────────────────────────────────────────────────┤
│ LEVEL 4: TECHNICAL RECRUITER (Dashboard, Requisitions, Bench, Vendors, │
│          Access Request, AI Tailoring, Email Drafts & Pipeline)        │
└────────────────────────────────────────────────────────────────────────┘
```

#### Level 1 — Platform Super Admin (SaaS Governance)

- **Primary Target Role**: SaaS Owner, Platform Administrator, System Auditor.
- **Dedicated Modules**:
  1. **Platform Console (`/platform`)**: SaaS dashboard displaying active tenant count, MRR, allocated seats, plan toggles (`trial`, `starter`, `growth`, `enterprise`), tenant status controls (`active`, `suspended`), and seat adjustments.
  2. **Tenant Registration (`/tenants/new`)**: Enterprise tenant onboarding with EIN numbers, owner contacts, and admin credentials.
  3. **Access Request Console (`/access-request`)**: Reviews and approves/rejects L3/L4 recruiter developer access upgrades.

#### Level 2 — VP of Recruiting / Org Admin (Agency Operations & Revenue)

- **Primary Target Role**: VP of Recruiting, Agency Owner, Operations Director.
- **Dedicated Modules**:
  1. **Executive Overview Dashboard (`/overview`)**: Placements count, Gross Margin ($/hr), and Monthly Revenue Trends.
  2. **Client Accounts Hub (`/clients/*`)**: Client accounts (`/clients/new`, `/clients/$id`), billing terms, and active requisitions.
  3. **Vendor Management Hub (`/vendors/*`)**: Sub-vendor directory with **Tier 1 (Preferred)** vs **Tier 2 (Standard)** tiering classifications.
  4. **Placements & Revenue Tracker (`/placements`)**: Ledger tracking Bill Rate, Pay Rate, Net Margin ($/hr), and total placement revenues.

#### Level 3 — Recruiting Manager / Lead (Delivery & Bench Operations)

- **Primary Target Role**: Recruiting Manager, Account Delivery Lead, Bench Manager.
- **Dedicated Modules**:
  1. **Requisitions Management Hub (`/requirements/*`)**: Client job requisitions (`/requirements/new`, `/requirements/$id/edit`), target budget rates ($/hr), priority status, and recruiter assignments.
  2. **Bench Candidates Repository (`/candidates/*`)**: Central bench talent database (`/candidates/new`, `/candidates/$id`), visa status, tech stacks, and profile-level Pipeline Trackers with editable stage selectors (`Submitted`, `Shortlisted`, `Interview`, `Offered`, `Hired`, `Withdrawn`).
  3. **AI Candidate-Job Match Engine (`/matching`)**: Vector-based match engine pairing candidates with open requisitions, computing 0–100% match scores and skill gap analysis.

#### Level 4 — Technical Recruiter (Complete Sourcing & Delivery Workspace)

- **Primary Target Role**: Technical Recruiter, Sourcing Specialist, Delivery Recruiter.
- **Business Purpose**: Operates the complete operational workflow—from personal dashboard performance monitoring to candidate bench sourcing, vendor partner management, requisition analysis, access privilege escalation requests, AI resume tailoring, email submittals, and 6-stage pipeline tracking.
- **Dedicated Modules & Key Features**:
  1. **Recruiter Operational Dashboard (`/dashboard`)**:
     - Personal recruiter console tracking active submittals, pending client interviews, daily submission targets, and priority assigned requisitions.
  2. **Assigned Requisitions Module (`/requirements/*`)**:
     - Views assigned job requisitions (`/requirements/$id`), rate caps, client specifications, required tech stack skills, and direct 1-click triggers to launch candidate matching.
  3. **Bench Candidates Sourcing Hub (`/candidates/*`)**:
     - Accesses bench candidate profiles (`/candidates/$id`), inspects resume details, work authorization, location, phone/email, and profile-level Pipeline Trackers.
  4. **Vendors Hub (`/vendors/*`)**:
     - Inspects sub-vendor partner profiles (`/vendors/$id`), vendor contacts (phone/email), sub-vendor candidate submittals, and Tier 1 Preferred vs Tier 2 Standard classifications for sub-vendor candidate sourcing.
  5. **Platform Access Request (`/access-request`)**:
     - Submits role escalation requests (e.g. requesting L3 Manager or L2 Admin permissions) with justification reasons directly to L1 Super Admins.
  6. **AI Resume Tailoring Engine (`/tailoring` Tab 1)**:
     - Contextually rewrites candidate summaries, technical skills, and work experience bullets to align cleanly with client job descriptions.
  7. **Client Submission Workspace (`/tailoring` Tab 2)**:
     - Formats candidate submittals, provides 1-click **Send via Outlook** / **Send via Gmail** dispatch, displays non-clickable **Submitted** badge with a tick icon, and triggers auto-redirect to Pipeline Tracker.
  8. **Pipeline Tracker (`/submissions/board`)**:
     - **6 Pipeline Stages**: `Submitted` $\rightarrow$ `Shortlisted` $\rightarrow$ `Interview` $\rightarrow$ `Offered` $\rightarrow$ `Hired` $\rightarrow$ `Withdrawn`.
     - **Kanban Board View**: Single-screen grid featuring compact cards (Candidate Name, Avatar, Text-wrapped Job Role, Client Badge) with drag-and-drop support.
     - **Table View**: Detailed table featuring Candidate Email, Applied Job Role, Client, Vendor Details, Closed Rate ($/hr), Location, Inline Editable Stage Dropdown, and extreme-right horizontal 3-dots actions menu (**Delete** and **Cancel**).

---

# Part 2: Interchangeable Co-Presenter Script

### Presentation Roles

- **Aditya (Speaker A)**: Explains SaaS Governance (L1), Enterprise Revenue Operations (L2), System Architecture, Executive Metrics & Future Backend Roadmap.
- **Riva (Speaker B)**: Explains Delivery Management (L3), Recruiter Dashboard, Requisitions, Bench Candidates, Vendors, Access Requests, AI Matching, Recruiter Tailoring (L4), Pipeline Execution & AI Data Pipelines.

---

### Scene 1: Introduction & Vision

**Aditya**:

> "Welcome everyone! Today, Riva and I are thrilled to present **Staffinix**—our AI-powered IT Staffing, Sourcing, and Vendor Operations Platform. Staffinix was designed to unify the end-to-end recruitment lifecycle within a single, high-performance web interface."

**Riva**:

> "That's right, Aditya. Whether you are a SaaS Super Admin managing enterprise subscriptions, a VP of Recruiting tracking placement margins, a Manager balancing requisitions, or a Recruiter submitting candidate profiles—Staffinix delivers a seamless, role-optimized workspace for every level."

---

### Scene 2: Tech Stack & Level 1 (SaaS Governance) Deep Dive

**Aditya**:

> "Architecturally, Staffinix is powered by React 19, TypeScript, Vite, TanStack Router for file-based type safety, and Tailwind CSS v4.
> At the top of our 4-tier RBAC architecture is **Level 1 — Super Admin**. In the Platform Console (`/platform`), Super Admins monitor global SaaS metrics, manage multi-tenant seat allocations, upgrade subscription plans from Trial to Enterprise, and control tenant activation status with a single click."

**Riva**:

> "L1 Super Admins also oversee tenant registration (`/tenants/new`) and manage elevated developer access requests (`/access-request`), ensuring strict enterprise governance and multi-tenant security across the platform."

---

### Scene 3: Level 2 (VP of Recruiting & Revenue Ops) Deep Dive

**Aditya**:

> "Stepping into **Level 2 — Org Admin & VP of Recruiting**, the platform shifts focus to agency growth and revenue operations. In the Executive Overview (`/overview`), leaders track active placements, gross revenue, net margin per hour, and recruiter performance."

**Riva**:

> "L2 leaders also manage Client Accounts (`/clients/*`) and Vendor Partnerships (`/vendors/*`). Our vendor module categorizes sub-vendors into **Tier 1 Preferred** and **Tier 2 Standard** tiers, while our Placements Tracker (`/placements`) maintains a real-time margin ledger for every placed candidate."

---

### Scene 4: Level 3 (Recruiting Manager & AI Match Engine) Deep Dive

**Riva**:

> "Next is **Level 3 — Recruiting Manager & Delivery Lead**. Managers oversee client Requisitions (`/requirements/*`), defining budget rate caps, priority levels, tech stack requirements, and recruiter assignments."

**Aditya**:

> "Managers also operate the Bench Candidates Repository (`/candidates/*`) and our **AI Match Engine** (`/matching`). The AI match engine parses open requisitions against candidate profiles using vector embeddings, computing instant 0-to-100% match scores and skill gap analysis to ensure rapid fulfillment."

---

### Scene 5: Level 4 Recruiter Workspace — Dashboard, Requisitions, Bench, Vendors & Access Requests

**Riva** _(Navigating to L4 Recruiter Workspace)_:

> "Now let's explore **Level 4 — Technical Recruiter** in full detail. A recruiter's day starts on the **Recruiter Operational Dashboard** (`/dashboard`), tracking daily submission targets, client interviews, and assigned job requisitions."

**Aditya**:

> "From the dashboard, recruiters navigate to **Requisitions** (`/requirements/*`) to inspect budget rate caps and tech stack requirements. They then leverage the **Bench Candidates Repository** (`/candidates/*`) and **Vendors Hub** (`/vendors/*`) to source talent from both internal benches and Tier-1 Preferred sub-vendor partners."

**Riva**:

> "And when recruiters need elevated platform capabilities or developer console privileges, they use the **Platform Access Request** module (`/access-request`) to submit role escalation requests directly to L1/L2 Admins with clear justification."

---

### Scene 6: Level 4 Recruiter Tailoring, Email Submission & Pipeline Tracker

**Riva** _(Navigating to Tailoring Workspace)_:

> "Once the candidate and requirement are selected, the recruiter launches the **AI Resume Tailoring Engine** (`/tailoring` Tab 1). The AI contextually rewrites candidate summaries and experience bullets to align with client requirements."

**Aditya**:

> "In Tab 2, the Client Submission Draft formats the submittal details. Clicking **Send via Outlook** or **Send via Gmail** launches a prefilled email compose tab. Back in Staffinix, a non-clickable **Submitted** badge appears with a green tick icon, and the candidate automatically syncs to the Pipeline Tracker after 10 seconds!"

**Riva** _(Navigating to Pipeline Tracker)_:

> "In the **Pipeline Tracker** (`/submissions/board`), recruiters manage candidate progression across 6 stages: **Submitted, Shortlisted, Interview, Offered, Hired, and Withdrawn**. They can use the compact **Kanban Board** or switch to the detailed **Table View** with inline editable stage dropdowns and horizontal 3-dots actions menus."

---

### Scene 7: Future Backend Architecture & 7-Step AI Pipeline

**Aditya**:

> "Looking ahead, we are expanding our backend architecture using **FastAPI in Python 3.12**, backed by **PostgreSQL, SQLAlchemy, Redis**, and containerized with **Docker and GitHub Actions CI/CD**.
> Our backend roadmap introduces a 7-step automated data pipeline—starting with automated email ingestion from Gmail and Outlook, layout text extraction via `pdfplumber`, exact hash deduplication using `hashlib`, and semantic similarity linking with `SentenceTransformers` and `FAISS`."

**Riva**:

> "For candidate privacy, our Bench Search and Matching will run `SentenceTransformers` locally to ensure zero exposure of candidate PII, paired with `Pinecone` vector indexing and hard filtering for work auth and rate caps.
> Furthermore, step 4 uses `Tesseract OCR` and a custom verification layer to anchor tailored resume points directly back to source PDFs, while `WeasyPrint` renders approved drafts into docx and PDF formats!"

---

### Scene 8: AI Assistant & Closing

**Aditya**:

> "Step 6 and 7 complete the backend engine—utilizing PostgreSQL and SQLAlchemy for atomic submission transactions, and a RAG-powered AI Assistant that parses natural language intent, queries database tables, and returns cited answers to users in real time."

**Riva**:

> "Together, this frontend-backend synergy turns Staffinix into an end-to-end recruitment intelligence engine. Thank you for your time, and Aditya and I would be happy to take any questions!"
