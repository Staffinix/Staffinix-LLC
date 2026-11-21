import {
  createVendorCsv,
  createVendorSheet,
  parseVendorCsv,
  parseVendorSheet,
  type VendorCsvRow,
} from "./vendor-csv.ts";

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export type VendorFileFormat = "csv" | "xlsx";

export async function readVendorFile(file: File): Promise<VendorCsvRow[]> {
  if (file.size > MAX_IMPORT_BYTES) throw new Error("Import file must be 5 MB or smaller.");
  const name = file.name.toLowerCase();

  if (name.endsWith(".csv")) return parseVendorCsv(await file.text());
  if (name.endsWith(".xls")) {
    throw new Error("Old .xls files are not supported. In Excel, use Save As and choose .xlsx.");
  }
  if (!name.endsWith(".xlsx")) throw new Error("Choose a .csv or .xlsx file.");

  const { readSheet } = await import("read-excel-file/browser");
  const cells = await readSheet(file).catch(() => {
    throw new Error("This Excel file could not be read. Open it in Excel and save it again.");
  });
  return parseVendorSheet(cells);
}

export async function downloadVendors(rows: VendorCsvRow[], format: VendorFileFormat) {
  let blob: Blob;
  if (format === "csv") {
    blob = new Blob(["﻿", createVendorCsv(rows)], { type: "text/csv;charset=utf-8" });
  } else {
    const { default: writeExcelFile } = await import("write-excel-file/browser");
    blob = await writeExcelFile(createVendorSheet(rows)).toBlob();
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `vendors-${new Date().toISOString().slice(0, 10)}.${format}`;
  anchor.click();
  // Revoking in the same tick can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
