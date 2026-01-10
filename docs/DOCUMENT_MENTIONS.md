# Document Mentions Guide

Document mentions (`@filename`) allow you to reference and include workspace files in your chat messages with Claude. The referenced file content is automatically injected into the message context, enabling Claude to analyze, understand, and work with specific files without manual copy-paste.

## Quick Start

### Basic Syntax
Type `@` followed by a filename or path:

```
@README.md
@src/config.ts
@docs/architecture.md
@package.json
```

### Autocomplete
As you type, AssistantOS shows suggestions:
- **Integrations** (cyan with 🔌 icon) - MCP services like @gmail, @research
- **Documents** (violet with 📄 or 📁 icon) - Files and folders in your workspace

Press **Tab** or **Enter** to select a suggestion, **Escape** to close.

### What Happens
1. You mention a file: `"@README.md explain the project"`
2. Claude receives:
   - Your message text
   - Full content of README.md wrapped in `<referenced_documents>` XML tags
3. Claude can reference and analyze that content in their response

## How It Works

### File Search
When you start typing `@`, AssistantOS searches your workspace:
- **Max Results**: 20 files per search
- **Max Depth**: 4 directory levels deep
- **Case-Insensitive**: Search is case-insensitive for convenience
- **Excluded Directories**: Automatically skips:
  - `.git`, `node_modules`, `.obsidian`, `.vscode`
  - `dist`, `build`, `coverage`, `__pycache__`, `.next`, `.cache`

These are excluded to keep results relevant and avoid clutter from build outputs and dependencies.

### Result Ranking
Files are sorted to show the most relevant first:
1. **Exact name matches** (name matches search term exactly)
2. **Path length** (shorter paths shown before longer paths)

Example: searching `@config` would show `src/config.ts` before `src/utils/config-parser.ts`.

### Content Injection
Referenced file contents are:
- Automatically read from disk
- Wrapped in `<referenced_documents>` tags with file path
- Included in the message sent to Claude
- Limited to files under your workspace path (security boundary)

## Usage Patterns

### Single Document Reference
Analyze a specific file:
```
@package.json what are all the dependencies?
Review @src/main.ts for performance issues
```

### Multiple Document References
Compare or analyze several files:
```
@src/config.ts explain how this differs from @src/defaults.ts
Why is @utils/helpers.ts so large? Can we refactor it like @utils/handlers.ts?
```

### Path-Based References
Use relative paths for deeper nesting:
```
@docs/architecture/system-design.md
@src/components/chat/AgentChat.tsx
@config/webpack.config.js
```

### Directory References
Reference entire folders (content listing):
```
What's in @src/services?
Show me @docs
```

## Advanced Features

### Nested File Discovery
Mentions support paths with slashes:
```
@src/components/chat/AgentChat.tsx      # Deep nesting
@docs/api/endpoints.md                   # Nested in subdirectories
```

### File Extension Support
Include file extensions in your mention:
```
@config.ts      # TypeScript file
@styles.css     # CSS file
@README.md      # Markdown file
```

### Workspace Boundary
- Only files within your selected workspace are accessible
- Path traversal (`../../../etc/passwd`) is blocked
- Select workspace via File panel: click folder icon to choose directory

## Technical Details

### Mention Parser (`src/services/mentions/parser.ts`)
The parser handles mention detection and autocomplete:

**Key Functions**:
- `parseMessage()` - Extract mentions from input text
- `getFileMentionSuggestions()` - Find matching files in workspace
- `getUnifiedSuggestions()` - Combined autocomplete (integrations + documents)
- `getPartialMention()` - Detect incomplete mention at cursor
- `completeMention()` - Insert full mention and trailing space

**Regex Patterns**:
- `MENTION_WITH_PATHS_REGEX` = `/@[\w\-./]+/g` - Matches paths with slashes/dots
- `MENTION_SIMPLE_REGEX` = `/@[\w-]+/g` - Matches simple words (integrations)

### File Search Handler (`electron/main.ts`)
The backend implements workspace file discovery:

**Handler**: `fs:searchFiles(workspacePath, searchTerm)`

**Implementation**:
- `searchDirectoryRecursively()` - Recursive traversal with depth limit
- `sortSearchResults()` - Exact matches first, then by path length
- Filters: Excludes hidden dirs (`.`), excluded dirs (node_modules, etc.)
- Error handling: Gracefully handles permission errors

**Configuration Constants**:
```typescript
const FILE_SEARCH_MAX_RESULTS = 20      // Max 20 results per search
const FILE_SEARCH_MAX_DEPTH = 4         // Max 4 directory levels
const EXCLUDED_DIRECTORIES = new Set([
  '.git', 'node_modules', '.obsidian', '.vscode',
  'dist', 'build', 'coverage', '__pycache__', '.next', '.cache'
])
```

### Chat Integration (`src/components/AgentChat.tsx`)
Document mentions are integrated into the chat flow:

1. **Parsing**: User message parsed for mentions (via `parseMessage()`)
2. **File Reading**: Content of mentioned files read from workspace
3. **Formatting**: Content wrapped in `<referenced_documents>` XML:
   ```xml
   <referenced_documents>
   <document path="path/to/file.ts">
   [file contents here]
   </document>
   </referenced_documents>
   ```
