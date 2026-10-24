-- Prepared account hard deletion via Auth Admin only; requires explicit deployment approval.
-- Keep anonymous, consolidated shared results; cascade all account-owned private data.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- A deleted administrator must not cascade-delete other participants' history.
alter table public.streak_groups drop constraint streak_groups_owner_id_fkey;
alter table public.streak_groups alter column owner_id drop not null;
alter table public.streak_groups alter column original_owner_id drop not null;
alter table public.streak_groups add constraint streak_groups_owner_id_fkey
 foreign key(owner_id) references public.profiles(id) on delete set null;
alter table public.streak_groups add constraint group_active_owner
 check(owner_id is not null or status='archived');

create function public.account_anonymize_participants(p_rows jsonb,p_user uuid) returns jsonb
language sql immutable set search_path=public,pg_temp as $$
 select case when jsonb_typeof(p_rows)='array' then coalesce((
  select jsonb_agg(case when value->>'id'=p_user::text then
   (value-array['id','nickname','avatar','frame','timezone','days'])||jsonb_build_object('id',null,'nickname','Conta excluída')
   else value end order by ordinal)
  from jsonb_array_elements(p_rows) with ordinality entries(value,ordinal)), '[]'::jsonb)
 else p_rows end;
$$;
revoke all on function public.account_anonymize_participants(jsonb,uuid) from public,anon,authenticated;

-- Reuse the existing deletion trigger and its policy of archiving current groups.
-- Run before FK cascades, while confirmations and member rows still exist.
create or replace function public.social_profile_deleted() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare person uuid;g streak_groups;c gf_challenges;
begin
 perform pg_advisory_xact_lock(607173021);
 -- Same settlement lane -> ordered accounts -> groups/challenges -> wallets.
 for person in select a.user_id from training_accounts a where a.user_id=old.id
  or exists(select 1 from group_members own join group_members other on other.group_id=own.group_id
    where own.user_id=old.id and other.user_id=a.user_id)
  or exists(select 1 from gf_challenge_members own join gf_challenge_members other on other.challenge_id=own.challenge_id
    where own.user_id=old.id and other.user_id=a.user_id)
  order by a.user_id loop
   perform 1 from training_accounts where user_id=person for update;
 end loop;
 for g in select * from streak_groups where owner_id=old.id or exists(
   select 1 from group_members m where m.group_id=streak_groups.id and m.user_id=old.id) order by id for update loop
  if not exists(select 1 from group_members where group_id=g.id and user_id<>old.id and status='accepted')
   and not exists(select 1 from gf_badge_memberships where group_id=g.id and user_id<>old.id) then
   delete from streak_groups where id=g.id;continue;
  end if;
  if g.status<>'archived' then perform arena_prepare_membership_change(g.id);end if;
  -- Freeze partial goals at their actual close using the existing close formula.
  update arena_group_cycles cycle set final_count=(
   select count(distinct(w.user_id,w.day)) from workout_days w
   where exists(select 1 from jsonb_array_elements(cycle.participants) p where (p->>'id')::uuid=w.user_id)
    and w.confirmed_at>=cycle.opened_at and w.confirmed_at<clock_timestamp()),closed_at=clock_timestamp()
   where group_id=g.id and closed_at is null;
  update streak_groups set status='archived',
   owner_id=case when owner_id=old.id then null else owner_id end,
   name=case when owner_id=old.id then 'Grupo encerrado' else name end where id=g.id;
 end loop;
 update streak_groups set original_owner_id=null where original_owner_id=old.id;
 update arena_group_cycles set participants=account_anonymize_participants(participants,old.id)
  where participants @> jsonb_build_array(jsonb_build_object('id',old.id));

 for c in select * from gf_challenges where exists(select 1 from gf_challenge_members m
   where m.challenge_id=gf_challenges.id and m.user_id=old.id) order by id for update loop
  if c.settled_at is null then
   -- Settle an already ended challenge before removing its participant.
   perform gf_settle_challenge(c.id);
   select * into strict c from gf_challenges where id=c.id;
   if c.settled_at is null then
    update gf_challenge_members set status='withdrawn',withdrawn_at=clock_timestamp()
     where challenge_id=c.id and user_id=old.id;
    if (select count(*) from gf_challenge_members where challenge_id=c.id
      and user_id is not null and user_id<>old.id and status='accepted')<2 then
     update gf_challenges set cancelled=true,settled_at=clock_timestamp(),
      cancel_reason='insufficient-participants',results='[]'::jsonb where id=c.id;
    end if;
   end if;
  end if;
 end loop;
 update gf_challenges set results=account_anonymize_participants(results,old.id)
  where results @> jsonb_build_array(jsonb_build_object('id',old.id));
 update gf_challenges set name='Desafio encerrado' where owner_id=old.id;
 update gf_challenge_members set nickname='Conta excluída',timezone=null,planned_days='{}'::date[],quota=null,accepted_at=null,withdrawn_at=null
  where user_id=old.id;
 -- Operation receipts and the private nickname hash are no longer useful for this identity.
 delete from arena_group_receipts where payload::text like '%'||old.id::text||'%';
 delete from nickname_login_attempts where identifier_hash=md5(lower(normalize(old.nickname,NFKC)));
 return old;
end $$;
revoke all on function public.social_profile_deleted() from public,anon,authenticated;

-- Keep the existing optional adminId contract valid for cached clients too.
create or replace function public.arena_phase1_social_state() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare payload jsonb; groups_value jsonb:='[]';item jsonb;g streak_groups;
begin
 payload:=arena_base_social_state();
 for item in select value from jsonb_array_elements(payload->'groups') loop
  select * into strict g from streak_groups where id=(item->>'id')::uuid;
  groups_value:=groups_value||jsonb_build_array((item-'adminId')||jsonb_build_object('goals',case when not (item->>'invited')::boolean then arena_group_goals(g.id) else '[]'::jsonb end)||case when g.owner_id is null then '{}'::jsonb else jsonb_build_object('adminId',g.owner_id) end);
 end loop;
 return payload||jsonb_build_object('arenaVersion',1,'groups',groups_value);
end $$;

create function public.account_deletion_ready() returns boolean
language sql stable set search_path=public,pg_temp as $$
 select exists(select 1 from pg_trigger where tgrelid='public.profiles'::regclass
  and tgname='social_profile_deleted' and tgenabled='O' and tgfoid='public.social_profile_deleted()'::regprocedure)
 and exists(select 1 from pg_constraint where conrelid='public.streak_groups'::regclass
  and conname='streak_groups_owner_id_fkey' and confdeltype='n');
$$;
revoke all on function public.account_deletion_ready() from public,anon,authenticated;
grant execute on function public.account_deletion_ready() to service_role;
notify pgrst,'reload schema';
commit;
