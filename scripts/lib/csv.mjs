import fs from "node:fs/promises";

export function parseCsv(text) {
  const cleaned = text.replace(/^\uFEFF/, "");
  const records = splitCsvRecords(cleaned).filter((record) =>
    record.some((cell) => cell.length)
  );
  if (!records.length) return [];

  const headers = records[0].map((header) => header.trim());
  return records.slice(1).map((cells) =>
    Object.fromEntries(
      headers.map((header, index) => [header, (cells[index] || "").trim()])
    )
  );
}

export async function readCsv(filePath) {
  return parseCsv(await fs.readFile(filePath, "utf8"));
}

function splitCsvRecords(text) {
  const records = [];
  let row = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (inQuotes && text[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      row.push(current);
      records.push(row);
      row = [];
      current = "";
      if (char === "\r" && text[index + 1] === "\n") index += 1;
    } else {
      current += char;
    }
  }

  row.push(current);
  records.push(row);
  return records;
}
