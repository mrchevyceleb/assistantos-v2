<script lang="ts">
  import Papa from "papaparse";
  import { uiZoom } from "$lib/stores/ui";

  interface Props {
    content: string;
    ext?: string;
  }

  let { content, ext }: Props = $props();

  // State
  let sortColumn = $state<number | null>(null);
  let sortDirection = $state<"asc" | "desc">("asc");
  let searchQuery = $state("");
  let hoveredRow = $state<number | null>(null);
  let hoveredCol = $state<number | null>(null);
  let firstRowIsHeader = $state(true);
  let clickedHeader = $state<number | null>(null);

  // Parse CSV
  let parsed = $derived.by(() => {
    if (!content || !content.trim()) return { headers: [], rows: [], delimiter: "," };
    const result = Papa.parse<string[]>(content, {
      header: false,
      skipEmptyLines: true,
      dynamicTyping: false,
    });
    const allRows = result.data;
    if (allRows.length === 0) return { headers: [], rows: [], delimiter: result.meta.delimiter };

    const maxCols = allRows.reduce((max, row) => Math.max(max, row.length), 0);

    // Pad ragged rows
    const padded = allRows.map((row) => {
      if (row.length < maxCols) return [...row, ...Array(maxCols - row.length).fill("")];
      return row;
    });

    let headers: string[];
    let rows: string[][];

    if (firstRowIsHeader && padded.length > 0) {
      headers = padded[0];
      rows = padded.slice(1);
    } else {
      headers = Array.from({ length: maxCols }, (_, i) => `Column ${i + 1}`);
      rows = padded;
    }

    return { headers, rows, delimiter: result.meta.delimiter };
  });

  // Filter by search
  let filteredRows = $derived.by(() => {
    if (!searchQuery.trim()) return parsed.rows;
    const q = searchQuery.toLowerCase();
    return parsed.rows.filter((row) => row.some((cell) => cell.toLowerCase().includes(q)));
  });

  // Sort
  let sortedRows = $derived.by(() => {
    if (sortColumn === null) return filteredRows;
    const col = sortColumn;
    const dir = sortDirection === "asc" ? 1 : -1;
    return [...filteredRows].sort((a, b) => {
      const va = a[col] ?? "";
      const vb = b[col] ?? "";
      // Try numeric comparison
      const na = parseFloat(va);
      const nb = parseFloat(vb);
      if (!isNaN(na) && !isNaN(nb)) return (na - nb) * dir;
      return va.localeCompare(vb) * dir;
    });
  });

  let delimiterLabel = $derived(
    parsed.delimiter === "\t" ? "TSV" : parsed.delimiter === ";" ? "Semicolon" : "CSV"
  );

  function handleSort(colIndex: number) {
    // Bounce animation
    clickedHeader = colIndex;
    setTimeout(() => (clickedHeader = null), 200);

    if (sortColumn === colIndex) {
      if (sortDirection === "asc") {
        sortDirection = "desc";
      } else {
        sortColumn = null;
        sortDirection = "asc";
      }
    } else {
      sortColumn = colIndex;
      sortDirection = "asc";
    }
  }
</script>

