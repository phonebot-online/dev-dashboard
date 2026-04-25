# devdash — Operations Guide

**Owner:** Fahad (CEO, Phonebot)
**Domain:** devdash.phonebot.co.uk
**Last updated:** 2026-04-24
**Stack:** Alpine.js SPA → CloudFront/S3 → API Gateway + Lambda → DynamoDB + S3 → SES
**Auth:** TOTP (Google Authenticator) + AES-GCM encrypted secrets in AWS Secrets Manager

Related documents — read these first, this guide does not repeat them:
- `data-architecture.md` — storage tier design, DynamoDB table layout, S3 path conventions, retention rules, per-project data structure, security model, API surface
- `context-strategy.md` — token economics, knowledge card mechanism, what gets loaded when, Claude Max quota math

---

## Section A — System Architecture Overview

### Components

```
┌─────────────────────────────────────────────────────────────────────────┐
│  BROWSER  (Alpine.js SPA — devdash.html)                                │
│  8 users: Fahad, Imran, Faizan, Moazzam, Faisal, Usama, Mustafa, QA    │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │ HTTPS
                           ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  CLOUDFLARE DNS  (devdash.phonebot.co.uk)                                │
│  CNAME → CloudFront distribution                                         │
│  Existing Cloudflare Worker handles TOTP auth + session cookie +         │
│  serves cached HTML from Cloudflare KV (7-day TTL fallback)             │
└──────────────────────────┬───────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  AWS CLOUDFRONT  (distribution in ap-southeast-2)                        │
│  Origin 1: S3 static site bucket (devdash.html + assets)                │
│  Origin 2: API Gateway (for /api/* path pattern)                         │
│  HTTPS only. Custom domain TLS cert from ACM.                            │
└────────────┬──────────────────────────────────┬──────────────────────────┘
             │                                  │
             ▼                                  ▼
┌─────────────────────────┐     ┌───────────────────────────────────────────┐
│  S3 STATIC SITE BUCKET  │     │  AWS API GATEWAY  (REST, ap-southeast-2)  │
│  devdash-static         │     │  /auth/* /projects/* /merit/*             │
│  devdash.html + assets  │     │  /admin/* /audit/*                        │
│  Versioned, private     │     └────────────────┬──────────────────────────┘
│  CloudFront OAC access  │                      │
└─────────────────────────┘                      ▼
                                ┌────────────────────────────────────────────┐
                                │  AWS LAMBDA FUNCTIONS  (Python 3.12)       │
                                │                                            │
                                │  devdash-auth         — TOTP login/logout  │
                                │  devdash-data         — CRUD (items, etc.) │
                                │  devdash-upload       — file intake to S3  │
                                │  devdash-audit-trigger— weekly audit job   │
                                │  devdash-context      — context assembler  │
                                │  devdash-email-digest — daily SES cron     │
                                └──────┬──────────────────────────────────────┘
                                       │
                          ┌────────────┴─────────────┐
                          ▼                           ▼
          ┌───────────────────────┐   ┌──────────────────────────────────────┐
          │  DYNAMODB             │   │  S3 DATA BUCKET  (devdash-data)      │
          │  Table: devdash       │   │                                      │
          │  Hot tier: 0-14 days  │   │  /projects/{id}/knowledge-card.md   │
          │  PK: PROJECT#pb2      │   │  /projects/{id}/handoffs/...        │
          │  SK: ITEM#R0-07       │   │  /projects/{id}/week-summaries/...  │
          │  SK: MERIT#2026-W17   │   │  /projects/{id}/merit-history/...   │
          │  Encrypted at rest    │   │  /global/users/{email}.json          │
          │  (KMS CMK)            │   │  /global/audit-log.jsonl             │
          └───────────────────────┘   │  Warm: S3-IA 15-90d; Cold: Glacier  │
                                      │  Versioning on. Cross-region rep.    │
                                      └──────────────────────────────────────┘

          ┌─────────────────────────────────────────────────────────────────┐
          │  S3 SUPPORT BUCKETS                                             │
          │  devdash-audit-logs  — CloudTrail logs (read-only to Lambdas)  │
          │  devdash-secrets     — TOTP QR archives (admin only)           │
          └─────────────────────────────────────────────────────────────────┘

          ┌─────────────────────────────────────────────────────────────────┐
          │  AWS SES  (ap-southeast-2)                                      │
          │  Sender: devdash@phonebot.com.au                                │
          │  Daily digest to fahad@, weekly audit summary to Fahad+Imran   │
          └─────────────────────────────────────────────────────────────────┘

          ┌─────────────────────────────────────────────────────────────────┐
          │  FAHAD'S LAPTOP  (Claude Code + Claude Max $100/5x)             │
          │  /weekly-audit command triggers the audit pipeline:             │
          │  loads context from DynamoDB/S3 → Claude processes → writes    │
          │  results back → dashboard reads from DynamoDB on next load      │
          └─────────────────────────────────────────────────────────────────┘
```

### Weekly Audit — End-to-End Data Flow

1. **Sunday night, Fahad's laptop:** `claude code /weekly-audit` is invoked. The command script reads `dashboard.config.yaml` (project list, dev assignments) and pulls active DynamoDB records to get this week's data window.

2. **Context assembly (per project):** For each of the 5 projects, the `devdash-context` Lambda is called. It assembles: the project's knowledge card (~650 tokens), this week's handoff entries, open items, new commits, QA findings, and any PM/CEO uploads. Full budget: ~9,600 tokens per project, ~48,000 tokens for all 5. See `context-strategy.md` Section 2 for the exact breakdown.

