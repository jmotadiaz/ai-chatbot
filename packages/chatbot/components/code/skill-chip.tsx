import { X } from "lucide-react";
import { cn } from "@/lib/utils/helpers";

export interface SkillChipProps {
  name: string;
  onRemove?: () => void;
  className?: string;
}

export const SkillChip: React.FC<SkillChipProps> = ({
  name,
  onRemove,
  className,
}) => (
  <span
    className={cn(
      "inline-flex max-w-full items-center gap-1 rounded-full border border-blue-500/25 bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-700 dark:text-blue-300",
      className,
    )}
  >
    <span className="truncate">{name}</span>
    {onRemove && (
      <button
        type="button"
        onClick={onRemove}
        className="rounded-full p-0.5 hover:bg-blue-500/15"
        aria-label={`Remove ${name} skill`}
      >
        <X size={12} />
      </button>
    )}
  </span>
);
