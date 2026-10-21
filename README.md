# SEO Outreach Automation for n8n

Six example workflows covering lead qualification, human-reviewed outreach drafts, Gmail draft creation, follow-up preparation, CRM synchronization, and reply classification. The provider and lead data are fictional. Exports are **inactive**, with credential bindings removed.

| Order | Workflow | Purpose |
| --- | --- | --- |
| 1 | Lead Qualification | Score evidence from a company site and save the result to CRM. |
| 2 | Outreach Draft Generation | Create an email draft for leads approved in CRM. |
| 3 | Create Approved Gmail Drafts | Create Gmail drafts only after a reviewer sets `draft_status` to `Approved to draft`. Follow-ups require the original Gmail thread. |
| 4 | Follow-up Monitor | Prepare a follow-up row for human review; it does not send. |
| 5 | Sync Sent Outreach to CRM | Sync sent status recorded in the outreach sheet to CRM. |
| 6 | Gmail Reply Classifier | Classify matched replies, update CRM, and optionally send an **internal** alert. |

## Setup

1. Import each JSON file into n8n. The six exports are separate workflows; no cross-workflow IDs are required.
2. Connect your own Google Sheets, Gmail, and OpenAI credentials in n8n. Credentials are not stored here.
3. Replace `REPLACE_WITH_SPREADSHEET_ID` in each Google Sheets node, and map the `crm_master`, `outreach_drafts`, and `scoring_log` tabs and column headers to your own spreadsheet. The export schemas show the expected column names. Clear and remap stale node columns in the editor if necessary.
4. Replace `alerts@example.com` with your own internal alert address only if enabling the reply alert. Replace the fictional signature and service description before use.
5. Review campaign eligibility and consent, site request limits, inbox access, email claims, and scheduled triggers before activation. Run with fictional data first.

## Review gates

Qualification is advisory and does not authorize outreach. Workflow 2 filters for approved leads and saves text as `Pending review`. Workflow 3 filters for `Approved to draft` and creates Gmail drafts; sending remains a separate human action. Workflow 4 saves follow-ups as `Draft ready for review`; a reviewer must approve them before workflow 3 can create Gmail drafts. Workflow 6 contains an internal alert sender and should be configured before activation. No workflow automatically sends mail to leads.

These are sanitized reference exports, not a connected demo environment. Live behavior depends on your own sheet layout, credentials, Gmail permissions, and n8n version. Existing model selections are retained from the exports and should be reviewed against the provider's current support policy before activation.
