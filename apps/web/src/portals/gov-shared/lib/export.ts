// Client-side exports (Spec C §6.9). Heavy libraries load on demand. jsPDF's built-in fonts only cover Latin text,
// so anything with Indic or Urdu script is rasterized instead of printed as a table.
export interface ExportSheet {
  name: string;
  columns: string[];
  rows: (string | number)[][];
}

const NON_LATIN = /[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/u;
export const hasNonLatin = (sheets: ExportSheet[]) =>
  sheets.some((s) => [s.columns, ...s.rows].some((r) => r.some((c) => NON_LATIN.test(String(c)))));

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Quotes CSV cells and neutralizes spreadsheet formulas, since cells can hold citizen-written text. */
const csvCell = (v: string | number) => {
  if (typeof v === 'number') return String(v);
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function exportCsv(sheets: ExportSheet[], filename: string) {
  const body = sheets
    .map((s) =>
      [...(sheets.length > 1 ? [s.name] : []), s.columns.map(csvCell).join(','), ...s.rows.map((r) => r.map(csvCell).join(','))].join(
        '\n',
      ),
    )
    .join('\n\n');
  // The byte order mark makes Excel read Telugu, Hindi and Urdu as UTF-8.
  download(new Blob(['﻿', body], { type: 'text/csv;charset=utf-8' }), `${filename}.csv`);
}

export async function exportExcel(sheets: ExportSheet[], filename: string) {
  const XLSX = await import('xlsx');
  const book = XLSX.utils.book_new();
  for (const s of sheets) {
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([s.columns, ...s.rows]), s.name.slice(0, 31));
  }
  XLSX.writeFile(book, `${filename}.xlsx`);
}

export async function exportPdfTables(sheets: ExportSheet[], filename: string, title: string) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape' });
  doc.setFontSize(14);
  doc.text(title, 14, 16);
  let y = 22;
  for (const s of sheets) {
    doc.setFontSize(10);
    doc.text(s.name, 14, y + 4);
    autoTable(doc, { head: [s.columns], body: s.rows, startY: y + 7, styles: { fontSize: 8 } });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    if (y > 180) {
      doc.addPage();
      y = 14;
    }
  }
  doc.save(`${filename}.pdf`);
}

export async function exportPdfRaster(element: HTMLElement, filename: string) {
  const [{ jsPDF }, { toPng }] = await Promise.all([import('jspdf'), import('html-to-image')]);
  const background = getComputedStyle(document.body).getPropertyValue('background-color');
  const png = await toPng(element, { backgroundColor: background, pixelRatio: 2 });
  const doc = new jsPDF({ orientation: 'portrait' });
  const width = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const height = (element.offsetHeight / element.offsetWidth) * width;
  // One tall image, shifted up a page at a time.
  for (let top = 0; top < height; top += pageHeight) {
    if (top > 0) doc.addPage();
    doc.addImage(png, 'PNG', 0, -top, width, height);
  }
  doc.save(`${filename}.pdf`);
}
