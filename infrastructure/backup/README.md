# Backup and restore rehearsal

These scripts back up the self-hosted Routefolk application schemas and private
Storage volume, verify their checksums, and restore them into an isolated Docker
Compose project.

## Safety model

- Run the scripts from the configured server checkout.
- `backup.sh` briefly stops the public application services to prevent writes
  while PostgreSQL and Storage are captured.
- PostgreSQL remains running and is dumped in custom format.
- `.env` and all secrets are intentionally excluded. Back up `.env` separately
  to an encrypted secret store; the JWT secret and keys are required for a real
  disaster recovery.
- A restore project name must start with `routefolk-restore-`, preventing the
  script from targeting the working `routefolk` project.
- Never add `--volumes` when operating on the working project.

## Create and verify a backup

```sh
./infrastructure/backup/backup.sh /encrypted/offsite/staging
./infrastructure/backup/verify-backup.sh \
  /encrypted/offsite/staging/routefolk-backup-YYYYMMDDTHHMMSSZ
```

Copy the completed directory to encrypted off-device storage only after
verification succeeds. The generated checksum file detects later corruption.

## Rehearse a restore

Choose an unused loopback port:

```sh
./infrastructure/backup/restore-rehearsal.sh \
  /encrypted/offsite/staging/routefolk-backup-YYYYMMDDTHHMMSSZ \
  routefolk-restore-manual \
  18081
```

The script verifies the archive, restores a separate database and Storage
volume, compares row counts, and checks the isolated gateway. It first
initializes an empty current schema so the custom dump's cleanup statements
have valid relation targets. It intentionally leaves the rehearsal running so
an operator can inspect UUID ownership and download a restored GPX file.

After inspection, remove only the isolated project:

```sh
docker compose -p routefolk-restore-manual down --volumes
```

The backup's `counts.restored.tsv` is rehearsal output and can be deleted after
the result has been recorded.
