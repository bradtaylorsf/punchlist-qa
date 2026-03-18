interface SyncBannerProps {
  pendingCount: number;
}

export function SyncBanner({ pendingCount }: SyncBannerProps) {
  if (pendingCount === 0) return null;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-800 flex items-center gap-2">
      <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.3" />
        <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      {pendingCount} result{pendingCount !== 1 ? 's' : ''} pending sync — will retry automatically
    </div>
  );
}
