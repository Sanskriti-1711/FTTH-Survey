#!/usr/bin/env bash
# Print "<table> <md5>" for every gis.* table holding rows for the HLD source
# project of the e2e survey project. The mutating cases must not change these:
# edits only create survey rows, so any difference means a case wrote to the
# HLD layers, which db-reset.sh does not restore.
#
# The gis tables key rows by the FTTH project id without dashes; the survey
# project points at it through business.projects.source_ftth_project_id.
#
# Required env: PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE
# Optional: E2E_SURVEY_PROJECT_ID (same default as db-snapshot.sh)
set -euo pipefail

PROJECT="${E2E_SURVEY_PROJECT_ID:-a443bfc7-d7e9-4ca9-9402-43dc0b731fc8}"

SRC=$(psql -X -At -v ON_ERROR_STOP=1 -c "select replace(source_ftth_project_id::text,'-','') from business.projects where id='$PROJECT'" | tr -d '\r')
[ -n "$SRC" ] || { echo "no source_ftth_project_id for project $PROJECT" >&2; exit 1; }

TABLES=$(psql -X -At -c "select table_name from information_schema.columns where table_schema='gis' and column_name='project_id' group by table_name order by table_name" | tr -d '\r')

for t in $TABLES; do
  h=$(psql -X -At -v ON_ERROR_STOP=1 -c "select coalesce(md5(string_agg(x::text, E'\n' order by x::text)), 'empty') from gis.\"$t\" x where replace(x.project_id::text,'-','')='$SRC'" | tr -d '\r')
  echo "$t $h"
done
