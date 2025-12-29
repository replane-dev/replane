import {useCallback, useEffect, useState} from 'react';

/**
 * A hook that persists state to localStorage.
 *
 * @param key - The localStorage key to use
 * @param defaultValue - The default value if no value is stored
 * @returns A tuple of [value, setValue] similar to useState
 */
export function useLocalStorage<T>(
  key: string,
  defaultValue: T,
): [T, (value: T | ((prev: T) => T)) => void] {
  // Use a function to initialize state to avoid reading localStorage on every render
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') {
      return defaultValue;
    }

    try {
      const stored = window.localStorage.getItem(key);
      if (stored !== null) {
        return JSON.parse(stored) as T;
      }
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error);
    }

    return defaultValue;
  });

  // Update localStorage when value changes
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn(`Error writing localStorage key "${key}":`, error);
    }
  }, [key, value]);

  // Wrap setValue to support function updates
  const setStoredValue = useCallback((newValue: T | ((prev: T) => T)) => {
    setValue(prev => {
      const resolvedValue = typeof newValue === 'function' ? (newValue as (prev: T) => T)(prev) : newValue;
      return resolvedValue;
    });
  }, []);

  return [value, setStoredValue];
}

// Storage keys for SDK preferences
export const SDK_STORAGE_KEYS = {
  LANGUAGE: 'replane:sdk-language',
  CODEGEN_ENABLED: 'replane:sdk-codegen-enabled',
} as const;

