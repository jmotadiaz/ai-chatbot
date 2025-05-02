"use client";
import React, { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";

export const ThemeToggle = () => {
  const { theme, setTheme, systemTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Determine theme: before mounting, default to light to match SSR
  const resolvedTheme = theme === "system" ? systemTheme : theme;
  const currentTheme = mounted && resolvedTheme ? resolvedTheme : "light";

  return (
    <button
      aria-label="Toggle Dark Mode"
      onClick={() => setTheme(currentTheme === "dark" ? "light" : "dark")}
      className="p-2 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-md transition-colors"
    >
      {currentTheme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
};