"use client";
import React, { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { updateTheme } from "@/app/actions/theme";

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
    <Button
      variant="icon"
      size="icon"
      aria-label="Toggle Dark Mode"
      onClick={() => {
        const newTheme = currentTheme === "dark" ? "light" : "dark";
        setTheme(newTheme);
        // Sync with server

        updateTheme(newTheme);
      }}
    >
      {currentTheme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
    </Button>
  );
};
