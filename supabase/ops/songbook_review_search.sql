-- Additive read-only search; no existing rows, grants on tables, or RLS policies change.
begin;
create or replace function public.songbook_review_search(
 p_decision text, p_query text default '', p_page integer default 0, p_page_size integer default 8
) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog as $$
declare terms text[]; result jsonb;
begin
 if not exists(select 1 from public.admins where user_id=(select auth.uid())) then
  raise exception 'administrator_required' using errcode='42501';
 end if;
 if p_decision is null or p_decision not in ('pending','auto','approved','rejected','excluded')
  or p_query is null or char_length(p_query)>200 or p_page is null or p_page<0 or p_page>=10000
  or p_page_size is null or p_page_size<1 or p_page_size>50 then
  raise exception 'invalid_search' using errcode='22023';
 end if;
 terms:=regexp_split_to_array(trim(regexp_replace(lower(normalize(p_query,NFKC)),'[[:space:]]+',' ','g')),' ');
 with filtered as materialized (
  select c.id,c.vod_id,c.seconds,c.approved_seconds,c.title,c.artist,c.reason,c.line,
         c.revision,c.song_id,c.decision,c.first_seen_at
  from public.songbook_timeline_candidates c
  where c.present and c.decision=p_decision
   and not exists (
    select 1 from unnest(terms) as t(term)
    where term<>'' and strpos(
     regexp_replace(lower(normalize(concat_ws(' ',c.title,c.artist,c.line,c.vod_id),NFKC)),'[[:space:]]+','','g'),term
    )=0
   )
 ), paged as (
  select * from filtered order by first_seen_at desc,id offset p_page*p_page_size limit p_page_size
 )
 select jsonb_build_object('count',(select count(*) from filtered),
  'rows',coalesce((select jsonb_agg(to_jsonb(p)-'first_seen_at' order by p.first_seen_at desc,p.id) from paged p),'[]'::jsonb)) into result;
 return result;
end $$;
revoke all on function public.songbook_review_search(text,text,integer,integer) from public,anon;
grant execute on function public.songbook_review_search(text,text,integer,integer) to authenticated;
comment on function public.songbook_review_search(text,text,integer,integer) is 'Admin-only, RLS-preserving literal keyword search across the complete review tab before pagination. No writes.';
notify pgrst, 'reload schema';
commit;