3. **Claude processes:** Fahad's Claude Max session reads the assembled context, computes a compass score per dev per project (merit tier: Exceptional / Solid / Developing / At Risk), and generates a forecast per project (on track / at risk / off track).

4. **Results written back:** The audit script writes merit scores to DynamoDB (`DEV#{email}` / `MERIT#{YYYY-Www}`) and updated knowledge cards to both DynamoDB and S3. Snapshots go to `s3://devdash-data/projects/{id}/snapshots/{date}.json`.

5. **Dashboard reads on next login:** When a user logs in, the SPA calls `GET /projects` and `GET /merit/{email}/current`. Both read from DynamoDB hot tier — single-digit millisecond responses. No Claude call happens at login time.

### Day-to-Day Operations Flow

**Dev clocks in:** Browser → `POST /projects/{id}/handoff` → Lambda validates session role → writes `handoffs/{today}/{email}.md` to S3 → updates DynamoDB `CLOCK#{date}` record. Done in under 300ms.

**QA submits bug:** Browser → `POST /projects/{id}/qa-findings` → Lambda writes to S3 → if bug matches regression pattern, triggers optional 1,500-token Claude call for regression check → result written to DynamoDB notification queue → included in next morning's digest email.

**Imran uploads assessment:** Browser → `POST /projects/{id}/uploads` → Lambda writes to `s3://devdash-data/projects/{id}/uploads/imran/` → DynamoDB `last_updated` timestamp updated → included in next weekly audit context load.

### Security Boundaries

| Boundary | Mechanism |
|---|---|
| Authentication | TOTP (Google Authenticator, 6-digit code). TOTP secrets encrypted with AES-GCM 256-bit key stored in AWS Secrets Manager (`devdash/totp-master-key`) |
| Session cookies | `HttpOnly; Secure; SameSite=Strict`. 32-byte random token. 24-hour TTL in DynamoDB. |
| S3 access | All buckets private. No public access. CloudFront uses Origin Access Control (OAC). Lambda uses IAM role `devdash-lambda-audit` (read/write) or `devdash-lambda-read` (read-only). |
| DynamoDB | Encrypted at rest with KMS CMK (`alias/devdash`). Role-based — Lambdas use least-privilege policies. |
| Data authorization | Lambda enforces role matrix before any S3/DynamoDB call. A dev session requesting another dev's merit data gets 403 before any storage call is made. |
| Audit trail | CloudTrail enabled on all devdash S3 buckets and DynamoDB. Logs go to `devdash-audit-logs` bucket (write-once policy). Every merit score write is logged. |

---

## Section B — Deployment Guide

### 1. AWS Account Setup

```bash
# Recommended: create a dedicated IAM account for devdash ops.
# Do NOT use root credentials for day-to-day work.

# Create an IAM user for Fahad (human admin access)
aws iam create-user --user-name fahad-devdash-admin
aws iam attach-user-policy \
  --user-name fahad-devdash-admin \
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess

# Enable MFA on the new IAM user via the console:
# IAM > Users > fahad-devdash-admin > Security credentials > Assign MFA device
# Use virtual MFA (Google Authenticator). Do this before any further config.

# Set region for all CLI calls
export AWS_DEFAULT_REGION=ap-southeast-2
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
```

### 2. Domain Setup (Cloudflare → CloudFront)

The domain `devdash.phonebot.co.uk` is managed in Cloudflare DNS. The existing Cloudflare Worker already handles TOTP auth. This step connects Cloudflare to CloudFront.

1. In AWS ACM (Certificate Manager) in **us-east-1** (required for CloudFront):
   ```bash
   aws acm request-certificate \
     --domain-name devdash.phonebot.co.uk \
     --validation-method DNS \
     --region us-east-1
   ```
2. ACM outputs a CNAME record. Add that CNAME to Cloudflare DNS for validation. ACM becomes `ISSUED` within 5 minutes.

3. In Cloudflare DNS, set: `devdash.phonebot.co.uk CNAME → {cloudfront-domain}.cloudfront.net` (proxy **disabled** — grey cloud, not orange). CloudFront handles TLS termination; Cloudflare Worker handles auth upstream.

### 3. S3 Static Site Bucket + CloudFront Distribution

```bash
# Create static site bucket (private — CloudFront serves it)
aws s3api create-bucket \
  --bucket devdash-static \
  --region ap-southeast-2 \
  --create-bucket-configuration LocationConstraint=ap-southeast-2

aws s3api put-public-access-block \
  --bucket devdash-static \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,\
    BlockPublicPolicy=true,RestrictPublicBuckets=true

# Upload the SPA
aws s3 cp "dev dashboard/devdash.html" s3://devdash-static/index.html

# Create CloudFront Origin Access Control, then create distribution via console or CDK.
# Key settings:
#   Origins: devdash-static (S3 OAC), API Gateway (for /api/*)
#   Default cache behaviour: redirect HTTP→HTTPS, cache enabled
#   Custom domain: devdash.phonebot.co.uk
#   ACM cert: the one created in step 2
```

### 4. S3 Data Buckets

