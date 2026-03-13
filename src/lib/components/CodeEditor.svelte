<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { EditorState, Compartment } from "@codemirror/state";
  import type { Extension } from "@codemirror/state";
  import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from "@codemirror/view";
  import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
  import { oneDark } from "@codemirror/theme-one-dark";
  import { searchKeymap } from "@codemirror/search";
  import { bracketMatching, foldGutter, indentUnit } from "@codemirror/language";
  import { settings } from "$lib/stores/settings";
  import { uiZoom } from "$lib/stores/ui";
  import { getCodeMirrorLanguage } from "$lib/utils/codemirror-language";

  interface Props {
    content: string;
    onSave?: (content: string) => void;
    onChange?: (content: string) => void;
    language?: string;
  }

  let { content, onSave, onChange, language = "markdown" }: Props = $props();
  let container: HTMLDivElement;
  let view: EditorView | undefined;
  const languageCompartment = new Compartment();
  const wrapCompartment = new Compartment();
  const typographyCompartment = new Compartment();
  const tabCompartment = new Compartment();

  function typographyExtension(): Extension {
    return EditorView.theme({
      "&": {
        height: "100%",
        fontSize: `${Math.round($settings.editorFontSize * $uiZoom)}px`,
      },
      ".cm-scroller": {
        fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
      },
      ".cm-content": {
        padding: "8px 0",
      },
    });
  }

  function tabExtension(): Extension {
    return [indentUnit.of(" ".repeat($settings.tabSize)), EditorState.tabSize.of($settings.tabSize)];
  }

  function wrapExtension(): Extension {
    return $settings.wordWrap ? EditorView.lineWrapping : [];
  }

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

    const extensions = [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        history(),
        foldGutter(),
        bracketMatching(),
        languageCompartment.of(getCodeMirrorLanguage(language)),
        wrapCompartment.of(wrapExtension()),
        typographyCompartment.of(typographyExtension()),
        tabCompartment.of(tabExtension()),
        oneDark,
        saveKeymap,
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && onChange) {
            onChange(update.state.doc.toString());
          }
        }),
    ];

    const state = EditorState.create({
      doc: content,
      extensions,
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

  $effect(() => {
    if (!view) return;
    view.dispatch({
      effects: languageCompartment.reconfigure(getCodeMirrorLanguage(language)),
    });
  });

  $effect(() => {
    if (!view) return;
    view.dispatch({
      effects: wrapCompartment.reconfigure(wrapExtension()),
    });
  });

  $effect(() => {
    if (!view) return;
    view.dispatch({
      effects: tabCompartment.reconfigure(tabExtension()),
    });
  });

  $effect(() => {
    if (!view) return;
    view.dispatch({
      effects: typographyCompartment.reconfigure(typographyExtension()),
    });
  });
</script>

<div class="h-full overflow-hidden" bind:this={container} style:font-size="{Math.round($settings.editorFontSize * $uiZoom)}px"></div>
