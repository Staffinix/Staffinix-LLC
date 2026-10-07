/**
 * Master rich fixture dataset for local UI development.
 * Contains 250+ realistic, non-artificial datapoints matching current schema.
 */

export interface MasterClient {
  id: string;
  name: string;
  industry: string;
  website: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  city: string;
  state: string;
  country: string;
  status: "active" | "inactive" | "lead";
  tier: "enterprise" | "tier_1" | "tier_2";
  notes?: string;
  created_at: string;
}

export interface MasterVendor {
  id: string;
  name: string;
  website: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  city: string;
  state: string;
  country: string;
  status: "active" | "inactive" | "pending";
  tier: "preferred" | "approved" | "standard" | "a" | "b" | "c";
  payment_terms_days?: number;
  notes?: string;
  created_at: string;
}

export interface MasterCandidate {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  current_title: string;
  current_employer: string;
  applied_role: string;
  client_name: string;
  primary_technology: string;
  skills: string[];
  visa_status: "US Citizen" | "Green Card" | "H1B" | "OPT-STEM" | "TN Visa";
  experience_years: number;
  location: string;
  availability: "immediate" | "two_weeks" | "one_month" | "negotiable";
  status: "active" | "submitted" | "placed" | "on_hold" | "inactive";
  min_rate: number;
  max_rate: number;
  currency: string;
  ats_score: number;
  summary: string;
  skills_matrix: { category: string; items: string[] }[];
  certifications?: string[];
  projects?: { title: string; description: string; tech: string[] }[];
  created_at: string;
}

export interface MasterRequisition {
  id: string;
  title: string;
  skills: string[];
  secondary_skills: string[];
  vendor_id: string;
  vendor_name: string;
  vendor_email: string;
  vendor_contact: string;
  client_id: string;
  client_name: string;
  location: string;
  work_mode: "onsite" | "remote" | "hybrid";
  engagement_type: string;
  duration: string;
  visa_required: string;
  rate_min: number;
  rate_max: number;
  rate_type: "hourly" | "annual";
  currency: string;
  status: "open" | "assigned" | "closed" | "on_hold" | "expired";
  priority: "urgent" | "high" | "medium" | "low";
  min_experience: string;
  certifications?: string;
  created_at: string;
  start_date: string;
  description: string;
}

export interface MasterSubmission {
  id: string;
  candidate_id: string;
  candidate_name: string;
  candidate_email: string;
  requirement_id: string;
  role: string;
  client_id: string;
  client: string;
  stage: "Submitted" | "Shortlisted" | "Interview" | "Offered" | "Hired" | "Withdrawn";
  rate: string;
  score: number;
  updatedAt: string;
  submitted_by: string;
  created_at: string;
}

export interface MasterInterview {
  id: string;
  submission_id: string;
  candidate_name: string;
  role: string;
  client_name: string;
  round: "Technical Round 1" | "System Design" | "Client Manager" | "Executive Culture Fit";
  interviewer_name: string;
  interviewer_email: string;
  scheduled_at: string;
  duration_minutes: number;
  outcome: "scheduled" | "passed" | "failed" | "pending";
  feedback?: string;
}

export interface MasterPlacement {
  id: string;
  candidate_name: string;
  role: string;
  client_name: string;
  vendor_name: string;
  bill_rate: number;
  pay_rate: number;
  margin: number;
  start_date: string;
  end_date: string;
  status: "active" | "completed";
}

export interface MasterAuditLog {
  id: string;
  action: string;
  actor_email: string;
  entity_type: string;
  entity_id: string;
  created_at: string;
  metadata?: Record<string, unknown>;
}

