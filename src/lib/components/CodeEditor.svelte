<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { EditorState } from "@codemirror/state";
  import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from "@codemirror/view";
  import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
  import { markdown } from "@codemirror/lang-markdown";
  import { oneDark } from "@codemirror/theme-one-dark";
  import { searchKeymap } from "@codemirror/search";
  import { bracketMatching, foldGutter, syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";

  interface Props {
    content: string;
    onSave?: (content: string) => void;
    onChange?: (content: string) => void;
    language?: string;
  }

  let { content, onSave, onChange, language = "markdown" }: Props = $props();
  let container: HTMLDivElement;
  let view: EditorView | undefined;

  onMount(() => {
    const saveKeymap = keymap.of([
      {
        key: "Mod-s",
        run: () => {
          if (onSave && view) {
            onSave(view.state.doc.toString());
          }
          return true;
        },
      },
    ]);

    let langExtension;
    if (language === "markdown") {
      langExtension = markdown();
    } else {
      // For other languages, just use basic setup
      langExtension = markdown(); // fallback for now
    }

    const state = EditorState.create({
      doc: content,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        history(),
        foldGutter(),
        bracketMatching(),
        langExtension,
        oneDark,
        saveKeymap,
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && onChange) {
            onChange(update.state.doc.toString());
          }
        }),
        EditorView.theme({
          "&": {
            height: "100%",
            fontSize: "14px",
          },
          ".cm-scroller": {
            fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
          },
          ".cm-content": {
            padding: "8px 0",
          },
        }),
      ],
    });

    view = new EditorView({
      state,
      parent: container,
    });
  });

  onDestroy(() => {
    view?.destroy();
  });

  // Update content if it changes externally
  $effect(() => {
    if (view && content !== view.state.doc.toString()) {
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: content,
        },
      });
    }
  });
</script>

<div class="h-full overflow-hidden" bind:this={container}></div>
