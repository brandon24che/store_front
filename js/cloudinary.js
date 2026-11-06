/* ==========================================================================
   Cloudinary helpers — store only publicIds in Firestore, build URLs on render.
   ========================================================================== */

import { cloudinaryConfig, isCloudinaryConfigured } from "./config.js";

export { isCloudinaryConfigured };

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

export function validateImage(file) {
  if (!ACCEPTED.includes(file.type)) {
    return "Format accepté : JPG, PNG ou WebP.";
  }
  if (file.size > MAX_BYTES) {
    return "Image trop lourde (5 Mo maximum).";
  }
  return null;
}

/**
 * Optimised delivery URL.
 * cldUrl(publicId, { w: 600 }) → …/f_auto,q_auto,w_600,c_fill/publicId
 */
export function cldUrl(publicId, { w, h, crop = "fill", q = "auto", f = "auto", blur } = {}) {
  if (!isCloudinaryConfigured || !publicId) return null;
  const parts = [`f_${f}`, `q_${q}`];
  if (w) parts.push(`w_${w}`);
  if (h) parts.push(`h_${h}`);
  if (w || h) parts.push(`c_${crop}`);
  if (blur) parts.push(`e_blur:${blur}`);
  return `https://res.cloudinary.com/${cloudinaryConfig.cloudName}/image/upload/${parts.join(",")}/${publicId}`;
}

/** Responsive srcset string, e.g. "url 320w, url 480w, …" */
export function cldSrcset(publicId, widths = [320, 480, 640, 960, 1280]) {
  if (!isCloudinaryConfigured || !publicId) return "";
  return widths
    .map((w) => `${cldUrl(publicId, { w })} ${w}w`)
    .join(", ");
}

/** Tiny blurred placeholder shown while the real image loads. */
export function cldPlaceholder(publicId) {
  return cldUrl(publicId, { w: 20, blur: 200 });
}

/**
 * Unsigned upload straight from the admin form.
 * Returns { publicId, secureUrl, width, height }.
 */
export function uploadImage(file, { folder = cloudinaryConfig.folder, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    if (!isCloudinaryConfigured) {
      reject(new Error("Cloudinary n'est pas configuré (js/config.js)."));
      return;
    }
    const problem = validateImage(file);
    if (problem) {
      reject(new Error(problem));
      return;
    }

    const form = new FormData();
    form.append("file", file);
    form.append("upload_preset", cloudinaryConfig.uploadPreset);
    form.append("folder", folder);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/image/upload`);
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });
    xhr.addEventListener("load", () => {
      try {
        const body = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({
            publicId: body.public_id,
            secureUrl: body.secure_url,
            width: body.width,
            height: body.height,
          });
        } else {
          reject(new Error(body.error?.message || "Échec de l'envoi."));
        }
      } catch (error) {
        reject(error);
      }
    });
    xhr.addEventListener("error", () => reject(new Error("Réseau indisponible.")));
    xhr.send(form);
  });
}
