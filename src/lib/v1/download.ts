/** Header-safe download name (RFC 6266 `filename*`), no path or control characters. */
export const downloadName = (name: string) => encodeURIComponent(name.replace(/[\\/\x00-\x1f\x7f"]/g, "_").slice(0, 200) || "attachment");