```bash
# Main data bucket (projects, handoffs, snapshots, etc.)
aws s3api create-bucket \
  --bucket devdash-data \
  --region ap-southeast-2 \
  --create-bucket-configuration LocationConstraint=ap-southeast-2

# Enable versioning (required for point-in-time restore and backup)
aws s3api put-bucket-versioning \
  --bucket devdash-data \
  --versioning-configuration Status=Enabled

# Enable server-side encryption with KMS (create the key first — step 10)
aws s3api put-bucket-encryption \
  --bucket devdash-data \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "aws:kms",
        "KMSMasterKeyID": "alias/devdash"
      }
    }]
  }'

# Block all public access
aws s3api put-public-access-block \
  --bucket devdash-data \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,\
    BlockPublicPolicy=true,RestrictPublicBuckets=true

# Enforce TLS-only access
aws s3api put-bucket-policy --bucket devdash-data --policy '{
  "Statement": [{
    "Effect": "Deny",
    "Principal": "*",
    "Action": "s3:*",
    "Resource": ["arn:aws:s3:::devdash-data", "arn:aws:s3:::devdash-data/*"],
    "Condition": {"Bool": {"aws:SecureTransport": "false"}}
  }]
}'

# Lifecycle rules: Warm (Standard-IA after 15 days) → Cold (Glacier after 90 days) → Expire after 365 days
aws s3api put-bucket-lifecycle-configuration \
  --bucket devdash-data \
  --lifecycle-configuration '{
    "Rules": [{
      "ID": "tier-transitions",
      "Status": "Enabled",
      "Filter": {"Prefix": "projects/"},
      "Transitions": [
        {"Days": 15, "StorageClass": "STANDARD_IA"},
        {"Days": 90, "StorageClass": "DEEP_ARCHIVE"}
      ],
      "Expiration": {"Days": 365}
    }]
  }'

# Audit logs bucket (separate, write-once)
aws s3api create-bucket --bucket devdash-audit-logs \
  --region ap-southeast-2 \
  --create-bucket-configuration LocationConstraint=ap-southeast-2

aws s3api put-bucket-versioning --bucket devdash-audit-logs \
  --versioning-configuration Status=Enabled
```

**Cross-region replication (backup):** Set up replication of `devdash-data` to `ap-southeast-4` (Melbourne) or `us-east-1` for DR. Requires replication IAM role and destination bucket. Do this before go-live.

```bash
# Create destination bucket in secondary region
aws s3api create-bucket --bucket devdash-data-replica \
  --region us-east-1

# Enable versioning on destination (required for replication)
aws s3api put-bucket-versioning --bucket devdash-data-replica \
  --versioning-configuration Status=Enabled

# Configure replication rule via console:
# S3 > devdash-data > Management > Replication rules > Add rule
# Replicate entire bucket. Create IAM role automatically. Enable replication time control (RTC) optional.
```

### 5. DynamoDB Table

```bash
aws dynamodb create-table \
  --table-name devdash \
  --attribute-definitions \
    AttributeName=pk,AttributeType=S \
    AttributeName=sk,AttributeType=S \
  --key-schema \
    AttributeName=pk,KeyType=HASH \
    AttributeName=sk,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --sse-specification Enabled=true,SSEType=KMS \
  --region ap-southeast-2

# Enable Point-in-Time Recovery (PITR)
aws dynamodb update-continuous-backups \
  --table-name devdash \
  --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true
```

**Key schema reference** (from `data-architecture.md` Section 2):

| pk | sk | Contents |
|---|---|---|
| `PROJECT#phonebot-2` | `META` | Project name, status, deadline, traffic light |
| `PROJECT#phonebot-2` | `KNOWLEDGE_CARD` | 500-word summary text |
| `PROJECT#phonebot-2` | `ITEM#R0-07` | Individual work item |
| `DEV#faizan@phonebot.com.au` | `MERIT#2026-W17` | Merit score + tier |
| `DEV#faizan@phonebot.com.au` | `CLOCK#2026-04-24` | Clock in/out times |
| `DEV#faizan@phonebot.com.au` | `HANDOFF#2026-04-24` | S3 key pointer |
| `SESSION#{32-byte-hex}` | `DATA` | Session record (TTL: 86400s) |
| `NOTIFICATION#{uuid}` | `DATA` | Queued notification (TTL: 7d) |

### 6. Lambda Functions

Five functions needed. All: Python 3.12, arm64 (Graviton2, cheaper), 512MB memory, 30s timeout unless noted.

```bash
# Create execution role first (step 9), then deploy each function.
# Package: zip up scripts/dashboard/*.py + requirements.txt dependencies.

FUNCTIONS=(
  "devdash-auth:auth_handler:60"
  "devdash-data:data_handler:30"
  "devdash-upload:upload_handler:60"
  "devdash-audit-trigger:audit_handler:900"
  "devdash-email-digest:digest_handler:120"
)

for fn_spec in "${FUNCTIONS[@]}"; do
  IFS=: read name handler timeout <<< "$fn_spec"
  aws lambda create-function \
    --function-name "$name" \
    --runtime python3.12 \
    --architectures arm64 \
    --handler "${handler}.lambda_handler" \
    --role "arn:aws:iam::${AWS_ACCOUNT_ID}:role/devdash-lambda-exec" \
    --zip-file fileb://function.zip \
    --timeout "$timeout" \
    --environment "Variables={
      DYNAMODB_TABLE=devdash,
      DATA_BUCKET=devdash-data,
      SES_SENDER=devdash@phonebot.com.au,
      SECRETS_ARN=arn:aws:secretsmanager:ap-southeast-2:${AWS_ACCOUNT_ID}:secret:devdash/totp-master-key
    }"
done

# Schedule weekly audit: every Sunday at 21:00 AEST (11:00 UTC)
aws events put-rule \
  --name devdash-weekly-audit \
  --schedule-expression "cron(0 11 ? * SUN *)" \
  --state ENABLED

aws events put-targets \
  --rule devdash-weekly-audit \
  --targets "Id=audit-lambda,Arn=arn:aws:lambda:ap-southeast-2:${AWS_ACCOUNT_ID}:function:devdash-audit-trigger"

# Schedule daily digest: 06:00 AEST (20:00 UTC previous day) Monday–Friday
aws events put-rule \
  --name devdash-daily-digest \
  --schedule-expression "cron(0 20 ? * MON-FRI *)" \
  --state ENABLED
```

