import sharp from 'sharp';
import {ACCEPTED_IMAGE_TYPES_REGEX, LOGO_SIZE, MAX_IMAGE_UPLOAD_SIZE} from './constants';

/**
 * Processes and resizes an image for use as a workspace logo.
 *
 * - Accepts base64 data URL (data:image/png;base64,... or similar)
 * - Resizes to 128x128 pixels (fit: contain, preserving aspect ratio)
 * - Converts to PNG for consistency
 * - Returns as base64 data URL
 *
 * @param dataUrl - Base64 data URL of the image
 * @returns Processed base64 data URL (PNG, 128x128)
 * @throws Error if the data URL is invalid or image processing fails
 */
export async function processLogoImage(dataUrl: string): Promise<string> {
  // Validate and parse data URL
  const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/i);
  if (!match) {
    throw new Error('Invalid image format. Please upload a PNG, JPEG, WebP, or GIF image.');
  }

  const base64Data = match[2];
  const inputBuffer = Buffer.from(base64Data, 'base64');

  // Validate size before processing
  if (inputBuffer.length > MAX_IMAGE_UPLOAD_SIZE) {
    throw new Error('Image is too large. Maximum size is 2MB.');
  }

  // Process with sharp: resize and convert to PNG
  const outputBuffer = await sharp(inputBuffer)
    .resize(LOGO_SIZE, LOGO_SIZE, {
      fit: 'contain',
      background: {r: 0, g: 0, b: 0, alpha: 0}, // Transparent background
    })
    .png()
    .toBuffer();

  // Convert back to data URL
  const outputBase64 = outputBuffer.toString('base64');
  return `data:image/png;base64,${outputBase64}`;
}

/**
 * Validates that a string is a valid base64 data URL for an image.
 *
 * @param dataUrl - String to validate
 * @returns true if valid image data URL
 */
export function isValidImageDataUrl(dataUrl: string): boolean {
  return ACCEPTED_IMAGE_TYPES_REGEX.test(dataUrl);
}
