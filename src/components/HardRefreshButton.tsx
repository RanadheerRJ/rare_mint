import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { getBuildLabel, hardRefresh } from '../utils/hardRefresh';

interface HardRefreshButtonProps {
  variant: 'sidebar' | 'icon' | 'link' | 'menu';
}

const TITLE = 'Hard refresh: load the latest version of Rare Mint (your ledger data is kept)';

export const HardRefreshButton: React.FC<HardRefreshButtonProps> = ({ variant }) => {
  const [refreshing, setRefreshing] = useState(false);

  const handleClick = () => {
    if (refreshing) return;
    setRefreshing(true);
    void hardRefresh();
  };

  if (variant === 'icon') {
    return (
      <button
        onClick={handleClick}
        disabled={refreshing}
        className="lg:hidden rounded-lg border border-[#0B3B2E]/20 bg-white p-1.5 text-[#0B3B2E] disabled:opacity-60"
        title={TITLE}
        aria-label="Hard refresh app"
      >
        <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
      </button>
    );
  }

  if (variant === 'link') {
    return (
      <div className="text-center">
        <button
          type="button"
          onClick={handleClick}
          disabled={refreshing}
          title={TITLE}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0B3B2E] hover:underline disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Loading latest version…' : 'Hard refresh app (load latest updates)'}
        </button>
        <p className="mt-1 text-[10px] text-[#55655E]">Version {getBuildLabel()}</p>
      </div>
    );
  }

  if (variant === 'menu') {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={refreshing}
        title={TITLE}
        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-[#14201C] transition hover:bg-[#FAF8F4] disabled:opacity-60"
      >
        <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        <span className="flex-1 text-left">
          {refreshing ? 'Loading latest version…' : 'Hard Refresh App'}
        </span>
        <span className="text-[10px] font-medium text-[#55655E]">{getBuildLabel()}</span>
      </button>
    );
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={refreshing}
        title={TITLE}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/8 px-3 py-2 text-xs font-semibold text-white/90 transition hover:bg-white/15 disabled:opacity-60"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
        {refreshing ? 'Loading latest version…' : 'Hard Refresh App'}
      </button>
      <p className="mt-1 text-center text-[10px] text-white/55">Version {getBuildLabel()}</p>
    </div>
  );
};
