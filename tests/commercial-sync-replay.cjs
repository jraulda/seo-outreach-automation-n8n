'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflow = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '..', 'workflows', '05-sent-outreach-crm-sync.json'),
    'utf8',
  ),
);
const code = workflow.nodes.find(
  node => node.name === 'Prepare CRM Outreach Updates',
).parameters.jsCode;
const run = (sent, crm) =>
  new Function('$', code)(name => ({
    all: () => {
      if (name === 'Select Sent Outreach Not Synced') {
        return sent.map(json => ({ json }));
      }
      if (name === 'Read CRM Master') {
        return crm.map(json => ({ json }));
      }
      return [];
    },
  }));

const draft = {
  lead_id: 'lead_0001',
  draft_id: 'followup_lead_0001_100',
  campaign_id: 'example_outreach_followup_2026_09',
  draft_status: 'Sent',
  sent_at: '2026-11-10',
  notes: '',
};
const lead = {
  lead_id: 'lead_0001',
  outreach_status: 'Sent',
  follow_up_count: 1,
  last_contact_date: '2026-11-01',
  next_action_date: '2026-11-06',
  notes: 'Prior human note',
};

// CRM succeeds, but marking the draft row as synced fails. A retry must
// still return the draft for marking without incrementing the count again.
const first = run([draft], [lead]);
assert.equal(first.length, 1);
assert.equal(first[0].json.follow_up_count, 2);
assert.equal(first[0].json.outreach_status, 'Stopped');
assert.equal(first[0].json.notes, 'Prior human note | [atlas_outreach_sync:followup_lead_0001_100]');
const retry = run([draft], [first[0].json]);
assert.equal(retry.length, 1);
assert.equal(retry[0].json.follow_up_count, 2);
assert.equal(retry[0].json.notes, first[0].json.notes);
assert.equal(retry[0].json.outreach_draft_id, draft.draft_id);
assert.equal(run([draft, draft], [lead]).length, 1);

const initial = {
  ...draft,
  draft_id: 'draft_lead_0001_099',
  campaign_id: 'example_outreach_2026_09_no_offer',
  sent_at: '2026-11-01',
};
const batch = run([initial, draft], [{ ...lead, follow_up_count: 0, notes: '' }]);
assert.equal(batch.length, 2);
assert.equal(batch[0].json.follow_up_count, 0);
assert.equal(batch[1].json.follow_up_count, 1);
assert.ok(batch[1].json.notes.includes('draft_lead_0001_099'));
assert.ok(batch[1].json.notes.includes('followup_lead_0001_100'));

const update = workflow.nodes.find(node => node.name === 'Update CRM Outreach Status');
assert.equal(update.parameters.columns.value.notes, '={{ $json.notes }}');
assert.deepEqual(update.parameters.columns.matchingColumns, ['lead_id']);
console.log('Commercial CRM replay regressions passed.');

