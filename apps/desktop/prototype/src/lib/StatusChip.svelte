<script lang="ts">
  import Chip from './Chip.svelte';
  import type { RunStatus } from './types';

  let { status }: { status: RunStatus } = $props();

  const map = {
    approval: { tone: 'err' as const, label: 'Needs approval', dot: true, live: false },
    running: { tone: '' as const, label: 'Running', dot: true, live: true },
    verified: { tone: 'outline' as const, label: 'Verified', dot: true, live: false },
    stopped: { tone: 'outline' as const, label: 'Stopped', dot: true, live: false },
  };
</script>

<Chip tone={map[status].tone} dot={map[status].dot} live={map[status].live}
  >{map[status].label}</Chip
>
