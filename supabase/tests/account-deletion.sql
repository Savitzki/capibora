-- Synthetic fixtures only, in scripts/test-final-review-db.sh's disposable database.
begin;
insert into auth.users(id,email) select ('d7450000-0000-4000-8000-'||lpad(x::text,12,'0'))::uuid,'delete.review.'||x||'@example.invalid' from generate_series(1,3)x;
insert into profiles(id,nickname) select id,'delete.review.'||right(id::text,1) from auth.users where id::text like 'd7450000%';
insert into training_accounts(user_id,time_zone,started_on,medical_checked_through)
select id,'UTC',current_date-14,current_date-1 from profiles where id::text like 'd7450000%';
insert into training_plans(user_id,revision,effective_on,training_days,created_at,starts_immediately)
select user_id,1,started_on,array[1,2,3,4,5,6,7],clock_timestamp()-interval '15 days',true from training_accounts where user_id::text like 'd7450000%';
insert into workout_days(user_id,day,activity,minutes,confirmed_at)
select user_id,current_date-1,'Caminhada',35,current_date-interval '12 hours' from training_accounts where user_id::text like 'd7450000%';
insert into workout_sessions(user_id,request_id,activity,time_zone,started_at,ended_at,minimum_seconds,maximum_seconds,status,validated_seconds,workout_id)
select user_id,gen_random_uuid(),'Caminhada','UTC',confirmed_at-interval '35 minutes',confirmed_at,2100,14400,'completed',2100,id
from workout_days where user_id='d7450000-0000-4000-8000-000000000001';
insert into weight_entries(user_id,id,day,kg,recorded_at)
values('d7450000-0000-4000-8000-000000000001',gen_random_uuid(),current_date,70,clock_timestamp());
select economy_post('d7450000-0000-4000-8000-000000000002','survivor-fixture','workout','Synthetic survivor',500,current_date);
select economy_post('d7450000-0000-4000-8000-000000000001','deletion-fixture','workout','Synthetic fixture',1000,current_date);
set local request.jwt.claim.sub='d7450000-0000-4000-8000-000000000001';
select buy_cosmetic('frame-sport-band','UTC');
select economy_grant_monthly_kits(auth.uid(),current_date);
insert into friendships(requester,recipient,status) values
('d7450000-0000-4000-8000-000000000001','d7450000-0000-4000-8000-000000000002','accepted');
insert into streak_groups(id,owner_id,name,time_zone,status,started_on,training_checked_through)
select ('d7451000-0000-4000-8000-'||lpad(x::text,12,'0'))::uuid,
case when x in(1,4) then 'd7450000-0000-4000-8000-000000000001'::uuid else 'd7450000-0000-4000-8000-000000000002'::uuid end,
'delete.review.1 group '||x,'UTC','active',current_date-10,current_date-1 from generate_series(1,4)x;
insert into group_members(group_id,user_id,status) values
('d7451000-0000-4000-8000-000000000001','d7450000-0000-4000-8000-000000000001','accepted'),
('d7451000-0000-4000-8000-000000000001','d7450000-0000-4000-8000-000000000002','accepted'),
('d7451000-0000-4000-8000-000000000002','d7450000-0000-4000-8000-000000000001','accepted'),
('d7451000-0000-4000-8000-000000000002','d7450000-0000-4000-8000-000000000002','accepted'),
('d7451000-0000-4000-8000-000000000003','d7450000-0000-4000-8000-000000000002','accepted'),
('d7451000-0000-4000-8000-000000000003','d7450000-0000-4000-8000-000000000003','accepted'),
('d7451000-0000-4000-8000-000000000004','d7450000-0000-4000-8000-000000000001','accepted');
insert into group_days(group_id,day,members_count) values('d7451000-0000-4000-8000-000000000001',current_date-2,2);
insert into arena_group_cycles(group_id,week_start,starts_on,timezone,opened_at,target,participants,closed_at,final_count)
values('d7451000-0000-4000-8000-000000000001',date_trunc('week',current_date)::date-7,date_trunc('week',current_date)::date-7,'UTC',current_date-interval '14 days',7,
'[ {"id":"d7450000-0000-4000-8000-000000000001","nickname":"delete.review.1","timezone":"UTC","days":["2026-10-01"]}, {"id":"d7450000-0000-4000-8000-000000000002","nickname":"delete.review.2"} ]',current_date-interval '1 day',7);
insert into gf_challenges(id,owner_id,name,kind,starts_on,ends_on,invite_until,target,rewards,settled_at,results,rule_version)
values('d7452000-0000-4000-8000-000000000001','d7450000-0000-4000-8000-000000000001','delete.review.1 challenge','frequency',current_date-10,current_date-4,current_date-interval '11 days',7,'{"participation":5,"winner":10}',current_date-interval '3 days',
'[{"id":"d7450000-0000-4000-8000-000000000001","nickname":"delete.review.1","completed":3,"planned":7,"percent":null,"place":1},{"id":"d7450000-0000-4000-8000-000000000002","nickname":"delete.review.2","completed":2,"planned":7,"percent":null,"place":2}]',1),
('d7452000-0000-4000-8000-000000000002','d7450000-0000-4000-8000-000000000001','Active duel','frequency',current_date,current_date+6,current_date-interval '1 day',7,'{"participation":0,"winner":0}',null,null,2),
('d7452000-0000-4000-8000-000000000003','d7450000-0000-4000-8000-000000000002','Active collective','collective',current_date,current_date+6,current_date-interval '1 day',3,'{"participation":0,"winner":0}',null,null,2);
insert into gf_challenge_members(challenge_id,user_id,nickname,status,timezone,quota,accepted_at,planned_days)
select c.id,p.id,p.nickname,'accepted','UTC',7,clock_timestamp()-interval '15 days',array(select current_date+x from generate_series(0,6)x)
from gf_challenges c cross join profiles p where c.id::text like 'd7452000%'
and (p.id::text in('d7450000-0000-4000-8000-000000000001','d7450000-0000-4000-8000-000000000002')
 or(c.id='d7452000-0000-4000-8000-000000000003' and p.id='d7450000-0000-4000-8000-000000000003'));
