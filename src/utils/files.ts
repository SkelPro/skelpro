import path from "path";

// Raster image formats get an image/* MIME type in the data URI. SVG is text
// and is stored as text, so it is deliberately not listed here.
export const imgExtensions: string[] = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".bmp",
  ".ico",
];

const MIME_OVERRIDES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
};

const BINARY_SNIFF_BYTES = 8 * 1024;

/** A file is binary if it has a null byte in its first 8 KB, or is a raster image. */
export function isBinaryContent(buffer: Buffer, filename = ""): boolean {
  if (imgExtensions.includes(getFileExtension(filename))) {
    return true;
  }
  const sample = buffer.subarray(0, BINARY_SNIFF_BYTES);
  return sample.includes(0);
}

export function encodeBinary(buffer: Buffer, filename: string): string {
  const ext = getFileExtension(filename);
  const mime = imgExtensions.includes(ext)
    ? MIME_OVERRIDES[ext] ?? `image/${ext.slice(1)}`
    : "application/octet-stream";
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

const DATA_URI = /^data:[\w.+-]+\/[\w.+-]+;base64,([A-Za-z0-9+/=\r\n]*)$/;

/** Returns the decoded bytes if the value is a base64 data URI, otherwise null. */
export function decodeBinary(value: string): Buffer | null {
  const match = DATA_URI.exec(value);
  return match ? Buffer.from(match[1], "base64") : null;
}

export function getFileExtension(filename: string): string {
  return path.extname(filename).toLowerCase();
}
