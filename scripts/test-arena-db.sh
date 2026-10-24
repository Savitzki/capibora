#!/usr/bin/env bash
set -euo pipefail
task_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
task_container=$(docker run --detach --rm --network none --env POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine)
trap 'docker rm --force "$task_container" >/dev/null 2>&1 || true' EXIT
for attempt in $(seq 1 120);do if docker exec "$task_container" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1;then break;fi;sleep .25;done
docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/tests/bootstrap.sql"
docker exec "$task_container" psql -U postgres -c 'alter table auth.users add column email text;'
for file in "$task_root"/supabase/migrations/*.sql;do
 if [[ "$file" == *202610240044* || "$file" == *202610240045* || "$file" == *202610220042* || "$file" == *202610200039* || "$file" == *202610210040* || "$file" == *202610220041* ]];then continue;fi
 if [[ ( "$file" == *202610200038* || "$file" == *202610200034* || "$file" == *202610200035* || "$file" == *202610200036* || "$file" == *202610200037* ) && "${1:-}" == phase1 ]];then continue;fi
 if [[ "$file" == *202610200033* ]];then docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/tests/arena-groups-legacy-setup.sql";fi
 if [[ "$file" == *202610200034* ]];then docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/tests/arena-legacy-setup.sql";fi
 if [[ "$file" == *202610200037* ]];then docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/tests/arena-taunt-replies-legacy-setup.sql";fi
 if [[ "$file" == *202610200038* ]];then docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/tests/group-capacity-legacy-setup.sql";fi
 docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$file"
 if [[ "$file" == *202610200038* ]];then docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/tests/group-capacity.sql";fi
 if [[ "$file" == *202610200033* ]];then docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/tests/arena-groups.sql";fi
 if [[ "$file" == *202610200034* ]];then docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/tests/arena-interactions.sql";fi
done

if [[ "${1:-}" != phase1 ]];then docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/tests/query-indexes.sql";fi
if [[ "${1:-}" != phase1 ]];then bash "$task_root/scripts/test-arena-concurrency.sh" "$task_container";fi

if [[ "${1:-}" != phase1 ]];then docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/tests/friend-profile.sql";fi

if [[ "${1:-}" != phase1 ]];then
 docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/tests/arena-taunt-replies.sql"
 bash "$task_root/scripts/test-taunt-reply-concurrency.sh" "$task_container"
fi

if [[ "${1:-}" != phase1 ]];then
 bash "$task_root/scripts/test-group-capacity-concurrency.sh" "$task_container"
fi

if [[ "${1:-}" != phase1 ]];then
 docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/tests/arena-daily-taunts-legacy.sql"
 docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/migrations/202610200039_random_daily_taunts.sql"
 docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/tests/arena-daily-taunts.sql"
 bash "$task_root/scripts/test-daily-taunt-concurrency.sh" "$task_container"
fi

if [[ "${1:-}" != phase1 ]];then

# Only after legacy and current taunt contracts pass, validate global delivery.
docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/migrations/202610210040_global_arena_notices.sql"
docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/tests/global-arena-notices.sql"
bash "$task_root/scripts/test-global-taunt-concurrency.sh" "$task_container"
docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/migrations/202610220041_auth_hardening.sql"
docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/tests/auth-hardening.sql"
bash "$task_root/scripts/test-login-budget-concurrency.sh" "$task_container"
docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/tests/security-boundaries.sql"
fi

if [[ "${1:-}" != phase1 ]];then
# New requirements are checked only after all legacy contracts above pass.
docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/migrations/202610220042_protection_eligibility_friend_lookup.sql"
docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/tests/protection-eligibility.sql"
bash "$task_root/scripts/test-protection-eligibility-concurrency.sh" "$task_container"
fi

if [[ "${1:-}" != phase1 ]];then
# Final review changes are checked only after every prior contract has passed.
for final_file in 202610240044_transaction_day_boundary 202610240045_account_deletion_privacy; do
 docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/migrations/$final_file.sql"
done
for final_test in midnight-boundary account-deletion; do
 docker exec -i "$task_container" psql -U postgres -v ON_ERROR_STOP=1 < "$task_root/supabase/tests/$final_test.sql"
done
fi
