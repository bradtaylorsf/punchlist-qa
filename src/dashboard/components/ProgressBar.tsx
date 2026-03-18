interface ProgressBarProps {
  total: number;
  pass: number;
  fail: number;
  skip: number;
  blocked: number;
}

export function ProgressBar({ total, pass, fail, skip, blocked }: ProgressBarProps) {
  const tested = pass + fail + skip + blocked;
  const remaining = total - tested;
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  return (
    <div>
      <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
        <span>
          {tested} of {total} tested
        </span>
        <span className="flex gap-3">
          <span className="text-green-600">{pass} pass</span>
          <span className="text-red-600">{fail} fail</span>
          <span className="text-yellow-600">{skip} skip</span>
          <span className="text-orange-600">{blocked} blocked</span>
        </span>
      </div>
      <div className="h-3 bg-gray-200 rounded-full overflow-hidden flex">
        {pass > 0 && (
          <div className="bg-green-500 transition-all" style={{ width: `${pct(pass)}%` }} />
        )}
        {fail > 0 && (
          <div className="bg-red-500 transition-all" style={{ width: `${pct(fail)}%` }} />
        )}
        {skip > 0 && (
          <div className="bg-yellow-400 transition-all" style={{ width: `${pct(skip)}%` }} />
        )}
        {blocked > 0 && (
          <div className="bg-orange-400 transition-all" style={{ width: `${pct(blocked)}%` }} />
        )}
        {remaining > 0 && (
          <div className="bg-gray-200 transition-all" style={{ width: `${pct(remaining)}%` }} />
        )}
      </div>
    </div>
  );
}
