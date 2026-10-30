import { cn } from "@/lib/utils";

export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id="cf-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9775DE" />
          <stop offset="1" stopColor="#5935A8" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill="url(#cf-g)" />
      <path d="M17 41c6-15 12 6 18-8s11-4 11-4" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
      <circle cx="46" cy="22" r="4.5" fill="#fff" />
    </svg>
  );
}

export function Logo({ collapsed, className }: { collapsed?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      {!collapsed && (
        <span className="whitespace-nowrap text-[17px] font-extrabold tracking-tight">
          ContentFlow <span className="text-brand-500">AI</span>
        </span>
      )}
    </div>
  );
}
