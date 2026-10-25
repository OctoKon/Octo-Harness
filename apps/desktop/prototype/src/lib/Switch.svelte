<script lang="ts">
  let {
    checked = $bindable(false),
    label = '',
    disabled = false,
    onchange,
  }: {
    checked?: boolean;
    label?: string;
    disabled?: boolean;
    onchange?: (value: boolean) => void;
  } = $props();

  function toggle() {
    if (disabled) return;
    checked = !checked;
    onchange?.(checked);
  }
</script>

<button
  type="button"
  class="switch"
  data-on={checked}
  role="switch"
  aria-checked={checked}
  aria-label={label}
  {disabled}
  onclick={toggle}
>
  <span class="knob"></span>
</button>

<style>
  .switch {
    cursor: pointer;
  }
  .switch:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .switch .knob {
    left: 2px;
    transition: left 0.18s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .switch[data-on='true'] .knob {
    left: 18px;
  }
</style>
