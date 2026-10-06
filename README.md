# FEDMOGA V2

A Next.js application for FEDMOGA registration, member accounts and calendar-based dues. Runs on Node.js 22 with MySQL/MariaDB, including Hostinger Node.js hosting.

## Features

- All V1 registration, Paystack test/live checkout, form builder, manual registration approval, administrator roles and test-cleanup features.
- One-time registration fee separate from monthly, quarterly and annual dues. Admins can configure each amount.
- Verified member accounts created after registration, password activation/reset, payment history and active/overdue/inactive status.
- Member-initiated payments only. Monthly coverage ends at month-end, quarterly at calendar quarter-end and annually on December 31. Early renewals extend existing coverage; expired renewals cover the current period. The member sees coverage dates before checkout.
- Paystack verification, signed webhooks and transactional payment handling prevent duplicate renewals. Customer-borne processing charges are accepted when the transaction otherwise matches and covers the dues fee.
- Branded email receipts, scheduled dues reminders, durable email delivery with retries and administrator delivery controls.
- Manual bank-transfer dues approval, member and collection reports, CSV exports and outstanding-dues estimates.
- Existing V1 registrations can receive accounts without registering or paying the registration fee again. Super Admin migration and account activation support this flow.
- A dedicated incomplete-checkout menu displays payer name, email and phone and lets administrators email payment reminders.

## Deployment and V1 migration

Read [DEPLOYMENT_V2.md](DEPLOYMENT_V2.md) before deploying from `Mustymustapha12/FEDMOGA_V2`. Use a separate application and database. Back up and copy the V1 database into the V2 database to retain existing registrations, payments and settings. Preserve its `FEDMOGA_ENCRYPTION_KEY` so existing encrypted settings remain readable.

The guide covers environment variables, calendar rules, account migration, Paystack webhooks and the required email scheduler. Deploying the application alone does not install a scheduled job. Configure either the included GitHub Actions workflow or an external scheduler for `/api/jobs/run`.

Use `.env.example` as the configuration reference. Keep credentials private and out of Git. Start with test Paystack checkout and `ALLOW_LIVE_PAYMENTS=false`. Check `/api/health` after deployment. A build does not prove the running application can connect to the database.

## Local development

```sh
npm ci
# Copy .env.example to .env.local and configure a dedicated local database.
# For development, use APP_URL=http://localhost:3000.
npm run dev
npm run typecheck
npm run build
npm test
```

Database integration tests require a dedicated empty test database, `FEDMOGA_RUN_DB_TESTS=true` and test database variables. Never run these tests against member data. `FEDMOGA_APP_TEST_URL` enables HTTP integration checks against an application using that same test database. Payment and SMTP responses are mocked in these tests.

## Administration and operations

Admins and Super Admins can configure registration fees, form fields and dues prices, review records, approve manual payments and send member/payment reminders. Paystack keys and mode, administrator management, bulk member migration, email-job controls and destructive cleanup are restricted to Super Admins.

Authentication uses password hashes, separate administrator/member sessions, protected cookies, origin validation and rate limits. Email verification and password changes invalidate old activation links and sessions. Membership expiry does not prevent an enabled member signing in to renew.

Reports use recorded dues fees; receipts also show the actual Paystack amount charged. Outstanding dues are an estimate at current prices, not an arrears ledger. Screens show bounded record sets; retain database backups for complete history.

Test cleanup removes associated test members, dues and queued emails through database relationships. Live records are preserved. Explicit deletion of a manual test entry must only be used for practice data. Deleted data requires a backup to recover.

Validate V2 against your actual hosting, SMTP mailbox and Paystack test credentials before live operation. Database/HTTP tests do not verify those external services. Successful SMTP acceptance does not guarantee inbox delivery; check spam and provider logs. PDF receipts are not included.
