/** The cap on a message's text, mirroring 079's `_message_body_valid`. The
 * database decides; this is for the composer's counter and the route's 400.
 * Its own module so a Client Component can import it without pulling in
 * messages.ts, which reads attachments (lib/askTeacher, TCH-006) and with
 * them the item registry. */
export const MESSAGE_MAX_CHARS = 2000;
