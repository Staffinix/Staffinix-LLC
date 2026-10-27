function fail(message) {
  throw new Error(message);
}

export function validatePdf(bytes) {
  const header = Buffer.from(bytes.subarray(0, Math.min(bytes.length, 1024))).toString("latin1");
  const trailer = Buffer.from(bytes.subarray(Math.max(0, bytes.length - 4096))).toString("latin1");
  if (!header.startsWith("%PDF-")) fail("PDF signature is missing");
  if (!trailer.includes("%%EOF")) fail("PDF end marker is missing");

  const source = Buffer.from(bytes).toString("latin1");
  const blocked = [
    /\/JavaScript\b/i,
    /\/JS\b/i,
    /\/Launch\b/i,
    /\/EmbeddedFile\b/i,
    /\/OpenAction\b/i,
    /\/RichMedia\b/i,
    /\/XFA\b/i,
    /\/Encrypt\b/i,
  ];
  if (blocked.some((pattern) => pattern.test(source)))
    fail("PDF contains active or encrypted content");
  if ((source.match(/\b\d+\s+\d+\s+obj\b/g) ?? []).length > 10_000)
    fail("PDF object limit exceeded");
  if ((source.match(/\bstream[\r\n]/g) ?? []).length > 2_000) fail("PDF stream limit exceeded");
  return null;
}