### 7. API Gateway Routes

Create a REST API named `devdash-api`. Key routes (all require `devdash_session` cookie except `/auth/*`):

| Method | Path | Lambda | Notes |
|---|---|---|---|
| POST | /auth/login | devdash-auth | Returns session cookie |
| POST | /auth/logout | devdash-auth | Clears session |
| GET | /projects | devdash-data | Role-filtered list |
| GET | /projects/{id} | devdash-data | Metadata + knowledge card |
| PUT | /projects/{id}/metadata | devdash-data | CEO/PM only |
| POST | /projects/{id}/handoff | devdash-upload | Dev only |
| POST | /projects/{id}/qa-findings | devdash-upload | QA role |
| POST | /projects/{id}/qa-audits | devdash-upload | QA Auditor only |
| POST | /projects/{id}/uploads | devdash-upload | Any role |
| GET | /merit/{email}/current | devdash-data | Dev sees own; CEO sees all |
| GET | /merit/{email} | devdash-data | CEO only |
| PUT | /merit/{email}/{week} | devdash-data | CEO only, manual override |
| POST | /audit/trigger | devdash-audit-trigger | CEO only |
| GET | /audit/status/{jobId} | devdash-audit-trigger | |
| POST | /admin/provision-user | devdash-auth | CEO only |
| DELETE | /admin/users/{email} | devdash-auth | CEO only + TOTP confirm |

```bash
# Create API, deploy to 'prod' stage, and note the invoke URL.
# Then set CloudFront to route /api/* to the API Gateway origin.
```

### 8. SES Domain Verification

```bash
# Verify sending domain
aws sesv2 create-email-identity \
  --email-identity phonebot.com.au \
  --region ap-southeast-2

# SES outputs DKIM CNAME records. Add them to Cloudflare DNS.
# Wait for Status: VERIFIED (usually < 10 minutes).

# Verify sender address
aws sesv2 create-email-identity \
  --email-identity devdash@phonebot.com.au

# Move SES out of sandbox (required to email non-verified addresses):
# AWS console > SES > Account dashboard > Request production access
# Use case: transactional. Estimated volume: < 50/day. Takes 24h.
```

### 9. IAM Roles and Policies

```bash
# Lambda execution role
aws iam create-role \
  --role-name devdash-lambda-exec \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "lambda.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }'

# Attach managed policies
aws iam attach-role-policy --role-name devdash-lambda-exec \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

# Inline policy: DynamoDB + S3 + SES + Secrets Manager
aws iam put-role-policy \
  --role-name devdash-lambda-exec \
  --policy-name devdash-data-access \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": ["dynamodb:GetItem","dynamodb:PutItem","dynamodb:UpdateItem",
                   "dynamodb:DeleteItem","dynamodb:Query","dynamodb:Scan"],
        "Resource": "arn:aws:dynamodb:ap-southeast-2:*:table/devdash"
      },
      {
        "Effect": "Allow",
        "Action": ["s3:GetObject","s3:PutObject","s3:DeleteObject","s3:ListBucket"],
        "Resource": ["arn:aws:s3:::devdash-data","arn:aws:s3:::devdash-data/*"]
      },
      {
        "Effect": "Allow",
        "Action": ["ses:SendEmail","ses:SendRawEmail"],
        "Resource": "*",
        "Condition": {"StringEquals": {"ses:FromAddress": "devdash@phonebot.com.au"}}
      },
      {
        "Effect": "Allow",
        "Action": "secretsmanager:GetSecretValue",
        "Resource": "arn:aws:secretsmanager:ap-southeast-2:*:secret:devdash/*"
      },
      {
        "Effect": "Allow",
        "Action": ["kms:Decrypt","kms:GenerateDataKey"],
        "Resource": "arn:aws:kms:ap-southeast-2:*:key/*",
        "Condition": {"StringEquals": {"kms:ViaService": "s3.ap-southeast-2.amazonaws.com"}}
      }
    ]
  }'

# CloudTrail: enable on devdash-data bucket
aws cloudtrail create-trail \
  --name devdash-s3-trail \
  --s3-bucket-name devdash-audit-logs \
  --enable-log-file-validation

aws cloudtrail put-event-selectors \
  --trail-name devdash-s3-trail \
  --event-selectors '[{
    "ReadWriteType": "All",
    "IncludeManagementEvents": false,
    "DataResources": [
      {"Type": "AWS::S3::Object", "Values": ["arn:aws:s3:::devdash-data/"]},
      {"Type": "AWS::DynamoDB::Table", "Values": ["arn:aws:dynamodb:ap-southeast-2:*:table/devdash"]}
    ]
  }]'

aws cloudtrail start-logging --name devdash-s3-trail
```

