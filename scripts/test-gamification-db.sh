#!/usr/bin/env bash
set -euo pipefail
task_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
task_container=$(docker run --detach --rm --network none --env POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine)
trap 'docker rm --force "$task_container" >/dev/null 2>&1 || true' EXIT
for attempt in $(seq 1 120); do
 if docker exec "$task_container" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then break;fi
 sleep 0.25
done
docker exec "$task_container" pg_isready -h 127.0.0.1 -U postgres >/dev/null
docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/tests/bootstrap.sql"
docker exec "$task_container" psql -U postgres -c 'alter table auth.users add column email text;'
for file in "$task_root"/supabase/migrations/*.sql; do
 if [[ "$file" == *202610240044* || "$file" == *202610240045* || "$file" == *202610220042* || "$file" == *202610200039* || "$file" == *202610210040* || "$file" == *202610220041* ]];then continue;fi
 if [[ "$file" == *202610200038_group_capacity_five.sql || "$file" == *202610200037_arena_taunt_replies.sql || "$file" == *202610200036_friend_profile.sql || "$file" == *202610200035_query_indexes.sql || "$file" == *202610200033_arena_groups.sql || "$file" == *202610200034_arena_interactions.sql || "$file" == *202610190030_profile_cosmetics.sql || "$file" == *202610200031_automatic_medical_kits.sql || "$file" == *202610200032_achievement_catalog.sql ]];then continue;fi
 if [[ "$file" == *202610180023_workout_recording.sql ]];then
  docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/tests/workout-recording-legacy-setup.sql"
 fi
 if [[ "$file" == *202610180024_manual_workout_confirmation.sql ]];then
  docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/tests/manual-confirmation-legacy-setup.sql"
 fi
 if [[ "$file" == *202610180025_locked_weekly_plans.sql ]];then
  docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/tests/locked-plans-legacy-setup.sql"
 fi
 docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$file"
 if [[ "$file" == *202610180023_workout_recording.sql ]];then
  docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/tests/workout-recording-migration.sql"
 fi
 if [[ "$file" == *202610180024_manual_workout_confirmation.sql ]];then
  docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/tests/manual-confirmation-migration.sql"
 fi
 if [[ "$file" == *202610180025_locked_weekly_plans.sql ]];then
  docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/tests/locked-plans-migration.sql"
 fi
done
# psql \ir fixtures resolve relative to the tests' directory in the container.
docker cp "$task_root/supabase/tests" "$task_container:/tmp/fokus-tests"
for file in gamification-missions gamification-rotating-missions gamification-achievements gamification-reports gamification-challenges gamification-cosmetics shop-showcase workout-recording manual-workout-confirmation locked-weekly-plans capibora-notifications notification-onboarding flexible-training-plans morning-push-cadence; do
 docker exec "$task_container" psql -U postgres -v ON_ERROR_STOP=1 -f "/tmp/fokus-tests/$file.sql"
done
# Two devices buy the same permanent item concurrently; only one charge/inventory row.
bash "$task_root/scripts/test-workout-concurrency.sh" "$task_container"
bash "$task_root/scripts/test-plan-concurrency.sh" "$task_container"
docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 <<'SQL'
insert into auth.users(id) values('b0000000-0000-4000-8000-000000000001');
insert into profiles(id,nickname) values('b0000000-0000-4000-8000-000000000001','gamify.concurrent');
set request.jwt.claim.sub='b0000000-0000-4000-8000-000000000001';
select get_training_state('UTC');
select save_training_plan(array[1,2,3,4,5],0,'UTC',false);
update training_accounts set started_on=date_trunc('week',now())::date-7 where user_id=auth.uid();
update training_plans set effective_on=date_trunc('week',now())::date-7,created_at=date_trunc('week',now())-interval '7 days' where user_id=auth.uid();
insert into gf_accounts(user_id) values(auth.uid());
insert into gf_cycles(user_id,week_start,starts_on,planned_days,rewards) values(auth.uid(),date_trunc('week',now())::date-7,date_trunc('week',now())::date-7,array(select date_trunc('week',now())::date-7+x from generate_series(0,4) x),'{"bonus":50}');
insert into gf_missions(user_id,week_start,key,target,reward) values
(auth.uid(),date_trunc('week',now())::date-7,'workouts',3,10),
(auth.uid(),date_trunc('week',now())::date-7,'weight',2,10),
(auth.uid(),date_trunc('week',now())::date-7,'schedule',5,20),
(auth.uid(),date_trunc('week',now())::date-7,'consistency',7,30);
insert into workout_days(user_id,day,activity,minutes,confirmed_at) select auth.uid(),date_trunc('week',now())::date-7+x,'Caminhada',30,(date_trunc('week',now())::date-7+x)::timestamp+interval '12 hours' from generate_series(0,2) x;
select economy_post(auth.uid(),'fixture','workout','Fixture',500,current_date);
SQL
for device in 1 2; do
 docker exec "$task_container" psql -U postgres -v ON_ERROR_STOP=1 -c "begin;set role authenticated;set request.jwt.claim.sub='b0000000-0000-4000-8000-000000000001';select buy_cosmetic('frame-ember','UTC');select get_gamification_state('UTC');select pg_sleep(0.1);commit;" >/dev/null &
 if [[ "$device" == 1 ]]; then first_device=$!;else second_device=$!;fi
done
wait "$first_device";wait "$second_device"
docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 <<'SQL'
do $$ begin
 if (select count(*) from gf_inventory where user_id='b0000000-0000-4000-8000-000000000001')<>1 or
  (select balance from coin_wallets where user_id='b0000000-0000-4000-8000-000000000001')<>410 or
  (select count(*) from coin_movements where user_id='b0000000-0000-4000-8000-000000000001' and kind='mission')<>1 then raise exception 'Concurrent purchase or mission duplicated';end if;
end $$;
select 'PASS two concurrent devices: one permanent purchase, one debit and one mission reward';
SQL
# Concurrent devices issue one new cycle, even with different suggested timezones.
docker exec "$task_container" psql -U postgres -v ON_ERROR_STOP=1 -c "insert into auth.users(id) values('b0000000-0000-4000-8000-000000000002');insert into profiles(id,nickname) values('b0000000-0000-4000-8000-000000000002','gamify.rotation');set request.jwt.claim.sub='b0000000-0000-4000-8000-000000000002';select save_training_plan(array(select x from generate_series(1,7) x where x<>extract(isodow from current_date+1)::integer and x<>extract(isodow from current_date+2)::integer),0,'UTC',false);"
for device in 1 2; do
 if [[ "$device" == 1 ]];then task_timezone=UTC;else task_timezone=Pacific/Kiritimati;fi
 docker exec "$task_container" psql -U postgres -v ON_ERROR_STOP=1 -c "begin;set role authenticated;set request.jwt.claim.sub='b0000000-0000-4000-8000-000000000002';select get_gamification_state('$task_timezone');select pg_sleep(0.1);commit;" >/dev/null &
 if [[ "$device" == 1 ]];then first_device=$!;else second_device=$!;fi
done
wait "$first_device";wait "$second_device"
docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 <<'SQL'
do $$ begin
 if (select count(*) from gf_cycles where user_id='b0000000-0000-4000-8000-000000000002')<>1
  or(select count(*) from gf_missions where user_id='b0000000-0000-4000-8000-000000000002')<>3
  or(select count(*) from coin_movements where user_id='b0000000-0000-4000-8000-000000000002' and kind in('mission','weekly-bonus'))<>0
 then raise exception 'Concurrent devices duplicated or rewarded an uncompleted cycle';end if;
end $$;
select 'PASS two devices: one rotating cycle, three missions, fixed timezone, no unearned rewards';
SQL

bash "$task_root/scripts/test-shop-concurrency.sh" "$task_container"

bash "$task_root/scripts/test-notification-concurrency.sh" "$task_container"

bash "$task_root/scripts/test-notification-consent-concurrency.sh" "$task_container"

# Validate all previous contracts before applying the storefront retirement migration.
docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/tests/profile-cosmetics-legacy-setup.sql"
docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/migrations/202610190030_profile_cosmetics.sql"
docker exec "$task_container" psql -U postgres -v ON_ERROR_STOP=1 -f /tmp/fokus-tests/profile-cosmetics.sql
bash "$task_root/scripts/test-profile-shop-concurrency.sh" "$task_container"

docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/tests/automatic-kits-migration-setup.sql"
docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/migrations/202610200031_automatic_medical_kits.sql"
docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/tests/automatic-medical-kits.sql"
bash "$task_root/scripts/test-automatic-kits-concurrency.sh" "$task_container"

# Expand only after all previous contracts have been validated unchanged.
docker cp "$task_root/src/achievementCatalog.json" "$task_container:/tmp/fokus-tests/achievement-catalog.json"
docker exec "$task_container" chmod 755 /tmp/fokus-tests
docker exec "$task_container" chmod 644 /tmp/fokus-tests/achievement-catalog.json
docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/tests/achievement-catalog-legacy-setup.sql"
docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/migrations/202610200032_achievement_catalog.sql"
docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/tests/achievement-catalog.sql"
bash "$task_root/scripts/test-achievements-concurrency.sh" "$task_container"

# Verify existing confirmation, planning, economy, missions, reports and Arena
# against the expanded catalog too, not only against its predecessor.
for file in gamification-missions gamification-rotating-missions gamification-achievements gamification-reports gamification-challenges workout-recording manual-workout-confirmation flexible-training-plans; do
 docker exec "$task_container" psql -U postgres -v ON_ERROR_STOP=1 -f "/tmp/fokus-tests/$file.sql"
done

# Incremental Arena phases, after validating all legacy contracts above.
docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/tests/arena-groups-legacy-setup.sql"
docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/migrations/202610200033_arena_groups.sql"
docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/tests/arena-groups.sql"
docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/tests/arena-legacy-setup.sql"
docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/migrations/202610200034_arena_interactions.sql"
docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/tests/arena-interactions.sql"
bash "$task_root/scripts/test-arena-concurrency.sh" "$task_container"

# Index-only optimization follows the fully validated Arena schema.
docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/migrations/202610200035_query_indexes.sql"
docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/tests/query-indexes.sql"

# Friendship-scoped profile data extends the existing medal/privacy contract.
docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/migrations/202610200036_friend_profile.sql"
docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/tests/friend-profile.sql"

# Notifications replace the previous inbox only after its legacy contracts pass.
docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/tests/arena-taunt-replies-legacy-setup.sql"
docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/migrations/202610200037_arena_taunt_replies.sql"
docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/tests/arena-taunt-replies.sql"
bash "$task_root/scripts/test-taunt-reply-concurrency.sh" "$task_container"

# Capacity changes preserve oversized legacy groups and all consolidated results.
docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/tests/group-capacity-legacy-setup.sql"
docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/migrations/202610200038_group_capacity_five.sql"
docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/tests/group-capacity.sql"
bash "$task_root/scripts/test-group-capacity-concurrency.sh" "$task_container"

# Random originals use a separate daily allowance from replies; preserve live legacy receipts.
docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/tests/arena-daily-taunts-legacy.sql"
docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/migrations/202610200039_random_daily_taunts.sql"
docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/tests/arena-daily-taunts.sql"
bash "$task_root/scripts/test-daily-taunt-concurrency.sh" "$task_container"

# Only after legacy and current taunt contracts pass, validate global delivery.
docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/migrations/202610210040_global_arena_notices.sql"
docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/tests/global-arena-notices.sql"
bash "$task_root/scripts/test-global-taunt-concurrency.sh" "$task_container"
docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/migrations/202610220041_auth_hardening.sql"
docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/tests/auth-hardening.sql"
bash "$task_root/scripts/test-login-budget-concurrency.sh" "$task_container"
docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/tests/security-boundaries.sql"

# New requirements are checked only after all legacy contracts above pass.
docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/migrations/202610220042_protection_eligibility_friend_lookup.sql"
docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/tests/protection-eligibility.sql"
bash "$task_root/scripts/test-protection-eligibility-concurrency.sh" "$task_container"

# Final review changes are checked only after every prior contract has passed.
for final_file in 202610240044_transaction_day_boundary 202610240045_account_deletion_privacy; do
 docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/migrations/$final_file.sql"
done
for final_test in midnight-boundary account-deletion; do
 docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/tests/$final_test.sql"
done
