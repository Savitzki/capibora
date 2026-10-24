-- Reject stale transactions that acquired the account after local midnight.
-- Same existing operations and eligibility; no historical date policy is changed.
-- Prepared only. Requires explicit production authorization.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create function public.training_current_transaction_day(p_user uuid) returns date
language plpgsql security definer set search_path=public,pg_temp as $$
declare tz text; d date;
begin
 select time_zone into strict tz from training_accounts where user_id=p_user;
 d:=(clock_timestamp() at time zone tz)::date;
 if d is distinct from (now() at time zone tz)::date then
  raise exception 'O dia mudou durante a operação. Atualize e tente novamente.';
 end if;
 return d;
end $$;
revoke all on function public.training_current_transaction_day(uuid) from public,anon,authenticated;

create or replace function public.use_medical_kit(p_day date,p_timezone text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid();a training_accounts;k medical_kits;d date;g record;reason text;
begin
 perform get_training_state(p_timezone);
 select * into a from training_accounts where user_id=u for update;
 d:=training_current_transaction_day(u);
 if p_day is distinct from d then raise exception 'O Kit Médico protege apenas hoje, antes de o dia terminar.';end if;
 if exists(select 1 from medical_kits where user_id=u and used_on=d) then
  perform economy_grant_monthly_kits(u,d);
  return economy_state(u);
 end if;
 if training_day_kind(u,d)<>'training' then raise exception 'Hoje já está protegido por um descanso.';end if;
 if exists(select 1 from workout_days where user_id=u and day=d) then raise exception 'Você já registrou o treino de hoje.';end if;
 reason:=medical_protection_reason(u,d);
 if reason is not null then raise exception '%',reason;end if;
 perform economy_grant_monthly_kits(u,d);
 -- Consume the expiring monthly allowance before purchased, non-expiring stock.
 select * into k from economy_available_kits(u,d)
  order by (purchase_id is not null),acquired_at,id limit 1;
 if not found then raise exception 'Você não tem um Kit Médico disponível.';end if;
 -- The account/wallet locks serialize consumption with all other device requests.
 update medical_kits set used_on=d,used_at=clock_timestamp() where id=k.id and used_on is null;
 update coin_wallets set revision=revision+1 where user_id=u;
 update training_accounts set revision=revision+1 where user_id=u;
 for g in select group_id from group_members where user_id=u order by group_id loop perform social_refresh_day(g.group_id);end loop;
 return economy_state(u);
end $$;

create or replace function public.authorize_extra_rest(p_timezone text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid(); a training_accounts; d date; monday date; g record;
begin
 perform get_training_state(p_timezone);
 select * into a from training_accounts where user_id=u for update;
 d:=training_current_transaction_day(u); monday:=d-(extract(isodow from d)::integer-1);
 if exists(select 1 from training_extra_rests where user_id=u and day=d) then return training_state(u); end if;
 if training_day_kind(u,d)<>'training' then raise exception 'Hoje já é um descanso programado.'; end if;
 if exists(select 1 from workout_days where user_id=u and day=d) then raise exception 'O treino de hoje já foi registrado. Não é possível trocá-lo por descanso.'; end if;
 if (select count(*) from training_extra_rests where user_id=u and day>=monday and day<monday+7)>=training_extra_rest_limit()
 then raise exception 'Você já usou os descansos extras desta semana.'; end if;
 insert into training_extra_rests(user_id,day) values(u,d);
 update training_accounts set revision=revision+1 where user_id=u;
 for g in select group_id from group_members where user_id=u order by group_id loop perform social_refresh_day(g.group_id); end loop;
 return training_state(u);
end $$;

create or replace function public.reschedule_training(p_original_day date,p_target_day date,p_revision integer,p_timezone text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid(); a training_accounts; today_value date; monday date; planned integer; g streak_groups; d date;
begin
 perform get_training_state(p_timezone);
 select * into a from training_accounts where user_id=u for update;
 -- Repeating the identical successful request is safe after a lost response.
 if exists(select 1 from training_reschedules where user_id=u and original_day=p_original_day and target_day=p_target_day) then return training_state(u); end if;
 if p_revision is distinct from a.revision then raise exception 'Sua programação mudou em outro aparelho. Atualize e tente novamente.'; end if;
 today_value:=training_current_transaction_day(u);
 monday:=p_original_day-(extract(isodow from p_original_day)::integer-1);
 if p_original_day is null or p_target_day is null or p_original_day<today_value or p_target_day<=p_original_day or p_target_day>=monday+7
 then raise exception 'Escolha um descanso posterior ao treino, na mesma semana, antes de encerrar o dia original.'; end if;
 if (select count(*) from training_reschedules where user_id=u and week_start=monday)>=training_reschedule_limit()
 then raise exception 'Você já usou os 2 reagendamentos desta semana.'; end if;
 if exists(select 1 from training_reschedules where user_id=u and (original_day in(p_original_day,p_target_day) or target_day in(p_original_day,p_target_day)))
 then raise exception 'Uma dessas datas já participa de um reagendamento.'; end if;
 select count(*) into planned from generate_series(0,6) n where training_schedule_kind(u,monday+n)='training';
 if planned<>5 then raise exception 'Configure uma semana com 5 treinos e 2 descansos antes de reagendar.'; end if;
 if training_day_kind(u,p_original_day)<>'training' or training_day_kind(u,p_target_day)<>'scheduled-rest'
 then raise exception 'Troque um treino obrigatório por um descanso programado disponível.'; end if;
 if exists(select 1 from workout_days where user_id=u and day in(p_original_day,p_target_day))
 then raise exception 'Uma dessas datas já tem treino confirmado.'; end if;
 -- Lock groups in the same order as confirmation/rest RPCs. Freeze completed,
 -- checked and closed dates, including groups whose timezone has already advanced.
 for g in select s.* from streak_groups s join group_members m on m.group_id=s.id
  where m.user_id=u and m.status='accepted' and s.status='active' order by s.id for update of s loop
  foreach d in array array[p_original_day,p_target_day] loop
   if exists(select 1 from group_days where group_id=g.id and day=d)
    or d<=g.training_checked_through
    or clock_timestamp()>=((d+1)::timestamp at time zone g.time_zone)
    or exists(select 1 from workout_days w where w.user_id=u and (w.confirmed_at at time zone g.time_zone)::date=d)
   then raise exception 'Uma dessas datas já encerrou ou foi consolidada na Arena. O resultado do grupo será preservado.'; end if;
  end loop;
 end loop;
 insert into training_reschedules(user_id,original_day,target_day,week_start,revision)
  values(u,p_original_day,p_target_day,monday,a.revision+1);
 update training_accounts set revision=revision+1 where user_id=u;
 for g in select s.* from streak_groups s join group_members m on m.group_id=s.id
  where m.user_id=u and m.status='accepted' and s.status='active' order by s.id loop perform social_refresh_day(g.id); end loop;
 return training_state(u);
end $$;

create or replace function public.save_training_plan(p_training_days integer[],p_revision integer,p_timezone text,p_replace boolean) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid();a training_accounts;d date;effective date;previous integer;conflicts text;g streak_groups;
begin
 perform get_training_state(p_timezone);
 select * into strict a from training_accounts where user_id=u for update;
 if p_revision is distinct from a.revision then raise exception 'Sua programação mudou em outro aparelho. Atualize e tente novamente.';end if;
 if p_training_days is null or cardinality(p_training_days) not between 1 and 7 or
  (select count(distinct x) from unnest(p_training_days) x where x between 1 and 7)<>cardinality(p_training_days)
 then raise exception 'Escolha de 1 a 7 dias de treino, sem repetições.';end if;
 select revision into previous from training_plans where user_id=u order by effective_on desc,revision desc limit 1;
 if p_replace is null or p_replace is distinct from (previous is not null) then raise exception 'Crie seu primeiro plano ou confirme Substituir plano.';end if;
 d:=training_current_transaction_day(u);
 effective:=case when previous is null then d else d+1 end;
 -- Accepted open challenges retain their existing criteria. A permanent plan
 -- change may not reclassify any obligation inside their remaining period.
 select string_agg(to_char(x.day,'DD/MM/YYYY'),', ' order by x.day) into conflicts from (
  select distinct z::date as day from gf_challenge_members m
   join gf_challenges c on c.id=m.challenge_id
   cross join lateral generate_series(greatest(effective,c.starts_on)::timestamp,c.ends_on::timestamp,interval '1 day') z
  where m.user_id=u and m.status='accepted' and c.settled_at is null and not c.cancelled
   and not exists(select 1 from training_reschedules r where r.user_id=u and z::date in(r.original_day,r.target_day))
   and (training_schedule_kind(u,z::date)='training') is distinct from (extract(isodow from z)::integer=any(p_training_days))) x;
 if conflicts is not null then raise exception 'Um desafio aceito depende das datas %. Preserve esses dias até o encerramento do desafio.',conflicts;end if;
 -- Future swaps keep their original mandatory day and originally available rest.
 select string_agg(to_char(x.day,'DD/MM/YYYY'),', ' order by x.day) into conflicts from (
  select original_day as day from training_reschedules where user_id=u and original_day>=effective and not extract(isodow from original_day)::integer=any(p_training_days)
  union select target_day from training_reschedules where user_id=u and target_day>=effective and extract(isodow from target_day)::integer=any(p_training_days)) x;
 if conflicts is not null then raise exception 'O plano conflita com reagendamentos nas datas %. Preserve esses dias ao substituir.',conflicts;end if;
 -- A group in another timezone may already have consolidated an account-future day.
 for g in select s.* from streak_groups s join group_members m on m.group_id=s.id
  where m.user_id=u and m.status='accepted' and s.status='active' order by s.id for update of s loop
  select string_agg(to_char(x.day,'DD/MM/YYYY'),', ' order by x.day) into conflicts from (
   select z::date as day from generate_series(effective::timestamp,greatest(g.training_checked_through,(clock_timestamp() at time zone g.time_zone)::date)::timestamp,interval '1 day') z
   where (z::date<=g.training_checked_through or exists(select 1 from group_days where group_id=g.id and day=z::date))
    and not exists(select 1 from training_reschedules where user_id=u and z::date in(original_day,target_day))
    and not exists(select 1 from training_extra_rests where user_id=u and day=z::date)
    and not exists(select 1 from medical_kits where user_id=u and used_on=z::date)
    and (training_schedule_kind(u,z::date)='training') is distinct from (extract(isodow from z)::integer=any(p_training_days))) x;
  if conflicts is not null then raise exception 'A Arena já consolidou as datas %. Preserve esses dias no novo plano.',conflicts;end if;
 end loop;
 insert into training_plans(user_id,revision,effective_on,training_days,replaces_revision,starts_immediately)
 values(u,a.revision+1,effective,array(select x from unnest(p_training_days) x order by x),previous,previous is null);
 update training_accounts set revision=revision+1 where user_id=u;
 update gf_cycles set rewards=jsonb_set(rewards,'{planningPolicy}','2'::jsonb)
 where user_id=u and week_start=date_trunc('week',effective)::date and not finalized;
 if previous is null then
  for g in select s.* from streak_groups s join group_members m on m.group_id=s.id
   where m.user_id=u and m.status='accepted' and s.status='active' order by s.id loop perform social_refresh_day(g.id);end loop;
 end if;
 return training_state(u);
end $$;
notify pgrst,'reload schema';
commit;
