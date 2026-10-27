# Magnum Secure Dividend PDF Portal

Administrators upload a customer CSV and a ZIP of individual dividend PDFs. A separate worker validates the files, matches each customer to one PDF, encrypts that PDF with qpdf, stores it privately, and creates a unique link. The link is sent by email and WhatsApp. The customer opens `/d/[token]`, enters their full name and folio number, and downloads only their encrypted statement.

## Local development

Requirements: Node.js 22, pnpm 10.34.7, Docker, and qpdf on the worker host. PostgreSQL is published on host port **5433** so it does not collide with a local PostgreSQL already listening on 5432.

```powershell
$env:Path = "$env:USERPROFILE\.local;" + $env:Path
docker compose up -d postgres redis
Copy-Item .env.example .env
pnpm install
pnpm db:migrate
pnpm admin:create -- --email admin@example.com --name "Magnum Admin"
pnpm dev
```

In a second terminal:

```powershell
pnpm worker
```

The create-admin script prints a random password once. It is not stored in the repository. In production the same command refuses to run unless `--confirm-production yes` is passed, and production startup rejects the sample secrets in `.env.example`.

qpdf is installed in the worker image (`Dockerfile`). It is not bundled for Windows. Install qpdf and keep `QPDF_BIN=qpdf`, or run the worker with Docker:

```powershell
docker compose --profile app up --build worker
```

PDF processing fails with a recorded document error when `qpdf` is missing. The application does not pretend encryption succeeded.

## Tests

```powershell
pnpm test
pnpm test:integration
pnpm typecheck
pnpm lint
```

`pnpm test:integration` needs the Docker PostgreSQL database from `.env`. `pnpm test:e2e` runs Playwright. The current end-to-end spec covers admin login and an unknown customer link when `E2E_ADMIN_EMAIL` and `E2E_ADMIN_PASSWORD` are set. The qpdf encrypt/decrypt test runs only when `qpdf` is on `PATH`.

## Production

Terminate TLS at the reverse proxy or load balancer. Set `NODE_ENV=production` and replace every value in `.env`. Startup fails if mock email, mock WhatsApp, local storage, the development token key, or a placeholder storage key is configured.

Required production choices:

- `STORAGE_DRIVER=s3` with a private bucket. Use `STORAGE_SSE=AES256` when the provider supports it.
- `EMAIL_PROVIDER=smtp` or `resend`, with `MOCK_EMAIL_ENABLED=false`.
- WhatsApp Cloud API credentials and an approved template, with `MOCK_WHATSAPP_ENABLED=false`.
- `APP_BASE_URL` set to the public HTTPS origin. Customer links are built from this value, not from the request `Host` header.
- `TOKEN_ENCRYPTION_KEY` as base64 for a random 32-byte key, distinct from the development key.
- `NEXTAUTH_SECRET` of at least 32 characters, distinct from the development secret.

Apply migrations before serving traffic:

```powershell
pnpm db:migrate
pnpm build
pnpm start
pnpm worker
```

The Docker Compose `app` profile builds the web and worker images. The image installs qpdf and runs `pnpm build`. Override `DATABASE_URL`, `REDIS_URL`, and `STORAGE_ENDPOINT` for the compose network as the file already does.

Keep Redis reachable only from the web and worker processes. Queue payloads contain record ids. Access-token ciphertext lives in PostgreSQL.

Configure the reverse proxy so request logs do not store the raw path under `/d/`. That path contains the bearer token.

## Storage

`STORAGE_DRIVER=local` writes under `STORAGE_LOCAL_PATH` and is rejected in production. The S3 adapter uses path-style requests when `STORAGE_FORCE_PATH_STYLE=true` (MinIO). Object keys look like `batches/{batchId}/source/...`, `original/{customerId}.pdf`, and `encrypted/{customerId}.pdf`. Customers never receive those keys or a public object URL.

Original PDFs are removed after `ORIGINAL_RETENTION_DAYS`. Encrypted PDFs are removed after `ENCRYPTED_RETENTION_DAYS` only when the customer has no active, unexpired link. Output CSVs expire after `EXPORT_RETENTION_HOURS`. The worker schedules this sweep hourly.

For a local S3-compatible bucket:

```powershell
docker compose up -d minio minio-init
```

