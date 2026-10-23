import { useEffect, useState } from "react";

export function useDebouncedValue(value: string, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    if (!value) {
      setDebounced(value);
      return;
    }
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
