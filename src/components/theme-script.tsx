"use client";

import { useServerInsertedHTML } from "next/navigation";
import { useRef } from "react";
import { THEME_INIT_SCRIPT } from "@/lib/theme/init-script";

/**
 * Injects the anti-FOUC theme script into the SSR HTML stream.
 * Returns null so React never renders a <script> in the client component tree
 * (avoids the React 19 / Next 16 console error).
 */
export function ThemeScript() {
  const inserted = useRef(false);

  useServerInsertedHTML(() => {
    if (inserted.current) {
      return null;
    }

    inserted.current = true;

    return (
      <script
        id="devpulse-theme-init"
        dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
      />
    );
  });

  return null;
}
