-- Ephemeral CI database only: no external credentials or real user data.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
CREATE TABLE public.admins (user_id uuid PRIMARY KEY REFERENCES auth.users(id));
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.admins TO authenticated;
CREATE POLICY own_admin_flag ON public.admins FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
INSERT INTO auth.users VALUES ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002'),('00000000-0000-4000-8000-000000000003'),('00000000-0000-4000-8000-000000000004');
INSERT INTO public.admins VALUES ('00000000-0000-4000-8000-000000000001');
