# FEDMOGA V2 deployment and migration

## Calendar rules

Registration is a one-time fee and does not pay membership dues. Admin and Super Admin set separate monthly, quarterly and annual prices in Memberships & dues. Zero disables a plan. Monthly coverage ends at the last day of the month; quarterly coverage ends March 31, June 30, September 30 or December 31; annual coverage ends December 31. All calendar calculations and reminder dates use Africa/Lagos.

An early renewal starts the day after the current paid-through date and extends to the next selected calendar boundary. If the previous membership is expired, the new payment covers the current calendar period; historical arrears are not automatically charged. There is no proration. For example, an annual first payment in October covers through December 31 of that year; the member sees the exact dates before checkout. Members initiate every payment; there are no recurring deductions or stored card charges.

Active means dues cover today; overdue means unpaid but within the configured grace period (default 30 days); inactive means beyond grace or access disabled. Newly registered members have no dues coverage until they pay dues. The outstanding report estimates one next renewal at current prices per unpaid enabled member; it does not claim historical arrears. Test/live membership accounts and financial reports are separate.

## Hostinger setup

Use a separate V2 Node.js website and database for testing. Do not point a staging V2 deployment at the live V1 database. Build: npm run build; application: Next.js; output: .next; Node.js 22 or newer. V2 preserves all V1 source features and existing tables, then automatically creates additional membership, session, token, dues, checkout-link and email-job tables. Do not delete or recreate existing data.

Copy the V1 environment configuration (.env.example lists names), change APP_URL to the V2 HTTPS domain, and configure a separate JOB_SECRET with at least 32 random characters. Keep ALLOW_LIVE_PAYMENTS=false during testing. Never commit credentials. When using a copy of the V1 database, retain its original FEDMOGA_ENCRYPTION_KEY so the existing encrypted Paystack keys and registration links can still be read. A fresh database can use a new encryption key.

In Paystack configure the V2 webhook as https://YOUR-V2-DOMAIN/api/paystack/webhook. Registration checkout sets /api/paystack/callback automatically; dues checkout sets /api/dues/callback automatically. Both use the same verified webhook. Configure and activate separate test/live keys in Super Admin Settings. Customer-borne fees are accepted as long as the verified total covers the saved fee, and reference, email, currency and mode match. Dues receipts record both the dues fee and total charged.

## Migrate members without another registration or registration fee

1. Back up/export the V1 MySQL database through Hostinger/phpMyAdmin.
2. Restore it into a **separate V2 database** and deploy V2 with that database's credentials and the matching encryption key. GitHub repositories contain source code, not the live registrations; copying source alone cannot migrate those registrations.
3. Sign in using the existing admin account. Open Memberships & dues, set dues prices, then Super Admin selects Create accounts for existing registrations. Batches contain up to 100 registrations. Repeat until eligible accounts are created. Registrations, numbers, payment records, form settings and admin users are retained.
4. Activation emails are queued. Members open the private 24-hour single-use link, choose a 12–128 character password and thereby verify their email. They can also select Activate / reset account at /member using their original email. This lazily creates an account for an eligible V1 registration if migration has not reached it yet.
5. Multiple V1 registrations sharing the same email and test/live mode use one member account. They are flagged for admin review; a second account is not silently created. Registration payments are not converted into dues.
6. New V2 registrations automatically create member accounts and queue activation emails in the same registration transaction.

For final cutover, briefly stop new registrations on V1, take the final database backup, restore and migrate V2, validate counts and SMTP, and then direct the public domain to V2. Avoid running both sites against diverging databases after cutover. Keep the V1 backup for rollback; do not import V1 data over an active V2 database with new payments.

## Automatic email jobs (required)

Welcome/reset emails, dues receipts and admin reminders are stored in an encrypted outbox. SMTP errors do not undo registrations or payments. Registration tries to process one queued email immediately when SMTP is configured. The scheduler delivers queued mail, retries failures with backoff, and creates reminders seven days before, one day before, on the due date, and 1/7/30 days overdue. Reminder and receipt keys prevent ordinary duplicates; SMTP delivery is at-least-once if the process crashes after the mail server accepts a message. Server acceptance is not proof of inbox delivery.

A scheduler must POST /api/jobs/run with `Authorization: Bearer YOUR_JOB_SECRET`. This endpoint processes five emails per call. Call it every 5–10 minutes; increase frequency when the queue grows. Never place the secret in a public URL. In Super Admin → Memberships & dues, Process next 5 queued emails offers a manual delivery check.

Two supported options:

- Included GitHub Actions workflow: in FEDMOGA_V2 → Settings → Secrets and variables → Actions add APP_URL (V2 HTTPS origin) and JOB_SECRET (the same runtime secret), enable Actions, and run Membership email jobs once manually. It then runs every ten minutes. GitHub schedules may be delayed; monitor runs and queue counts. The workflow is a scheduled caller, not a hosting service.
- A Hostinger/private external cron: run `node --env-file=/PRIVATE/PATH/job.env /APP/PATH/scripts/run-jobs.mjs` using Node 22+. The private env file needs APP_URL and JOB_SECRET. Keep it outside public web directories. Test the command once, then schedule it every 5–10 minutes.

Account links expire in 24 hours; request another if email delivery was delayed. Test email sending in Super Admin Settings first. Admin manually queues member activation/password-reset or dues-reminder emails; only Super Admin can process email jobs or migrate accounts.

## Incomplete checkout reminders

Admin → Payment not completed lists payers with full name, email, phone and an unconfirmed registration payment. Send payment reminder queues a branded email. New V2 checkouts save the original Paystack URL: the reminder verifies payment first, then opens that original checkout if not yet confirmed. Older V1 pending records lack a stored URL, so the reminder opens the site's payment-verification page. It never initiates a second charge automatically. Administrators can contact the payer using the displayed contact details.

## Manual dues

In Memberships & dues, choose a member and plan, enter actual bank amount, payment date and unique reference, and confirm bank receipt. This requires Admin/Super Admin sign-in. The amount must cover the configured plan. Approval records its actor, renews from the payment date/current coverage and queues a branded receipt. Duplicate bank references are rejected. Payments cannot be approved from a member account. Test data cleanup cascades to member accounts, their dues and email jobs; Live records remain protected.

## Validation

The project includes the V1 integration suite plus calendar and V2 tests. They exercise real MySQL and HTTP sessions with a dedicated database ending in _test and mock Paystack/SMTP responses. Live credentials and real bank payments are not used. Before production, verify one complete test registration, activation, dues checkout, repeated verification, manual bank approval, SMTP receipt, scheduler run and imported V1 member access on your actual Hostinger domain.
