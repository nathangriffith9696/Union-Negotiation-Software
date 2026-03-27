-- Optional Row Level Security: draft-only DELETE on proposals.
-- PostgreSQL applies policies only when RLS is enabled on the table
-- (ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY).
-- If you enable RLS, add matching SELECT / INSERT / UPDATE policies for your roles
-- (anon, authenticated, or custom JWT claims); otherwise the app cannot read or write rows.
--
-- Verify in Supabase Dashboard: Table Editor → proposals → Policies,
-- or run: select schemaname, tablename, policyname, cmd, roles from pg_policies where tablename = 'proposals';

DROP POLICY IF EXISTS "proposals_delete_draft_only" ON public.proposals;

CREATE POLICY "proposals_delete_draft_only"
ON public.proposals
FOR DELETE
USING (status = 'draft');