Then set `STORAGE_DRIVER=s3`, `STORAGE_ENDPOINT=http://127.0.0.1:9000`, `STORAGE_BUCKET=magnum-documents`, and the MinIO credentials. Do not use the sample MinIO password in production.

## Email

`EMAIL_PROVIDER=mock` writes a JSON file under `DEV_MAILBOX_PATH` and records delivery status `MOCK_RECORDED`. The admin UI shows **Mock delivery**. SMTP uses `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and `SMTP_PASSWORD`. Resend uses `EMAIL_API_KEY`.

Dividend messages contain the customer name and the portal link. They do not attach the PDF. Password-reset messages use a separate template.

Provider status webhooks are `POST /api/webhooks/email` with `x-magnum-signature` set to hex HMAC-SHA256 of the raw body using `EMAIL_WEBHOOK_SECRET`.

## WhatsApp

The adapter calls the official Graph API only:

`POST https://graph.facebook.com/{WHATSAPP_API_VERSION}/{WHATSAPP_PHONE_NUMBER_ID}/messages`

The template named by `WHATSAPP_TEMPLATE_NAME` must already be approved. It receives two body parameters, in order: customer name, then the portal URL. This application does not bypass template approval.

When the access token or phone-number id is empty and `MOCK_WHATSAPP_ENABLED=true` outside production, the attempt is stored as mock delivery. Production cannot enable that flag.

Webhook verification is `GET /api/webhooks/whatsapp` with `WHATSAPP_VERIFY_TOKEN`. Status callbacks are `POST` with `X-Hub-Signature-256` computed from `WHATSAPP_APP_SECRET`.

## Identity and PDF passwords

Name and folio verification is not multi-factor authentication. The portal says so. The check is server-side, rate limited, and locked out after `MAX_VERIFICATION_ATTEMPTS`. A successful check creates an HttpOnly session cookie (`magnum_portal`) that expires after `VERIFICATION_SESSION_TTL_MINUTES`. Download checks the link again and streams only that customer's encrypted PDF.

`PDF_PASSWORD_POLICY=folio` is the only supported policy. The open password is the normalized folio: trimmed, whitespace removed, uppercased, leading zeros preserved. A short or guessable folio is a weak PDF password. The owner password is a random 32-byte secret used only during encryption and is not stored. qpdf is invoked with an argument array and `shell: false`. Passwords are redacted from qpdf stderr before it is saved.

## Roles

| Role | Can |
| --- | --- |
| SUPER_ADMIN | Settings, users, exports, link revocation, audit |
| ADMIN | Exports, link revocation, resend, audit |
| OPERATOR | Upload, process, and retry batches |

Every admin API checks the role on the server. Deactivating a user takes effect on the next request because the session is checked against `isActive`.

## Backup and recovery

PostgreSQL is the system of record. Take regular `pg_dump` backups and test a restore. Object storage should use the provider's versioning or replication; the database rows point at object keys. Redis only holds the queue and rate-limit counters. After a Redis loss, restart the worker. Idempotent job ids and the one-active-link constraint prevent a second active link or a second initial message for the same attempt. Documents left in `PROCESSING` can be retried from the batch page.

To restore:

1. Restore PostgreSQL and the object bucket to the same point in time if possible.
2. Set the production environment and run `pnpm db:migrate`.
3. Start the web process and the worker.
4. Retry failed documents from the admin batch page. Do not re-upload a completed batch unless the original files are still within the retention window.

## Annual report campaigns

Campaigns are separate from individual-statement batches. An administrator creates a campaign, uploads one source PDF, uploads a customer CSV, validates the roster, and activates the campaign. Every customer uses the same URL under `/campaign/[token]`. After name and folio verification, the server encrypts a temporary copy of that one source PDF with the customer's folio and streams `annual-report.pdf`. The encrypted file is deleted when the stream finishes or fails. It is not stored as a customer document.

Operators can upload and validate. Admins and super admins activate, revoke, and reveal the shared URL. The raw token is not stored in plaintext and is not shown on the campaign list. Regenerating the URL invalidates the previous address and existing campaign sessions. Empty email or phone values remain warnings. Notifications are not sent for campaigns in this version; the shared URL can be copied from the campaign page.