4. **Context**: Appended to user message before sending to Claude
5. **Display**: Document content shown in message UI (when expanded)

### TypeScript Types
```typescript
// Document mention from parser
interface DocumentMention {
  mention: string              // e.g. "@src/config.ts"
  name: string                 // e.g. "config.ts"
  path: string                 // Full absolute path
  relativePath: string         // Relative to workspace
  isDirectory: boolean         // Directory vs file
}

// Autocomplete suggestion for documents
interface FileMentionSuggestion {
  mention: string              // For insertion: "@src/config.ts"
  name: string                 // Display: "config.ts"
  path: string                 // Full path
  relativePath: string         // Relative path
  isDirectory: boolean         // Directory type
  description: string          // Display description
  type: 'document'             // Suggestion type
}

// Combined suggestion (integration or document)
type UnifiedSuggestion = MentionSuggestion | FileMentionSuggestion
```

## Limitations & Constraints

### File Size
- Large files may slow down context processing
- Claude's context window limits total input size
- For large files, consider referencing specific sections or using grep-like patterns

### Character Limits
- Document paths limited to reasonable length (same as filesystem limits)
- Filenames with special characters may need escaping

### Workspace Boundary
- Cannot access parent directories (`..` traversal blocked)
- Cannot access system files outside workspace
- Security-first: only files in selected workspace directory

### Search Limits
- Max 20 results per search (prevents overwhelming autocomplete)
- Max 4 directory levels deep (avoids deep node_modules scanning)
- Excluded common build/dependency directories

## Troubleshooting

### Files Not Appearing in Autocomplete
**Symptoms**: Can't find a file when typing `@`

**Solutions**:
1. Verify workspace is set (click folder icon in File panel)
2. Check file is in workspace directory (not parent or external path)
3. Try typing more of the filename: `@src/config` not just `@con`
4. Ensure file isn't in excluded directories (node_modules, .git, etc.)

### File Content Not Included
**Symptoms**: Mention autocompletes but Claude doesn't see file content

**Solutions**:
1. Verify file is readable (check file permissions)
2. Try closing and reopening the file in the editor
3. Look for errors in browser console (F12 DevTools)
4. Ensure workspace path is still valid (hasn't moved/deleted)

### Autocomplete Showing Wrong Files
**Symptoms**: Suggestions don't match what you typed

**Solutions**:
1. Check spelling of filename
2. Clear browser cache (localStorage): Settings → Clear Cache
3. Try fully qualified path: `@src/components/chat/AgentChat.tsx`
4. Restart application if index seems stale

### Permission Denied Errors
**Symptoms**: Files exist but can't be read

**Solutions**:
1. Check file permissions: `ls -la path/to/file` (macOS/Linux) or Properties dialog (Windows)
2. Ensure workspace directory is readable by user
3. Move files to accessible directory
4. Run AssistantOS with appropriate permissions

## Best Practices

### 1. Be Specific
```
// Good - Clear context
@src/components/chat/AgentChat.tsx
@docs/api/endpoints.md

// Less helpful - Too vague
@file
@doc
```

### 2. One File at a Time
```
// Good - Compare two files explicitly
"@src/old-config.ts vs @src/new-config.ts: what changed?"

// Fine for simple analysis
"@README.md summarize this project"
```

### 3. Use Full Paths for Clarity
```
// Clear and unambiguous
@src/services/claude.ts

// Might match multiple files
@claude.ts
```

### 4. Check File Accessibility
Before mentioning a file:
- Verify it's in your workspace
- Check file permissions
- Ensure it's not in an excluded directory

### 5. Monitor Context Size
```
// Good - Targeted reference
"Review @src/utils/validation.ts for bugs"

// Use caution - Very large files
"Analyze @entire-codebase.ts" (if file is large)
```

## Integration with Other Features

### With File Tools
Document mentions complement native file operations:
- **Mention**: Quick reference and analysis
- **Tools**: Read/write/create files via Claude commands

Both work together:
```
"Look at @src/config.ts and create a new validation.ts file based on it"
```

### With MCP Integrations
Combine document mentions with external services:
```
"@research latest TypeScript best practices and apply them to @src/types.ts"
```

### With Custom Instructions
Workspace documents can be referenced in custom instructions:
```
"Follow the architecture rules in @docs/architecture.md"
```

## Future Enhancements

Potential improvements to document mentions:
- **Partial file references**: Include only specific line ranges
- **Syntax highlighting**: Preserve code formatting in mentions
- **Change tracking**: Highlight diffs when comparing versions
- **Bulk references**: Reference entire directories at once
- **Smart filtering**: Auto-exclude generated/compiled files
- **Mention history**: Recent mentions for quick access
- **Full-text search**: Search file contents in addition to names

## See Also

- [CLAUDE.md](../CLAUDE.md#mention-system) - Architecture details
- [MCP Integration Guide](./MCP_INTEGRATION.md) - Integration mentions (@gmail, @research, etc.)
- [README.md](../README.md#mention-system) - Feature overview
