/** The fragment id of a practice block's card, so the completion review can
 * link back to it (PLAY-016). Block ids are authored slugs; prefixed so they
 * can't collide with other ids on the page. */
export function exerciseAnchorId(blockId: string): string {
  return `exercise-${blockId}`;
}

/** The fragment id of a voice task's card (VOICE-018): the sign-in link returns the learner to it. */
export function voiceAnchorId(blockId: string): string {
  return `voice-${blockId}`;
}
