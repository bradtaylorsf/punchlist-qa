interface FilterBarProps {
  categories: Array<{ id: string; label: string }>;
  selectedCategory: string;
  selectedStatus: string;
  onCategoryChange: (category: string) => void;
  onStatusChange: (status: string) => void;
}

export function FilterBar({
  categories,
  selectedCategory,
  selectedStatus,
  onCategoryChange,
  onStatusChange,
}: FilterBarProps) {
  return (
    <div className="flex gap-4 items-center">
      <select
        value={selectedCategory}
        onChange={(e) => onCategoryChange(e.target.value)}
        className="text-sm border border-gray-300 rounded-md px-3 py-1.5 bg-white"
      >
        <option value="all">All Categories</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
      <select
        value={selectedStatus}
        onChange={(e) => onStatusChange(e.target.value)}
        className="text-sm border border-gray-300 rounded-md px-3 py-1.5 bg-white"
      >
        <option value="all">All Statuses</option>
        <option value="untested">Untested</option>
        <option value="pass">Pass</option>
        <option value="fail">Fail</option>
        <option value="skip">Skip</option>
        <option value="blocked">Blocked</option>
      </select>
    </div>
  );
}