insert into push_devices(user_id,endpoint,p256dh,auth,vapid_key,time_zone,reminder_hour,tone)
values(auth.uid(),'https://fcm.googleapis.com/deletion-review',repeat('A',87),repeat('A',22),repeat('A',87),'UTC',18,'gentle');
insert into push_jobs(device_id,day,slot) select id,current_date,'reminder' from push_devices where user_id=auth.uid();
insert into notification_consents(user_id,installation_id,decision) values(auth.uid(),gen_random_uuid(),'accepted');
insert into local_reminder_receipts(user_id,day,kind) values(auth.uid(),current_date,'workout');
insert into arena_taunts(id,sender,recipient,message_id) values(gen_random_uuid(),auth.uid(),'d7450000-0000-4000-8000-000000000002',(select id from arena_taunt_catalog order by id limit 1));
insert into nickname_login_attempts values(md5('delete.review.1'),clock_timestamp(),1);
create temp table survivor_wallet as select * from coin_wallets where user_id='d7450000-0000-4000-8000-000000000002';
create temp table survivor_movements as select * from coin_movements where user_id='d7450000-0000-4000-8000-000000000002';

-- A downstream database failure must roll back anonymization, archival and Auth together.
create function pg_temp.reject_review_deletion() returns trigger language plpgsql as $$
begin if old.id='d7450000-0000-4000-8000-000000000001' then raise exception 'synthetic rollback';end if;return old;end $$;
create trigger zz_review_abort_deletion before delete on profiles for each row execute function pg_temp.reject_review_deletion();
do $$ begin
 begin delete from auth.users where id='d7450000-0000-4000-8000-000000000001';raise exception 'Expected rollback';
 exception when raise_exception then if sqlerrm<>'synthetic rollback' then raise;end if;end;
 if not exists(select 1 from profiles where id='d7450000-0000-4000-8000-000000000001')
  or not exists(select 1 from streak_groups where id='d7451000-0000-4000-8000-000000000001' and status='active') then raise exception 'Deletion was partially committed';end if;
end $$;
drop trigger zz_review_abort_deletion on profiles;
delete from auth.users where id='d7450000-0000-4000-8000-000000000001';

