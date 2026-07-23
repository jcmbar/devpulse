/** Shared theme bootstrap used by the root layout blocking script. */
export const THEME_STORAGE_KEY = "theme";

/**
 * Inline script that runs before paint to apply light/dark class.
 * Must stay in sync with ThemeProvider defaults (attribute=class, system enabled).
 */
export const THEME_INIT_SCRIPT = `(function(){try{var storageKey=${JSON.stringify(THEME_STORAGE_KEY)};var d=document.documentElement;var stored=localStorage.getItem(storageKey);var system=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";var theme=stored==="light"||stored==="dark"?stored:system;d.classList.remove("light","dark");d.classList.add(theme);d.style.colorScheme=theme;}catch(e){}})();`;

