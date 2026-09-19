// A phone photo is 3-8 MB and often HEIC; Textract takes JPEG/PNG up to 10 MB. Shrink it in the
// browser (long edge 2000 px, JPEG 0.85, EXIF rotation applied) so the upload is ~0.5 MB.

export class PhotoError extends Error {}

export async function photoToJpeg(file: File, maxEdge = 2000, quality = 0.85): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new PhotoError(
      "This browser can't read that photo format (HEIC?). Take the photo with the camera option, or use a JPEG or PNG.",
    );
  }
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new PhotoError("Could not prepare the photo for upload.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new PhotoError("Could not encode the photo."))), "image/jpeg", quality),
  );
}
