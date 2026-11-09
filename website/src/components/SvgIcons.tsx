import React from 'react';

/**
 * Authentic TikTok Logo with chromatic aberration (Cyan #25F4EE and Red/Pink #FE2C55 offsets)
 */
export function TikTokLogoIcon({
  className = 'w-5 h-5',
  chromatic = true,
}: {
  className?: string;
  chromatic?: boolean;
}) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      {chromatic && (
        <>
          {/* Cyan layer shifted top-left */}
          <path
            d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 3 15.68 6.34 6.34 0 0 0 9.33 22a6.34 6.34 0 0 0 6.34-6.33V9.22a8.16 8.16 0 0 0 4.92 1.63V7.4a4.85 4.85 0 0 1-1-.71z"
            fill="#25F4EE"
            transform="translate(-0.9, -0.7)"
            opacity="0.9"
          />
          {/* Red/Magenta layer shifted bottom-right */}
          <path
            d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 3 15.68 6.34 6.34 0 0 0 9.33 22a6.34 6.34 0 0 0 6.34-6.33V9.22a8.16 8.16 0 0 0 4.92 1.63V7.4a4.85 4.85 0 0 1-1-.71z"
            fill="#FE2C55"
            transform="translate(0.9, 0.7)"
            opacity="0.9"
          />
        </>
      )}
      {/* Crisp White/Front layer */}
      <path
        d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 3 15.68 6.34 6.34 0 0 0 9.33 22a6.34 6.34 0 0 0 6.34-6.33V9.22a8.16 8.16 0 0 0 4.92 1.63V7.4a4.85 4.85 0 0 1-1-.71z"
        fill="currentColor"
      />
    </svg>
  );
}

/**
 * Top Icon: Hybrid Emblem combining TikTok chromatic aesthetic with Pulsaria celestial rings
 */
export function PulsarTikTokBadgeIcon({
  className = 'w-7 h-7',
}: {
  className?: string;
}) {
  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <svg viewBox="0 0 36 36" className="w-full h-full" fill="none">
        {/* Glow ambient background filter */}
        <defs>
          <filter id="ttGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="-1" dy="0" stdDeviation="1.5" floodColor="#25F4EE" floodOpacity="0.7" />
            <feDropShadow dx="1" dy="0" stdDeviation="1.5" floodColor="#FE2C55" floodOpacity="0.7" />
          </filter>
        </defs>

        {/* Pulsar orbit ring */}
        <circle
          cx="18"
          cy="18"
          r="14"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeOpacity="0.25"
        />
        {/* Cyan orbital arc */}
        <path
          d="M18 4 A14 14 0 0 1 32 18"
          stroke="#25F4EE"
          strokeWidth="2"
          strokeLinecap="round"
        />
        {/* Red/Pink orbital arc */}
        <path
          d="M18 32 A14 14 0 0 1 4 18"
          stroke="#FE2C55"
          strokeWidth="2"
          strokeLinecap="round"
        />

        {/* Outer relativistic jets */}
        <line x1="18" y1="1" x2="18" y2="4.5" stroke="#25F4EE" strokeWidth="2" strokeLinecap="round" />
        <line x1="18" y1="31.5" x2="18" y2="35" stroke="#FE2C55" strokeWidth="2" strokeLinecap="round" />

        {/* Center TikTok glyph group scaled into 18x18 center */}
        <g transform="translate(7.5, 7) scale(0.88)" filter="url(#ttGlow)">
          {/* Cyan layer */}
          <path
            d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 3 15.68 6.34 6.34 0 0 0 9.33 22a6.34 6.34 0 0 0 6.34-6.33V9.22a8.16 8.16 0 0 0 4.92 1.63V7.4a4.85 4.85 0 0 1-1-.71z"
            fill="#25F4EE"
            transform="translate(-0.8, -0.6)"
          />
          {/* Red/Pink layer */}
          <path
            d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 3 15.68 6.34 6.34 0 0 0 9.33 22a6.34 6.34 0 0 0 6.34-6.33V9.22a8.16 8.16 0 0 0 4.92 1.63V7.4a4.85 4.85 0 0 1-1-.71z"
            fill="#FE2C55"
            transform="translate(0.8, 0.6)"
          />
          {/* Main White/Black glyph */}
          <path
            d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 3 15.68 6.34 6.34 0 0 0 9.33 22a6.34 6.34 0 0 0 6.34-6.33V9.22a8.16 8.16 0 0 0 4.92 1.63V7.4a4.85 4.85 0 0 1-1-.71z"
            fill="currentColor"
          />
        </g>
      </svg>
    </div>
  );
}

