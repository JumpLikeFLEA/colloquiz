/**
 * The request header proxy.ts sets to the request's pathname, for Server
 * Components that need the path and get none of their own: the English root
 * layout reads it for `<html lang>` (SHELL-018, docs/decisions/0091).
 *
 * proxy.ts always overwrites it, so a client-sent value never reaches a
 * reader on a proxied route. Treat it as untrusted anyway: the layout passes
 * it through `pageLangForPath`, which only ever returns "ru" or "en".
 */
export const PATHNAME_HEADER = "x-colloquiz-pathname";
