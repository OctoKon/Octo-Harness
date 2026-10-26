<script lang="ts">
  // TD-67 specialist model UI (presentational, fixtures only).
  export let advisory: string = "unavailable";
  export let calibration: string = "unavailable";
</script>

<section class="specialist">
  <h2>Specialist model</h2>
  <p class="advisory">Advisory: {advisory}</p>
  <p class="calibration">Calibration: {calibration}</p>
</section>
