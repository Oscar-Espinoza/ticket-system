<!-- One @mention candidate (exported MemberOption of suggestion-menu.tsx). -->
<script lang="ts">
  import { Avatar } from '@/lib/components/ui-icons';
  import type { IssueUser } from '@/lib/issue-model';
  import { optionClass } from './suggestion-entries';

  let {
    id,
    active,
    onPick,
    onHover,
    member,
  }: {
    id: string;
    active: boolean;
    onPick: () => void;
    onHover: () => void;
    member: IssueUser;
  } = $props();
</script>

<!-- mousedown + preventDefault: pick without blurring the editor. -->
<li
  {id}
  role="option"
  aria-selected={active}
  class={optionClass(active)}
  onmousedown={(e) => {
    e.preventDefault();
    onPick();
  }}
  onmousemove={onHover}
>
  <Avatar name={member.name} src={member.image} size={20} />
  <span class="truncate">{member.name}</span>
</li>
