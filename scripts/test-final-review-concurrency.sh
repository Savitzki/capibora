#!/usr/bin/env bash
set -euo pipefail
container=${1:?Disposable PostgreSQL container required}
docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 <<'SQL'
insert into auth.users(id) select ('d7460000-0000-4000-8000-'||lpad(x::text,12,'0'))::uuid from generate_series(1,6)x;
insert into profiles(id,nickname) select id,'review.concurrent.'||right(id::text,1) from auth.users where id::text like 'd7460000%';
insert into training_accounts(user_id,time_zone,started_on,medical_checked_through)
select id,'UTC',current_date-20,current_date-1 from profiles where id::text like 'd7460000%';
insert into training_plans(user_id,revision,effective_on,training_days,created_at,starts_immediately)
select user_id,1,started_on,array[1,2,3,4,5,6,7],current_date-interval '21 days',true from training_accounts where user_id::text like 'd7460000%';
update economy_rules set medical_auto_started_at=current_date-30,medical_protection_started_at=current_date-30;
update training_accounts set medical_checked_through=current_date-2 where user_id='d7460000-0000-4000-8000-000000000001';
insert into workout_days(user_id,day,activity,minutes,confirmed_at)
values('d7460000-0000-4000-8000-000000000001',current_date-2,'Caminhada',35,current_date-interval '36 hours');
SQL
# One account/stock lock, even when the other device presents a different timezone.
docker exec "$container" psql -U postgres -v ON_ERROR_STOP=1 -c "begin;select medical_auto_close_account('d7460000-0000-4000-8000-000000000001');select pg_sleep(.1);commit;" >/dev/null &
first=$!
docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 >/dev/null <<'SQL' &
begin;
set local role authenticated;
set local request.jwt.claim.sub='d7460000-0000-4000-8000-000000000001';
do $$ begin
 begin perform use_medical_kit(current_date,'Pacific/Kiritimati');raise exception 'Manual use unexpectedly accepted';
 exception when raise_exception or serialization_failure then
  if sqlerrm not like '%dias seguidos%' and sqlerrm not like '%fechamento do dia%' then raise;end if;
 end;
end $$;
commit;
SQL
second=$!
wait "$first"; wait "$second"
docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 <<'SQL'
do $$ begin
 if (select count(*) from medical_kits where user_id='d7460000-0000-4000-8000-000000000001' and used_on=current_date-1)<>1
 or exists(select 1 from medical_kits where user_id='d7460000-0000-4000-8000-000000000001' and used_on=current_date) then raise exception 'Manual/automatic race bypassed consecutive-day rule';end if;
end $$;
select 'PASS manual/automatic kit race: one previous-day protection, no consecutive use, fixed account timezone';
-- A legacy challenge retains its original (unique) financial settlement rules.
insert into workout_days(user_id,day,activity,minutes,confirmed_at) values
('d7460000-0000-4000-8000-000000000002',current_date-10,'Caminhada',35,current_date-interval '9 days 12 hours'),
('d7460000-0000-4000-8000-000000000002',current_date-9,'Caminhada',35,current_date-interval '8 days 12 hours'),
('d7460000-0000-4000-8000-000000000003',current_date-10,'Caminhada',35,current_date-interval '9 days 12 hours');
insert into gf_challenges(id,owner_id,name,kind,starts_on,ends_on,invite_until,target,rewards,rule_version)
values('d7462000-0000-4000-8000-000000000001','d7460000-0000-4000-8000-000000000002','Concurrent result','frequency',current_date-10,current_date-4,current_date-interval '11 days',7,'{"participation":5,"winner":10}',1);
insert into gf_challenge_members(challenge_id,user_id,nickname,status,timezone,quota,accepted_at)
select 'd7462000-0000-4000-8000-000000000001',id,nickname,'accepted','UTC',7,current_date-interval '11 days'
from profiles where id in('d7460000-0000-4000-8000-000000000002','d7460000-0000-4000-8000-000000000003');
create schema review_fixture;
create table review_fixture.reads(reader uuid primary key,data jsonb);
grant usage on schema review_fixture to authenticated;
grant insert on review_fixture.reads to authenticated;
SQL
for device in 2 3; do
 docker exec "$container" psql -U postgres -v ON_ERROR_STOP=1 -c "begin;set role authenticated;set request.jwt.claim.sub='d7460000-0000-4000-8000-00000000000$device';insert into review_fixture.reads select auth.uid(),get_friend_challenges();select pg_sleep(.1);commit;" >/dev/null &
 if [[ "$device" == 2 ]];then first=$!;else second=$!;fi
done
wait "$first"; wait "$second"
docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 <<'SQL'
do $$ begin
 if (select count(*) from coin_movements where kind='challenge' and user_id in('d7460000-0000-4000-8000-000000000002','d7460000-0000-4000-8000-000000000003'))<>2
 or (select sum(amount) from coin_movements where kind='challenge' and user_id in('d7460000-0000-4000-8000-000000000002','d7460000-0000-4000-8000-000000000003'))<>20 then raise exception 'Concurrent readers duplicated or changed legacy challenge rewards';end if;
 if (select count(distinct item->'board') from review_fixture.reads cross join lateral jsonb_array_elements(data)item where item->>'id'='d7462000-0000-4000-8000-000000000001')<>1 then raise exception 'Participants saw different official results';end if;
end $$;
select 'PASS simultaneous challenge settlement: same official board for both accounts, one reward per participant';
insert into streak_groups(id,owner_id,name,time_zone,status,started_on,training_checked_through)
values('d7461000-0000-4000-8000-000000000001','d7460000-0000-4000-8000-000000000004','Concurrent team','UTC','active',current_date-10,current_date-1);
insert into group_members(group_id,user_id,status) values
('d7461000-0000-4000-8000-000000000001','d7460000-0000-4000-8000-000000000004','accepted'),
('d7461000-0000-4000-8000-000000000001','d7460000-0000-4000-8000-000000000005','accepted'),
('d7461000-0000-4000-8000-000000000001','d7460000-0000-4000-8000-000000000006','invited');
insert into group_days(group_id,day,members_count) values('d7461000-0000-4000-8000-000000000001',current_date-2,2);
SQL
docker exec "$container" psql -U postgres -v ON_ERROR_STOP=1 -c "begin;set role authenticated;set request.jwt.claim.sub='d7460000-0000-4000-8000-000000000004';select arena_group_command('d7461000-0000-4000-8000-000000000001','remove','d7460000-0000-4000-8000-000000000006',null,'d7463000-0000-4000-8000-000000000001');select pg_sleep(.1);commit;" >/dev/null &
first=$!
docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 >/dev/null <<'SQL' &
begin;
set local role authenticated;
set local request.jwt.claim.sub='d7460000-0000-4000-8000-000000000006';
do $$ begin
 begin perform reply_group_invite('d7461000-0000-4000-8000-000000000001',true);
 exception when raise_exception then if sqlerrm<>'Convite indisponível.' then raise;end if;end;
end $$;
commit;
SQL
second=$!
wait "$first"; wait "$second"
docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 <<'SQL'
do $$ begin
 if exists(select 1 from group_members where group_id='d7461000-0000-4000-8000-000000000001' and user_id='d7460000-0000-4000-8000-000000000006') then raise exception 'Concurrent removed invitation survived';end if;
 if not exists(select 1 from group_days where group_id='d7461000-0000-4000-8000-000000000001' and day=current_date-2 and members_count=2) then raise exception 'Membership race changed a consolidated result';end if;
end $$;
select 'PASS simultaneous acceptance/removal: no ghost member and historical team result preserved';
SQL