do $$ declare row record;remaining integer;begin
 if exists(select 1 from auth.users where id='d7450000-0000-4000-8000-000000000001') then raise exception 'Auth identity retained';end if;
 for row in select distinct c.conrelid::regclass as tab,a.attname as col from pg_constraint c
 join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
 where c.contype='f' and c.confrelid in('auth.users'::regclass,'public.profiles'::regclass,'public.training_accounts'::regclass,'public.coin_wallets'::regclass)
 and cardinality(c.conkey)=1 loop
  execute format('select count(*) from %s where %I=$1',row.tab,row.col) into remaining using 'd7450000-0000-4000-8000-000000000001'::uuid;
  if remaining<>0 then raise exception 'Account reference retained in %.%',row.tab,row.col;end if;
 end loop;
 if not exists(select 1 from group_days where group_id='d7451000-0000-4000-8000-000000000001' and day=current_date-2 and members_count=2) then raise exception 'Shared historical result deleted';end if;
 if not exists(select 1 from arena_group_cycles where group_id='d7451000-0000-4000-8000-000000000001' and final_count=7) then raise exception 'Consolidated goal rewritten';end if;
 if exists(select 1 from arena_group_cycles where participants::text like '%delete.review.1%' or participants::text like '%d7450000-0000-4000-8000-000000000001%') then raise exception 'Identity retained in goals';end if;
 if not exists(select 1 from gf_challenges where id='d7452000-0000-4000-8000-000000000001' and not cancelled and results->0->>'completed'='3' and results->0->>'place'='1' and results->0->>'nickname'='Conta excluída') then raise exception 'Closed challenge score/result changed';end if;
 if exists(select 1 from gf_challenges where results::text like '%delete.review.1%' or results::text like '%d7450000-0000-4000-8000-000000000001%') then raise exception 'Identity retained in challenge results';end if;
 if exists(select 1 from gf_challenge_members where challenge_id::text like 'd7452000%' and user_id is null and(nickname<>'Conta excluída' or timezone is not null or cardinality(planned_days)>0)) then raise exception 'Deleted participant retained personal details';end if;
 if not exists(select 1 from gf_challenges where id='d7452000-0000-4000-8000-000000000002' and cancelled and cancel_reason='insufficient-participants') then raise exception 'Duel with missing participant continued';end if;
 if not exists(select 1 from gf_challenges where id='d7452000-0000-4000-8000-000000000003' and not cancelled and settled_at is null) then raise exception 'Valid collective challenge cancelled';end if;
 if not exists(select 1 from streak_groups where id='d7451000-0000-4000-8000-000000000001' and status='archived' and owner_id is null) then raise exception 'Deleted owner lost shared history';end if;
 if not exists(select 1 from streak_groups where id='d7451000-0000-4000-8000-000000000003' and status='active') then raise exception 'Unrelated group altered';end if;
 if exists(select 1 from streak_groups where id='d7451000-0000-4000-8000-000000000004') then raise exception 'Unshared personal group retained';end if;
 if exists(select * from survivor_wallet except select * from coin_wallets) or exists(select * from survivor_movements except select * from coin_movements) then raise exception 'Other account wallet/history changed';end if;
 if exists(select 1 from nickname_login_attempts where identifier_hash=md5('delete.review.1')) then raise exception 'Private nickname hash retained';end if;
 if has_function_privilege('authenticated','public.account_deletion_ready()','EXECUTE') or has_function_privilege('anon','public.account_anonymize_participants(jsonb,uuid)','EXECUTE') then raise exception 'Private deletion helper exposed';end if;
end $$;
set local request.jwt.claim.sub='d7450000-0000-4000-8000-000000000002';
set local role authenticated;
select get_social_state();
select get_friend_challenges();
do $$ begin
 begin delete from auth.users where id='d7450000-0000-4000-8000-000000000003';raise exception 'Client deleted another account';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role service_role;
do $$ begin if not account_deletion_ready() then raise exception 'Deletion readiness unavailable';end if;end $$;
reset role;
rollback;
select 'PASS account deletion: Auth/private cascades, atomic rollback, shared history, anonymous results, unchanged other wallets, owner/last member, client authorization';