// -------------------------------------------------------------
// 1. Enterprise Clients (25)
// -------------------------------------------------------------
export const MASTER_CLIENTS: MasterClient[] = [
  {
    id: "cl-1",
    name: "FinTech Solutions LLC",
    industry: "Financial Services & Banking",
    website: "https://fintechsolutions.io",
    contact_name: "Sarah Jenkins",
    contact_email: "sjenkins@fintechsolutions.io",
    contact_phone: "+1 (555) 901-2345",
    city: "New York",
    state: "NY",
    country: "USA",
    status: "active",
    tier: "tier_1",
    created_at: "2026-01-10T09:00:00Z",
  },
  {
    id: "cl-2",
    name: "HealthScale Digital",
    industry: "Healthcare & MedTech",
    website: "https://healthscale.digital",
    contact_name: "Dr. Robert Miller",
    contact_email: "rmiller@healthscale.digital",
    contact_phone: "+1 (555) 876-5432",
    city: "Austin",
    state: "TX",
    country: "USA",
    status: "active",
    tier: "tier_2",
    created_at: "2026-01-12T10:30:00Z",
  },
  {
    id: "cl-3",
    name: "RetailGenius Inc.",
    industry: "E-Commerce Tech",
    website: "https://retailgenius.com",
    contact_name: "Amanda Watson",
    contact_email: "awatson@retailgenius.com",
    contact_phone: "+1 (555) 654-9870",
    city: "Chicago",
    state: "IL",
    country: "USA",
    status: "active",
    tier: "tier_1",
    created_at: "2026-01-15T14:20:00Z",
  },
  {
    id: "cl-4",
    name: "OmniLogistics America",
    industry: "Supply Chain & Logistics",
    website: "https://omnilogistics.com",
    contact_name: "David Vance",
    contact_email: "dvance@omnilogistics.com",
    contact_phone: "+1 (555) 432-1098",
    city: "Atlanta",
    state: "GA",
    country: "USA",
    status: "active",
    tier: "tier_1",
    created_at: "2026-01-18T11:15:00Z",
  },
  {
    id: "cl-5",
    name: "Vertex Financial Group",
    industry: "Asset Management & Trading",
    website: "https://vertexfinancial.com",
    contact_name: "Marcus Brody",
    contact_email: "mbrody@vertexfinancial.com",
    contact_phone: "+1 (555) 321-7654",
    city: "Boston",
    state: "MA",
    country: "USA",
    status: "active",
    tier: "tier_1",
    created_at: "2026-01-20T08:45:00Z",
  },
  {
    id: "cl-6",
    name: "CloudScale Systems",
    industry: "Enterprise Infrastructure",
    website: "https://cloudscale.io",
    contact_name: "Elena Rostova",
    contact_email: "elena@cloudscale.io",
    contact_phone: "+1 (555) 210-9876",
    city: "San Jose",
    state: "CA",
    country: "USA",
    status: "active",
    tier: "tier_1",
    created_at: "2026-01-22T13:00:00Z",
  },
  {
    id: "cl-7",
    name: "BioHealth Labs",
    industry: "Pharmaceutical Research",
    website: "https://biohealthlabs.com",
    contact_name: "Dr. Kevin Zhao",
    contact_email: "kzhao@biohealthlabs.com",
    contact_phone: "+1 (555) 109-8765",
    city: "San Diego",
    state: "CA",
    country: "USA",
    status: "active",
    tier: "tier_2",
    created_at: "2026-01-25T16:40:00Z",
  },
  {
    id: "cl-8",
    name: "CyberGuard Security",
    industry: "Cybersecurity & SOC",
    website: "https://cyberguard.sec",
    contact_name: "Rachel Green",
    contact_email: "rgreen@cyberguard.sec",
    contact_phone: "+1 (555) 098-7654",
    city: "Reston",
    state: "VA",
    country: "USA",
    status: "active",
    tier: "tier_1",
    created_at: "2026-01-28T09:30:00Z",
  },
  {
    id: "cl-9",
    name: "NextGen Mobility",
    industry: "Autonomous Vehicles & EV",
    website: "https://nextgenmobility.tech",
    contact_name: "Carlos Mendez",
    contact_email: "cmendez@nextgenmobility.tech",
    contact_phone: "+1 (555) 987-0123",
    city: "Detroit",
    state: "MI",
    country: "USA",
    status: "active",
    tier: "tier_1",
    created_at: "2026-02-01T10:00:00Z",
  },
  {
    id: "cl-10",
    name: "PayEdge Global",
    industry: "Payments Infrastructure",
    website: "https://payedge.com",
    contact_name: "Jason Statham",
    contact_email: "jstatham@payedge.com",
    contact_phone: "+1 (555) 987-1234",
    city: "Charlotte",
    state: "NC",
    country: "USA",
    status: "active",
    tier: "tier_1",
    created_at: "2026-02-03T11:20:00Z",
  },
  {
    id: "cl-11",
    name: "DataMatrix Inc.",
    industry: "Big Data Analytics & AI",
    website: "https://datamatrix.ai",
    contact_name: "Sophia Loren",
    contact_email: "sloren@datamatrix.ai",
    contact_phone: "+1 (555) 876-2345",
    city: "Seattle",
    state: "WA",
    country: "USA",
    status: "active",
    tier: "tier_1",
    created_at: "2026-02-05T15:10:00Z",
  },
  {
    id: "cl-12",
    name: "Quantum Dynamics",
    industry: "AI & Quantum Software",
    website: "https://quantumdynamics.ai",
    contact_name: "Dr. Alan Turing",
    contact_email: "aturing@quantumdynamics.ai",
    contact_phone: "+1 (555) 765-3456",
    city: "Cambridge",
    state: "MA",
    country: "USA",
    status: "active",
    tier: "tier_2",
    created_at: "2026-02-08T09:50:00Z",
  },
  {
    id: "cl-13",
    name: "Horizon Media Group",
    industry: "Digital AdTech & Streaming",
    website: "https://horizonmedia.com",
    contact_name: "Claire Underwood",
    contact_email: "cunderwood@horizonmedia.com",
    contact_phone: "+1 (555) 654-4567",
    city: "Los Angeles",
    state: "CA",
    country: "USA",
    status: "active",
    tier: "tier_2",
    created_at: "2026-02-10T14:30:00Z",
  },
  {
    id: "cl-14",
    name: "Apex Financial Services",
    industry: "Consumer Banking",
    website: "https://apexfinancial.com",
    contact_name: "Thomas Shelby",
    contact_email: "tshelby@apexfinancial.com",
    contact_phone: "+1 (555) 543-5678",
    city: "Dallas",
    state: "TX",
    country: "USA",
    status: "active",
    tier: "tier_1",
    created_at: "2026-02-12T12:00:00Z",
  },
  {
    id: "cl-15",
    name: "Summit Energy Systems",
    industry: "CleanTech & Renewables",
    website: "https://summitenergy.io",
    contact_name: "Hannah Abbott",
    contact_email: "habbott@summitenergy.io",
    contact_phone: "+1 (555) 432-6789",
    city: "Denver",
    state: "CO",
    country: "USA",
    status: "active",
    tier: "tier_2",
    created_at: "2026-02-15T08:30:00Z",
  },
  {
    id: "cl-16",
    name: "ApexCare Health System",
    industry: "Hospitals & EHR Tech",
    website: "https://apexcarehealth.org",
    contact_name: "Dr. Gregory House",
    contact_email: "ghouse@apexcarehealth.org",
    contact_phone: "+1 (555) 321-7890",
    city: "Nashville",
    state: "TN",
    country: "USA",
    status: "active",
    tier: "tier_1",
    created_at: "2026-02-18T16:00:00Z",
  },
  {
    id: "cl-17",
    name: "Elevate Commerce",
    industry: "D2C Brands Tech",
    website: "https://elevatecommerce.com",
    contact_name: "Zendaya Coleman",
    contact_email: "zcoleman@elevatecommerce.com",
    contact_phone: "+1 (555) 210-8901",
    city: "San Francisco",
    state: "CA",
    country: "USA",
    status: "active",
    tier: "tier_2",
    created_at: "2026-02-20T10:15:00Z",
  },
  {
    id: "cl-18",
    name: "BlueOcean Tech",
    industry: "Maritime & IoT",
    website: "https://blueoceantech.io",
    contact_name: "Captain Jack",
    contact_email: "cjack@blueoceantech.io",
    contact_phone: "+1 (555) 109-9012",
    city: "Miami",
    state: "FL",
    country: "USA",
    status: "active",
    tier: "tier_2",
    created_at: "2026-02-22T11:45:00Z",
  },
  {
    id: "cl-19",
    name: "CoreLogic Solutions",
    industry: "Real Estate Analytics",
    website: "https://corelogicsolutions.com",
    contact_name: "Walter White",
    contact_email: "wwhite@corelogic.com",
    contact_phone: "+1 (555) 098-0123",
    city: "Irvine",
    state: "CA",
    country: "USA",
    status: "active",
    tier: "tier_1",
    created_at: "2026-02-25T13:20:00Z",
  },
  {
    id: "cl-20",
    name: "Stratos Aerospace",
    industry: "Defense & Flight Software",
    website: "https://stratosaerospace.com",
    contact_name: "Maverick Mitchell",
    contact_email: "mmitchell@stratos.com",
    contact_phone: "+1 (555) 987-1234",
    city: "Huntsville",
    state: "AL",
    country: "USA",
    status: "active",
    tier: "tier_1",
    created_at: "2026-02-28T15:00:00Z",
  },
  {
    id: "cl-21",
    name: "Beacon Logistics Tech",
    industry: "Freight Mobility",
    website: "https://beaconfreight.io",
    contact_name: "Jesse Pinkman",
    contact_email: "jpinkman@beaconfreight.io",
    contact_phone: "+1 (555) 876-2345",
    city: "Minneapolis",
    state: "MN",
    country: "USA",
    status: "active",
    tier: "tier_2",
    created_at: "2026-03-01T09:10:00Z",
  },
  {
    id: "cl-22",
    name: "Vantage Media Group",
    industry: "Broadcast & OTT",
    website: "https://vantagemedia.com",
    contact_name: "Logan Roy",
    contact_email: "lroy@vantagemedia.com",
    contact_phone: "+1 (555) 765-3456",
    city: "New York",
    state: "NY",
    country: "USA",
    status: "active",
    tier: "tier_1",
    created_at: "2026-03-03T14:40:00Z",
  },
  {
    id: "cl-23",
    name: "Vanguard Capital Tech",
    industry: "Private Equity Software",
    website: "https://vanguardcap.com",
    contact_name: "Shiv Roy",
    contact_email: "sroy@vanguardcap.com",
    contact_phone: "+1 (555) 654-4567",
    city: "Greenwich",
    state: "CT",
    country: "USA",
    status: "active",
    tier: "tier_1",
    created_at: "2026-03-05T10:30:00Z",
  },
  {
    id: "cl-24",
    name: "Pulse Health Technologies",
    industry: "Telehealth & RPM",
    website: "https://pulsehealthtech.com",
    contact_name: "Kendall Roy",
    contact_email: "kroy@pulsehealthtech.com",
    contact_phone: "+1 (555) 543-5678",
    city: "Phoenix",
    state: "AZ",
    country: "USA",
    status: "active",
    tier: "tier_2",
    created_at: "2026-03-08T12:15:00Z",
  },
  {
    id: "cl-25",
    name: "NovaTech Labs",
    industry: "Edge AI & Microchips",
    website: "https://novatechlabs.ai",
    contact_name: "Roman Roy",
    contact_email: "rroy@novatechlabs.ai",
    contact_phone: "+1 (555) 432-6789",
    city: "Austin",
    state: "TX",
    country: "USA",
    status: "active",
    tier: "tier_1",
    created_at: "2026-03-10T16:00:00Z",
  },
];

