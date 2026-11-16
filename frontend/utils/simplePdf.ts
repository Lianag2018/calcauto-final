// Une image JPEG posée sur une page lettre : le plus petit PDF possible, sans bibliothèque.
const PAGE_W = 612; // 8,5 po en points
const PAGE_H = 792; // 11 po

const bytes = (text: string): Uint8Array => {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
  return out;
};

export function jpegToLetterPdf(jpeg: Uint8Array, pixelWidth: number, pixelHeight: number, margin = 26): Blob {
  const scale = Math.min((PAGE_W - 2 * margin) / pixelWidth, (PAGE_H - 2 * margin) / pixelHeight);
  const w = pixelWidth * scale;
  const h = pixelHeight * scale;
  const x = (PAGE_W - w) / 2;
  const y = PAGE_H - margin - h; // collée en haut
  const content = `q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im0 Do Q`;
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let size = 0;
  const push = (chunk: Uint8Array | string) => {
    const data = typeof chunk === 'string' ? bytes(chunk) : chunk;
    parts.push(data);
    size += data.length;
  };
  const object = (id: number, body: () => void) => { offsets[id] = size; push(`${id} 0 obj\n`); body(); push('\nendobj\n'); };
  push('%PDF-1.4\n');
  object(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  object(2, () => push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'));
  object(3, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`));
  object(4, () => {
    push(`<< /Type /XObject /Subtype /Image /Width ${pixelWidth} /Height ${pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
    push(jpeg);
    push('\nendstream');
  });
  object(5, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
  const xref = size;
  push(`xref\n0 6\n0000000000 65535 f \n${[1, 2, 3, 4, 5].map((id) => String(offsets[id]).padStart(10, '0') + ' 00000 n \n').join('')}`);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts as BlobPart[], { type: 'application/pdf' });
}

export const blobToBase64 = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});
