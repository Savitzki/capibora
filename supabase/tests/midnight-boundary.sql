-- Disposable fixture: choose a fixed-offset zone whose midnight is one second away.
-- The real wall clock advances; no production clock or built-in is overridden.
begin;
create temp table midnight_fixture(tz text,day date);
insert into midnight_fixture(tz)
select 'UTC'||case when secs>=0 then '+' else '-' end||to_char(abs(secs)*interval '1 second','HH24:MI:SS')
from (select extract(epoch from date_trunc('second',clock_timestamp() at time zone 'UTC')-date_trunc('day',clock_timestamp() at time zone 'UTC'))::integer+1
 -case when extract(hour from clock_timestamp() at time zone 'UTC')>=12 then 86400 else 0 end as secs)x;
update midnight_fixture set day=(clock_timestamp() at time zone tz)::date;
insert into auth.users(id) values('d7440000-0000-4000-8000-000000000001');
insert into profiles(id,nickname) values('d7440000-0000-4000-8000-000000000001','midnight.review');
insert into training_accounts(user_id,time_zone,started_on,medical_checked_through)
select 'd7440000-0000-4000-8000-000000000001',tz,day-3,day-1 from midnight_fixture;
insert into training_plans(user_id,revision,effective_on,training_days,created_at,starts_immediately)
select user_id,1,started_on,array[1,2,3,4,5,6,7],clock_timestamp()-interval '4 days',true from training_accounts where user_id='d7440000-0000-4000-8000-000000000001';
insert into workout_days(user_id,day,activity,minutes,confirmed_at)
select 'd7440000-0000-4000-8000-000000000001',day-1,'Caminhada',35,((day-1)::timestamp at time zone tz)+interval '12 hours' from midnight_fixture;
-- Isolate the manual operation; the separate rollover suite covers automatic use.
update economy_rules set medical_auto_started_at=clock_timestamp()+interval '2 days';
set local request.jwt.claim.sub='d7440000-0000-4000-8000-000000000001';
select pg_sleep(1.2);
do $$ declare f midnight_fixture; rejected boolean;begin
 select * into f from midnight_fixture;
 if (now() at time zone f.tz)::date<>f.day or (clock_timestamp() at time zone f.tz)::date<>f.day+1 then
  raise exception 'Midnight fixture did not cross exactly one day';
 end if;
 rejected:=false;
 begin perform use_medical_kit(f.day,'UTC');exception when raise_exception then rejected:=sqlerrm like '%dia mudou%';end;
 if not rejected then raise exception 'Late manual kit was accepted after account midnight';end if;
 rejected:=false;
 begin perform authorize_extra_rest('UTC');exception when raise_exception then rejected:=sqlerrm like '%dia mudou%';end;
 if not rejected then raise exception 'Late extra rest was accepted after account midnight';end if;
 if exists(select 1 from medical_kits where user_id=auth.uid() and used_on=f.day)
  or exists(select 1 from training_extra_rests where user_id=auth.uid() and day=f.day) then
  raise exception 'A late operation changed a closed date';
 end if;
end $$;
rollback;
select 'PASS midnight: real wall-clock rollover rejects stale kit/rest transactions without consuming stock or changing a closed date';
