# Resume tailoring workspace

## Implemented flow

Open Resume Tailoring from the sidebar, candidate profile, matching result, requisition, or submission. Search and select accessible candidates and open requisitions. Selection is paginated and governed by the existing server authorization and RLS policies.

Upload an original PDF/DOCX (10 MiB maximum) through the existing signed-upload and isolated document-parser pipeline. Select the original to use. Review extracted text against the profile, then verify the source. Generation remains disabled without verified source text.

The shared matching evaluator explains weighted scores, skill gaps, experience, education, location, and review findings. This is recruitment decision support, not a guaranteed ATS score.

AI receives bounded source text and verified records as untrusted data. It may select existing fact IDs only. The server rejects unknown, cross-category, or duplicate IDs and renders stored facts verbatim. Employment is chronological. AI requests use the existing provider gateway, timeout, schema validation, and usage guard.

Review original/generated text side by side (tabs on mobile). Edit included facts; regenerate a section; save a new immutable draft; reject a draft; or explicitly approve it. History lets recruiters view, compare, duplicate, and restore selections into a new draft without overwriting any prior version. Source hashes are checked when saving edits and approving.

Approved, validated versions can be exported as real PDF or DOCX, using Classic Professional, Modern Minimal, or Technical Specialist fonts. Export authorization is checked again server-side, and export requests are audited. Download libraries are dynamically loaded. No email or submission is sent automatically.

## Configuration

No new database migration or credential is required. Retain existing server-only `OPENROUTER_API_KEY`, optional `OPENROUTER_APP_URL`/`OPENROUTER_APP_NAME`, Supabase configuration, and `DOCUMENT_PROCESSOR_URL`/`DOCUMENT_PROCESSOR_TOKEN` for the isolated parsing worker. Never prefix secret keys with `VITE_`.

## Tests and manual verification

`npm run test:matching-engine` includes mock-selection accuracy checks and PDF/DOCX tests. Existing document-worker, gateway, usage, authorization, and database regression suites cover the reused infrastructure.

1. Sign in as an authorized recruiter and select a real accessible candidate and requisition.
2. Upload a source document, review parsed profile facts, and verify it.
3. Generate; confirm missing skills are reported as gaps, not inserted into the resume.
4. Change fact selections; save; verify a new draft and unchanged original.
5. Regenerate a section; compare versions; reject a draft; duplicate a previous version.
6. Approve after human review; export both formats; reopen documents and inspect pagination.
7. Change candidate facts and confirm old selections cannot be saved or approved against stale evidence.
8. Test another recruiter/tenant and confirm inaccessible records cannot be selected, modified, or exported.

## Explicit limitations

- Free-text AI paraphrasing and arbitrary prose editing are not enabled: they cannot meet the existing deterministic no-fabrication guarantee. Edit verified profile facts through the candidate editor, reverify, and generate a new draft instead.
- PDF uses built-in Latin fonts. Unsupported scripts fail safely instead of producing corrupt text; DOCX supports Unicode. A reviewed embedded Unicode font is needed for multilingual PDF output.
- History uses the existing candidate API's latest 100-version bound. Export audit records record requests, not proof that the user's browser saved a file.
- Production currently has no original resumes, so live upload → provider generation → approval → download still needs recruiter verification with a real source resume. Automated tests do not call a paid AI service or mutate production candidates.
