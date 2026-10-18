import React from "react";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "../../context/ThemeContext.js";

export const ThemeSwitcher: React.FC = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      className="p-2 border border-[var(--border)] hover:border-[var(--border-hover)] bg-[var(--bg-card)] text-[var(--text-main)] smooth-corners-sm transition-colors flex items-center justify-center cursor-pointer"
      onClick={toggleTheme}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
};
