<script lang="ts">
  interface Props {
    direction: "horizontal" | "vertical";
    onResize: (delta: number) => void;
  }

  let { direction, onResize }: Props = $props();
  let isDragging = $state(false);

  function handleMouseDown(e: MouseEvent) {
    e.preventDefault();
    isDragging = true;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = direction === "horizontal" ? e.movementX : e.movementY;
      onResize(delta);
    };

    const handleMouseUp = () => {
      isDragging = false;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = direction === "horizontal" ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
  }
</script>

<div
  class="shrink-0 transition-all hover:shadow-[0_0_4px_rgba(0,212,255,0.3)]"
  class:w-[4px]={direction === "horizontal"}
  class:h-[4px]={direction === "vertical"}
  class:cursor-col-resize={direction === "horizontal"}
  class:cursor-row-resize={direction === "vertical"}
  class:bg-border={!isDragging}
  class:bg-accent={isDragging}
  class:hover:bg-accent={true}
  onmousedown={handleMouseDown}
  role="separator"
></div>
