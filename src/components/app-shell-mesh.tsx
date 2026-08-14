"use client";

import { useTheme } from "@/components/theme-provider";
import { LOGIN_MESH, loginMeshPoints } from "@/lib/login-graph";
import { useMemo } from "react";

const SHELL_CLOCK = LOGIN_MESH.cycleMs * 0.2;

export function AppShellMesh() {
  const { resolvedTheme } = useTheme();
  const light = resolvedTheme === "light";
  const points = useMemo(
    () => loginMeshPoints(resolvedTheme, false, SHELL_CLOCK, "shell"),
    [resolvedTheme],
  );

  return (
    <svg
      className="app-shell-mesh"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      {points.map((point) => (
        <circle
          key={`${point.row}-${point.col}`}
          cx={point.x * 100}
          cy={point.y * 100}
          r={light ? 0.22 + point.size * 0.2 : 0.16 + point.size * 0.22}
          fill="var(--login-mesh)"
          opacity={point.alpha * (light ? 0.7 : 0.55)}
        />
      ))}
    </svg>
  );
}