### 10. Secrets Manager

```bash
# KMS customer-managed key for S3/DynamoDB encryption
aws kms create-key \
  --description "devdash data encryption" \
  --region ap-southeast-2

aws kms create-alias \
  --alias-name alias/devdash \
  --target-key-id <key-id-from-above>

# TOTP master key (AES-GCM 256-bit, base64-encoded 32-byte random)
TOTP_KEY=$(python3 -c "import os,base64; print(base64.b64encode(os.urandom(32)).decode())")

aws secretsmanager create-secret \
  --name devdash/totp-master-key \
  --description "AES-GCM key for TOTP secret encryption" \
  --secret-string "{\"key\": \"${TOTP_KEY}\"}" \
  --region ap-southeast-2

# Cloudflare API token (for DNS automation if needed)
aws secretsmanager create-secret \
  --name devdash/cloudflare-api-token \
  --description "Cloudflare API token for DNS management" \
  --secret-string "{\"token\": \"<cf-token-here>\"}"
```

**Secrets inventory:**

| Secret name | Contents | Rotation |
|---|---|---|
| `devdash/totp-master-key` | AES-GCM 256-bit key (base64) | Manual, quarterly |
| `devdash/cloudflare-api-token` | CF DNS API token | Manual, on staff change |
| `devdash/ses-smtp-password` | SES SMTP credentials (if using SMTP mode) | Annual |

**Environment variables per Lambda** (set in Lambda console or SAM template):

| Variable | Value |
|---|---|
| `DYNAMODB_TABLE` | `devdash` |
| `DATA_BUCKET` | `devdash-data` |
| `SES_SENDER` | `devdash@phonebot.com.au` |
| `SECRETS_ARN` | Full ARN of `devdash/totp-master-key` |
| `AWS_REGION` | `ap-southeast-2` |

### 11. CI/CD with GitHub Actions

```yaml
# .github/workflows/deploy.yml
name: Deploy devdash

on:
  push:
    branches: [main]
    paths:
      - 'dev dashboard/**'

jobs:
  deploy-spa:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ap-southeast-2
      - name: Deploy SPA to S3
        run: |
          aws s3 cp "dev dashboard/devdash.html" s3://devdash-static/index.html \
            --cache-control "max-age=300"
      - name: Invalidate CloudFront
        run: |
          aws cloudfront create-invalidation \
            --distribution-id ${{ secrets.CF_DISTRIBUTION_ID }} \
            --paths "/index.html"

  deploy-lambda:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ap-southeast-2
      - name: Package and deploy Lambda
        run: |
          cd "dev dashboard/scripts/dashboard"
          pip install -r ../../requirements.txt -t ./package/
          cp *.py ./package/
          cd package && zip -r ../function.zip .
          cd ..
          for fn in devdash-auth devdash-data devdash-upload devdash-audit-trigger devdash-email-digest; do
            aws lambda update-function-code \
              --function-name "$fn" \
              --zip-file fileb://function.zip
          done
```

GitHub Actions secrets required: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `CF_DISTRIBUTION_ID`.

### 12. Monthly Cost Estimate

| Service | Component | Monthly estimate |
|---|---|---|
| DynamoDB | On-demand reads/writes, 8 users daily | $0.50 |
| S3 Standard-IA | Warm tier, ~500MB first year | $0.80 |
| S3 Glacier Deep Archive | Cold tier, ~1GB first year | $0.20 |
| S3 Static | devdash.html + assets | $0.05 |
| Lambda | 5 functions, ~50K invocations/month | $0.50 |
| API Gateway | REST, ~50K requests/month | $0.18 |
| CloudFront | ~5GB transfer/month | $0.50 |
| SES | ~200 emails/month | $0.10 |
| KMS | CMK operations | $0.30 |
| CloudTrail | Data events on S3 + DynamoDB | $1.00 |
| Secrets Manager | 2 secrets × $0.40 | $0.80 |
| Data transfer | S3/Lambda egress | $0.50 |
| **Total** | | **~$5.50/month** |

Well inside the $20/month target. Reaches $20/month only if you scale to 15+ projects with daily heavy uploads.

### 13. Post-Deploy Verification Checklist

```bash
# 1. Auth endpoint
curl -X POST https://devdash.phonebot.co.uk/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"fahad@phonebot.com.au","totp_code":"123456"}'
# Expected: 200 with Set-Cookie header

# 2. Load dashboard
curl -s -o /dev/null -w "%{http_code}" https://devdash.phonebot.co.uk/
# Expected: 200

# 3. Project list
curl -H "Cookie: devdash_session=<token>" \
  https://devdash.phonebot.co.uk/api/projects
# Expected: JSON array with Phonebot 2.0 listed

# 4. Test handoff upload
curl -X POST https://devdash.phonebot.co.uk/api/projects/phonebot-2/handoff \
  -H "Cookie: devdash_session=<dev-token>" \
  -H "Content-Type: text/plain" \
  -d "## 2026-04-24 test handoff"
# Expected: 200 with S3 key in response

# 5. Test QA finding
curl -X POST https://devdash.phonebot.co.uk/api/projects/phonebot-2/qa-findings \
  -H "Cookie: devdash_session=<qa-token>" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test bug","severity":"low","body":"Smoke test finding"}'
# Expected: 200

# 6. Trigger test digest email
aws lambda invoke \
  --function-name devdash-email-digest \
  --payload '{"dry_run": true}' \
  response.json && cat response.json
# Expected: {"status": "ok", "emails_would_send": 1}

# 7. Check S3 write landed
aws s3 ls s3://devdash-data/projects/phonebot-2/handoffs/2026-04-24/
# Expected: faizan@phonebot.com.au.md listed (or whichever dev ran step 4)

# 8. Check CloudTrail is recording
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=ResourceName,AttributeValue=devdash-data \
  --max-results 5
# Expected: recent PutObject events listed
```

