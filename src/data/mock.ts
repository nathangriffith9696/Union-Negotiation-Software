import type {
  BargainingSession,
  BargainingUnit,
  District,
  Local,
  Note,
  Proposal,
} from "@/types/models";

export const districts: District[] = [
  {
    id: "d-1",
    name: "North Central Education District",
    region: "North Central",
    code: "NC-ED",
  },
  {
    id: "d-2",
    name: "Metro Transit District",
    region: "Urban Core",
    code: "MT-D1",
  },
  {
    id: "d-3",
    name: "Riverside Healthcare District",
    region: "South Valley",
    code: "RH-D3",
  },
];

export const locals: Local[] = [
  {
    id: "l-1",
    districtId: "d-1",
    name: "Local 412 — Education Workers",
    charterNumber: "CH-412",
    memberCount: 1840,
  },
  {
    id: "l-2",
    districtId: "d-1",
    name: "Local 418 — Support Staff",
    charterNumber: "CH-418",
    memberCount: 620,
  },
  {
    id: "l-3",
    districtId: "d-2",
    name: "Local 901 — Transit Operators",
    charterNumber: "CH-901",
    memberCount: 2400,
  },
  {
    id: "l-4",
    districtId: "d-3",
    name: "Local 220 — Clinical & Technical",
    charterNumber: "CH-220",
    memberCount: 980,
  },
];

/** UI mock for negotiations list (IDs are not UUIDs; Supabase uses real UUIDs). */
export const negotiationsMock = [
  {
    id: "neg-1",
    bargainingUnitId: "bu-1",
    title: "2025–2028 successor agreement — Teachers Unit",
    status: "active" as const,
    negotiationType: "successor" as const,
    startedOn: "2025-01-15",
    targetContractEffectiveDate: "2025-07-01",
  },
  {
    id: "neg-2",
    bargainingUnitId: "bu-3",
    title: "Transit operators — safety & scheduling cycle",
    status: "active" as const,
    negotiationType: "successor" as const,
    startedOn: "2025-02-01",
    targetContractEffectiveDate: null as string | null,
  },
  {
    id: "neg-3",
    bargainingUnitId: "bu-4",
    title: "Allied Health — staffing ratios reopener",
    status: "tentative_agreement" as const,
    negotiationType: "reopener" as const,
    startedOn: "2024-11-01",
    targetContractEffectiveDate: "2025-04-01",
  },
];

export function getNegotiationById(id: string) {
  return negotiationsMock.find((n) => n.id === id);
}

/** Sessions aligned with DB shape; link to negotiationsMock (not legacy `sessions`). */
export const sessionsMockForUi = [
  {
    id: "s-2",
    negotiationId: "neg-1",
    sessionNumber: 1,
    title: "Workload & class size",
    scheduledAt: "2025-03-18T18:00:00.000Z",
    location: "Zoom",
    status: "completed" as const,
    summary:
      "Discussed class size metrics; employer requested cost study for next session." as string | null,
    nextSessionDate: "2025-04-02" as string | null,
  },
  {
    id: "s-1",
    negotiationId: "neg-1",
    sessionNumber: 2,
    title: "Economic package — opening positions",
    scheduledAt: "2025-04-02T13:00:00.000Z",
    location: "District Office — Conference Room A",
    status: "scheduled" as const,
    summary: null as string | null,
    nextSessionDate: null as string | null,
  },
  {
    id: "s-4",
    negotiationId: "neg-3",
    sessionNumber: 1,
    title: "Staffing ratios",
    scheduledAt: "2025-03-28T09:00:00.000Z",
    location: "Riverside Medical Center — HR Suite",
    status: "completed" as const,
    summary: "Tentative agreement on ratios pending legal review." as string | null,
    nextSessionDate: null as string | null,
  },
  {
    id: "s-3",
    negotiationId: "neg-2",
    sessionNumber: 1,
    title: "Safety & scheduling",
    scheduledAt: "2025-04-10T15:30:00.000Z",
    location: "MTA Union Hall",
    status: "in_progress" as const,
    summary: null as string | null,
    nextSessionDate: null as string | null,
  },
];

