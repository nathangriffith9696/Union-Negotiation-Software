/**
 * Row shapes aligned with `supabase/migrations/20250323120000_union_negotiation_schema.sql`.
 * Use ISO 8601 strings for timestamps when reading from JSON/API.
 */

export type NegotiationStatus =
  | "preparing"
  | "active"
  | "tentative_agreement"
  | "ratified"
  | "closed"
  | "suspended";

export type NegotiationType = "successor" | "reopener" | "midterm" | "other";

export type SessionStatus =
  | "scheduled"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "postponed";

export type SessionFormat = "in_person" | "remote" | "hybrid";

export type ProposalStatus =
  | "draft"
  | "submitted"
  | "in_negotiation"
  | "tentative"
  | "withdrawn"
  | "settled";

export type ProposingParty = "union" | "employer" | "joint" | "other";

export type NoteType =
  | "general"
  | "caucus"
  | "minutes"
  | "legal"
  | "strategy"
  | "other";

export type NoteVisibility = "team" | "organization" | "shared_readonly";

export type DocumentType =
  | "proposal_pdf"
  | "counter_proposal"
  | "economic_model"
  | "minutes"
  | "correspondence"
  | "other";

export type DistrictRow = {
  id: string;
  name: string;
  region: string;
  code: string;
  created_at: string;
};

export type LocalRow = {
  id: string;
  district_id: string;
  name: string;
  charter_number: string;
  member_count: number;
  created_at: string;
};

export type BargainingUnitRow = {
  id: string;
  local_id: string;
  name: string;
  description: string | null;
  employer_name: string;
  created_at: string;
};

export type NegotiationRow = {
  id: string;
  bargaining_unit_id: string;
  title: string;
  status: NegotiationStatus;
  started_on: string | null;
  target_contract_effective_date: string | null;
  negotiation_type: NegotiationType;
  contract_start_date: string | null;
  contract_end_date: string | null;
  chief_spokesperson: string | null;
  employer_lead_name: string | null;
  ratified_at: string | null;
  closed_at: string | null;
  created_at: string;
};

export type SessionRow = {
  id: string;
  negotiation_id: string;
  session_number: number;
  title: string;
  scheduled_at: string;
  location: string | null;
  format: SessionFormat;
  summary: string | null;
  next_session_date: string | null;
  actual_start_at: string | null;
  actual_end_at: string | null;
  status: SessionStatus;
  created_at: string;
};

export type ProposalRow = {
  id: string;
  negotiation_id: string;
  prior_proposal_id: string | null;
  proposal_group_id: string;
  version_number: number;
  version_label: string | null;
  proposing_party: ProposingParty;
  submitted_at: string | null;
  submitted_by: string | null;
  title: string;
  category: string;
  status: ProposalStatus;
  summary: string | null;
  created_at: string;
};

export type SessionProposalRow = {
  session_id: string;
  proposal_id: string;
  created_at: string;
};

export type NoteRow = {
  id: string;
  negotiation_id: string;
  session_id: string | null;
  proposal_id: string | null;
  note_type: NoteType;
  visibility: NoteVisibility;
  author: string;
  author_user_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
};

export type DocumentRow = {
  id: string;
  negotiation_id: string;
  proposal_id: string | null;
  session_id: string | null;
  storage_path: string;
  file_name: string;
  mime_type: string;
  byte_size: number;
  uploaded_at: string;
  uploaded_by: string | null;
  document_type: DocumentType;
  created_at: string;
};

/** Insert payloads (omit DB defaults where optional). */
export type DistrictInsert = Omit<DistrictRow, "id" | "created_at"> &
  Partial<Pick<DistrictRow, "id" | "created_at">>;

export type LocalInsert = Omit<LocalRow, "id" | "created_at"> &
  Partial<Pick<LocalRow, "id" | "created_at">>;

export type BargainingUnitInsert = Omit<BargainingUnitRow, "id" | "created_at"> &
  Partial<Pick<BargainingUnitRow, "id" | "created_at">>;

