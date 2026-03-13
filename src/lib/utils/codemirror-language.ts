import type { Extension } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { sql } from "@codemirror/lang-sql";

export function getCodeMirrorLanguage(language?: string): Extension {
  const lang = (language || "").toLowerCase();

  if (!lang) return [];

  if (lang === "markdown" || lang === "md" || lang === "mdx") return markdown();
  if (lang === "html" || lang === "htm" || lang === "xml") return html();
  if (lang === "css" || lang === "scss" || lang === "less" || lang === "sass") return css();
  if (lang === "javascript" || lang === "js" || lang === "mjs" || lang === "cjs") return javascript();
  if (lang === "typescript" || lang === "ts") return javascript({ typescript: true });
  if (lang === "jsx") return javascript({ jsx: true });
  if (lang === "tsx") return javascript({ typescript: true, jsx: true });
  if (lang === "json" || lang === "jsonc") return json();
  if (lang === "python" || lang === "py") return python();
  if (lang === "rust" || lang === "rs") return rust();
  if (lang === "sql") return sql();

  return [];
}
