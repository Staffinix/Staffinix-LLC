# Isolated document processor

Run this service separately from the web application. It intentionally fails to start unless a
private bearer token and a reachable ClamAV daemon are configured.

Required environment variables:

- `DOCUMENT_PROCESSOR_TOKEN`: at least 32 random characters; use the same secret in the web app.
- `CLAMAV_HOST`: private hostname/IP of a ClamAV daemon with `INSTREAM` enabled.
- `CLAMAV_PORT`: defaults to `3310`.
- `PORT`: defaults to `8788`.

The web app also requires `DOCUMENT_PROCESSOR_URL`. Do not expose the worker publicly; place it on a
private service network and permit traffic only from the web application.

Build from the repository root:

```sh
docker build -f workers/document-processor/Dockerfile -t staffinix-document-processor .
```

The deployment must add a container-level ceiling in addition to the worker-thread heap limit, for
example `--memory=128m --memory-swap=128m --cpus=0.5 --pids-limit=64 --read-only`. Give `/tmp` a
small size-limited tmpfs if the platform requires it. Keep outbound network access disabled except
for the private ClamAV connection.