<div class="h-full flex flex-col bg-bg-primary" style="font-size: calc(14px * var(--content-zoom, 1));">
  <!-- Info bar -->
  <div
    class="flex items-center border-b border-border text-text-muted shrink-0"
    style="padding: 8px 16px; gap: 16px; font-size: 12px;"
  >
    <span class="text-text-secondary font-medium">{delimiterLabel}</span>
    <span>{parsed.headers.length} columns</span>
    <span>{parsed.rows.length} rows</span>
    {#if searchQuery && filteredRows.length !== parsed.rows.length}
      <span class="text-accent">{filteredRows.length} matched</span>
    {/if}

    <button
      class="text-text-muted hover:text-text-primary transition-colors"
      style="margin-left: 4px; padding: 2px 8px; font-size: 11px; border-radius: 4px;"
      class:bg-accent={!firstRowIsHeader}
      class:text-bg-primary={!firstRowIsHeader}
      onclick={() => (firstRowIsHeader = !firstRowIsHeader)}
      title={firstRowIsHeader ? "First row is used as headers" : "First row is treated as data"}
    >
      {firstRowIsHeader ? "Headers: ON" : "Headers: OFF"}
    </button>

    <div style="margin-left: auto; position: relative;">
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Filter rows..."
        class="bg-bg-secondary border border-border rounded-md text-text-primary text-xs focus:outline-none focus:border-accent transition-all"
        style="padding: 4px 10px; width: 180px;"
      />
    </div>
  </div>

  <!-- Table -->
  {#if parsed.headers.length === 0}
    <div class="flex-1 flex items-center justify-center text-text-muted">
      <div class="text-center">
        <p class="text-sm">This file is empty</p>
        <p class="text-xs" style="margin-top: 4px;">No data to display</p>
      </div>
    </div>
  {:else}
    <div class="flex-1 overflow-auto csv-table-wrap">
      <table class="csv-table" style="border-collapse: collapse; min-width: 100%;">
        <thead>
          <tr>
            <!-- Row number header -->
            <th
              class="text-text-muted text-right select-none"
              style="padding: 8px 10px; position: sticky; top: 0; z-index: 11; font-weight: 500; font-size: 11px; min-width: 48px; background: var(--color-bg-secondary); border-bottom: 2px solid var(--color-border);"
            >
              #
            </th>
            {#each parsed.headers as header, i}
              <th
                class="text-left text-text-secondary select-none cursor-pointer"
                class:csv-col-highlight={hoveredCol === i}
                style="padding: 8px 14px; position: sticky; top: 0; z-index: 10; font-weight: 600; white-space: nowrap; background: var(--color-bg-secondary); border-bottom: 2px solid var(--color-border); transition: transform 100ms ease; {clickedHeader === i ? 'transform: scale(0.96);' : ''}"
                onclick={() => handleSort(i)}
                onmouseenter={() => (hoveredCol = i)}
                onmouseleave={() => (hoveredCol = null)}
                title="Click to sort"
              >
                <span class="inline-flex items-center" style="gap: 6px;">
                  {header}
                  {#if sortColumn === i}
                    <span class="csv-sort-arrow" style="font-size: 10px; transition: transform 200ms ease; {sortDirection === 'desc' ? 'transform: rotate(180deg);' : ''}">
                      &#9650;
                    </span>
                  {:else}
                    <span style="font-size: 10px; opacity: 0.2;">&#9650;</span>
                  {/if}
                </span>
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each sortedRows as row, rowIdx}
            <tr
              class="csv-row"
              class:csv-row-even={rowIdx % 2 === 0}
              class:csv-row-hover={hoveredRow === rowIdx}
              onmouseenter={() => (hoveredRow = rowIdx)}
              onmouseleave={() => (hoveredRow = null)}
            >
              <!-- Row number -->
              <td
                class="text-text-muted text-right select-none"
                style="padding: 6px 10px; font-size: 11px; border-bottom: 1px solid rgba(255,255,255,0.04); min-width: 48px; font-variant-numeric: tabular-nums;"
              >
                {rowIdx + 1}
              </td>
              {#each row as cell, colIdx}
                <td
                  class="text-text-primary csv-cell"
                  class:csv-col-highlight={hoveredCol === colIdx}
                  class:csv-crosshair={hoveredRow === rowIdx && hoveredCol === colIdx}
                  style="padding: 6px 14px; border-bottom: 1px solid rgba(255,255,255,0.04); white-space: nowrap; max-width: 400px; overflow: hidden; text-overflow: ellipsis;"
                  onmouseenter={() => (hoveredCol = colIdx)}
                  onmouseleave={() => (hoveredCol = null)}
                  title={cell}
                >
                  {cell}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  .csv-table-wrap {
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.1) transparent;
  }

  .csv-table-wrap::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  .csv-table-wrap::-webkit-scrollbar-track {
    background: transparent;
  }

  .csv-table-wrap::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
  }

  .csv-row {
    transition: background 150ms ease;
  }

  .csv-row-even {
    background: rgba(255, 255, 255, 0.015);
  }

  .csv-row-hover {
    background: rgba(88, 180, 208, 0.06) !important;
  }

  .csv-col-highlight {
    background: rgba(88, 180, 208, 0.03);
  }

  .csv-crosshair {
    background: rgba(88, 180, 208, 0.1) !important;
    box-shadow: inset 0 0 0 1px rgba(88, 180, 208, 0.15);
  }

  .csv-cell {
    transition: transform 100ms ease, background 150ms ease;
  }

  .csv-cell:hover {
    transform: scale(1.01);
  }

  th:hover {
    background: rgba(88, 180, 208, 0.08) !important;
  }

  .csv-sort-arrow {
    color: var(--color-accent, #58b4d0);
  }

  /* Focus glow on search */
  input:focus {
    box-shadow: 0 0 0 2px rgba(88, 180, 208, 0.2), 0 0 12px rgba(88, 180, 208, 0.1);
  }
</style>