---

## Section C — Operations Runbook

### On-Call Contact Tree

| Role | Person | Contact | When |
|---|---|---|---|
| Primary | Fahad (CEO) | fahad@phonebot.com.au | All incidents |
| Backup | Imran (PM) | imran@phonebot.com.au | If Fahad unreachable > 2 hours |
| AWS escalation | AWS Support | console.aws.amazon.com/support | P1 AWS infrastructure issues |

For any incident: Fahad first. Imran only if Fahad cannot be reached within 2 hours. No dev is in the on-call rotation — this is an internal operations tool, not customer-facing infrastructure.

---

### Daily Operations

**Morning check (06:00 AEST):**

1. The `devdash-email-digest` Lambda runs at 06:00 and sends a summary to fahad@phonebot.com.au. Check for it.
2. **If the email is empty:** Either no new activity yesterday (expected on weekends), or the Lambda failed. Check CloudWatch Logs: `aws logs tail /aws/lambda/devdash-email-digest --since 2h`. If error present, see "Daily email not arriving" below.
3. **If the email has flagged items:** Review each flag. Blockers (marked OPEN in a handoff with no corresponding next-day CLOSED entry) should be followed up in the morning standup. QA regressions require checking the relevant project's `qa-findings/` folder.
4. **Stale data badge on dashboard:** If any project card shows "Stale — last audit was X hours ago," verify the weekly audit ran. Check `aws dynamodb get-item --table-name devdash --key '{"pk":{"S":"PROJECT#phonebot-2"},"sk":{"S":"META"}}'` and inspect the `last_audit` field.

**Weekly audit cadence (Sunday night):**

The audit is run manually by Fahad from his laptop using Claude Code. It is not fully automated because it runs inside a Claude Max session.

Standard run:
1. Open terminal, `cd` to project root.
2. Run: `claude code /weekly-audit` (or whatever the configured command alias is).
3. The script loads context, Claude processes, results write back automatically.
4. Check that DynamoDB records updated: `aws dynamodb query --table-name devdash --key-condition-expression "pk = :p AND begins_with(sk, :s)" --expression-attribute-values '{":p":{"S":"DEV#faizan@phonebot.com.au"},":s":{"S":"MERIT#"}}'`
5. Log in to the dashboard and verify merit scores appear under each dev.

If Sunday is missed, run it Monday morning before the team logs in. The audit is idempotent — re-running it for the same week overwrites that week's records cleanly.

**Monthly review (first Monday of the month):**

1. Open dashboard, review merit score distribution across all devs for the past 4 weeks.
2. Check for threshold drift: if everyone is Exceptional every week, the scoring thresholds are too loose. If everyone is Developing, they are too tight. Aim for roughly 1–2 Exceptional, 1–2 Solid per 4-dev team in a normal week.
3. Recalibrate by adjusting the merit scoring prompt in the weekly audit command or the config thresholds in `dashboard.config.yaml`.
4. Review S3 storage costs in AWS Cost Explorer. If warm storage is growing faster than expected, shorten the Standard-IA window in `global/retention-config.json`.

**Quarterly review:**

1. Run `/quarterly-review` command (already built in `.claude/commands/`).
2. System loads 13 `week-summaries/` files per project + merit history per dev + current knowledge card. Total ~32,500 tokens.
3. Review with Imran. Confirm project forecasts. Update `data-architecture.md` open decisions if any have drifted.
4. Archive the quarterly review output to `s3://devdash-data/projects/{id}/snapshots/Q{n}-{year}.json`.

---

### CloudWatch Alarms — Recommended Set

Set these up once after deploy. They cost almost nothing at this scale.

```bash
# Lambda errors > 3 in 10 minutes (any function)
for fn in devdash-auth devdash-data devdash-upload devdash-audit-trigger devdash-email-digest; do
  aws cloudwatch put-metric-alarm \
    --alarm-name "devdash-${fn}-errors" \
    --metric-name Errors --namespace AWS/Lambda \
    --dimensions Name=FunctionName,Value="$fn" \
    --statistic Sum --period 600 --threshold 3 \
    --comparison-operator GreaterThanOrEqualToThreshold \
    --evaluation-periods 1 \
    --alarm-actions "arn:aws:sns:ap-southeast-2:${AWS_ACCOUNT_ID}:devdash-alerts"
done

# DynamoDB throttling > 0 (on-demand should never throttle, but alert if it does)
aws cloudwatch put-metric-alarm \
  --alarm-name "devdash-dynamo-throttle" \
  --metric-name ThrottledRequests --namespace AWS/DynamoDB \
  --dimensions Name=TableName,Value=devdash \
  --statistic Sum --period 300 --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --evaluation-periods 1 \
  --alarm-actions "arn:aws:sns:ap-southeast-2:${AWS_ACCOUNT_ID}:devdash-alerts"

# SES bounce rate > 5%
aws cloudwatch put-metric-alarm \
  --alarm-name "devdash-ses-bounces" \
  --metric-name Reputation.BounceRate --namespace AWS/SES \
  --statistic Average --period 3600 --threshold 0.05 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --evaluation-periods 1 \
  --alarm-actions "arn:aws:sns:ap-southeast-2:${AWS_ACCOUNT_ID}:devdash-alerts"

# Create the SNS topic and subscribe Fahad's email
aws sns create-topic --name devdash-alerts
aws sns subscribe \
  --topic-arn "arn:aws:sns:ap-southeast-2:${AWS_ACCOUNT_ID}:devdash-alerts" \
  --protocol email \
  --notification-endpoint fahad@phonebot.com.au
```

