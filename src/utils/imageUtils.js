/**
 * Image utility functions for processing base64 data-URLs from the canvas.
 */

/**
 * Extract the raw base64 data from a data-URL string.
 * e.g. "data:image/png;base64,iVBORw0KGgo..." → "iVBORw0KGgo..."
 *
 * @param {string} dataUrl - Full data-URL from canvas.toDataURL()
 * @returns {string} Raw base64 string without the prefix
 */
export function extractBase64Data(dataUrl) {
  if (!dataUrl) return '';

  // If it already looks like raw base64 (no prefix), return as-is
  if (!dataUrl.startsWith('data:')) return dataUrl;

  const parts = dataUrl.split(',');
  return parts.length > 1 ? parts[1] : dataUrl;
}

/**
 * Extract the MIME type from a data-URL string.
 * e.g. "data:image/png;base64,..." → "image/png"
 *
 * @param {string} dataUrl - Full data-URL from canvas.toDataURL()
 * @returns {string} MIME type (defaults to "image/png" if not detected)
 */
export function getMimeType(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith('data:')) return 'image/png';

  const match = dataUrl.match(/^data:([^;]+);/);
  return match ? match[1] : 'image/png';
}
