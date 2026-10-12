/** The fragment id of a practice block's card, so the completion review can
 * link back to it (PLAY-016). Block ids are authored slugs; prefixed so they
 * can't collide with other ids on the page. */
export function exerciseAnchorId(blockId: string): string {
  return `exercise-${blockId}`;
}