// -------------------------------------------------------------
// 2. Staffing Vendors (20)
// -------------------------------------------------------------
export const MASTER_VENDORS: MasterVendor[] = [
  {
    id: "vn-1",
    name: "Apex Global Staffing",
    website: "https://apexstaffing.io",
    contact_name: "Mark Davis",
    contact_email: "account@apexstaffing.io",
    contact_phone: "+1 (555) 234-8901",
    city: "New York",
    state: "NY",
    country: "USA",
    status: "active",
    tier: "a",
    payment_terms_days: 30,
    created_at: "2026-01-05T08:00:00Z",
  },
  {
    id: "vn-2",
    name: "Vanguard Tech Partners",
    website: "https://vanguardtech.com",
    contact_name: "Lisa Ray",
    contact_email: "vanguard@techpartners.com",
    contact_phone: "+1 (555) 876-5432",
    city: "Austin",
    state: "TX",
    country: "USA",
    status: "active",
    tier: "a",
    payment_terms_days: 45,
    created_at: "2026-01-08T10:00:00Z",
  },
  {
    id: "vn-3",
    name: "Quantum Talent Group",
    website: "https://quantumtalent.io",
    contact_name: "James Wilson",
    contact_email: "info@quantumtalent.io",
    contact_phone: "+1 (555) 765-4321",
    city: "San Jose",
    state: "CA",
    country: "USA",
    status: "active",
    tier: "b",
    payment_terms_days: 30,
    created_at: "2026-01-10T14:30:00Z",
  },
  {
    id: "vn-4",
    name: "TEKsystems Inc.",
    website: "https://teksystems.com",
    contact_name: "Brian O'Conner",
    contact_email: "sales@teksystems.com",
    contact_phone: "+1 (555) 654-3210",
    city: "Hanover",
    state: "MD",
    country: "USA",
    status: "active",
    tier: "a",
    payment_terms_days: 60,
    created_at: "2026-01-12T11:00:00Z",
  },
  {
    id: "vn-5",
    name: "Insight Global",
    website: "https://insightglobal.com",
    contact_name: "Jessica Alba",
    contact_email: "biz@insightglobal.com",
    contact_phone: "+1 (555) 543-2109",
    city: "Atlanta",
    state: "GA",
    country: "USA",
    status: "active",
    tier: "b",
    payment_terms_days: 45,
    created_at: "2026-01-15T09:15:00Z",
  },
  {
    id: "vn-6",
    name: "Kforce Digital",
    website: "https://kforce.com",
    contact_name: "David Miller",
    contact_email: "d.miller@kforce.com",
    contact_phone: "+1 (555) 432-1098",
    city: "Tampa",
    state: "FL",
    country: "USA",
    status: "active",
    tier: "a",
    payment_terms_days: 30,
    created_at: "2026-01-18T13:40:00Z",
  },
  {
    id: "vn-7",
    name: "Randstad Digital",
    website: "https://randstad.com",
    contact_name: "Sarah Jenkins",
    contact_email: "s.jenkins@randstad.com",
    contact_phone: "+1 (555) 321-0987",
    city: "Chicago",
    state: "IL",
    country: "USA",
    status: "active",
    tier: "b",
    payment_terms_days: 45,
    created_at: "2026-01-20T16:20:00Z",
  },
  {
    id: "vn-8",
    name: "Motion Recruitment",
    website: "https://motionrecruitment.com",
    contact_name: "Robert Taylor",
    contact_email: "rtaylor@motionrecruitment.com",
    contact_phone: "+1 (555) 210-9876",
    city: "Boston",
    state: "MA",
    country: "USA",
    status: "active",
    tier: "c",
    payment_terms_days: 30,
    created_at: "2026-01-22T08:50:00Z",
  },
  {
    id: "vn-9",
    name: "Mindlance Inc.",
    website: "https://mindlance.com",
    contact_name: "Rachel Green",
    contact_email: "r.green@mindlance.com",
    contact_phone: "+1 (555) 109-8765",
    city: "Union",
    state: "NJ",
    country: "USA",
    status: "active",
    tier: "c",
    payment_terms_days: 60,
    created_at: "2026-01-25T10:10:00Z",
  },
  {
    id: "vn-10",
    name: "Mitchell Martin",
    website: "https://mitchellmartin.com",
    contact_name: "Daniel Kim",
    contact_email: "dkim@mitchellmartin.com",
    contact_phone: "+1 (555) 098-7654",
    city: "New York",
    state: "NY",
    country: "USA",
    status: "active",
    tier: "b",
    payment_terms_days: 30,
    created_at: "2026-01-28T12:00:00Z",
  },
  {
    id: "vn-11",
    name: "Collabera LLC",
    website: "https://collabera.com",
    contact_name: "Samantha Reed",
    contact_email: "sreed@collabera.com",
    contact_phone: "+1 (555) 987-6543",
    city: "Basking Ridge",
    state: "NJ",
    country: "USA",
    status: "active",
    tier: "c",
    payment_terms_days: 45,
    created_at: "2026-02-01T15:30:00Z",
  },
  {
    id: "vn-12",
    name: "Eliassen Group",
    website: "https://eliassen.com",
    contact_name: "Anthony Vance",
    contact_email: "avance@eliassen.com",
    contact_phone: "+1 (555) 876-5432",
    city: "Reading",
    state: "MA",
    country: "USA",
    status: "active",
    tier: "c",
    payment_terms_days: 15,
    created_at: "2026-02-03T09:40:00Z",
  },
  {
    id: "vn-13",
    name: "Beacon Hill Staffing",
    website: "https://beaconhillstaffing.com",
    contact_name: "Victoria Sterling",
    contact_email: "vsterling@beaconhill.com",
    contact_phone: "+1 (555) 765-4321",
    city: "Boston",
    state: "MA",
    country: "USA",
    status: "active",
    tier: "a",
    payment_terms_days: 30,
    created_at: "2026-02-05T11:15:00Z",
  },
  {
    id: "vn-14",
    name: "Modis International",
    website: "https://modis.com",
    contact_name: "Christopher Hayes",
    contact_email: "chayes@modis.com",
    contact_phone: "+1 (555) 654-3210",
    city: "Jacksonville",
    state: "FL",
    country: "USA",
    status: "active",
    tier: "c",
    payment_terms_days: 60,
    created_at: "2026-02-08T14:00:00Z",
  },
  {
    id: "vn-15",
    name: "Robert Half Technology",
    website: "https://roberthalf.com",
    contact_name: "Elena Rostova",
    contact_email: "erostova@roberthalf.com",
    contact_phone: "+1 (555) 543-2109",
    city: "Menlo Park",
    state: "CA",
    country: "USA",
    status: "active",
    tier: "c",
    payment_terms_days: 45,
    created_at: "2026-02-10T16:45:00Z",
  },
  {
    id: "vn-16",
    name: "Apex Systems",
    website: "https://apexsystems.com",
    contact_name: "Jonathan Myers",
    contact_email: "jmyers@apexsystems.com",
    contact_phone: "+1 (555) 432-1098",
    city: "Richmond",
    state: "VA",
    country: "USA",
    status: "active",
    tier: "a",
    payment_terms_days: 30,
    created_at: "2026-02-12T10:20:00Z",
  },
  {
    id: "vn-17",
    name: "Aerotek IT Services",
    website: "https://aerotek.com",
    contact_name: "Nathaniel Cooper",
    contact_email: "ncooper@aerotek.com",
    contact_phone: "+1 (555) 321-0987",
    city: "Hanover",
    state: "MD",
    country: "USA",
    status: "active",
    tier: "b",
    payment_terms_days: 45,
    created_at: "2026-02-15T13:10:00Z",
  },
  {
    id: "vn-18",
    name: "The Judge Group",
    website: "https://judge.com",
    contact_name: "Rebecca Sterling",
    contact_email: "rsterling@judge.com",
    contact_phone: "+1 (555) 210-9876",
    city: "Wayne",
    state: "PA",
    country: "USA",
    status: "active",
    tier: "b",
    payment_terms_days: 30,
    created_at: "2026-02-18T08:30:00Z",
  },
  {
    id: "vn-19",
    name: "Softpath System",
    website: "https://softpath.com",
    contact_name: "Gregory Palmer",
    contact_email: "gpalmer@softpath.com",
    contact_phone: "+1 (555) 109-8765",
    city: "Norcross",
    state: "GA",
    country: "USA",
    status: "active",
    tier: "c",
    payment_terms_days: 60,
    created_at: "2026-02-20T15:00:00Z",
  },
  {
    id: "vn-20",
    name: "CyberCoders",
    website: "https://cybercoders.com",
    contact_name: "Sophia Patel",
    contact_email: "spatel@cybercoders.com",
    contact_phone: "+1 (555) 098-7654",
    city: "Irvine",
    state: "CA",
    country: "USA",
    status: "active",
    tier: "b",
    payment_terms_days: 30,
    created_at: "2026-02-22T11:30:00Z",
  },
];

