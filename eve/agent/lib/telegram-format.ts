// The agent's replies on Telegram (ruling 60). Eve 0.86.0's Telegram channel posts a reply as plain
// text: its sendMessage forwards the body's fields but sets no parse_mode and has no formatting
// hook, so the live run showed **Done**, backticks and ``` fences raw. This module turns the
// model's markdown into Telegram's HTML subset (b, i, s, code, pre, a) with <, > and & escaped,
// and splits a long reply so no part goes over Telegram's 4096-character cap: Eve splits a longer
// text itself and drops parse_mode from every part after the first. A part Telegram refuses to
// parse is sent again as the plain markdown. No Eve import, so the tests drive it directly.

export const TELEGRAM_TEXT_MAX = 4096;

const escape = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const escapeAttribute = (text: string) => escape(text).replaceAll('"', "&quot;");

/** Bold, italic and strikethrough in one line of already escaped text. */
function emphasis(text: string): string {
  return text
    .replace(/\*\*(?=\S)([^*\n]*?\S)\*\*/g, "<b>$1</b>")
    .replace(/(^|[^\w])__(?=\S)([^_\n]*?\S)__(?!\w)/g, "$1<b>$2</b>")
    .replace(/~~(?=\S)([^~\n]*?\S)~~/g, "<s>$1</s>")
    .replace(/(^|[^\w*])\*(?=[^\s*])([^*\n]*?[^\s*])\*(?![\w*])/g, "$1<i>$2</i>")
    .replace(/(^|[^\w])_(?=[^\s_])([^_\n]*?[^\s_])_(?!\w)/g, "$1<i>$2</i>");
}

/** Markdown to Telegram HTML: fenced blocks as pre, inline code, emphasis, links, headings in bold, bullets. */
export function telegramHtml(markdown: string): string {
  const held: string[] = [];
  const hold = (html: string) => `\u0000${held.push(html) - 1}\u0000`;
  const line = (text: string) =>
    emphasis(
      escape(text).replace(/\[([^\]\n]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)/g, (_match, label: string, url: string) =>
        hold(`<a href="${escapeAttribute(url.replaceAll("&amp;", "&"))}">${emphasis(label)}</a>`),
      ),
    );
  const text = markdown
    .replaceAll("\u0000", "")
    .replace(/^ {0,3}```([\w+-]*)[^\n]*\n([\s\S]*?)^ {0,3}```[ \t]*$/gm, (_match, language: string, code: string) =>
      hold(language ? `<pre><code class="language-${language}">${escape(code.replace(/\n$/, ""))}</code></pre>` : `<pre>${escape(code.replace(/\n$/, ""))}</pre>`),
    )
    .replace(/`([^`\n]+)`/g, (_match, code: string) => hold(`<code>${escape(code)}</code>`));
  let html = text
    .split("\n")
    .map((row) => {
      const heading = /^ {0,3}#{1,6}\s+(.*?)\s*#*\s*$/.exec(row);
      if (heading) return `<b>${line(heading[1])}</b>`;
      const bullet = /^(\s*)[-*+]\s+(.*)$/.exec(row);
      if (bullet) return `${bullet[1]}• ${line(bullet[2])}`;
      return line(row);
    })
    .join("\n");
  // A link label can hold inline code, so a restored part can hold another placeholder.
  while (/\u0000\d+\u0000/.test(html)) html = html.replace(/\u0000(\d+)\u0000/g, (_match, index: string) => held[Number(index)]);
  return html;
}

/** Splits markdown into blocks at blank lines, keeping each fenced code block whole. */
function blocks(markdown: string): string[] {
  const out: string[] = [];
  let current: string[] = [];
  let fenced = false;
  for (const line of markdown.split("\n")) {
    if (/^ {0,3}```/.test(line)) fenced = !fenced;
    if (!fenced && !line.trim() && current.length) {
      out.push(current.join("\n"));
      current = [];
      continue;
    }
    if (line.trim() || current.length) current.push(line);
  }
  if (current.length) out.push(current.join("\n"));
  return out;
}

export interface TelegramPart {
  /** The markdown this part came from: what is sent when Telegram refuses the HTML. */
  readonly markdown: string;
  /** The HTML to send with parse_mode HTML, or null when even one block's HTML is over the cap. */
  readonly html: string | null;
}

/** The reply as parts whose HTML each fits one Telegram message; a block too long alone goes plain. */
export function telegramParts(markdown: string, max = TELEGRAM_TEXT_MAX): TelegramPart[] {
  const whole = telegramHtml(markdown);
  if (whole.length <= max) return [{ markdown, html: whole }];
  const parts: TelegramPart[] = [];
  let pending: string[] = [];
  const flush = () => {
    if (!pending.length) return;
    const text = pending.join("\n\n");
    parts.push({ markdown: text, html: telegramHtml(text) });
    pending = [];
  };
  for (const block of blocks(markdown)) {
    if (telegramHtml(block).length > max) {
      flush();
      parts.push({ markdown: block, html: null });
      continue;
    }
    if (telegramHtml([...pending, block].join("\n\n")).length > max) flush();
    pending.push(block);
  }
  flush();
  return parts;
}

/** What the channel needs to send: Eve's telegram.sendMessage, which takes a string or a body. */
export type TelegramSend = (message: string | { readonly text: string; readonly parse_mode?: string }) => Promise<unknown>;

/** Telegram's answer when it cannot parse the formatting, as Eve's sendMessage reports it. */
const PARSE_ERROR = /HTTP 400\b/;

/**
 * Sends a reply formatted, part by part. A part Telegram refuses with a 400 goes again as its plain
 * markdown, so a reply is never lost to a formatting mistake; any other failure is thrown.
 */
export async function sendFormatted(send: TelegramSend, markdown: string): Promise<void> {
  for (const part of telegramParts(markdown)) {
    if (part.html === null) {
      await send(part.markdown);
      continue;
    }
    try {
      await send({ text: part.html, parse_mode: "HTML" });
    } catch (error) {
      if (!PARSE_ERROR.test(error instanceof Error ? error.message : String(error))) throw error;
      console.warn("[telegram] formatted reply refused, sent as plain text", error);
      await send(part.markdown);
    }
  }
}
