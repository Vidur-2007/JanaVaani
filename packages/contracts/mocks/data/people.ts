import type { DeepLang, DepartmentId, Officer, Role } from '../../src/types';
import { WARDS } from './wards';

export interface MockProfile {
  id: string;
  role: Role;
  name: string;
  email: string;
  preferred_language: DeepLang;
  department_id?: DepartmentId;
  persona_en: string;
}

export const DEMO_PASSWORD = 'Demo@2026';

// Master spec §14 — the 7 demo accounts.
export const DEMO_USERS: MockProfile[] = [
  {
    id: 'u-lakshmi',
    role: 'citizen',
    name: 'Lakshmi Devi',
    email: 'lakshmi@janavaani.test',
    preferred_language: 'te',
    persona_en: 'Citizen · Kukatpally · prefers Telugu',
  },
  {
    id: 'u-imran',
    role: 'citizen',
    name: 'Imran Khan',
    email: 'imran@janavaani.test',
    preferred_language: 'ur',
    persona_en: 'Citizen · Charminar · prefers Urdu',
  },
  {
    id: 'u-ravi',
    role: 'officer',
    name: 'Ravi Kumar',
    email: 'ravi.roads@janavaani.test',
    preferred_language: 'en',
    department_id: 'roads',
    persona_en: 'AE Roads · Kukatpally + Serilingampally',
  },
  {
    id: 'u-sunitha',
    role: 'officer',
    name: 'Sunitha Reddy',
    email: 'sunitha.electrical@janavaani.test',
    preferred_language: 'en',
    department_id: 'streetlights',
    persona_en: 'AE Electrical · streetlights + power liaison',
  },
  {
    id: 'u-farhan',
    role: 'officer',
    name: 'Farhan Ali',
    email: 'farhan.water@janavaani.test',
    preferred_language: 'en',
    department_id: 'water',
    persona_en: 'Manager Water Supply · Charminar zone',
  },
  {
    id: 'u-supervisor',
    role: 'supervisor',
    name: 'Deputy Commissioner',
    email: 'supervisor@janavaani.test',
    preferred_language: 'en',
    persona_en: 'Supervisor · all departments',
  },
  {
    id: 'u-admin',
    role: 'admin',
    name: "Commissioner's Office",
    email: 'admin@janavaani.test',
    preferred_language: 'en',
    persona_en: 'Admin · city-wide',
  },
];

export const GUEST_PROFILE: MockProfile = {
  id: 'u-guest',
  role: 'guest',
  name: 'Guest',
  email: '',
  preferred_language: 'en',
  persona_en: 'Guest · no account',
};

const wardsInZones = (...zones: string[]) => WARDS.filter((w) => zones.includes(w.zone)).map((w) => w.id);
const ALL = WARDS.map((w) => w.id);

// Demo officers are real Officer records; other departments get one officer each.
export const OFFICERS: Officer[] = [
  {
    id: 'o-ravi',
    name: 'Ravi Kumar',
    designation: 'Assistant Engineer, Roads',
    department_id: 'roads',
    ward_ids: wardsInZones('Kukatpally', 'Serilingampally'),
    office_name: 'GHMC Kukatpally Circle Office',
    office_phone: '040-00000001',
  },
  {
    id: 'o-swathi',
    name: 'Swathi Rao',
    designation: 'Assistant Engineer, Roads',
    department_id: 'roads',
    ward_ids: wardsInZones('Khairatabad', 'Secunderabad', 'Charminar', 'LB Nagar'),
    office_name: 'GHMC Khairatabad Zonal Office',
  },
  {
    id: 'o-sunitha',
    name: 'Sunitha Reddy',
    designation: 'Assistant Engineer, Electrical',
    department_id: 'streetlights',
    ward_ids: ALL,
    office_name: 'GHMC Electrical Wing, Khairatabad',
    office_phone: '040-00000002',
  },
  {
    id: 'o-prakash',
    name: 'Prakash Goud',
    designation: 'Assistant Engineer, TGSPDCL',
    department_id: 'power',
    ward_ids: ALL,
    office_name: 'TGSPDCL Section Office, Kukatpally',
  },
  {
    id: 'o-farhan',
    name: 'Farhan Ali',
    designation: 'Manager, Water Supply',
    department_id: 'water',
    ward_ids: wardsInZones('Charminar', 'LB Nagar'),
    office_name: 'HMWSSB O&M Division, Charminar',
    office_phone: '040-00000003',
  },
  {
    id: 'o-kavitha',
    name: 'Kavitha Nair',
    designation: 'Manager, Water Supply',
    department_id: 'water',
    ward_ids: wardsInZones('Serilingampally', 'Kukatpally', 'Khairatabad', 'Secunderabad'),
    office_name: 'HMWSSB O&M Division, Kukatpally',
  },
  {
    id: 'o-srinivas',
    name: 'Srinivas Yadav',
    designation: 'Sanitation Supervisor',
    department_id: 'sanitation',
    ward_ids: ALL,
    office_name: 'GHMC SWM, Zonal Office',
  },
  {
    id: 'o-mahesh',
    name: 'Mahesh Babu',
    designation: 'Assistant Engineer, Drainage',
    department_id: 'drainage',
    ward_ids: ALL,
    office_name: 'HMWSSB Sewerage Division',
  },
  {
    id: 'o-ayesha',
    name: 'Ayesha Begum',
    designation: 'Inspector, Traffic',
    department_id: 'traffic',
    ward_ids: ALL,
    office_name: 'Hyderabad Traffic Police HQ',
  },
  {
    id: 'o-ramesh',
    name: 'Dr. Ramesh Chandra',
    designation: 'Assistant Medical Officer of Health',
    department_id: 'health',
    ward_ids: ALL,
    office_name: 'GHMC Health Wing',
  },
  {
    id: 'o-padma',
    name: 'Padma Latha',
    designation: 'Mandal Education Officer',
    department_id: 'education',
    ward_ids: ALL,
    office_name: 'District Education Office, Hyderabad',
  },
  {
    id: 'o-vikram',
    name: 'Vikram Singh',
    designation: 'Town Planning Officer',
    department_id: 'town_planning',
    ward_ids: ALL,
    office_name: 'GHMC Town Planning Wing',
  },
  {
    id: 'o-review',
    name: 'Routing Desk',
    designation: 'Review Officer',
    department_id: 'other',
    ward_ids: ALL,
    office_name: 'GHMC Grievance Cell',
  },
];

/** Mock auth profile id → officer record id. */
export const OFFICER_FOR_USER: Record<string, string> = {
  'u-ravi': 'o-ravi',
  'u-sunitha': 'o-sunitha',
  'u-farhan': 'o-farhan',
};

export function pickOfficer(dept: DepartmentId, wardId: string): Officer {
  return (
    OFFICERS.find((o) => o.department_id === dept && o.ward_ids.includes(wardId)) ??
    OFFICERS.find((o) => o.department_id === dept) ??
    OFFICERS[OFFICERS.length - 1]
  );
}