// -------------------------------------------------------------
// 3. Bench Candidates (80)
// -------------------------------------------------------------
export const MASTER_CANDIDATES: MasterCandidate[] = [
  {
    id: "cand-101",
    first_name: "Alex",
    last_name: "Vance",
    email: "alex.vance@techbench.io",
    phone: "+1 (555) 987-6543",
    current_title: "Senior Full Stack Developer",
    current_employer: "TechBench Labs",
    applied_role: "Senior React / Node Engineer",
    client_name: "FinTech Solutions LLC",
    primary_technology: "React",
    skills: ["React", "TypeScript", "Node.js", "GraphQL", "TailwindCSS"],
    visa_status: "H1B",
    experience_years: 8,
    location: "Jersey City, NJ",
    availability: "immediate",
    status: "active",
    min_rate: 75,
    max_rate: 90,
    currency: "USD",
    ats_score: 94,
    summary:
      "High-performing Full Stack Engineer with 8+ years building enterprise micro-frontends, banking apps, and high-frequency Node.js APIs.",
    skills_matrix: [
      { category: "Frontend", items: ["React (9/10)", "TypeScript (9/10)", "Next.js (8/10)"] },
      { category: "Backend", items: ["Node.js (8/10)", "GraphQL (8/10)", "PostgreSQL (7/10)"] },
    ],
    created_at: "2026-01-15T10:00:00Z",
  },
  {
    id: "cand-102",
    first_name: "Priya",
    last_name: "Sharma",
    email: "priya.sharma@consultantbench.com",
    phone: "+1 (555) 321-7654",
    current_title: "Staff DevOps Architect",
    current_employer: "CloudEdge Inc.",
    applied_role: "Lead DevOps / Platform Architect",
    client_name: "HealthScale Digital",
    primary_technology: "Kubernetes",
    skills: ["AWS", "Kubernetes", "Terraform", "Docker", "Python"],
    visa_status: "US Citizen",
    experience_years: 10,
    location: "Dallas, TX",
    availability: "two_weeks",
    status: "submitted",
    min_rate: 90,
    max_rate: 110,
    currency: "USD",
    ats_score: 96,
    summary:
      "Seasoned cloud architect specializing in automated GitOps infrastructure, zero-downtime Kubernetes deployments, and HIPAA compliance.",
    skills_matrix: [
      { category: "Cloud & Ops", items: ["AWS EKS (10/10)", "Terraform (9/10)", "Helm (8/10)"] },
      { category: "Security", items: ["IAM (9/10)", "ArgoCD (8/10)", "Prometheus (8/10)"] },
    ],
    created_at: "2026-01-18T11:30:00Z",
  },
  {
    id: "cand-103",
    first_name: "Marcus",
    last_name: "Chen",
    email: "marcus.chen@databenched.org",
    phone: "+1 (555) 654-9870",
    current_title: "Senior Data Engineer",
    current_employer: "DataMatrix Corp",
    applied_role: "Lead Data Engineer (Spark / Snowflake)",
    client_name: "RetailGenius Inc.",
    primary_technology: "PySpark",
    skills: ["PySpark", "Snowflake", "dbt", "Airflow", "Python"],
    visa_status: "Green Card",
    experience_years: 7,
    location: "Chicago, IL",
    availability: "immediate",
    status: "active",
    min_rate: 85,
    max_rate: 105,
    currency: "USD",
    ats_score: 92,
    summary:
      "Expert data pipeline craftsman with extensive track record in Snowflake data warehousing, real-time streaming architectures, and dbt transformations.",
    skills_matrix: [
      { category: "Data", items: ["Snowflake (9/10)", "PySpark (9/10)", "dbt (9/10)"] },
      { category: "Orchestration", items: ["Airflow (8/10)", "Kafka (7/10)"] },
    ],
    created_at: "2026-01-20T14:15:00Z",
  },
  {
    id: "cand-104",
    first_name: "Elena",
    last_name: "Rostova",
    email: "elena.r@devstaffing.com",
    phone: "+1 (555) 432-1098",
    current_title: "Java Developer",
    current_employer: "OmniSystems",
    applied_role: "Java Microservices Specialist",
    client_name: "OmniLogistics America",
    primary_technology: "Java",
    skills: ["Java 17", "Spring Boot", "Kafka", "PostgreSQL", "Docker"],
    visa_status: "OPT-STEM",
    experience_years: 5,
    location: "Atlanta, GA",
    availability: "one_month",
    status: "placed",
    min_rate: 70,
    max_rate: 85,
    currency: "USD",
    ats_score: 88,
    summary:
      "Backend Java specialist focused on high-concurrency order management microservices, event streaming with Kafka, and automated integration testing.",
    skills_matrix: [
      { category: "Backend", items: ["Java 17 (9/10)", "Spring Boot (9/10)", "Kafka (8/10)"] },
    ],
    created_at: "2026-01-22T09:00:00Z",
  },
  {
    id: "cand-105",
    first_name: "Arjun",
    last_name: "Mehta",
    email: "arjun.m@techbench.io",
    phone: "+1 (555) 111-2233",
    current_title: "Senior AI Software Engineer",
    current_employer: "NeuralNet Labs",
    applied_role: "Senior AI & LLM Integration Engineer",
    client_name: "Quantum Dynamics",
    primary_technology: "Python",
    skills: ["Python", "FastAPI", "PyTorch", "LangChain", "AWS"],
    visa_status: "US Citizen",
    experience_years: 9,
    location: "Seattle, WA",
    availability: "immediate",
    status: "active",
    min_rate: 95,
    max_rate: 120,
    currency: "USD",
    ats_score: 98,
    summary:
      "Pioneer AI Engineer with expertise fine-tuning open-source LLMs, building RAG systems, and embedding vector retrieval algorithms.",
    skills_matrix: [
      { category: "AI & ML", items: ["PyTorch (9/10)", "LangChain (9/10)", "VectorDBs (9/10)"] },
      { category: "Backend", items: ["FastAPI (9/10)", "Python (10/10)", "Docker (8/10)"] },
    ],
    created_at: "2026-01-25T16:00:00Z",
  },
  {
    id: "cand-106",
    first_name: "David",
    last_name: "Kowalski",
    email: "dkowalski@cloudtalent.org",
    phone: "+1 (555) 222-3344",
    current_title: "Cloud Security Specialist",
    current_employer: "SecOps Solutions",
    applied_role: "Cloud Security Architect (AWS / IAM)",
    client_name: "CyberGuard Security",
    primary_technology: "AWS",
    skills: ["AWS", "IAM", "Terraform", "GuardDuty", "Python"],
    visa_status: "US Citizen",
    experience_years: 8,
    location: "Reston, VA",
    availability: "two_weeks",
    status: "submitted",
    min_rate: 90,
    max_rate: 115,
    currency: "USD",
    ats_score: 95,
    summary:
      "Certified AWS Security Specialist focused on zero-trust architecture, automated threat detection, and compliance frameworks.",
    skills_matrix: [
      {
        category: "Security",
        items: ["AWS Security (9/10)", "IAM (10/10)", "SOC2 Compliance (9/10)"],
      },
    ],
    created_at: "2026-01-28T10:45:00Z",
  },
  {
    id: "cand-107",
    first_name: "Sofia",
    last_name: "Álvarez",
    email: "sofia.a@techbench.io",
    phone: "+1 (555) 333-4455",
    current_title: "Senior Go / React Engineer",
    current_employer: "FinScale Tech",
    applied_role: "Golang High-Frequency Developer",
    client_name: "Vertex Financial Group",
    primary_technology: "Go",
    skills: ["Golang", "React", "gRPC", "Docker", "PostgreSQL"],
    visa_status: "Green Card",
    experience_years: 7,
    location: "Boston, MA",
    availability: "immediate",
    status: "active",
    min_rate: 85,
    max_rate: 110,
    currency: "USD",
    ats_score: 91,
    summary:
      "High-concurrency systems engineer building ultra-low latency gRPC services in Go combined with responsive React dashboards.",
    skills_matrix: [
      { category: "Systems", items: ["Golang (9/10)", "gRPC (8/10)", "PostgreSQL (8/10)"] },
    ],
    created_at: "2026-02-01T12:00:00Z",
  },
  {
    id: "cand-108",
    first_name: "Kenji",
    last_name: "Watanabe",
    email: "kenji.w@consultantbench.com",
    phone: "+1 (555) 444-5566",
    current_title: "Lead Backend Developer",
    current_employer: "PayTech Systems",
    applied_role: "Python FastAPI Microservices Engineer",
    client_name: "PayEdge Global",
    primary_technology: "Python",
    skills: ["Python", "FastAPI", "Redis", "Celery", "PostgreSQL"],
    visa_status: "H1B",
    experience_years: 9,
    location: "Charlotte, NC",
    availability: "immediate",
    status: "placed",
    min_rate: 80,
    max_rate: 95,
    currency: "USD",
    ats_score: 93,
    summary:
      "Python backend maestro specializing in distributed payment transaction queues, Redis caching, and asynchronous API design.",
    skills_matrix: [
      { category: "Backend", items: ["Python (9/10)", "FastAPI (9/10)", "Redis (8/10)"] },
    ],
    created_at: "2026-02-03T15:30:00Z",
  },
];

