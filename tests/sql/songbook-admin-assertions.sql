BEGIN;
-- A legacy owner/manager without the site admin grant must have no write access.
INSERT INTO public.songbook_editors(user_id,role) VALUES ('00000000-0000-4000-8000-000000000002','owner'),('00000000-0000-4000-8000-000000000003','manager');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
INSERT INTO public.songbook_entries(id,title,artist,categories,difficulty) VALUES ('mir-aabbccddeeff','CI 테스트 곡','CI 테스트 가수',ARRAY['가요'],3);
UPDATE public.songbook_entries SET difficulty=4 WHERE id='mir-aabbccddeeff';
INSERT INTO public.songbook_ratings(song_id,proficiency) VALUES ('mir-aabbccddeeff',2);
UPDATE public.songbook_ratings SET proficiency=5 WHERE song_id='mir-aabbccddeeff';
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.songbook_entries WHERE id='mir-aabbccddeeff' AND difficulty=4 AND revision=2) THEN RAISE EXCEPTION 'admin metadata failed'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.songbook_ratings WHERE song_id='mir-aabbccddeeff' AND proficiency=5 AND revision=2) THEN RAISE EXCEPTION 'admin proficiency failed'; END IF;
 BEGIN
  UPDATE public.songbook_ratings SET proficiency=6 WHERE song_id='mir-aabbccddeeff';
  RAISE EXCEPTION 'invalid star accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
DO $$ DECLARE member uuid; changed integer; BEGIN
 FOREACH member IN ARRAY ARRAY['00000000-0000-4000-8000-000000000002'::uuid,'00000000-0000-4000-8000-000000000003'::uuid,'00000000-0000-4000-8000-000000000004'::uuid] LOOP
  PERFORM set_config('request.jwt.claim.sub',member::text,true);
  PERFORM set_config('request.jwt.claims','{"user_metadata":{"role":"admin"}}',true);
  BEGIN
   INSERT INTO public.songbook_entries(id,title,artist,categories) VALUES ('mir-bbccddeeff00','CI 거절','CI',ARRAY['가요']);
   RAISE EXCEPTION 'nonadmin metadata insertion accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
   INSERT INTO public.songbook_ratings(song_id,proficiency) VALUES ('mir-bbccddeeff00',4);
   RAISE EXCEPTION 'nonadmin rating accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE public.songbook_entries SET difficulty=1 WHERE id='mir-aabbccddeeff';
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>0 THEN RAISE EXCEPTION 'nonadmin metadata update accepted'; END IF;
  UPDATE public.songbook_ratings SET proficiency=1 WHERE song_id='mir-aabbccddeeff';
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>0 THEN RAISE EXCEPTION 'nonadmin rating update accepted'; END IF;
 END LOOP;
END $$;
RESET ROLE;
DELETE FROM public.admins WHERE user_id='00000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
DO $$ DECLARE changed integer; BEGIN
 UPDATE public.songbook_ratings SET proficiency=1 WHERE song_id='mir-aabbccddeeff';
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>0 THEN RAISE EXCEPTION 'revoked admin can still write'; END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.songbook_entries)<>1 THEN RAISE EXCEPTION 'public read failed'; END IF;
 BEGIN
  INSERT INTO public.songbook_ratings(song_id,proficiency) VALUES ('mir-bbccddeeff00',3);
  RAISE EXCEPTION 'anonymous write accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS: site admin only; metadata and proficiency; legacy roles denied; revoked admin denied; public read and anonymous write protection; test data rolled back' AS result;
