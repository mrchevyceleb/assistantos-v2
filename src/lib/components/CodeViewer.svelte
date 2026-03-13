<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { EditorState, Compartment } from "@codemirror/state";
  import type { Extension } from "@codemirror/state";
  import { EditorView, lineNumbers } from "@codemirror/view";
  import { oneDark } from "@codemirror/theme-one-dark";
  import { settings } from "$lib/stores/settings";
  import { uiZoom } from "$lib/stores/ui";
  import { getLanguageFromExt } from "$lib/utils/file-types";
  import { getCodeMirrorLanguage } from "$lib/utils/codemirror-language";

  interface Props {
    content: string;
    ext?: string;
  }

  let { content, ext }: Props = $props();
  let container: HTMLDivElement;
  let view: EditorView | undefined;
  const language = $derived(getLanguageFromExt(ext));

  const languageCompartment = new Compartment();
  const wrapCompartment = new Compartment();
  const typographyCompartment = new Compartment();

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
      ".cm-activeLine": {
        backgroundColor: "transparent",
      },
      ".cm-gutters": {
        backgroundColor: "transparent",
      },
    });
  }

  function wrapExtension(): Extension {
    return $settings.wordWrap ? EditorView.lineWrapping : [];
  }

  onMount(() => {
    const state = EditorState.create({
      doc: content,
      extensions: [
        lineNumbers(),
        oneDark,
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
        languageCompartment.of(getCodeMirrorLanguage(language)),
        wrapCompartment.of(wrapExtension()),
        typographyCompartment.of(typographyExtension()),
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
      effects: typographyCompartment.reconfigure(typographyExtension()),
    });
  });
</script>

<div class="h-full overflow-hidden bg-bg-primary" bind:this={container}></div>
