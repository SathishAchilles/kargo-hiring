// Kept apart from validate.ts so client components can import it without pulling in the
// server-only PDF and DOCX parsers.
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
