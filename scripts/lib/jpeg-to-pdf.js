/**
 * Wraps a single JPEG into a one-page PDF.
 *
 * A JPEG is already a valid PDF image stream (`/DCTDecode`), so the whole file is
 * just a handful of objects around the original bytes — no PDF library needed.
 * Used to produce a PDF fixture so the "upload the PDF of your e-Aadhaar" path
 * gets tested as well as the plain-image one.
 */
export function jpegToPdf(jpeg, width, height) {
  const chunks = [];
  const offsets = [];
  let length = 0;

  const push = (data) => {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, 'latin1');
    chunks.push(buf);
    length += buf.length;
  };

  /** Records where this object starts, as the xref table needs byte offsets. */
  const startObject = (n) => {
    offsets[n] = length;
    push(`${n} 0 obj\n`);
  };

  const content = `q\n${width} 0 0 ${height} 0 0 cm\n/Im0 Do\nQ\n`;

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

  startObject(1);
  push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  startObject(2);
  push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');

  startObject(3);
  push(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] ` +
      `/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
  );

  startObject(4);
  push(
    `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
  );
  push(jpeg);
  push('\nendstream\nendobj\n');

  startObject(5);
  push(`<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`);

  const xrefOffset = length;
  const entries = ['0000000000 65535 f \n'];
  for (let n = 1; n <= 5; n++) entries.push(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`);

  push(`xref\n0 6\n${entries.join('')}`);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  return Buffer.concat(chunks);
}
