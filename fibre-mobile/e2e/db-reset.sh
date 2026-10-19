#!/usr/bin/env bash
# Restore the survey rows for one project from the CSVs written by db-snapshot.sh.
# Deletes the current scope rows (including rows the tests created), then
# re-inserts the snapshot, all inside one transaction.
#
# Required env: PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE
# Optional: E2E_SURVEY_PROJECT_ID, E2E_SNAPSHOT_DIR (same defaults as db-snapshot.sh)
set -euo pipefail

# Destructive: the e2e mutating cases only run when the operator opts in.
if [ "${E2E_ALLOW_DB_RESET:-}" != "1" ]; then
  echo "refusing to reset: set E2E_ALLOW_DB_RESET=1 to restore project rows" >&2
  exit 1
fi

PROJECT="${E2E_SURVEY_PROJECT_ID:-a443bfc7-d7e9-4ca9-9402-43dc0b731fc8}"
DIR="${E2E_SNAPSHOT_DIR:-$(git -C "$(dirname "$0")" rev-parse --show-toplevel)/tmp/e2e-snapshot}"

for f in features survey_surveyfeature survey_gpstrace survey_gpspoint survey_surveyeditlog \
         survey_approvalrecord survey_existingasset survey_fieldevidence survey_hazard \
         survey_riskassessment survey_surveystatus survey_trenchsurvey; do
  [ -f "$DIR/$f.csv" ] || { echo "missing snapshot file: $DIR/$f.csv" >&2; exit 1; }
done

F="(select id from business.features where project_id='$PROJECT')"
S="(select id from business.survey_surveyfeature where project_id='$PROJECT')"
G="(select id from business.survey_gpstrace where project_id='$PROJECT')"

# Children first (they reference features / survey features / traces).
# Scopes are evaluated before any parent row is deleted.
SQL=$(cat <<EOF
begin;
delete from business.survey_gpspoint where trace_id in $G;
delete from business.survey_surveyeditlog where feature_id in $F;
delete from business.survey_approvalrecord where survey_feature_id in $S;
delete from business.survey_existingasset where survey_feature_id in $S or feature_id in $F;
delete from business.survey_fieldevidence where survey_feature_id in $S or feature_id in $F;
delete from business.survey_hazard where survey_feature_id in $S or feature_id in $F;
delete from business.survey_riskassessment where survey_feature_id in $S or feature_id in $F;
delete from business.survey_surveystatus where survey_feature_id in $S or feature_id in $F;
delete from business.survey_trenchsurvey where survey_feature_id in $S or feature_id in $F;
delete from business.survey_surveyfeature where project_id='$PROJECT';
delete from business.survey_gpstrace where project_id='$PROJECT';
delete from business.features where project_id='$PROJECT';
\copy business.features from '$DIR/features.csv' csv header
\copy business.survey_gpstrace from '$DIR/survey_gpstrace.csv' csv header
\copy business.survey_surveyfeature from '$DIR/survey_surveyfeature.csv' csv header
\copy business.survey_gpspoint from '$DIR/survey_gpspoint.csv' csv header
\copy business.survey_surveyeditlog from '$DIR/survey_surveyeditlog.csv' csv header
\copy business.survey_approvalrecord from '$DIR/survey_approvalrecord.csv' csv header
\copy business.survey_existingasset from '$DIR/survey_existingasset.csv' csv header
\copy business.survey_fieldevidence from '$DIR/survey_fieldevidence.csv' csv header
\copy business.survey_hazard from '$DIR/survey_hazard.csv' csv header
\copy business.survey_riskassessment from '$DIR/survey_riskassessment.csv' csv header
\copy business.survey_surveystatus from '$DIR/survey_surveystatus.csv' csv header
\copy business.survey_trenchsurvey from '$DIR/survey_trenchsurvey.csv' csv header
commit;
EOF
)

printf '%s\n' "$SQL" | psql -X -v ON_ERROR_STOP=1 -q
echo "restored project $PROJECT from $DIR"
