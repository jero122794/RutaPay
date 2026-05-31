// frontend/lib/download.ts
import api from "./api";

const filenameFromDisposition = (disposition: string | undefined, fallback: string): string => {
  if (!disposition) {
    return fallback;
  }
  const utfMatch = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (utfMatch?.[1]) {
    return decodeURIComponent(utfMatch[1]);
  }
  const asciiMatch = /filename="?([^";]+)"?/i.exec(disposition);
  if (asciiMatch?.[1]) {
    return asciiMatch[1];
  }
  return fallback;
};

const triggerBrowserDownload = (blob: Blob, filename: string): void => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

/** Downloads an authenticated API resource (Bearer token) as a file via the axios client. */
export const downloadAuthedFile = async (
  url: string,
  params: Record<string, string>,
  fallbackName: string
): Promise<void> => {
  const response = await api.get(url, { params, responseType: "blob" });
  const disposition = response.headers["content-disposition"] as string | undefined;
  const filename = filenameFromDisposition(disposition, fallbackName);
  triggerBrowserDownload(response.data as Blob, filename);
};