// Dynamically generate remaining candidates up to 80 to form a high-density candidate pool
const TECH_POOLS = [
  {
    title: "Senior React / Next.js Developer",
    tech: "React",
    skills: ["React", "Next.js", "TypeScript", "TailwindCSS"],
    exp: 6,
    visa: "H1B",
    loc: "San Francisco, CA",
  },
  {
    title: "Lead Python / Django Architect",
    tech: "Python",
    skills: ["Python", "Django", "PostgreSQL", "Docker"],
    exp: 11,
    visa: "US Citizen",
    loc: "Denver, CO",
  },
  {
    title: "DevOps & Cloud Engineer",
    tech: "AWS",
    skills: ["AWS", "Terraform", "CI/CD", "Kubernetes"],
    exp: 7,
    visa: "Green Card",
    loc: "Austin, TX",
  },
  {
    title: "Senior Java / Spring Developer",
    tech: "Java",
    skills: ["Java 17", "Spring Boot", "Kafka", "Microservices"],
    exp: 8,
    visa: "H1B",
    loc: "New York, NY",
  },
  {
    title: "Data Engineer (Snowflake & Airflow)",
    tech: "Snowflake",
    skills: ["Snowflake", "dbt", "Airflow", "Python"],
    exp: 6,
    visa: "OPT-STEM",
    loc: "Chicago, IL",
  },
  {
    title: "Senior iOS Engineer (Swift)",
    tech: "Swift",
    skills: ["Swift", "SwiftUI", "iOS SDK", "REST APIs"],
    exp: 7,
    visa: "US Citizen",
    loc: "Los Angeles, CA",
  },
  {
    title: "Full Stack Engineer (Node & React)",
    tech: "Node.js",
    skills: ["Node.js", "React", "TypeScript", "MongoDB"],
    exp: 5,
    visa: "H1B",
    loc: "Seattle, WA",
  },
  {
    title: "Machine Learning Engineer",
    tech: "PyTorch",
    skills: ["PyTorch", "TensorFlow", "Scikit-Learn", "Python"],
    exp: 6,
    visa: "Green Card",
    loc: "Boston, MA",
  },
];

const NAMES_FIRST = [
  "Michael",
  "Jessica",
  "James",
  "Emily",
  "Robert",
  "Samantha",
  "Daniel",
  "Ashley",
  "Christopher",
  "Sarah",
  "Matthew",
  "Amanda",
  "Joseph",
  "Melissa",
  "Andrew",
  "Stephanie",
  "David",
  "Nicole",
  "Joshua",
  "Elizabeth",
  "John",
  "Heather",
  "Ryan",
  "Tiffany",
  "Nicholas",
  "Michelle",
  "Anthony",
  "Amber",
  "William",
  "Megan",
];
const NAMES_LAST = [
  "Smith",
  "Johnson",
  "Williams",
  "Brown",
  "Jones",
  "Garcia",
  "Miller",
  "Davis",
  "Rodriguez",
  "Martinez",
  "Hernandez",
  "Lopez",
  "Gonzalez",
  "Wilson",
  "Anderson",
  "Thomas",
  "Taylor",
  "Moore",
  "Jackson",
  "Martin",
  "Lee",
  "Perez",
  "Thompson",
  "White",
  "Harris",
  "Sanchez",
  "Clark",
  "Ramirez",
  "Lewis",
  "Robinson",
];

