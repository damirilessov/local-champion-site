import { BlobReader, BlobWriter, TextReader, TextWriter, ZipReader, ZipWriter } from "@zip.js/zip.js";

export const rateTemplateHeaders = [
  "Откуда", "Куда", "Вид перевозки", "Валюта", "Базовая ставка", "За кг",
  "За м3", "Топливная надбавка %", "Обработка", "Минимальная сумма",
  "Транзит дней", "Действует с", "Действует до",
];

export async function parseRateWorkbook(file: File) {
  const reader = new ZipReader(new BlobReader(file));
  try {
    const entries = await reader.getEntries();
    const byName = new Map(entries.map((entry) => [entry.filename, entry]));
    const sheet = byName.get("xl/worksheets/sheet1.xml");
    if (!sheet?.getData) throw new Error("В книге не найден первый лист");
    const sharedEntry = byName.get("xl/sharedStrings.xml");
    const shared = sharedEntry?.getData ? sharedStrings(await sharedEntry.getData(new TextWriter())) : [];
    const xml = await sheet.getData(new TextWriter());
    return worksheetRows(xml, shared);
  } finally { await reader.close(); }
}

export async function createRateTemplate() {
  const example = ["Шэньчжэнь, CN", "Алматы, KZ", "Авто", "USD", "2200", "0.34", "31", "5", "40", "2200", "12", futureDate(1), futureDate(90)];
  const writer = new ZipWriter(new BlobWriter("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"));
  await writer.add("[Content_Types].xml", new TextReader(contentTypes));
  await writer.add("_rels/.rels", new TextReader(rootRels));
  await writer.add("xl/workbook.xml", new TextReader(workbook));
  await writer.add("xl/_rels/workbook.xml.rels", new TextReader(workbookRels));
  await writer.add("xl/styles.xml", new TextReader(styles));
  await writer.add("xl/worksheets/sheet1.xml", new TextReader(sheetXml([rateTemplateHeaders, example])));
  return writer.close();
}

function worksheetRows(xml: string, shared: string[]) {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) throw new Error("Не удалось прочитать структуру Excel");
  const matrix = [...document.getElementsByTagName("row")].map((row) => {
    const values: string[] = [];
    for (const cell of [...row.getElementsByTagName("c")]) {
      const index = columnIndex(cell.getAttribute("r") ?? "A1");
      const type = cell.getAttribute("t");
      const raw = type === "inlineStr"
        ? [...cell.getElementsByTagName("t")].map((node) => node.textContent ?? "").join("")
        : cell.getElementsByTagName("v")[0]?.textContent ?? "";
      values[index] = type === "s" ? shared[Number(raw)] ?? "" : raw;
    }
    return values;
  }).filter((row) => row.some((value) => String(value ?? "").trim()));
  if (matrix.length < 2) throw new Error("Добавьте хотя бы одну строку тарифа под заголовками");
  const headers = matrix[0].map((value) => normalize(String(value ?? "")));
  return matrix.slice(1).map((row, index) => ({
    rowNumber: index + 2,
    values: Object.fromEntries(headers.map((header, column) => [header, String(row[column] ?? "").trim()])),
  }));
}

function sharedStrings(xml: string) {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  return [...document.getElementsByTagName("si")].map((item) => [...item.getElementsByTagName("t")].map((node) => node.textContent ?? "").join(""));
}

export function normalize(value: string) { return value.trim().toLocaleLowerCase("ru-RU").replace(/ё/g, "е").replace(/³/g, "3").replace(/\s+/g, " "); }
export function excelDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const serial = Number(value);
  if (!Number.isFinite(serial) || serial < 20_000 || serial > 100_000) return value;
  return new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000).toISOString().slice(0, 10);
}

function columnIndex(reference: string) {
  const letters = reference.match(/^[A-Z]+/)?.[0] ?? "A";
  return [...letters].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}
function columnName(index: number) { let result = ""; for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) result = String.fromCharCode(65 + (value - 1) % 26) + result; return result; }
function sheetXml(rows: string[][]) { return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, column) => `<c r="${columnName(column)}${rowIndex + 1}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`).join("")}</row>`).join("")}</sheetData></worksheet>`; }
function escapeXml(value: string) { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function futureDate(days: number) { return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10); }

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Тарифы" sheetId="1" r:id="rId1"/></sheets></workbook>`;
const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="1"><xf/></cellXfs></styleSheet>`;
