# Document processing

PDF uploads are checked locally for size, PDF signature, structure, and active content before
sending the PDF to the existing AI provider to extract candidate or requirement fields.
PDF auto-fill needs no document-processing service or DOCUMENT_PROCESSOR_* variables.
These checks are format validation, not antivirus scanning. Review the fields before saving.

DOCX uploads still use the isolated worker for bounded plain-text extraction. It requires
DOCUMENT_PROCESSOR_TOKEN (at least 32 random characters) and PORT (default 8788).
The application needs DOCUMENT_PROCESSOR_URL and the matching token for DOCX only.
No malware-scanner service is used.

## Optional local DOCX worker

Start Docker Desktop, then run from the repository root:

```sh
node scripts/setup-local-document-processor.mjs
docker compose --env-file .env.local -f docker-compose.documents.yml up -d --build
```

The setup preserves unrelated variables and writes a token to ignored .env.local.
The gateway binds to 127.0.0.1:8788; the parser has no host port or internet route.
Worker-thread memory limits, container limits, timeouts, and archive-size checks remain enabled.

```sh
node --env-file=.env.local --experimental-strip-types scripts/test-local-document-processor.mjs
docker compose --env-file .env.local -f docker-compose.documents.yml stop
```

For production DOCX support, host the parser privately behind an authenticated HTTPS endpoint.
Vercel cannot reach your computer's loopback address. PDF auto-fill does not use this endpoint.
AI extraction uses the existing configured provider and its normal usage charges.
