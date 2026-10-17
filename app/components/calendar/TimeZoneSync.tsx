import { TZ_COOKIE } from "@/lib/calendar/calendar";

// COH-015 (docs/decisions/0159 Decision 2) — how the server learns the
// viewer's time zone. A server-rendered month grid has to know the zone before
// it renders, and the browser only reveals it to JavaScript. This is an inline
// script, not a client component: it ships no bundle bytes, and a Server
// Component can render it. It writes a cookie and reloads the page ONCE, only
// when the cookie was missing or different and the write actually stuck, so a
// browser that blocks cookies can't loop. Without JS the server falls back to
// UTC and the page says so.
const SCRIPT = `(function(){try{var z=Intl.DateTimeFormat().resolvedOptions().timeZone;if(!z)return;var n=${JSON.stringify(TZ_COOKIE)};var m=document.cookie.match(new RegExp("(?:^|; )"+n+"=([^;]*)"));var c=m?decodeURIComponent(m[1]):"";if(c===z)return;document.cookie=n+"="+encodeURIComponent(z)+"; path=/; max-age=31536000; samesite=lax";if(document.cookie.indexOf(n+"="+encodeURIComponent(z))>-1)location.reload()}catch(e){}})()`;

export function TimeZoneSync() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
