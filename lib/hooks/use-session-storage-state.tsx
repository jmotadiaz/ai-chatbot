import { useState, useEffect, type Dispatch, type SetStateAction } from "react";

/**
 * A React hook that manages state persisted in sessionStorage.
 *
 * @param key The sessionStorage key under which to store the state.
 * @param initialValue The initial state value or a function that returns it.
 * @returns A stateful value, and a function to update it.
 */
export function useSessionStorageState<T>(
  key: string,
  initialValue: T | (() => T)
): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    return typeof initialValue === "function"
      ? (initialValue as () => T)()
      : initialValue;
  });

  useEffect(() => {
    try {
      const storedValue = window.sessionStorage.getItem(key);

      if (storedValue !== null) {
        setState(JSON.parse(storedValue) as T);
      }
    } catch (error) {
      console.error(`Error reading sessionStorage key "${key}":`, error);
    }
  }, [key]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(key, JSON.stringify(state));
    } catch (error) {
      console.error(`Error setting sessionStorage key "${key}":`, error);
    }
  }, [key, state]);

  return [state, setState];
}
