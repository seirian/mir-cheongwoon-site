-- Applied via four songbook_existing_admin_* policy migrations.
-- This changes only the production songbook write predicates. No account grants/data changes.
BEGIN;
ALTER POLICY sb_prod_entries_insert ON public.songbook_entries WITH CHECK (EXISTS (SELECT 1 FROM public.admins WHERE user_id = (SELECT auth.uid())));
ALTER POLICY sb_prod_entries_update ON public.songbook_entries USING (EXISTS (SELECT 1 FROM public.admins WHERE user_id = (SELECT auth.uid()))) WITH CHECK (EXISTS (SELECT 1 FROM public.admins WHERE user_id = (SELECT auth.uid())));
ALTER POLICY sb_prod_ratings_insert ON public.songbook_ratings WITH CHECK (EXISTS (SELECT 1 FROM public.admins WHERE user_id = (SELECT auth.uid())));
ALTER POLICY sb_prod_ratings_update ON public.songbook_ratings USING (EXISTS (SELECT 1 FROM public.admins WHERE user_id = (SELECT auth.uid()))) WITH CHECK (EXISTS (SELECT 1 FROM public.admins WHERE user_id = (SELECT auth.uid())));
COMMIT;
