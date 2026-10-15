import {
  createWikiImageUpload,
  finalizeWikiImageUpload,
} from "@/fetchers/wiki";
import {
  getImageAltText,
  isSupportedImageFile,
  isSupportedTaskAsset,
} from "@/lib/upload-task-image";

/**
 * Sube un fichero a una pagina de la wiki (ADR 092) y da lo que el editor
 * inserta, con la misma forma que `uploadTaskImage`.
 */
export async function uploadWikiImage({
  pageId,
  file,
}: {
  pageId: string;
  file: File;
}) {
  if (!isSupportedImageFile(file) && !isSupportedTaskAsset(file)) {
    throw new Error("Only non-empty file uploads are supported.");
  }

  const contentType = file.type || "application/octet-stream";
  const filename = file.name || "file";
  const upload = await createWikiImageUpload(pageId, {
    filename,
    contentType,
    size: file.size,
  });

  const response = await fetch(upload.uploadUrl, {
    method: "PUT",
    headers: upload.headers,
    body: file,
  });
  if (!response.ok) {
    throw new Error("Failed to upload file to storage.");
  }

  const asset = await finalizeWikiImageUpload(pageId, {
    key: upload.key,
    filename,
    contentType,
    size: file.size,
  });

  return {
    url: asset.url,
    alt: getImageAltText(filename),
    filename,
    kind: isSupportedImageFile(file)
      ? ("image" as const)
      : ("attachment" as const),
    mimeType: contentType,
    size: file.size,
  };
}
