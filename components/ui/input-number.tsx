import { ComponentProps, useMemo, useRef, useState } from "react";
import { Plus, Minus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface InputNumberProps
  extends Omit<ComponentProps<typeof Input>, "onChange" | "type" | "value"> {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}

const once = (cb: () => void) => {
  let called = false;
  return () => {
    if (!called) {
      called = true;
      cb();
    }
  };
};

export function InputNumber({
  id,
  value,
  min = Number.MIN_SAFE_INTEGER,
  max = Number.MAX_SAFE_INTEGER,
  step = 1,
  onChange,
  className,
  disabled = false,
  ...props
}: InputNumberProps) {
  const [editingValue, setEditingValue] = useState<string | null>(null);
  const precision = useMemo(() => {
    const s = step.toString();
    return s.includes(".") ? s.split(".")[1].length : 0;
  }, [step]);

  const change = (newVal: number) => {
    onChange(
      Math.max(min, Math.min(max, parseFloat(newVal.toFixed(precision))))
    );
  };

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const intervalRef = useRef<number | null>(null);

  const startTimeout = (cb: () => void): void => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(cb, 300);
  };

  const startInterval = (cb: () => void): void => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = window.setInterval(cb, 100);
  };

  const handleMouseDown = (delta: number) => {
    if (disabled) return;
    startTimeout(() => {
      let increment = delta;
      startInterval(() => {
        increment = increment + delta;
        change(value + increment);
      });
    });
  };

  const clearTimers = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = parseFloat(e.target.value);
    if (
      e.target.value === "" ||
      (!isNaN(newVal) && newVal >= min && newVal <= max)
    ) {
      setEditingValue(e.target.value);
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const newVal = parseFloat(e.target.value);
    setEditingValue(null);
    if (!isNaN(newVal) && newVal >= min && newVal <= max) {
      onChange(parseFloat(newVal.toFixed(precision)));
    }
  };

  const increment = once(() => handleMouseDown(step));
  const decrement = once(() => handleMouseDown(-step));

  return (
    <div className={cn("flex items-center space-x-2", className)}>
      <Button
        onClick={() => change(value - step)}
        onTouchStart={decrement}
        onMouseDown={decrement}
        onTouchEnd={clearTimers}
        onMouseUp={clearTimers}
        disabled={disabled}
        variant="secondary"
        aria-label="Decrease value"
      >
        <Minus className="h-4 w-4" />
      </Button>
      <Input
        id={id}
        type="number"
        value={editingValue ?? value}
        step={step}
        min={min}
        max={max}
        onChange={handleChange}
        onBlur={handleBlur}
        disabled={disabled}
        className="w-12 text-center border-0 shadow-none focus-visible:ring-0"
        {...props}
      />
      <Button
        onClick={() => change(value + step)}
        onTouchStart={increment}
        onMouseDown={increment}
        onTouchEnd={clearTimers}
        onMouseUp={clearTimers}
        disabled={disabled}
        variant="secondary"
        aria-label="Increase value"
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}