export const bargainingUnits: BargainingUnit[] = [
  {
    id: "bu-1",
    localId: "l-1",
    name: "Teachers Unit",
    description: "Certified instructional staff",
    employerName: "North Central School Board",
  },
  {
    id: "bu-2",
    localId: "l-2",
    name: "Paraprofessional & Clerical Unit",
    description: "Educational support and office staff",
    employerName: "North Central School Board",
  },
  {
    id: "bu-3",
    localId: "l-3",
    name: "Operators & Maintenance Unit",
    description: "Vehicle operators and shop maintenance",
    employerName: "Metro Transit Authority",
  },
  {
    id: "bu-4",
    localId: "l-4",
    name: "Allied Health Unit",
    description: "Technologists, therapists, and lab staff",
    employerName: "Riverside Health System",
  },
];

export const sessions: BargainingSession[] = [
  {
    id: "s-1",
    bargainingUnitId: "bu-1",
    title: "Economic package — opening positions",
    scheduledAt: "2025-04-02T13:00:00.000Z",
    location: "District Office — Conference Room A",
    status: "scheduled",
  },
  {
    id: "s-2",
    bargainingUnitId: "bu-1",
    title: "Workload & class size",
    scheduledAt: "2025-03-18T18:00:00.000Z",
    location: "Zoom",
    status: "completed",
  },
  {
    id: "s-3",
    bargainingUnitId: "bu-3",
    title: "Safety & scheduling",
    scheduledAt: "2025-04-10T15:30:00.000Z",
    location: "MTA Union Hall",
    status: "in_progress",
  },
  {
    id: "s-4",
    bargainingUnitId: "bu-4",
    title: "Staffing ratios",
    scheduledAt: "2025-03-28T09:00:00.000Z",
    location: "Riverside Medical Center — HR Suite",
    status: "completed",
  },
];

export const proposals: Proposal[] = [
  {
    id: "p-1",
    bargainingUnitId: "bu-1",
    sessionId: "s-2",
    title: "Reduce maximum class sizes by two students",
    category: "Workload",
    status: "in_negotiation",
    summary:
      "Phased reduction over two contract years with funding tied to state aid formulas.",
    createdAt: "2025-02-10T12:00:00.000Z",
  },
  {
    id: "p-2",
    bargainingUnitId: "bu-1",
    sessionId: "s-1",
    title: "3.5% base wage increase — Year 1",
    category: "Compensation",
    status: "submitted",
    summary: "Across-the-board increase effective first pay period after ratification.",
    createdAt: "2025-03-01T09:30:00.000Z",
  },
  {
    id: "p-3",
    bargainingUnitId: "bu-3",
    sessionId: "s-3",
    title: "Minimum rest between split shifts",
    category: "Scheduling",
    status: "draft",
    summary: "Eight-hour minimum between sign-off and next report time unless mutually waived.",
    createdAt: "2025-03-22T16:45:00.000Z",
  },
  {
    id: "p-4",
    bargainingUnitId: "bu-4",
    sessionId: "s-4",
    title: "On-call stipend for imaging modalities",
    category: "Compensation",
    status: "tentative",
    summary: "Flat stipend per on-call shift with escalation for holiday coverage.",
    createdAt: "2025-03-05T11:15:00.000Z",
  },
];

export const notes: Note[] = [
  {
    id: "n-1",
    sessionId: "s-2",
    proposalId: "p-1",
    author: "J. Rivera",
    body: "Employer requested cost study; union to provide staffing model by next session.",
    createdAt: "2025-03-18T20:10:00.000Z",
  },
  {
    id: "n-2",
    sessionId: "s-2",
    proposalId: null,
    author: "M. Chen",
    body: "Caucus after Article 12 — revisit prep time language offline.",
    createdAt: "2025-03-18T19:55:00.000Z",
  },
  {
    id: "n-3",
    sessionId: null,
    proposalId: "p-2",
    author: "A. Okonkwo",
    body: "Counter may anchor on step movement; prepare comparables packet.",
    createdAt: "2025-03-02T14:00:00.000Z",
  },
  {
    id: "n-4",
    sessionId: "s-4",
    proposalId: "p-4",
    author: "S. Patel",
    body: "Tentative agreement pending legal review of call-back definitions.",
    createdAt: "2025-03-28T12:30:00.000Z",
  },
];

export function getDistrictById(id: string) {
  return districts.find((d) => d.id === id);
}

export function getLocalById(id: string) {
  return locals.find((l) => l.id === id);
}

export function getBargainingUnitById(id: string) {
  return bargainingUnits.find((b) => b.id === id);
}
