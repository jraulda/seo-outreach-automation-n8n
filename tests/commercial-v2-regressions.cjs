'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const names = [
  '01-lead-qualification.json',
  '02-outreach-draft-generation.json',
  '03-approved-gmail-drafts.json',
  '04-follow-up-monitor.json',
  '05-sent-outreach-crm-sync.json',
  '06-gmail-reply-classifier.json',
];
const workflows = Object.fromEntries(
  names.map(name => [name, JSON.parse(fs.readFileSync(path.join(root, 'workflows', name), 'utf8'))]),
);
const node = (workflow, name) => {
  const result = workflow.nodes.find(item => item.name === name);
  assert.ok(result, 'Missing node: ' + name);
  return result;
};
const run = (workflow, name, rows, lookup = () => []) =>
  new Function('$input', '$', node(workflow, name).parameters.jsCode)(
    { all: () => rows },
    key => ({ all: () => lookup(key) }),
  );

// Check that every connection in each supplied export points to a real node.
for (const workflow of Object.values(workflows)) {
  const nodes = new Set(workflow.nodes.map(item => item.name));
  assert.equal(nodes.size, workflow.nodes.length, workflow.name + ': duplicate node names');
  for (const [source, channels] of Object.entries(workflow.connections)) {
    assert.ok(nodes.has(source), workflow.name + ': missing source ' + source);
    for (const groups of Object.values(channels)) {
      for (const group of groups) {
        for (const edge of group) {
          assert.ok(nodes.has(edge.node), workflow.name + ': missing target ' + edge.node);
        }
      }
    }
  }
}

const monitor = workflows['04-follow-up-monitor.json'];
const sync = workflows['05-sent-outreach-crm-sync.json'];
const gmail = workflows['03-approved-gmail-drafts.json'];
const lead = (id, status, count, extra = {}) => ({
  json: {
    lead_id: id,
    outreach_status: status,
    follow_up_count: count,
    next_action_date: '2000-01-01',
    primary_email: id + '@example.invalid',
    ...extra,
  },
});
const due = run(monitor, 'Select Leads Due for Follow-up', [
  lead('first', 'Sent', 0),
  lead('second', 'Sent', 1),
  lead('finished', 'Stopped', 2),
  lead('optout', 'Sent', 0, { do_not_contact: true }),
  lead('replied', 'Sent', 0, { last_reply_message_id: 'reply-1' }),
  lead('future', 'Sent', 0, { next_action_date: '2999-01-01' }),
]);
assert.deepEqual(due.map(item => item.json.lead_id), ['first', 'second']);

const staleDate = run(monitor, 'Select Leads Due for Follow-up', [
  lead('stale-date', 'Sent', 1, { next_action_date: '2026-08-22', last_contact_date: '2026-08-25' }),
  lead('valid-date', 'Sent', 1, { next_action_date: '2026-09-10', last_contact_date: '2026-09-03' }),
  lead('no-next-date', 'Sent', 1, { next_action_date: '', last_contact_date: '2026-09-03' }),
]);
assert.deepEqual(staleDate.map(item => item.json.lead_id), ['valid-date']);

const initialSent = {
  json: {
    lead_id: 'second',
    draft_id: 'initial-1',
    campaign_id: 'example_outreach_2026_09_no_offer',
    draft_status: 'Sent',
    sent_at: '2026-11-01',
  },
};
const approvedFollowUp = {
  json: {
    lead_id: 'second',
    draft_id: 'followup-1',
    campaign_id: 'example_outreach_followup_2026_09',
    draft_status: 'Approved to draft',
  },
};
const dueSecond = key => key === 'Select Leads Due for Follow-up' ? [due[1]] : [];
assert.equal(
  run(monitor, 'Match Lead to Sent Email', [initialSent, approvedFollowUp], dueSecond).length,
  0,
  'A pending approved follow-up must block a duplicate draft',
);
const next = run(monitor, 'Match Lead to Sent Email', [initialSent], dueSecond);
assert.equal(next.length, 1);
assert.equal(next[0].json.follow_up_number, 2);

const sentFollowUp = {
  json: {
    lead_id: 'second',
    draft_id: 'followup-1',
    campaign_id: 'example_outreach_followup_2026_09',
    draft_status: 'Sent',
    sent_at: '2026-11-10',
    notes: '',
  },
};
const sentInitial = {
  json: {
    lead_id: 'first',
    draft_id: 'initial-2',
    campaign_id: 'example_outreach_2026_09_no_offer',
    draft_status: 'Sent',
    sent_at: '2026-11-10',
    notes: '',
  },
};
const alreadySynced = {
  json: { ...sentFollowUp.json, notes: 'CRM synced: 2026-11-10T12:00:00Z' },
};
assert.equal(
  run(monitor, 'Match Lead to Sent Email', [initialSent, sentFollowUp], key =>
    key === 'Select Leads Due for Follow-up' ? [lead('second', 'Sent', 0)] : []
  ).length,
  0,
  'A sent follow-up awaiting CRM sync must block another follow-up draft',
);
const pending = run(sync, 'Select Sent Outreach Not Synced', [
  sentFollowUp,
  sentInitial,
  alreadySynced,
]);
assert.equal(pending.length, 2);

const prepared = run(sync, 'Prepare CRM Outreach Updates', [], key => {
  if (key === 'Select Sent Outreach Not Synced') return pending;
  if (key === 'Read CRM Master') return [
    lead('second', 'Sent', 1),
    lead('first', 'Draft prepared', 0),
  ];
  return [];
});
assert.equal(prepared.length, 2);
const second = prepared.find(item => item.json.lead_id === 'second').json;
const first = prepared.find(item => item.json.lead_id === 'first').json;
assert.equal(second.follow_up_count, 2);
assert.equal(second.outreach_status, 'Stopped');
assert.equal(second.next_action_date, '');
assert.equal(first.follow_up_count, 0);
assert.equal(first.outreach_status, 'Sent');
assert.ok(first.next_action_date);

const syncedMapping = node(sync, 'Mark Outreach Row Synced').parameters.columns;
assert.deepEqual(syncedMapping.matchingColumns, ['draft_id']);
assert.equal(syncedMapping.value.lead_id, undefined);
assert.ok(syncedMapping.value.notes.includes('CRM synced'));

const approved = run(gmail, 'Filter Drafts Approved for Gmail', [
  { json: { draft_status: 'Approved to draft', recipient_email: 'lead@example.invalid', subject: 'Hello', body: 'Hi', gmail_draft_id: '' } },
  { json: { draft_status: 'Pending review', recipient_email: 'lead@example.invalid', subject: 'Hello', body: 'Hi', gmail_draft_id: '' } },
]);
assert.equal(approved.length, 1);

console.log('Commercial v2 regressions passed.');