---

### Incident Response Playbooks

**Dashboard won't load**

1. Check `https://devdash.phonebot.co.uk/` status. If browser shows Cloudflare error: Cloudflare Worker is down. Check Cloudflare dashboard → Workers & Pages → devdash Worker → Logs.
2. If Cloudflare Worker responds but page is blank: CloudFront distribution issue. `aws cloudfront list-distributions` → check distribution is `Deployed`. Check S3 origin: `aws s3 ls s3://devdash-static/`.
3. If page loads but API calls fail (network tab shows 5xx): Lambda errors. `aws logs tail /aws/lambda/devdash-data --since 30m`. Most likely: IAM role missing permission, or DynamoDB table name mismatch.
4. If DNS fails (`nslookup devdash.phonebot.co.uk`): Cloudflare DNS CNAME misconfigured. Check Cloudflare DNS panel.

**TOTP login failing**

1. First, verify the user is entering the code from Google Authenticator within the 30-second window. Codes expire — a code that was valid 35 seconds ago will fail.
2. Check the user's record exists in DynamoDB: `aws dynamodb get-item --table-name devdash --key '{"pk":{"S":"USER#faizan@phonebot.com.au"},"sk":{"S":"DATA"}}'`. Confirm `status = active`.
3. Check that Secrets Manager has the TOTP master key: `aws secretsmanager get-secret-value --secret-id devdash/totp-master-key`. If this returns an error, the Lambda cannot decrypt the stored TOTP secret.
4. Check Lambda logs for the specific error: `aws logs tail /aws/lambda/devdash-auth --since 1h --filter-pattern "totp"`.

**Daily email not arriving**

1. Check Lambda logs: `aws logs tail /aws/lambda/devdash-email-digest --since 2h`.
2. Check SES sending quota: `aws sesv2 get-account`. If `SendingEnabled: false`, SES is still in sandbox or has been paused due to bounce rate.
3. Check SES complaint/bounce dashboard in console. If bounce rate > 5% or complaint rate > 0.1%, SES auto-pauses sending. Fix: remove bounced addresses, then request re-enable via console.
4. Check EventBridge rule is still enabled: `aws events describe-rule --name devdash-daily-digest`. Confirm `State: ENABLED`.
5. If rule is enabled and Lambda runs but email does not arrive: check fahad@phonebot.com.au spam folder. Check `devdash@phonebot.com.au` DKIM status in SES console.

**Weekly audit crashed mid-run**

The audit is idempotent by design: each project's results are written independently. If it crashes after processing 3 of 5 projects, re-running it produces the same output for the 3 completed projects and adds the missing 2.

1. Check which projects were completed: `aws dynamodb query --table-name devdash --key-condition-expression "pk = :p" --expression-attribute-values '{":p":{"S":"PROJECT#phonebot-2"}}' | jq '.Items[] | select(.sk.S == "META") | .last_audit'`.
2. Re-run `/weekly-audit` from Claude Code. It will re-process all projects (cheaply — cache hits for the completed ones) and complete the missing ones.
3. If the crash was due to a Claude Max session rate limit (large context + multiple projects): break the audit into two runs across two sessions. Run projects 1–3 in one session, 4–5 in the next.

**Data loss in DynamoDB**

1. Minor: a single record was accidentally deleted. Use PITR: `aws dynamodb restore-table-to-point-in-time --source-table-name devdash --target-table-name devdash-restore --restore-date-time <ISO-timestamp>`. This creates a new table. Extract the specific records you need, write them back to `devdash`. Drop the restore table.
2. Major: table dropped or corrupted. Same PITR process but restore fully, then swap traffic. PITR retention is 35 days. If the loss is older than 35 days, restore from the S3 snapshot: `s3://devdash-data/projects/{id}/snapshots/{date}.json` contains the full audit snapshot for that week.

**Suspected secret compromise**

If you believe the TOTP master key or Cloudflare API token has been exposed:

1. **Immediately:** Rotate the Secrets Manager secret. `aws secretsmanager rotate-secret --secret-id devdash/totp-master-key`. This triggers a new key version. All active sessions become invalid (TOTP verification will fail until Lambda code picks up the new key version).
2. Re-provision TOTP for all users: run `totp_provision.py` to re-encrypt all stored TOTP secrets with the new key. Distribute new QR codes to each user.
3. Revoke the old Cloudflare API token in the Cloudflare dashboard and create a new one. Update Secrets Manager.
4. Review CloudTrail logs for unauthorized reads: `aws cloudtrail lookup-events --lookup-attributes AttributeKey=EventName,AttributeValue=GetSecretValue`.
5. If a Lambda function's environment variables were exposed (not just Secrets Manager): rotate Lambda execution role credentials via IAM (delete and recreate the access keys if any; role-based access auto-rotates, but force a re-deploy so the Lambda gets a fresh STS token).

