# Deployment (Verda)

The app runs on one Verda CPU instance. Terraform in [`infra/terraform`](../infra/terraform)
provisions the instance, and [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)
provisions and ships on every push to `master`. Nothing has to run on a laptop.

```text
push to master
  └─ Terraform job: restore encrypted state → plan → apply → save state → public IP
      └─ Ship app job: SSH → bootstrap.sh (Docker, ufw) → upload `git archive` release
                       → write API config → docker compose up --build --wait → smoke test
```

On the host, Docker Compose ([`deploy/compose.yaml`](../deploy/compose.yaml)) runs two containers:

- `api`: FastAPI on port 8000 inside the network. The SQLite order store is on the `api-state`
  volume, so it survives redeploys. It is lost if the instance is replaced.
- `web`: Caddy serves the built web app, proxies `/api` and `/mcp` to `api`, and gets a Let's
  Encrypt certificate automatically. Only ports 22, 80 and 443 are open.

The public URL is `https://<ip>.sslip.io` unless the `SITE_ADDRESS` repository variable sets a
domain whose DNS points at the instance. The MCP endpoint is `https://<site>/mcp`, and the workflow
adds that host to `API_MCP_ALLOWED_HOSTS`.

## Defaults

| Setting | Value | Notes |
|---|---|---|
| Instance type | `CPU.4V.16G` | About €0.048 an hour (Verda API, 2026-11-14). It was only available in `FIN-01`. |
| Image | `24.04.base` | Ubuntu 24.04 minimal. |
| OS volume | 50 GB NVMe | Deleted with the instance. |
| SSH user | `root` | |

Changing `instance_type`, `image` or `location` replaces the instance. That gives it a new IP, a
new sslip.io hostname and an empty order store.

## Terraform state

The state is a local file that CI keeps on the orphan branch `tfstate`, encrypted with AES-256
using `TF_STATE_PASSPHRASE`. The workflow's `concurrency` group allows one writer at a time. State
is saved after a failed apply too, so partly created resources are not orphaned. If the passphrase
cannot decrypt the state, the run stops before Terraform starts, rather than creating a second
instance.

If more than one pipeline or person needs to write state, move to a remote backend with locking,
such as HCP Terraform or S3. Change the `backend` block in `versions.tf` and run
`terraform init -migrate-state`.

## One-time setup

Repository secrets (`gh secret set NAME`, which reads the value from stdin):

| Secret | Required | Value |
|---|---|---|
| `VERDA_CLIENT_ID`, `VERDA_CLIENT_SECRET` | yes | Verda OAuth client credentials. |
| `DEPLOY_SSH_PRIVATE_KEY` | yes | Private half of a dedicated ed25519 key. CI derives the public key. |
| `TF_STATE_PASSPHRASE` | yes | Random string. Keep a copy, because without it the state cannot be read. |
| `API_VALIO_API_KEY` | for quotes and orders | Challenge API key. |
| `API_OXYLABS_API_KEY` | optional | Enables substitute web research. |
| `API_VALIO_BASE_URL`, `API_GEMINI_API_KEY`, `OPENAI_COMPATIBLE_URL`, `OPENAI_COMPATIBLE_API_KEY`, `OPENAI_COMPATIBLE_MODEL` | optional | Mirrored from the local `.env` and written to the API config. |

The deploy key and state passphrase are kept in the gitignored `.deploy/` folder at the repo
root (`.deploy/id_ed25519`, `.deploy/tf-state-passphrase`). To recreate the secrets:

```sh
gh secret set DEPLOY_SSH_PRIVATE_KEY < .deploy/id_ed25519
gh secret set TF_STATE_PASSPHRASE < .deploy/tf-state-passphrase
gh secret set VERDA_CLIENT_ID
gh secret set VERDA_CLIENT_SECRET
gh secret set API_VALIO_API_KEY
```

After adding a key to the local `.env` that production needs, set it as a secret and add it to the
"Write API config" step of the workflow.

Optional repository variables (`gh variable set NAME --body ...`): `SITE_ADDRESS`,
`OPERATOR_SSH_PUBLIC_KEYS` (an HCL or JSON list of extra public keys for shell access),
`API_VALIO_BASE_URL`, `API_VALIO_CUSTOMER`, `API_APPROVAL_SPEND_THRESHOLD_EUR`,
`API_REQUIRED_TAGS` and `API_BANNED_ALLERGENS`.

## Operating

- Deploy: push to `master`, or run the workflow by hand from the Actions tab
  (`gh workflow run deploy.yml`).
- Pull requests that touch `infra/`, `deploy/` or the workflow get a `terraform plan` only.
- Destroy: `gh workflow run deploy.yml -f destroy=true`. This deletes the instance, its disk and
  the order store.
- Shell access: `ssh -i .deploy/id_ed25519 root@<ip>`, then
  `docker compose -p valio-aimo logs -f`.
- Releases are unpacked to `/opt/app/releases/<sha>`, the last three are kept, and
  `/opt/app/current` points at the live one. To roll back, revert the commit and push.
- The API reads its config from `/opt/app/api-config` (mode 0600). CI rewrites it on every
  deploy from secrets and variables.
- A failed run prints `docker compose ps` and the last 200 log lines in its Diagnostics step.

To work on Terraform locally, export `VERDA_CLIENT_ID`, `VERDA_CLIENT_SECRET` and
`TF_VAR_deploy_ssh_public_key`. Then run `terraform init && terraform plan` in `infra/terraform`.
Do not apply locally while CI owns the state on the `tfstate` branch.
