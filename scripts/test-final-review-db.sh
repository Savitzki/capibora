#!/usr/bin/env bash
set -euo pipefail
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
container=$(docker run --detach --rm --network none --env POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine)
trap 'docker rm --force "$container" >/dev/null 2>&1 || true' EXIT
for attempt in $(seq 1 120); do
 if docker exec "$container" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then break; fi
 sleep .25
done
docker exec "$container" pg_isready -h 127.0.0.1 -U postgres >/dev/null
docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 < "$root/supabase/tests/bootstrap.sql"
docker exec "$container" psql -U postgres -v ON_ERROR_STOP=1 -c 'alter table auth.users add column email text;'
for file in "$root"/supabase/migrations/*.sql; do
 docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 < "$file"
done
docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 < "$root/supabase/tests/security-boundaries.sql"
for file in midnight-boundary account-deletion; do
 if [[ -f "$root/supabase/tests/$file.sql" ]]; then
  docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 < "$root/supabase/tests/$file.sql"
 fi
done
bash "$root/scripts/test-workout-concurrency.sh" "$container"
bash "$root/scripts/test-protection-eligibility-concurrency.sh" "$container"
bash "$root/scripts/test-final-review-concurrency.sh" "$container"
