-- Union negotiation platform — core schema
-- PostgreSQL / Supabase (uses gen_random_uuid())

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.districts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  region VARCHAR(120) NOT NULL,
  code VARCHAR(32) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.locals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  district_id UUID NOT NULL REFERENCES public.districts (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  charter_number VARCHAR(64) NOT NULL,
  member_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT locals_member_count_non_negative CHECK (member_count >= 0)
);

CREATE TABLE public.bargaining_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id UUID NOT NULL REFERENCES public.locals (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  employer_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.negotiations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bargaining_unit_id UUID NOT NULL REFERENCES public.bargaining_units (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'preparing',
  started_on DATE,
  target_contract_effective_date DATE,
  negotiation_type VARCHAR(32) NOT NULL DEFAULT 'successor',
  contract_start_date DATE,
  contract_end_date DATE,
  chief_spokesperson TEXT,
  employer_lead_name TEXT,
  ratified_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT negotiations_status_check CHECK (
    status IN (
      'preparing',
      'active',
      'tentative_agreement',
      'ratified',
      'closed',
      'suspended'
    )
  ),
  CONSTRAINT negotiations_type_check CHECK (
    negotiation_type IN ('successor', 'reopener', 'midterm', 'other')
  )
);

CREATE TABLE public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  negotiation_id UUID NOT NULL REFERENCES public.negotiations (id) ON DELETE CASCADE,
  session_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  location TEXT,
  format VARCHAR(16) NOT NULL DEFAULT 'in_person',
  summary TEXT,
  next_session_date DATE,
  actual_start_at TIMESTAMPTZ,
  actual_end_at TIMESTAMPTZ,
  status VARCHAR(24) NOT NULL DEFAULT 'scheduled',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sessions_status_check CHECK (
    status IN (
      'scheduled',
      'in_progress',
      'completed',
      'cancelled',
      'postponed'
    )
  ),
  CONSTRAINT sessions_format_check CHECK (
    format IN ('in_person', 'remote', 'hybrid')
  ),
  CONSTRAINT sessions_negotiation_session_number UNIQUE (negotiation_id, session_number)
);

CREATE TABLE public.proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  negotiation_id UUID NOT NULL REFERENCES public.negotiations (id) ON DELETE CASCADE,
  prior_proposal_id UUID REFERENCES public.proposals (id) ON DELETE SET NULL,
  proposal_group_id UUID NOT NULL DEFAULT gen_random_uuid(),
  version_number INTEGER NOT NULL DEFAULT 1,
  version_label VARCHAR(32),
  proposing_party VARCHAR(16) NOT NULL DEFAULT 'union',
  submitted_at TIMESTAMPTZ,
  submitted_by UUID,
  title TEXT NOT NULL,
  category VARCHAR(120) NOT NULL DEFAULT 'general',
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT proposals_status_check CHECK (
    status IN (
      'draft',
      'submitted',
      'in_negotiation',
      'tentative',
      'withdrawn',
      'settled'
    )
  ),
  CONSTRAINT proposals_proposing_party_check CHECK (
    proposing_party IN ('union', 'employer', 'joint', 'other')
  ),
  CONSTRAINT proposals_version_number_positive CHECK (version_number >= 1)
);

-- Many-to-many: which proposals are on the agenda / discussed in a session
CREATE TABLE public.session_proposals (
  session_id UUID NOT NULL REFERENCES public.sessions (id) ON DELETE CASCADE,
  proposal_id UUID NOT NULL REFERENCES public.proposals (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, proposal_id)
);

-- Notes always sit under a negotiation; optionally scoped to a session and/or proposal
CREATE TABLE public.notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  negotiation_id UUID NOT NULL REFERENCES public.negotiations (id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.sessions (id) ON DELETE SET NULL,
  proposal_id UUID REFERENCES public.proposals (id) ON DELETE SET NULL,
  note_type VARCHAR(24) NOT NULL DEFAULT 'general',
  visibility VARCHAR(24) NOT NULL DEFAULT 'team',
  author VARCHAR(200) NOT NULL,
  author_user_id UUID,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT notes_author_not_blank CHECK (length(trim(author)) > 0),
  CONSTRAINT notes_body_not_blank CHECK (length(trim(body)) > 0),
  CONSTRAINT notes_note_type_check CHECK (
    note_type IN ('general', 'caucus', 'minutes', 'legal', 'strategy', 'other')
  ),
  CONSTRAINT notes_visibility_check CHECK (
    visibility IN ('team', 'organization', 'shared_readonly')
  )
);

-- Files in Supabase Storage; scoped to a negotiation (optional proposal/session link)
CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  negotiation_id UUID NOT NULL REFERENCES public.negotiations (id) ON DELETE CASCADE,
  proposal_id UUID REFERENCES public.proposals (id) ON DELETE SET NULL,
  session_id UUID REFERENCES public.sessions (id) ON DELETE SET NULL,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type VARCHAR(255) NOT NULL,
  byte_size BIGINT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_by UUID,
  document_type VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT documents_byte_size_non_negative CHECK (byte_size >= 0),
  CONSTRAINT documents_document_type_check CHECK (
    document_type IN (
      'proposal_pdf',
      'counter_proposal',
      'economic_model',
      'minutes',
      'correspondence',
      'other'
    )
  )
);

