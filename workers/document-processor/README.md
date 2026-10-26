# Isolated document processor

## Temporary local testing (no cloud hosting)

Start Docker Desktop, then run these commands from the repository root:

```sh
node scripts/setup-local-document-processor.mjs
docker compose --env-file .env.local -f docker-compose.documents.yml up -d --build
```

The setup preserves unrelated environment variables and generates a private token in ignored
`.env.local`. Never commit or share this file. Start the local app with server-only environment
variables loaded explicitly (the normal Vite command loads only public `VITE_` variables):

```sh
node --env-file=.env.local node_modules/vite/bin/vite.js --host 127.0.0.1
```

The gateway listens only on `127.0.0.1:8788`; the parser and scanner have no host ports. The parser
is on an isolated Docker network with no internet route. The scanner can download virus-signature
updates. The gateway forwards requests only to the parser, never arbitrary destinations.
Initial image/signature downloads can take several minutes. Allow about 4 GB RAM for scanning.

Test the full local processing boundary with your PDF (no AI calls or candidate records):

```sh
node --env-file=.env.local --experimental-strip-types scripts/test-local-document-processor.mjs "C:/path/to/resume.pdf"
```

To stop testing without deleting signature data:

```sh
docker compose --env-file .env.local -f docker-compose.documents.yml stop
```

This does not connect the public Vercel app to your computer. Do not set the Vercel endpoint to
`localhost`, publish the scanner port, or create a public tunnel without reviewing its security.
AI extraction still requires the existing configured provider and can incur provider usage charges.

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
