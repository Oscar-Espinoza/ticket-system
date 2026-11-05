<!-- Screen-reader table with the chart's numbers (the accessible alternative to the drawing). -->
<script lang="ts">
  let {
    id,
    caption,
    columns,
    rows,
  }: {
    id: string;
    caption: string;
    columns: string[];
    rows: (string | number)[][];
  } = $props();
</script>

<table {id} class="sr-only">
  <caption>{caption}</caption>
  <thead>
    <tr>
      {#each columns as c (c)}
        <th scope="col">{c}</th>
      {/each}
    </tr>
  </thead>
  <tbody>
    {#each rows as row, i (i)}
      <tr>
        {#each row as cell, j (j)}
          {#if j === 0}
            <th scope="row">{cell}</th>
          {:else}
            <td>{cell}</td>
          {/if}
        {/each}
      </tr>
    {/each}
  </tbody>
</table>
