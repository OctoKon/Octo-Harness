<script lang="ts">
  import { statusLabel } from "../status-labels";

  export type SupportCellStatus =
    | "tested"
    | "supported"
    | "unsupported"
    | "unknown"
    | "unrun";

  export interface SupportCell {
    id: string;
    label: string;
    status: SupportCellStatus;
    count?: number;
  }

  let {
    title = "Support status",
    cells = [],
    help = "",
  }: {
    title?: string;
    cells?: SupportCell[];
    help?: string;
  } = $props();

  function cellLabel(status: SupportCellStatus): string {
    if (status === "unrun") return "Unrun (n=0)";
    return statusLabel(status);
  }
</script>

<section class="support-status" data-testid="support-status" aria-labelledby="support-title">
  <h3 id="support-title">{title}</h3>
  <table class="matrix">
    <thead>
      <tr>
        <th scope="col">Cell</th>
        <th scope="col">Status</th>
        <th scope="col">Count</th>
      </tr>
    </thead>
    <tbody>
      {#each cells as cell (cell.id)}
        <tr data-testid={`support-cell-${cell.id}`}>
          <td class="cell-label">{cell.label}</td>
          <td class={`cell-status cell-${cell.status}`}>{cellLabel(cell.status)}</td>
          <td class="cell-count">{cell.count ?? 0}</td>
        </tr>
      {/each}
      {#if cells.length === 0}
        <tr>
          <td colspan="3" class="empty">No support records.</td>
        </tr>
      {/if}
    </tbody>
  </table>
  {#if help}
    <p class="help">{help}</p>
  {/if}
</section>

<style>
  .support-status {
    border: 1px solid var(--border, #e5e7eb);
    border-radius: var(--radius-md, 8px);
    padding: 12px;
    margin: 12px 0;
  }
  .support-status h3 {
    margin: 0 0 8px;
    font-size: 1rem;
    font-weight: 600;
  }
  .matrix {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8125rem;
  }
  .matrix th,
  .matrix td {
    text-align: left;
    padding: 4px 8px;
    border-bottom: 1px solid var(--border, #e5e7eb);
  }
  .cell-tested,
  .cell-supported {
    color: #047857;
  }
  .cell-unsupported {
    color: #b91c1c;
  }
  .cell-unknown,
  .cell-unrun {
    color: #6b7280;
  }
  .empty {
    text-align: center;
    color: var(--text-muted, #6b7280);
  }
  .help {
    margin: 8px 0 0;
    font-size: 0.75rem;
    color: var(--text-secondary, #4b5563);
  }
</style>