export function PulsarMarkIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none">
      <circle cx="16" cy="16" r="9" stroke="currentColor" strokeWidth="2.2" strokeOpacity="0.4" />
      <path
        d="M16 3.5v4M16 24.5v4"
        stroke="var(--tt)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M16 7a9 9 0 0 1 9 9"
        stroke="var(--cy)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <circle cx="16" cy="16" r="2.5" fill="#25F4EE" />
    </svg>
  );
}

export function HeartIcon({
  className = 'w-4 h-4',
  liked = false,
}: {
  className?: string;
  liked?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill={liked ? '#FE2C55' : '#fff'}
      style={liked ? { filter: 'drop-shadow(0 2px 8px rgba(254, 44, 85, 0.6))' } : undefined}
    >
      <path d="M12 21s-8-5.2-8-10.4A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 8 3.6C20 15.8 12 21 12 21z" />
    </svg>
  );
}

export function CommentIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="#fff">
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12z" />
    </svg>
  );
}

export function ShareIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="#fff">
      <path d="M15 8V4l7 7-7 7v-4c-5 0-8.5 1.6-11 5.1 1-5 4-10 11-11.1z" />
    </svg>
  );
}

export function GithubIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.43-2.69 5.4-5.25 5.69.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}

export function WarningIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="#FE2C55"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 4 2.8 20h18.4z" />
      <path d="M12 10v5M12 17.6v.4" />
    </svg>
  );
}

export function SearchGlyphIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function WindowsIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <rect x="2" y="2" width="9.2" height="9.2" rx="0.5" />
      <rect x="12.8" y="2" width="9.2" height="9.2" rx="0.5" />
      <rect x="2" y="12.8" width="9.2" height="9.2" rx="0.5" />
      <rect x="12.8" y="12.8" width="9.2" height="9.2" rx="0.5" />
    </svg>
  );
}

/**
 * Official Microsoft Windows 11 Logo with authentic Fluent blue quad-color palette
 */
export function Windows11OfficialIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 88 88" className={className} fill="none" aria-hidden="true">
      <rect x="0" y="0" width="41.6" height="41.6" rx="1.5" fill="#00A4EF" />
      <rect x="46.4" y="0" width="41.6" height="41.6" rx="1.5" fill="#0078D4" />
      <rect x="0" y="46.4" width="41.6" height="41.6" rx="1.5" fill="#0082E6" />
      <rect x="46.4" y="46.4" width="41.6" height="41.6" rx="1.5" fill="#005A9E" />
    </svg>
  );
}

/**
 * Official-style Local Hardware Processor Chip icon with silicon heat-spreader and silkscreened LOCAL mark
 */
