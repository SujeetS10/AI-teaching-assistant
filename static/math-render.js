// Shared Markdown + LaTeX renderer, used by BOTH the student page (app.js)
// and the admin dashboard (admin.js).
//
// Exposes one function:  window.renderRichText(text)  ->  safe HTML string
//
// Pipeline:
//   1. Pull every math expression OUT of the raw text (before Markdown sees it)
//   2. Run Markdown (marked) on the remaining text
//   3. Put each math expression back, rendered by KaTeX
//   4. Sanitize the final HTML with DOMPurify

(function () {
  // Extract math in this order (order matters):
  //   $$ ... $$   display   (may span many lines)
  //   \[ ... \]   display   (may span many lines)
  //   \( ... \)   inline
  //   $ ... $     inline    (may span lines, but never crosses a blank line)
  //
  // (?<!\\) means "not preceded by a backslash". This is what protects the
  // LaTeX row separator "\\[4pt]" - its "\[" is NOT the start of a \[ ... \]
  // math block, it is the end of a matrix row followed by a spacing option.
  function extractMath(text) {
    const blocks = [];

    function stash(display, latex) {
      const token = `@@MATHBLOCK${blocks.length}@@`;
      blocks.push({ display, latex: latex.trim() });
      return token;
    }

    let out = text;

    out = out.replace(/(?<!\\)\$\$([\s\S]+?)(?<!\\)\$\$/g, (_, e) => stash(true, e));
    out = out.replace(/(?<!\\)\\\[([\s\S]+?)(?<!\\)\\\]/g, (_, e) => stash(true, e));
    out = out.replace(/(?<!\\)\\\(([\s\S]+?)(?<!\\)\\\)/g, (_, e) => stash(false, e));

    // Inline $...$ : body is "any char except $ and \" or "a backslash
    // followed by any char" (so \$ and \\ inside math are handled).
    out = out.replace(
      /(?<![\\$])\$(?!\$)((?:[^$\\]|\\[\s\S])+?)\$/g,
      (match, e) => {
        // Never let one stray "$" swallow text across a blank line.
        if (/\n\s*\n/.test(e)) return match;
        return stash(false, e);
      }
    );

    return { text: out, blocks };
  }

  function reinsertMath(html, blocks) {
    return html.replace(/@@MATHBLOCK(\d+)@@/g, (match, i) => {
      const block = blocks[Number(i)];
      if (!block) return match;
      try {
        return katex.renderToString(block.latex, {
          throwOnError: false,   // bad LaTeX shows in red instead of crashing
          strict: "ignore",      // don't warn on harmless things like unicode
          displayMode: block.display,
          output: "html",
        });
      } catch (err) {
        const safe = block.latex
          .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        return `<code>${safe}</code>`;
      }
    });
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  const renderRichText = function (text) {
    if (!(window.marked && window.katex && window.DOMPurify)) {
      console.warn("[math-render] marked/katex/DOMPurify not loaded - plain text shown.");
      return `<p>${escapeHtml(text)}</p>`;
    }
    const { text: protectedText, blocks } = extractMath(text);
    let html = marked.parse(protectedText);
    html = reinsertMath(html, blocks);
    return DOMPurify.sanitize(html, {
      ADD_TAGS: ["svg", "path", "line", "rect"],
      ADD_ATTR: ["style", "viewBox", "preserveAspectRatio", "d", "fill", "stroke", "width", "height", "xmlns"],
    });
  };

  if (typeof window !== "undefined") window.renderRichText = renderRichText;
  // Exposed only so it can be unit-tested in Node.
  if (typeof module !== "undefined") module.exports = { extractMath };
})();