export type NegotiationInsert = Omit<
  NegotiationRow,
  "id" | "created_at" | "negotiation_type"
> &
  Partial<Pick<NegotiationRow, "id" | "created_at" | "negotiation_type">>;

export type SessionInsert = Omit<SessionRow, "id" | "created_at" | "format"> &
  Partial<Pick<SessionRow, "id" | "created_at" | "format">>;

export type ProposalInsert = Omit<
  ProposalRow,
  "id" | "created_at" | "proposal_group_id" | "version_number" | "proposing_party"
> &
  Partial<
    Pick<
      ProposalRow,
      | "id"
      | "created_at"
      | "proposal_group_id"
      | "version_number"
      | "proposing_party"
    >
  >;

export type SessionProposalInsert = Omit<SessionProposalRow, "created_at"> &
  Partial<Pick<SessionProposalRow, "created_at">>;

export type NoteInsert = Omit<
  NoteRow,
  "id" | "created_at" | "updated_at" | "note_type" | "visibility"
> &
  Partial<
    Pick<
      NoteRow,
      "id" | "created_at" | "updated_at" | "note_type" | "visibility"
    >
  >;

export type DocumentInsert = Omit<
  DocumentRow,
  "id" | "created_at" | "uploaded_at" | "uploaded_by"
> &
  Partial<
    Pick<DocumentRow, "id" | "created_at" | "uploaded_at" | "uploaded_by">
  >;

/** Partial updates by primary key. */
export type DistrictUpdate = Partial<Omit<DistrictRow, "id" | "created_at">>;
export type LocalUpdate = Partial<Omit<LocalRow, "id" | "created_at">>;
export type BargainingUnitUpdate = Partial<
  Omit<BargainingUnitRow, "id" | "created_at">
>;
export type NegotiationUpdate = Partial<
  Omit<NegotiationRow, "id" | "created_at">
>;
export type SessionUpdate = Partial<Omit<SessionRow, "id" | "created_at">>;
export type ProposalUpdate = Partial<Omit<ProposalRow, "id" | "created_at">>;
export type NoteUpdate = Partial<
  Omit<NoteRow, "id" | "created_at">
>;
export type DocumentUpdate = Partial<
  Omit<DocumentRow, "id" | "created_at" | "uploaded_at">
>;

/** Composite PK (session_id, proposal_id) must not change; use delete + insert to relink. */
export type SessionProposalUpdate = Partial<
  Omit<SessionProposalRow, "session_id" | "proposal_id">
>;

/**
 * Supabase-style database map (handy for clients and generated query helpers).
 */
export type UnionNegotiationDatabase = {
  public: {
    Tables: {
      districts: { Row: DistrictRow; Insert: DistrictInsert; Update: DistrictUpdate };
      locals: { Row: LocalRow; Insert: LocalInsert; Update: LocalUpdate };
      bargaining_units: {
        Row: BargainingUnitRow;
        Insert: BargainingUnitInsert;
        Update: BargainingUnitUpdate;
      };
      negotiations: {
        Row: NegotiationRow;
        Insert: NegotiationInsert;
        Update: NegotiationUpdate;
      };
      sessions: { Row: SessionRow; Insert: SessionInsert; Update: SessionUpdate };
      proposals: {
        Row: ProposalRow;
        Insert: ProposalInsert;
        Update: ProposalUpdate;
      };
      session_proposals: {
        Row: SessionProposalRow;
        Insert: SessionProposalInsert;
        Update: SessionProposalUpdate;
      };
      notes: { Row: NoteRow; Insert: NoteInsert; Update: NoteUpdate };
      documents: {
        Row: DocumentRow;
        Insert: DocumentInsert;
        Update: DocumentUpdate;
      };
    };
  };
};

/** Alias for `createClient<Database>()` from `@supabase/supabase-js`. */
export type Database = UnionNegotiationDatabase;