export function LocalProcessorOfficialIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      {/* Top pins */}
      <line x1="7" y1="1" x2="7" y2="4" stroke="#25F4EE" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="12" y1="1" x2="12" y2="4" stroke="#25F4EE" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="17" y1="1" x2="17" y2="4" stroke="#25F4EE" strokeWidth="1.3" strokeLinecap="round" />
      {/* Bottom pins */}
      <line x1="7" y1="20" x2="7" y2="23" stroke="#25F4EE" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="12" y1="20" x2="12" y2="23" stroke="#25F4EE" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="17" y1="20" x2="17" y2="23" stroke="#25F4EE" strokeWidth="1.3" strokeLinecap="round" />
      {/* Left pins */}
      <line x1="1" y1="7" x2="4" y2="7" stroke="#25F4EE" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="1" y1="12" x2="4" y2="12" stroke="#25F4EE" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="1" y1="17" x2="4" y2="17" stroke="#25F4EE" strokeWidth="1.3" strokeLinecap="round" />
      {/* Right pins */}
      <line x1="20" y1="7" x2="23" y2="7" stroke="#25F4EE" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="20" y1="12" x2="23" y2="12" stroke="#25F4EE" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="20" y1="17" x2="23" y2="17" stroke="#25F4EE" strokeWidth="1.3" strokeLinecap="round" />

      {/* Ceramic Substrate */}
      <rect x="4" y="4" width="16" height="16" rx="2" fill="#080E13" stroke="#25F4EE" strokeWidth="1.2" />

      {/* Metallic Heat Spreader */}
      <rect x="6.8" y="6.8" width="10.4" height="10.4" rx="1.2" fill="#13232C" stroke="#25F4EE" strokeWidth="0.8" strokeOpacity="0.75" />

      {/* Pin 1 dot */}
      <circle cx="8.3" cy="8.3" r="0.75" fill="#25F4EE" />

      {/* Micro-etched "LOCAL" silkscreen */}
      <text
        x="12"
        y="13.2"
        textAnchor="middle"
        fontSize="3.1"
        fontWeight="800"
        fontFamily="system-ui, -apple-system, sans-serif"
        fill="#25F4EE"
        letterSpacing="0.06em"
      >
        LOCAL
      </text>
    </svg>
  );
}

/**
 * Official Incognito / Private Browsing icon representing 100% private, zero account requirement
 */
export function IncognitoOfficialIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      {/* Fedora Hat */}
      <path
        d="M21.5 12H17.2L15.3 5.8C15.1 5.3 14.6 4.9 14.1 4.8L12 4.5L9.9 4.8C9.4 4.9 8.9 5.3 8.7 5.8L6.8 12H2.5C1.7 12 1 12.7 1 13.5C1 14.3 1.7 15 2.5 15H21.5C22.3 15 23 14.3 23 13.5C23 12.7 22.3 12 21.5 12Z"
        fill="#FE2C55"
      />
      {/* Hat band ribbon */}
      <path
        d="M6.8 12L7.3 10.5C7.4 10 7.8 9.6 8.3 9.5L12 9.2L15.7 9.5C16.2 9.6 16.6 10 16.7 10.5L17.2 12H6.8Z"
        fill="#FFFFFF"
        opacity="0.9"
      />
      {/* Glasses Left */}
      <circle cx="7.5" cy="18" r="3.1" stroke="#FE2C55" strokeWidth="1.8" fill="none" />
      {/* Glasses Right */}
      <circle cx="16.5" cy="18" r="3.1" stroke="#FE2C55" strokeWidth="1.8" fill="none" />
      {/* Glasses Bridge */}
      <path d="M10.6 18H13.4" stroke="#FE2C55" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function CheckIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function SparkleIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4L12 2z" />
    </svg>
  );
}

/**
 * SPACE CONCEPT ICON PACK — Voyager & Pulsaria Deep Space Vector Suite
 */

export function ConstellationIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="5" cy="18" r="2" fill="currentColor" />
      <circle cx="12" cy="6" r="2.5" fill="currentColor" />
      <circle cx="19" cy="11" r="2" fill="currentColor" />
      <circle cx="18" cy="20" r="1.5" fill="currentColor" />
      <line x1="6.8" y1="16.5" x2="10.4" y2="8" strokeOpacity="0.6" strokeDasharray="1.5 1.5" />
      <line x1="14.3" y1="7" x2="17.2" y2="9.8" strokeOpacity="0.6" />
      <line x1="18.8" y1="13" x2="18.2" y2="18.5" strokeOpacity="0.6" strokeDasharray="1.5 1.5" />
      <line x1="6.8" y1="18.2" x2="16.5" y2="19.8" strokeOpacity="0.3" />
    </svg>
  );
}

