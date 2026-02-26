export type ViewerType =
  | "markdown"
  | "html"
  | "image"
  | "video"
  | "pdf"
  | "code"
  | "text"
  | "unsupported";

const MARKDOWN_EXTS = new Set(["md", "markdown", "mdx"]);
const HTML_EXTS = new Set(["html", "htm"]);
const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp"]);
const VIDEO_EXTS = new Set(["mp4", "webm", "mov", "avi", "mkv"]);
const PDF_EXTS = new Set(["pdf"]);
const CODE_EXTS = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs",
  "py", "rs", "go", "rb", "java", "kt", "swift", "c", "cpp", "h", "hpp",
  "sql", "graphql", "gql",
  "css", "scss", "less", "sass",
  "json", "jsonc", "yaml", "yml", "toml", "xml",
  "sh", "bash", "zsh", "fish", "ps1", "psm1", "bat", "cmd",
  "dockerfile", "makefile",
  "svelte", "vue", "astro",
  "env", "gitignore", "gitattributes", "editorconfig",
  "lock",
]);
const TEXT_EXTS = new Set(["txt", "log", "csv", "tsv", "ini", "cfg", "conf", "properties"]);

export function getViewerType(ext?: string): ViewerType {
  if (!ext) return "text";
  const lower = ext.toLowerCase();
  if (MARKDOWN_EXTS.has(lower)) return "markdown";
  if (HTML_EXTS.has(lower)) return "html";
  if (IMAGE_EXTS.has(lower)) return "image";
  if (VIDEO_EXTS.has(lower)) return "video";
  if (PDF_EXTS.has(lower)) return "pdf";
  if (CODE_EXTS.has(lower)) return "code";
  if (TEXT_EXTS.has(lower)) return "text";
  return "unsupported";
}

export function getLanguageFromExt(ext?: string): string {
  if (!ext) return "text";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    mjs: "javascript",
    cjs: "javascript",
    py: "python",
    rs: "rust",
    go: "go",
    rb: "ruby",
    java: "java",
    kt: "kotlin",
    swift: "swift",
    c: "c",
    cpp: "cpp",
    h: "c",
    hpp: "cpp",
    sql: "sql",
    css: "css",
    scss: "scss",
    less: "less",
    json: "json",
    jsonc: "jsonc",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    xml: "xml",
    html: "html",
    htm: "html",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    ps1: "powershell",
    bat: "batch",
    md: "markdown",
    svelte: "svelte",
    vue: "vue",
    graphql: "graphql",
    gql: "graphql",
  };
  return map[ext.toLowerCase()] || "text";
}

export function getFileIcon(name: string, isDir: boolean, ext?: string): string {
  if (isDir) {
    const lower = name.toLowerCase();
    if (lower === "src") return "folder-code";
    if (lower === "docs" || lower === "doc") return "folder-open";
    if (lower === "tests" || lower === "test" || lower === "__tests__") return "folder-check";
    if (lower === "assets" || lower === "images" || lower === "img") return "folder-image";
    if (lower === "scripts") return "folder-cog";
    if (lower === "archive") return "folder-archive";
    return "folder";
  }
  if (!ext) return "file";
  const lower = ext.toLowerCase();
  if (MARKDOWN_EXTS.has(lower)) return "file-text";
  if (HTML_EXTS.has(lower)) return "file-code";
  if (IMAGE_EXTS.has(lower)) return "image";
  if (VIDEO_EXTS.has(lower)) return "film";
  if (PDF_EXTS.has(lower)) return "file-text";
  if (["ts", "tsx", "js", "jsx"].includes(lower)) return "file-code-2";
  if (["py"].includes(lower)) return "file-code";
  if (["rs"].includes(lower)) return "file-cog";
  if (["json", "yaml", "yml", "toml"].includes(lower)) return "file-json";
  if (["css", "scss", "less"].includes(lower)) return "file-code";
  if (["sql"].includes(lower)) return "database";
  if (CODE_EXTS.has(lower)) return "file-code";
  return "file";
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
