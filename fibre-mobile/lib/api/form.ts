import { File as ExpoFile } from 'expo-file-system';

// ── Multipart file parts ──────────────────────────────────────────────────
//
// Expo 57 installs its own `fetch`, which builds the multipart body in
// JavaScript and accepts only a string, a Blob, or an object with `bytes()`.
// React Native's `{ uri, name, type }` object — still advertised by Expo's own
// FormData types — throws "Unsupported FormDataPart implementation" when the
// request is sent, so every upload goes through a File instead.

export interface PhotoPartSource {
  uri: string;
  name: string;
  type: string;
}

/**
 * A FormData part carrying the file at `photo.uri`.
 *
 * The picker's own filename and MIME type travel with the bytes; a bare `File`
 * would fall back to the temporary name it was given on disk.
 */
export function photoFormPart(photo: PhotoPartSource): Blob {
  const file = new ExpoFile(photo.uri);
  return {
    name: photo.name,
    type: photo.type,
    bytes: () => file.bytes(),
  } as unknown as Blob;
}
