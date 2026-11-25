# Validation and release checklist

## Offline checks

Run with Node.js from the repository root:

```sh
node tests/commercial-v2-regressions.cjs
node tests/commercial-sync-replay.cjs
```

The tests execute exported Code-node logic using fictional rows. They cover graph references, approval gates, follow-up eligibility, opt-outs and replies, stale dates, pending drafts, sent follow-ups awaiting synchronization, CRM mappings, replay after a partial failure, duplicate input, and two messages for one lead in one preparation run. They do not call n8n, Gmail, Google Sheets, or a model provider.

## Retry protection

Workflow 05 writes an `[atlas_outreach_sync:<encoded draft_id>]` marker into CRM `notes` in the same row update as the count and status. If the later draft-row update fails, a sequential retry finds the marker and finishes marking the draft without incrementing again. Existing human notes are preserved.

Keep `draft_id` unique and immutable, preserve the markers, and run only one synchronization execution at a time. This is not a transactional guarantee across simultaneous executions or concurrent human edits. Historical sent rows must be reconciled before enabling the workflow: a row already counted but lacking a marker cannot be identified automatically. Multiple messages in one batch require ordered writes; the offline test checks preparation state, not Google Sheets write ordering. Backdated sends can overwrite contact dates, so reconcile chronological order before running historical data.

Workflow 04 rejects a next-action date on or before the last-contact date. It also blocks preparation when a pending follow-up exists or the sent follow-up count exceeds the CRM count.

## Disposable integration test

Use a separate spreadsheet and an inbox you control. Keep schedules disabled until every step passes.

1. Configure the six imported workflows with your own credentials and sheet mappings. Include CRM `notes`, `lead_id`, `follow_up_count`, `last_contact_date`, and `next_action_date`, and draft `draft_id`, `lead_id`, `campaign_id`, `draft_status`, `sent_at`, and `notes`.
2. Qualify a fictional lead, approve it, and prepare its initial draft. Confirm an unapproved row creates no Gmail draft. Use only an address you control if testing a manual send.
3. Synchronize one sent initial message, then a follow-up. Confirm the CRM count, dates, marker, and draft synchronization note agree.
4. Simulate a failure after the CRM write and before the draft synchronization note. Retry sequentially and verify that the count does not increase again.
5. Verify stale dates, a pending approved draft, an unsynchronized sent follow-up, an opt-out, and a recorded reply each prevent another follow-up. Verify the second follow-up stops further preparation.
6. Record the n8n version, workflow version, test date, expected/observed result, and reviewer privately. Do not publish inbox contents or execution data.

No live integration result or measured business improvement is claimed by this repository. Before replacing an existing workflow, export its current definition and retain it for rollback; restore that definition and its prior schedule if the controlled test fails.