for (let i = 9; i <= 80; i++) {
  const f = NAMES_FIRST[(i * 3) % NAMES_FIRST.length];
  const l = NAMES_LAST[(i * 7) % NAMES_LAST.length];
  const pool = TECH_POOLS[i % TECH_POOLS.length];
  const visaChoice = ["US Citizen", "Green Card", "H1B", "OPT-STEM"][
    (i * 2) % 4
  ] as MasterCandidate["visa_status"];
  const availChoice = ["immediate", "two_weeks", "one_month"][
    (i * 5) % 3
  ] as MasterCandidate["availability"];
  const statusChoice = ["active", "submitted", "placed", "on_hold"][
    (i * 11) % 4
  ] as MasterCandidate["status"];

  MASTER_CANDIDATES.push({
    id: `cand-${100 + i}`,
    first_name: f,
    last_name: l,
    email: `${f.toLowerCase()}.${l.toLowerCase()}@benchtalent.org`,
    phone: `+1 (555) ${(100 + i).toString().padStart(3, "0")}-${(2000 + i * 15).toString().padStart(4, "0")}`,
    current_title: pool.title,
    current_employer: `${pool.tech} Dynamics Inc`,
    applied_role: pool.title,
    client_name: MASTER_CLIENTS[i % MASTER_CLIENTS.length].name,
    primary_technology: pool.tech,
    skills: pool.skills,
    visa_status: visaChoice,
    experience_years: pool.exp + (i % 5),
    location: pool.loc,
    availability: availChoice,
    status: statusChoice,
    min_rate: 65 + (i % 35),
    max_rate: 85 + (i % 45),
    currency: "USD",
    ats_score: 78 + (i % 21),
    summary: `Accomplished ${pool.title} with over ${pool.exp + (i % 5)} years of engineering expertise in scalable cloud architectures and enterprise software delivery.`,
    skills_matrix: [{ category: "Primary", items: pool.skills.map((s) => `${s} (8/10)`) }],
    created_at: new Date(Date.now() - i * 12 * 60 * 60 * 1000).toISOString(),
  });
}

// -------------------------------------------------------------
// 4. Requisitions / Requirements (50)
// -------------------------------------------------------------
export const MASTER_REQUISITIONS: MasterRequisition[] = [
  {
    id: "req-101",
    title: "Senior Full Stack React / Node Engineer",
    skills: ["React", "Node.js", "TypeScript", "PostgreSQL", "TailwindCSS"],
    secondary_skills: ["AWS", "Docker", "GraphQL"],
    vendor_id: "vn-1",
    vendor_name: "Apex Global Staffing",
    vendor_email: "account@apexstaffing.io",
    vendor_contact: "+1 (555) 234-8901",
    client_id: "cl-1",
    client_name: "FinTech Solutions LLC",
    location: "New York, NY",
    work_mode: "hybrid",
    engagement_type: "Corp-to-Corp (C2C)",
    duration: "12 Months",
    visa_required: "H1B, GC, USC",
    rate_min: 75,
    rate_max: 95,
    rate_type: "hourly",
    currency: "USD",
    status: "open",
    priority: "urgent",
    min_experience: "7+ Years",
    certifications: "AWS Certified Developer",
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    start_date: "Immediate (Within 2 weeks)",
    description:
      "We are seeking a seasoned Senior Full Stack Engineer to lead front-end architecture and high-throughput Node.js microservices for our core banking platform.",
  },
  {
    id: "req-102",
    title: "Lead DevOps / Platform Architect",
    skills: ["Kubernetes", "Terraform", "AWS", "CI/CD", "Helm"],
    secondary_skills: ["Python", "Prometheus", "ArgoCD"],
    vendor_id: "vn-2",
    vendor_name: "Vanguard Tech Partners",
    vendor_email: "vanguard@techpartners.com",
    vendor_contact: "+1 (555) 876-5432",
    client_id: "cl-2",
    client_name: "HealthScale Digital",
    location: "Austin, TX",
    work_mode: "remote",
    engagement_type: "W2 Contract",
    duration: "6 Months+",
    visa_required: "US Citizen, Green Card",
    rate_min: 90,
    rate_max: 110,
    rate_type: "hourly",
    currency: "USD",
    status: "open",
    priority: "high",
    min_experience: "8+ Years",
    certifications: "CKA, AWS Solutions Architect",
    created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    start_date: "Immediate",
    description:
      "Looking for an expert Cloud Platform Architect to manage our EKS Kubernetes clusters and transition existing infrastructure to GitOps with ArgoCD.",
  },
  {
    id: "req-103",
    title: "Lead Data Engineer (PySpark / Snowflake)",
    skills: ["PySpark", "Snowflake", "dbt", "Airflow", "Python"],
    secondary_skills: ["AWS S3", "Kafka", "SQL"],
    vendor_id: "vn-3",
    vendor_name: "Quantum Talent Group",
    vendor_email: "info@quantumtalent.io",
    vendor_contact: "+1 (555) 765-4321",
    client_id: "cl-3",
    client_name: "RetailGenius Inc.",
    location: "Chicago, IL",
    work_mode: "onsite",
    engagement_type: "Corp-to-Corp (C2C)",
    duration: "12 Months",
    visa_required: "H1B, GC, USC",
    rate_min: 85,
    rate_max: 105,
    rate_type: "hourly",
    currency: "USD",
    status: "open",
    priority: "urgent",
    min_experience: "7+ Years",
    certifications: "Snowflake SnowPro Core",
    created_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    start_date: "10 Days",
    description:
      "Architect and implement enterprise real-time data pipelines using PySpark and Snowflake data warehousing for high-frequency retail transactions.",
  },
];

// Dynamically generate remaining requisitions up to 50
const REQ_TEMPLATES = [
  {
    title: "Senior AI & LLM Integration Engineer",
    tech: "Python",
    skills: ["Python", "FastAPI", "PyTorch", "LangChain"],
    rateMin: 95,
    rateMax: 125,
    priority: "urgent" as const,
  },
  {
    title: "Cloud Security Architect (AWS / IAM)",
    tech: "AWS",
    skills: ["AWS", "IAM", "Terraform", "GuardDuty"],
    rateMin: 90,
    rateMax: 115,
    priority: "high" as const,
  },
  {
    title: "Python FastAPI Microservices Engineer",
    tech: "Python",
    skills: ["Python", "FastAPI", "Redis", "PostgreSQL"],
    rateMin: 75,
    rateMax: 95,
    priority: "medium" as const,
  },
  {
    title: "Senior React Native Mobile Developer",
    tech: "React Native",
    skills: ["React Native", "TypeScript", "iOS", "Android"],
    rateMin: 80,
    rateMax: 100,
    priority: "urgent" as const,
  },
  {
    title: "Golang High-Frequency Developer",
    tech: "Go",
    skills: ["Golang", "gRPC", "Docker", "PostgreSQL"],
    rateMin: 95,
    rateMax: 120,
    priority: "high" as const,
  },
  {
    title: "Data Platform & Airflow Architect",
    tech: "Airflow",
    skills: ["Airflow", "Python", "Snowflake", "BigQuery"],
    rateMin: 85,
    rateMax: 105,
    priority: "medium" as const,
  },
];

