// ── Image utilities ───────────────────────────────────────────────────────────

export interface AppImage {
  /** Full data URL (data:image/jpeg;base64,...) — safe to use as <img src>. */
  dataUrl: string;
  /** Raw base64 string without the data: prefix — what APIs want. */
  base64: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  sizeBytes: number;
  filename: string;
}

const SUPPORTED_TYPES: AppImage['mimeType'][] = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
];

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

function isSupportedMime(type: string): type is AppImage['mimeType'] {
  return (SUPPORTED_TYPES as string[]).includes(type);
}

export async function readImageFile(file: File): Promise<AppImage> {
  if (!isSupportedMime(file.type)) {
    throw new Error(`Unsupported image type: ${file.type}. Use JPEG, PNG, GIF, or WebP.`);
  }
  if (file.size > MAX_SIZE_BYTES) {
    throw new Error(
      `Image too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 10 MB.`
    );
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '');
      resolve({ dataUrl, base64, mimeType: file.type as AppImage['mimeType'], sizeBytes: file.size, filename: file.name });
    };
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

/** Extract the first image from a paste event's clipboardData items. */
export function extractPasteImage(clipboardData: DataTransfer): File | null {
  for (const item of clipboardData.items) {
    if (isSupportedMime(item.type)) {
      return item.getAsFile();
    }
  }
  return null;
}

export function formatImageSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(0)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
