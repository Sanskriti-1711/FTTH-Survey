#!/usr/bin/env bash
# Snapshot the business.* survey rows for one project to CSV files.
# Used before the mutating P0 e2e cases; db-reset.sh restores them.
#
# Required env (from the repo-root .env): PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE
# Optional: E2E_SURVEY_PROJECT_ID (default: the active UI-Brownfield-Verify survey copy)
#           E2E_SNAPSHOT_DIR      (default: ../../../tmp/e2e-snapshot)
set -euo pipefail

PROJECT="${E2E_SURVEY_PROJECT_ID:-a443bfc7-d7e9-4ca9-9402-43dc0b731fc8}"
DIR="${E2E_SNAPSHOT_DIR:-$(git -C "$(dirname "$0")" rev-parse --show-toplevel)/tmp/e2e-snapshot}"
mkdir -p "$DIR"

# Scope definitions shared with db-reset.sh (see db-reset.sh for the same list).
F="(select id from business.features where project_id='$PROJECT')"
S="(select id from business.survey_surveyfeature where project_id='$PROJECT')"
G="(select id from business.survey_gpstrace where project_id='$PROJECT')"

export_table() {
  local name="$1" where="$2"
  psql -X -v ON_ERROR_STOP=1 -c "\copy (select * from business.$name where $where) to '$DIR/$name.csv' csv header"
}

export_table features                 "project_id='$PROJECT'"
export_table survey_surveyfeature     "project_id='$PROJECT'"
export_table survey_gpstrace          "project_id='$PROJECT'"
export_table survey_gpspoint          "trace_id in $G"
export_table survey_surveyeditlog     "feature_id in $F"
export_table survey_approvalrecord    "survey_feature_id in $S"
export_table survey_existingasset     "survey_feature_id in $S or feature_id in $F"
export_table survey_fieldevidence     "survey_feature_id in $S or feature_id in $F"
export_table survey_hazard            "survey_feature_id in $S or feature_id in $F"
export_table survey_riskassessment    "survey_feature_id in $S or feature_id in $F"
export_table survey_surveystatus      "survey_feature_id in $S or feature_id in $F"
export_table survey_trenchsurvey      "survey_feature_id in $S or feature_id in $F"

echo "snapshot written to $DIR for project $PROJECT"
wc -l "$DIR"/*.csv