for (let i = 4; i <= 50; i++) {
  const template = REQ_TEMPLATES[i % REQ_TEMPLATES.length];
  const client = MASTER_CLIENTS[i % MASTER_CLIENTS.length];
  const vendor = MASTER_VENDORS[i % MASTER_VENDORS.length];
  const modeChoice = ["remote", "hybrid", "onsite"][i % 3] as MasterRequisition["work_mode"];

  // Open status predominantly, with only Closed and Expired rarely at the bottom of the table
  let statusChoice: MasterRequisition["status"] = "open";
  if (i === 49) statusChoice = "closed";
  if (i === 50) statusChoice = "expired";

  MASTER_REQUISITIONS.push({
    id: `req-${100 + i}`,
    title: `${template.title}`,
    skills: template.skills,
    secondary_skills: ["Docker", "Git", "REST APIs", "CI/CD"],
    vendor_id: vendor.id,
    vendor_name: vendor.name,
    vendor_email: vendor.contact_email,
    vendor_contact: vendor.contact_phone,
    client_id: client.id,
    client_name: client.name,
    location: `${client.city}, ${client.state}`,
    work_mode: modeChoice,
    engagement_type: "Corp-to-Corp (C2C)",
    duration: "12 Months",
    visa_required: "H1B, Green Card, US Citizen",
    rate_min: template.rateMin,
    rate_max: template.rateMax,
    rate_type: "hourly",
    currency: "USD",
    status: statusChoice,
    priority: template.priority,
    min_experience: "5+ Years",
    certifications: `Certified ${template.tech} Specialist`,
    created_at: new Date(Date.now() - i * 14 * 60 * 60 * 1000).toISOString(),
    start_date: "Within 2 Weeks",
    description: `We are looking for a key ${template.title} to join ${client.name} and spearhead major architecture deliverables for mission-critical client projects.`,
  });
}

// -------------------------------------------------------------
// 5. Submissions (60)
// -------------------------------------------------------------
export const MASTER_SUBMISSIONS: MasterSubmission[] = [
  {
    id: "sub-101",
    candidate_id: "cand-101",
    candidate_name: "Alex Vance",
    candidate_email: "alex.vance@techbench.io",
    requirement_id: "req-101",
    role: "Senior Full Stack React / Node Engineer",
    client_id: "cl-1",
    client: "FinTech Solutions LLC",
    stage: "Submitted",
    rate: "$85/hr",
    score: 94,
    updatedAt: "2h ago",
    submitted_by: "fixture-recruiter@example.invalid",
    created_at: "2026-03-01T10:00:00Z",
  },
  {
    id: "sub-102",
    candidate_id: "cand-102",
    candidate_name: "Priya Sharma",
    candidate_email: "priya.sharma@consultantbench.com",
    requirement_id: "req-102",
    role: "Lead DevOps / Platform Architect",
    client_id: "cl-2",
    client: "HealthScale Digital",
    stage: "Shortlisted",
    rate: "$100/hr",
    score: 96,
    updatedAt: "5h ago",
    submitted_by: "fixture-recruiter@example.invalid",
    created_at: "2026-03-02T11:30:00Z",
  },
  {
    id: "sub-103",
    candidate_id: "cand-103",
    candidate_name: "Marcus Chen",
    candidate_email: "marcus.chen@databenched.org",
    requirement_id: "req-103",
    role: "Lead Data Engineer (Spark / Snowflake)",
    client_id: "cl-3",
    client: "RetailGenius Inc.",
    stage: "Interview",
    rate: "$95/hr",
    score: 92,
    updatedAt: "1d ago",
    submitted_by: "fixture-recruiter@example.invalid",
    created_at: "2026-03-03T14:15:00Z",
  },
  {
    id: "sub-104",
    candidate_id: "cand-104",
    candidate_name: "Elena Rostova",
    candidate_email: "elena.r@devstaffing.com",
    requirement_id: "req-104",
    role: "Java Microservices Specialist",
    client_id: "cl-4",
    client: "OmniLogistics America",
    stage: "Offered",
    rate: "$80/hr",
    score: 88,
    updatedAt: "2d ago",
    submitted_by: "fixture-recruiter@example.invalid",
    created_at: "2026-03-04T09:00:00Z",
  },
  {
    id: "sub-105",
    candidate_id: "cand-105",
    candidate_name: "Arjun Mehta",
    candidate_email: "arjun.m@techbench.io",
    requirement_id: "req-105",
    role: "Senior AI & LLM Integration Engineer",
    client_id: "cl-12",
    client: "Quantum Dynamics",
    stage: "Hired",
    rate: "$110/hr",
    score: 98,
    updatedAt: "3d ago",
    submitted_by: "fixture-recruiter@example.invalid",
    created_at: "2026-03-05T16:00:00Z",
  },
  {
    id: "sub-106",
    candidate_id: "cand-106",
    candidate_name: "David Kowalski",
    candidate_email: "dkowalski@cloudtalent.org",
    requirement_id: "req-106",
    role: "Cloud Security Architect",
    client_id: "cl-8",
    client: "CyberGuard Security",
    stage: "Withdrawn",
    rate: "$100/hr",
    score: 95,
    updatedAt: "4d ago",
    submitted_by: "fixture-recruiter@example.invalid",
    created_at: "2026-03-06T10:45:00Z",
  },
];

const STAGE_CYCLE = [
  "Submitted",
  "Shortlisted",
  "Interview",
  "Offered",
  "Hired",
  "Withdrawn",
] as const;

for (let i = 7; i <= 60; i++) {
  const candidate = MASTER_CANDIDATES[i % MASTER_CANDIDATES.length];
  const req = MASTER_REQUISITIONS[i % MASTER_REQUISITIONS.length];
  const stage = STAGE_CYCLE[i % STAGE_CYCLE.length];

  MASTER_SUBMISSIONS.push({
    id: `sub-${100 + i}`,
    candidate_id: candidate.id,
    candidate_name: `${candidate.first_name} ${candidate.last_name}`,
    candidate_email: candidate.email,
    requirement_id: req.id,
    role: req.title,
    client_id: req.client_id,
    client: req.client_name,
    stage: stage,
    rate: `$${candidate.max_rate}/hr`,
    score: candidate.ats_score,
    updatedAt: `${(i % 12) + 1}h ago`,
    submitted_by: "fixture-recruiter@example.invalid",
    created_at: new Date(Date.now() - i * 8 * 60 * 60 * 1000).toISOString(),
  });
}

// -------------------------------------------------------------
// 6. Interviews (30)
// -------------------------------------------------------------
export const MASTER_INTERVIEWS: MasterInterview[] = [
  {
    id: "int-101",
    submission_id: "sub-102",
    candidate_name: "Priya Sharma",
    role: "Lead DevOps Architect",
    client_name: "HealthScale Digital",
    round: "Technical Round 1",
    interviewer_name: "Dr. Robert Miller",
    interviewer_email: "rmiller@healthscale.digital",
    scheduled_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    duration_minutes: 60,
    outcome: "scheduled",
    feedback: "Technical deep-dive on EKS and Terraform scripts.",
  },
  {
    id: "int-102",
    submission_id: "sub-103",
    candidate_name: "Marcus Chen",
    role: "Lead Data Engineer",
    client_name: "RetailGenius Inc.",
    round: "System Design",
    interviewer_name: "Amanda Watson",
    interviewer_email: "awatson@retailgenius.com",
    scheduled_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    duration_minutes: 45,
    outcome: "scheduled",
    feedback: "Snowflake data modeling and streaming architecture.",
  },
  {
    id: "int-103",
    submission_id: "sub-104",
    candidate_name: "Elena Rostova",
    role: "Java Microservices Specialist",
    client_name: "OmniLogistics America",
    round: "Client Manager",
    interviewer_name: "David Vance",
    interviewer_email: "dvance@omnilogistics.com",
    scheduled_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    duration_minutes: 45,
    outcome: "passed",
    feedback: "Strong technical knowledge, passed to offer round.",
  },
];

