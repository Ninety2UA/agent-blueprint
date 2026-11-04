// The Telegram reply formatter (ruling 60): the model's markdown as Telegram's HTML subset, split
// under the message cap, and the plain fallback when Telegram refuses the formatting.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { sendFormatted, telegramHtml, telegramParts } from "../agent/lib/telegram-format.ts";

describe("telegramHtml", () => {
  test("bold, italic and strikethrough", () => {
    assert.equal(telegramHtml("**Done** and __also__ done"), "<b>Done</b> and <b>also</b> done");
    assert.equal(telegramHtml("an *italic* and _another_ one, ~~gone~~"), "an <i>italic</i> and <i>another</i> one, <s>gone</s>");
    assert.equal(telegramHtml("snake_case_name and 2 * 3 * 4"), "snake_case_name and 2 * 3 * 4", "no emphasis inside words or around spaced stars");
  });

  test("inline code keeps its text as typed, escaped", () => {
    assert.equal(telegramHtml("run `npm test -- --grep **x**` now"), "run <code>npm test -- --grep **x**</code> now");
    assert.equal(telegramHtml("`a < b && c > d`"), "<code>a &lt; b &amp;&amp; c &gt; d</code>");
  });

  test("a fenced block becomes pre, with its language when it names one", () => {
    assert.equal(telegramHtml("Output:\n```\n**not bold** <tag>\n```\nend"), "Output:\n<pre>**not bold** &lt;tag&gt;</pre>\nend");
    assert.equal(telegramHtml("```ts\nconst a = 1 < 2;\n```"), '<pre><code class="language-ts">const a = 1 &lt; 2;</code></pre>');
  });

  test("links, headings and bullets", () => {
    assert.equal(
      telegramHtml("See [pull request #2](https://github.com/acme/widgets/pull/2?a=1&b=_x_)."),
      'See <a href="https://github.com/acme/widgets/pull/2?a=1&amp;b=_x_">pull request #2</a>.',
    );
    assert.equal(telegramHtml("[click](javascript:alert(1))"), "[click](javascript:alert(1))", "only web and mail links become links");
    assert.equal(telegramHtml("## Done\n- one\n* two"), "<b>Done</b>\n• one\n• two");
  });

  test("a literal <, > or & in prose is escaped", () => {
    assert.equal(telegramHtml("if a < b & b > c then <script>"), "if a &lt; b &amp; b &gt; c then &lt;script&gt;");
  });
});

describe("telegramParts", () => {
  test("a short reply is one part", () => {
    assert.deepEqual(telegramParts("**hi**"), [{ markdown: "**hi**", html: "<b>hi</b>" }]);
  });

  test("a long reply splits at blank lines, each part under the cap, a fence kept whole", () => {
    const paragraph = "word ".repeat(150).trim();
    const fence = "```\nline one\n\nline two\n```";
    const parts = telegramParts([paragraph, paragraph, fence, paragraph].join("\n\n"), 1_000);
    assert.ok(parts.length >= 3, JSON.stringify(parts.map((part) => part.markdown.length)));
    for (const part of parts) assert.ok(part.html !== null && part.html.length <= 1_000);
    assert.ok(parts.some((part) => part.markdown.includes(fence)), "the fenced block stays in one part");
  });

  test("a single block over the cap goes plain, for Eve to split", () => {
    const parts = telegramParts(`short\n\n${"x".repeat(200)}`, 100);
    assert.deepEqual(parts.map((part) => part.html), ["short", null]);
  });
});

describe("sendFormatted", () => {
  test("sends HTML with parse_mode; a 400 sends the same part again as plain markdown", async () => {
    const sent: unknown[] = [];
    await sendFormatted(async (message) => void sent.push(message), "**Done**");
    assert.deepEqual(sent, [{ text: "<b>Done</b>", parse_mode: "HTML" }]);

    const retried: unknown[] = [];
    await sendFormatted(async (message) => {
      retried.push(message);
      if (typeof message !== "string") throw new Error("Telegram sendMessage failed with HTTP 400: Bad Request: can't parse entities");
    }, "**Done**");
    assert.deepEqual(retried, [{ text: "<b>Done</b>", parse_mode: "HTML" }, "**Done**"]);
  });

  test("any other failure is thrown, not retried", async () => {
    const sent: unknown[] = [];
    await assert.rejects(
      sendFormatted(async (message) => {
        sent.push(message);
        throw new Error("Telegram sendMessage failed with HTTP 429: Too Many Requests");
      }, "**Done**"),
      /HTTP 429/,
    );
    assert.equal(sent.length, 1);
  });
});