**Dev lost phone — TOTP broken**

1. Fahad logs in with his own account and calls `POST /admin/provision-user` with `{"email": "faizan@phonebot.com.au", "regenerate_totp": true}`. This generates a new TOTP secret, re-encrypts it, and returns a fresh QR code as base64 PNG.
2. The old TOTP secret is immediately invalid — any existing sessions for that user are also invalidated (DynamoDB SESSION# records for that email are purged).
3. Send the QR code to the dev via a secure channel (not WhatsApp). Dev scans it into Google Authenticator on their new phone.
4. Dev attempts login with new code to confirm provisioning worked.
5. Log the re-provisioning event (it will appear in CloudTrail automatically via the Lambda execution).

**Dev disputes audit finding**

1. Dev submits a written dispute: email or a document uploaded via `POST /projects/{id}/uploads` with a note explaining what was missed.
2. Fahad reviews the dispute within the week using the `GET /merit/{email}` endpoint which returns the full signal breakdown (`signal_breakdown.json`). This shows exactly which handoff entries and commits were counted.
3. If the dispute is valid (e.g., a handoff file was uploaded after the audit cutoff, or Claude misread a commit message): Fahad calls `PUT /merit/{email}/{week}` with `{"score": <corrected>, "reason": "...", "override_reason": "handoff filed after Sunday cutoff"}`. The override is logged to CloudTrail.
4. If the dispute is not valid: Fahad explains the breakdown to the dev. Decision is final. Log response in the same S3 uploads folder for the record.
5. Disputes must be filed within 14 days of the audit week. After that, the data is in the warm tier and a manual S3 retrieval is needed — still possible, but Fahad's call whether to bother.

**User leaves company**

1. Day 0: `DELETE /admin/users/{email}` (CEO only, requires Fahad's TOTP confirmation). This sets `status = disabled` in DynamoDB. The user cannot log in. Their data is untouched.
2. Day 0–30: Read-only archive period. Fahad can pull contribution history for handover. Run `GET /merit/{email}` and export the result.
3. Day 30: Tag their S3 prefix: `aws s3api put-object-tagging --bucket devdash-data --key "global/users/{email}.json" --tagging '{"TagSet":[{"Key":"status","Value":"archived"}]}'`. A Lambda job generates a compressed summary JSON of their contributions.
4. If the user needs to come back: re-enable via `POST /admin/provision-user` (same endpoint, existing email, regenerates TOTP). Full data history is preserved.

**New project onboarded**

```
Checklist:
[ ] Add project to dashboard.config.yaml (name, kickoff_date, deadline, devs, repos)
[ ] Provision DynamoDB record: PUT /projects/{new-id}/metadata
[ ] Upload initial scope documents (CLAUDE.md, README, existing items list) via /uploads
[ ] Run a bootstrap knowledge card generation: POST /audit/trigger with {"project_id": "{new-id}", "bootstrap": true}
[ ] Verify knowledge card written to S3: aws s3 ls s3://devdash-data/projects/{new-id}/
[ ] Assign QA to project in users.yaml
[ ] Brief the dev(s) assigned: show them the handoff format, login flow, clock-in process
[ ] Run first full weekly audit on the next Sunday to include new project
```

---

### Monthly Checklist Template

Copy this block into the start of each month's handoff log.

```
## Monthly Ops Checklist — [Month YYYY]

[ ] Digest emails arriving daily Mon–Fri (spot-check CloudWatch logs)
[ ] Weekly audit ran all 4 Sundays (check DynamoDB MERIT#2026-W[n] entries)
[ ] Merit score distribution reviewed — no systemic bias (all Exceptional or all Developing)
[ ] S3 storage costs checked in Cost Explorer (target: < $2/month)
[ ] Lambda error rate checked (target: 0 errors in 30 days)
[ ] Secrets Manager — confirm TOTP master key has not been accessed by unexpected principals (CloudTrail check)
[ ] Active user count matches users.yaml (no stale accounts from departed staff)
[ ] Any open design decisions from data-architecture.md Section 12 resolved
[ ] Any project onboarding/offboarding this month documented
[ ] Retention config reviewed if any project has an unusual data volume
```

---

### Annual DR Drill Checklist

Run this once a year (recommend January, after Eid / quiet period).

```
[ ] PITR restore test: restore devdash table to 7 days ago into devdash-dr-test, verify record count matches, drop test table
[ ] S3 snapshot restore test: pull the most recent snapshot JSON for phonebot-2, verify it parses cleanly
[ ] Cross-region replica check: verify devdash-data-replica in secondary region has recent objects (aws s3 ls s3://devdash-data-replica/projects/ --region us-east-1)
[ ] TOTP re-provisioning drill: provision one test user, verify QR scan + login flow works end-to-end
[ ] Secret rotation: rotate devdash/totp-master-key, re-provision all users, confirm all can still log in
[ ] CloudFront failover: simulate S3 origin outage by removing index.html, confirm CloudFront serves cached version (or returns expected error)
[ ] Review CloudTrail logs for the year: any unexpected GetSecretValue, DeleteItem, or admin endpoint calls
[ ] Update contact tree if Fahad or Imran contact details changed
[ ] Verify GitHub Actions CI/CD still works: push a whitespace change to devdash.html, confirm deploy pipeline passes
```

---

*Document owner: Fahad. Last updated: 2026-04-24.*
*Review triggers: new project added, team size change, AWS region change, or security incident.*
