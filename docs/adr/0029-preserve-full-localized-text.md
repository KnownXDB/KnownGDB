# ADR 0029: Preserve full localized text

Status: local implementation; migration and real-service acceptance pending.

Reviewed summaries and descriptions must not be truncated or normalized merely to
fit arbitrary field length limits. Remove the 500-character summary and 20,000-
character description database checks, including the legacy approved projection.
Remove corresponding API and form character limits and preserve whitespace and
Unicode text in summaries and descriptions. Quick draft creation accepts longer
descriptions as well. Text containing a NUL character is rejected explicitly
because PostgreSQL text cannot store it; it is never silently altered.

The metadata, draft creation and intake-preview JSON requests are bounded to
1 MiB in the local Node adapter and handler. Larger payloads receive an error;
they are not truncated. This transport bound and hosted platform constraints
mean the API is not an unlimited text transport. Source clients must retain any
text that exceeds the request bound. Existing data and revisions are preserved;
only constraints are removed and the draft function is updated. Remote migration
and deployment require separate explicit authorization.
