export type District = {
  id: string;
  name: string;
  region: string;
  code: string;
};

export type Local = {
  id: string;
  districtId: string;
  name: string;
  charterNumber: string;
  memberCount: number;
};

export type BargainingUnit = {
  id: string;
  localId: string;
  name: string;
  description: string;
  employerName: string;
};

export type ProposalStatus =
  | "draft"
  | "submitted"
  | "in_negotiation"
  | "tentative"
  | "settled"
  | "withdrawn";

export type Proposal = {
  id: string;
  bargainingUnitId: string;
  sessionId: string | null;
  title: string;
  category: string;
  status: ProposalStatus;
  summary: string;
  createdAt: string;
};

export type SessionStatus = "scheduled" | "in_progress" | "completed" | "cancelled";

export type BargainingSession = {
  id: string;
  bargainingUnitId: string;
  title: string;
  scheduledAt: string;
  location: string;
  status: SessionStatus;
};

export type Note = {
  id: string;
  sessionId: string | null;
  proposalId: string | null;
  author: string;
  body: string;
  createdAt: string;
};