-- ---------------------------------------------------------------------------
-- Indexes (FK lookups & common filters)
-- ---------------------------------------------------------------------------

CREATE INDEX idx_locals_district_id ON public.locals (district_id);
CREATE INDEX idx_bargaining_units_local_id ON public.bargaining_units (local_id);
CREATE INDEX idx_negotiations_bargaining_unit_id ON public.negotiations (bargaining_unit_id);
CREATE INDEX idx_negotiations_status ON public.negotiations (status);
CREATE INDEX idx_sessions_negotiation_id ON public.sessions (negotiation_id);
CREATE INDEX idx_sessions_scheduled_at ON public.sessions (scheduled_at);
CREATE INDEX idx_proposals_negotiation_id ON public.proposals (negotiation_id);
CREATE INDEX idx_proposals_prior_proposal_id ON public.proposals (prior_proposal_id);
CREATE INDEX idx_proposals_proposal_group_id ON public.proposals (proposal_group_id);
CREATE INDEX idx_proposals_status ON public.proposals (status);
CREATE INDEX idx_session_proposals_proposal_id ON public.session_proposals (proposal_id);
CREATE INDEX idx_notes_negotiation_id ON public.notes (negotiation_id);
CREATE INDEX idx_notes_session_id ON public.notes (session_id);
CREATE INDEX idx_notes_proposal_id ON public.notes (proposal_id);
CREATE INDEX idx_documents_negotiation_id ON public.documents (negotiation_id);
CREATE INDEX idx_documents_proposal_id ON public.documents (proposal_id);
CREATE INDEX idx_documents_session_id ON public.documents (session_id);

-- ---------------------------------------------------------------------------
-- Integrity triggers (CHECK cannot reference other rows)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_session_proposals_same_negotiation ()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.sessions s
    INNER JOIN public.proposals p ON p.negotiation_id = s.negotiation_id
    WHERE s.id = NEW.session_id
      AND p.id = NEW.proposal_id
  ) THEN
    RAISE EXCEPTION 'session_proposals: session and proposal must belong to the same negotiation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_session_proposals_same_negotiation
  BEFORE INSERT OR UPDATE ON public.session_proposals
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_session_proposals_same_negotiation ();

CREATE OR REPLACE FUNCTION public.enforce_notes_negotiation_scope ()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.session_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.sessions s
      WHERE s.id = NEW.session_id
        AND s.negotiation_id = NEW.negotiation_id
    ) THEN
      RAISE EXCEPTION 'notes: session must belong to the same negotiation';
    END IF;
  END IF;

  IF NEW.proposal_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.proposals p
      WHERE p.id = NEW.proposal_id
        AND p.negotiation_id = NEW.negotiation_id
    ) THEN
      RAISE EXCEPTION 'notes: proposal must belong to the same negotiation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notes_negotiation_scope
  BEFORE INSERT OR UPDATE ON public.notes
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_notes_negotiation_scope ();

CREATE OR REPLACE FUNCTION public.enforce_prior_proposal_same_negotiation ()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.prior_proposal_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.proposals p
      WHERE p.id = NEW.prior_proposal_id
        AND p.negotiation_id = NEW.negotiation_id
    ) THEN
      RAISE EXCEPTION 'proposals: prior_proposal_id must reference a proposal in the same negotiation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prior_proposal_same_negotiation
  BEFORE INSERT OR UPDATE ON public.proposals
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_prior_proposal_same_negotiation ();

CREATE OR REPLACE FUNCTION public.enforce_documents_negotiation_scope ()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.session_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.sessions s
      WHERE s.id = NEW.session_id
        AND s.negotiation_id = NEW.negotiation_id
    ) THEN
      RAISE EXCEPTION 'documents: session must belong to the same negotiation';
    END IF;
  END IF;

  IF NEW.proposal_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.proposals p
      WHERE p.id = NEW.proposal_id
        AND p.negotiation_id = NEW.negotiation_id
    ) THEN
      RAISE EXCEPTION 'documents: proposal must belong to the same negotiation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_documents_negotiation_scope
  BEFORE INSERT OR UPDATE ON public.documents
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_documents_negotiation_scope ();

-- Optional: comments for Supabase / codegen
COMMENT ON TABLE public.districts IS 'Top-level geographic or administrative districts.';
COMMENT ON TABLE public.locals IS 'Union locals; each belongs to one district.';
COMMENT ON TABLE public.bargaining_units IS 'Bargaining units within a local.';
COMMENT ON TABLE public.negotiations IS 'A contract negotiation cycle for one bargaining unit.';
COMMENT ON TABLE public.sessions IS 'Bargaining meetings under a negotiation.';
COMMENT ON TABLE public.proposals IS 'Contract proposals; may chain versions via prior_proposal_id.';
COMMENT ON TABLE public.session_proposals IS 'Links proposals discussed or scheduled in a session.';
COMMENT ON TABLE public.notes IS 'Negotiation notes; scoped to negotiation with optional session/proposal.';
COMMENT ON TABLE public.documents IS 'Uploaded files (e.g. Storage path); scoped to negotiation with optional proposal/session.';
