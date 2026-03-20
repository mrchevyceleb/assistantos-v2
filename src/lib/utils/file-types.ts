export type ViewerType =
  | "markdown"
  | "html"
  | "image"
  | "video"
  | "pdf"
  | "csv"
  | "code"
  | "text"
  | "terminal"
  | "chat"
  | "claude-code"
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
const CSV_EXTS = new Set(["csv", "tsv"]);
const TEXT_EXTS = new Set(["txt", "log", "ini", "cfg", "conf", "properties"]);

export function getViewerType(ext?: string): ViewerType {
  if (!ext) return "text";
  const lower = ext.toLowerCase();
  if (MARKDOWN_EXTS.has(lower)) return "markdown";
  if (HTML_EXTS.has(lower)) return "html";
  if (IMAGE_EXTS.has(lower)) return "image";
  if (VIDEO_EXTS.has(lower)) return "video";
  if (PDF_EXTS.has(lower)) return "pdf";
  if (CODE_EXTS.has(lower)) return "code";
  if (CSV_EXTS.has(lower)) return "csv";
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
  if (CSV_EXTS.has(lower)) return "table";
  if (CODE_EXTS.has(lower)) return "file-code";
  return "file";
}

export function getFileColor(name: string, isDir: boolean, ext?: string): string {
  if (isDir) {
    const lower = name.toLowerCase();
    if (["src", "app", "lib"].includes(lower)) return "#7dd3fc";
    if (["docs", "doc"].includes(lower)) return "#facc15";
    if (["tests", "test", "__tests__"].includes(lower)) return "#a78bfa";
    if (["assets", "images", "img", "public"].includes(lower)) return "#34d399";
    return "#58b4d0";
  }

  if (!ext) return "var(--color-text-muted)";

  const lower = ext.toLowerCase();
  const map: Record<string, string> = {
    md: "#7dd3fc",
    markdown: "#7dd3fc",
    ts: "#60a5fa",
    tsx: "#60a5fa",
    js: "#facc15",
    jsx: "#facc15",
    py: "#93c5fd",
    rs: "#fdba74",
    html: "#fb7185",
    htm: "#fb7185",
    css: "#818cf8",
    scss: "#f472b6",
    less: "#818cf8",
    json: "#86efac",
    yaml: "#86efac",
    yml: "#86efac",
    toml: "#86efac",
    sql: "#f0abfc",
    svelte: "#fb923c",
    vue: "#4ade80",
    png: "#34d399",
    jpg: "#34d399",
    jpeg: "#34d399",
    gif: "#34d399",
    svg: "#facc15",
    webp: "#34d399",
    pdf: "#f87171",
    csv: "#4ade80",
    tsv: "#4ade80",
    sh: "#86efac",
    ps1: "#38bdf8",
    bat: "#38bdf8",
  };
  return map[lower] || "var(--color-text-muted)";
}

export function getMimeType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const mimeMap: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    webp: 'image/webp',
    ico: 'image/x-icon',
    bmp: 'image/bmp',
    pdf: 'application/pdf',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    avi: 'video/x-msvideo',
    mkv: 'video/x-matroska',
  };
  return mimeMap[ext] || 'application/octet-stream';
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
