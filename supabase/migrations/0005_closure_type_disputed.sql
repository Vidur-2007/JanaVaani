-- Supervisors can close a disputed resolution (POST /officer/grievances/{id}/dispute, Spec C §5.3 "close as disputed";
-- master rule 10: humans decide disputed closures). Adds 'disputed' to the allowed closure types. Idempotent.
alter table grievances drop constraint if exists grievances_closure_type_check;
alter table grievances add constraint grievances_closure_type_check
  check (closure_type in ('citizen_verified', 'auto_closed_unverified', 'rejected', 'disputed'));