for (let i = 4; i <= 30; i++) {
  const sub = MASTER_SUBMISSIONS[i % MASTER_SUBMISSIONS.length];
  const roundChoice = [
    "Technical Round 1",
    "System Design",
    "Client Manager",
    "Executive Culture Fit",
  ][i % 4] as MasterInterview["round"];
  const outcomeChoice = ["scheduled", "passed", "completed", "pending"][
    i % 4
  ] as MasterInterview["outcome"];

  MASTER_INTERVIEWS.push({
    id: `int-${100 + i}`,
    submission_id: sub.id,
    candidate_name: sub.candidate_name,
    role: sub.role,
    client_name: sub.client,
    round: roundChoice,
    interviewer_name: "Hiring Manager",
    interviewer_email: "manager@clienttech.io",
    scheduled_at: new Date(Date.now() + ((i % 5) - 2) * 24 * 60 * 60 * 1000).toISOString(),
    duration_minutes: 60,
    outcome: outcomeChoice,
    feedback: "Candidate demonstrated solid domain understanding and clear communication.",
  });
}

// -------------------------------------------------------------
// 7. Placements (20)
// -------------------------------------------------------------
export const MASTER_PLACEMENTS: MasterPlacement[] = [
  {
    id: "plc-101",
    candidate_name: "Arjun Mehta",
    role: "Senior AI Software Engineer",
    client_name: "Quantum Dynamics",
    vendor_name: "Apex Global Staffing",
    bill_rate: 130,
    pay_rate: 95,
    margin: 35,
    start_date: "2026-03-01",
    end_date: "2027-02-28",
    status: "active",
  },
  {
    id: "plc-102",
    candidate_name: "Kenji Watanabe",
    role: "Senior Backend Engineer",
    client_name: "Vertex Financial Group",
    vendor_name: "Vanguard Tech Partners",
    bill_rate: 120,
    pay_rate: 90,
    margin: 30,
    start_date: "2026-02-15",
    end_date: "2027-02-14",
    status: "active",
  },
  {
    id: "plc-103",
    candidate_name: "Elena Rostova",
    role: "Java Developer",
    client_name: "OmniLogistics America",
    vendor_name: "TEKsystems Inc.",
    bill_rate: 105,
    pay_rate: 78,
    margin: 27,
    start_date: "2026-02-01",
    end_date: "2026-12-31",
    status: "active",
  },
];

for (let i = 4; i <= 20; i++) {
  const cand = MASTER_CANDIDATES[i % MASTER_CANDIDATES.length];
  const client = MASTER_CLIENTS[i % MASTER_CLIENTS.length];
  const vendor = MASTER_VENDORS[i % MASTER_VENDORS.length];
  const bill = 100 + i * 3;
  const pay = 75 + i * 2;

  MASTER_PLACEMENTS.push({
    id: `plc-${100 + i}`,
    candidate_name: `${cand.first_name} ${cand.last_name}`,
    role: cand.applied_role,
    client_name: client.name,
    vendor_name: vendor.name,
    bill_rate: bill,
    pay_rate: pay,
    margin: bill - pay,
    start_date: "2026-01-15",
    end_date: "2026-12-31",
    status: i % 5 === 0 ? "completed" : "active",
  });
}

export const MASTER_AUDIT_LOGS: MasterAuditLog[] = [
  {
    id: "aud-101",
    action: "requisition.created",
    actor_email: "fixture-recruiter@example.invalid",
    entity_type: "requisition",
    entity_id: "req-101",
    created_at: new Date(Date.now() - 37 * 60 * 1000).toISOString(),
    metadata: {
      title: "Created Job Requisition",
      description: "IT Business Analyst (Healthcare Data Analytics) for Nukasani Group Inc",
    },
  },
  {
    id: "aud-102",
    action: "submission.created",
    actor_email: "fixture-recruiter@example.invalid",
    entity_type: "submission",
    entity_id: "sub-101",
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    metadata: {
      title: "Submitted Candidate to Role",
      description: "Alex Vance submitted to Senior React / Node Engineer (FinTech Solutions LLC)",
    },
  },
  {
    id: "aud-103",
    action: "bench.matched",
    actor_email: "fixture-recruiter@example.invalid",
    entity_type: "bench_matching",
    entity_id: "cand-102",
    created_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    metadata: {
      title: "Ran AI Bench Match",
      description:
        "Top candidate match (96% fit) calculated for Priya Sharma (Staff DevOps Architect)",
    },
  },
  {
    id: "aud-104",
    action: "resume.tailored",
    actor_email: "fixture-recruiter@example.invalid",
    entity_type: "tailoring",
    entity_id: "cand-105",
    created_at: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
    metadata: {
      title: "Tailored Candidate Resume",
      description:
        "Generated tailored resume & formatted CV for Marcus Brody (Cloud DevOps Architect)",
    },
  },
  {
    id: "aud-105",
    action: "interview.scheduled",
    actor_email: "fixture-recruiter@example.invalid",
    entity_type: "interview",
    entity_id: "int-101",
    created_at: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
    metadata: {
      title: "Scheduled Client Interview",
      description: "Technical Round 1 scheduled for Alex Vance with FinTech Solutions LLC",
    },
  },
];

const AUDIT_VARIATIONS = [
  {
    action: "requisition.created",
    entity_type: "requisition",
    title: "Created Job Requisition",
    desc: "Senior Java Microservices Architect for HealthScale Digital",
  },
  {
    action: "submission.created",
    entity_type: "submission",
    title: "Submitted Candidate to Role",
    desc: "David Miller submitted for Lead Cloud Infrastructure Engineer (CloudScale Systems)",
  },
  {
    action: "bench.matched",
    entity_type: "bench_matching",
    title: "Ran AI Bench Match",
    desc: "AI matching executed for Healthcare Data Analytics Requisition",
  },
  {
    action: "resume.tailored",
    entity_type: "tailoring",
    title: "Tailored Candidate Resume",
    desc: "Tailored resume for Sarah Jenkins matching FinTech Solutions requirements",
  },
  {
    action: "interview.scheduled",
    entity_type: "interview",
    title: "Scheduled Client Interview",
    desc: "Client Manager Round scheduled for Marcus Brody with Vertex Financial Group",
  },
  {
    action: "candidate.created",
    entity_type: "candidate",
    title: "Added Candidate to Bench",
    desc: "Registered new candidate Elena Rostova (Staff Data Engineer - Green Card)",
  },
  {
    action: "placement.confirmed",
    entity_type: "placement",
    title: "Placement Confirmed",
    desc: "Placement confirmed for Carlos Mendez as EV Embedded Systems Lead",
  },
];

for (let i = 6; i <= 40; i++) {
  const item = AUDIT_VARIATIONS[(i - 6) % AUDIT_VARIATIONS.length];
  MASTER_AUDIT_LOGS.push({
    id: `aud-${100 + i}`,
    action: item.action,
    actor_email: "fixture-recruiter@example.invalid",
    entity_type: item.entity_type,
    entity_id: `ent-${100 + i}`,
    created_at: new Date(Date.now() - (i * 2 + 12) * 60 * 60 * 1000).toISOString(),
    metadata: {
      title: item.title,
      description: item.desc,
    },
  });
}
