import { Skeleton } from '@/components/ui-icons';

export default function InboxLoading() {
  return (
    <div className="-mx-4 -my-6 flex h-[calc(100vh-3.5rem)] sm:-mx-6 sm:-my-8" aria-busy="true">
      <div className="flex w-full flex-col border-border md:w-[380px] md:shrink-0 md:border-r">
        <div className="flex h-11 items-center border-b border-border px-3 text-sm font-medium">Inbox</div>
        <div className="flex flex-col gap-1 p-2">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      </div>
      <div className="hidden flex-1 md:block" />
    </div>
  );
}