export function OrbitalPathIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <ellipse cx="12" cy="12" rx="9.5" ry="4.5" transform="rotate(-28 12 12)" strokeOpacity="0.5" />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
      <circle cx="19" cy="8.2" r="1.8" fill="#25F4EE" stroke="#000" strokeWidth="1" />
      <circle cx="5" cy="15.8" r="1.2" fill="#FE2C55" />
    </svg>
  );
}

export function PulsarBeamIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {/* Relativistic radiation jets */}
      <line x1="12" y1="1.5" x2="12" y2="7.5" stroke="#25F4EE" strokeWidth="2" />
      <line x1="12" y1="16.5" x2="12" y2="22.5" stroke="#FE2C55" strokeWidth="2" />
      {/* Magnetic poles tilt */}
      <line x1="5.5" y1="5.5" x2="8.5" y2="8.5" strokeOpacity="0.4" />
      <line x1="15.5" y1="15.5" x2="18.5" y2="18.5" strokeOpacity="0.4" />
      {/* Neutron core */}
      <circle cx="12" cy="12" r="4" fill="currentColor" />
      <circle cx="12" cy="12" r="1.6" fill="#020305" />
      <ellipse cx="12" cy="12" rx="8" ry="2.2" strokeOpacity="0.5" />
    </svg>
  );
}

export function DeepSpaceTelemetryIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 19a14 14 0 0 1 0-14" strokeOpacity="0.35" />
      <path d="M7.5 16.5a10 10 0 0 1 0-9" strokeOpacity="0.6" />
      <path d="M11 14a6 6 0 0 1 0-4" stroke="#25F4EE" />
      <circle cx="14.5" cy="12" r="1.5" fill="currentColor" />
      <path d="M14.5 13.5v5.5m-3 0h6" />
    </svg>
  );
}

export function GravitationalWaveIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12c2.5-4 4.5-4 7 0s4.5 4 7 0 4.5-4 6 0" />
      <path d="M2 8c2.5-3 4.5-3 7 0s4.5 3 7 0 4.5-3 6 0" strokeOpacity="0.4" />
      <path d="M2 16c2.5-3 4.5-3 7 0s4.5 3 7 0 4.5-3 6 0" strokeOpacity="0.4" />
    </svg>
  );
}

export function TelescopeArrayIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m10 4 8 4-4 8-8-4z" />
      <line x1="14" y1="12" x2="19" y2="21" />
      <line x1="10" y1="14" x2="5" y2="21" />
      <line x1="12" y1="16" x2="12" y2="21" />
      <circle cx="18" cy="4" r="1.5" fill="#25F4EE" />
    </svg>
  );
}

export function AstroCompassIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" strokeOpacity="0.5" />
      <path d="M12 3v3m0 12v3m9-9h-3M6 12H3" strokeOpacity="0.5" />
      <polygon points="12 7 14.5 12 12 17 9.5 12" fill="currentColor" fillOpacity="0.2" />
      <polygon points="12 7 14.5 12 12 12" fill="#25F4EE" />
      <polygon points="12 17 9.5 12 12 12" fill="#FE2C55" />
    </svg>
  );
}

export function SatelliteDishIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 10a10 10 0 0 1 10-10" strokeOpacity="0.35" />
      <path d="M4 14a14 14 0 0 1 14-14" strokeOpacity="0.2" />
      <path d="M17 11a7 7 0 0 1-7-7" stroke="#25F4EE" />
      <path d="M13 15 7 9" />
      <path d="m8 16-3 3m0 0h5m-5 0v-5" />
      <circle cx="16" cy="8" r="1.5" fill="currentColor" />
    </svg>
  );
}

export function TrajectoryVectorIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20C4 13 9 7 17 5" strokeDasharray="2 2" strokeOpacity="0.5" />
      <path d="m14 3 6 2-2 6" stroke="#25F4EE" />
      <circle cx="4" cy="20" r="2" fill="currentColor" />
      <circle cx="12" cy="10" r="1" fill="#FE2C55" />
    </svg>
  );
}



