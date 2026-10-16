import type { ConversationMessage } from "@/lib/messages/messages";
// Direct path, not the lesson-player barrel (docs/decisions/0059).
import { FeedbackContentView } from "@/app/components/lesson-player/blocks/FeedbackContentView";
import { MessageTime } from "./MessageTime";

/**
 * TCH-004 (docs/decisions/0151) — a conversation's messages, oldest first.
 * A Server Component: the only client JS in it is MessageTime. Bodies use the
 * feedback format and are rendered from the stored shape by
 * FeedbackContentView (nothing is parsed here and no HTML is rendered, 0096
 * Decision 3).
 *
 * The reader's own messages sit right in the brand tint, the other party's
 * left in the muted tone (the tokens the feedback box and the cards already
 * use). A message the reader had not read when the page loaded carries a
 * "New" pill; it is read from `read`, which the page captured before it
 * marked the thread read.
 */
export function MessageThread({
  messages,
  locale,
  labels,
}: {
  messages: readonly ConversationMessage[];
  locale: "en-GB" | "ru-RU";
  labels: { you: string; them: string; newMessage: string; unreadable: string };
}) {
  return (
    <ol className="flex flex-col gap-3" data-messages="thread">
      {messages.map((m) => (
        <li key={m.id} className={`flex flex-col gap-1 ${m.mine ? "items-end" : "items-start"}`}>
          <div
            className={`max-w-[85%] min-w-0 break-words rounded-2xl px-4 py-3 text-sm text-foreground ${
              m.mine ? "bg-brand-subtle" : "bg-muted"
            }`}
          >
            {m.content ? (
              <FeedbackContentView content={m.content} />
            ) : (
              <p className="text-muted-foreground">{labels.unreadable}</p>
            )}
          </div>
          <p className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
            <span>{m.mine ? labels.you : labels.them}</span>
            <MessageTime iso={m.createdAt} locale={locale} />
            {!m.read && (
              <span className="inline-flex items-center rounded-full bg-brand px-2 py-0.5 text-[11px] font-medium leading-none text-white">
                {labels.newMessage}
              </span>
            )}
          </p>
        </li>
      ))}
    </ol>
  );
}
