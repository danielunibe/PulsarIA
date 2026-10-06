# Pulsaria Design System

> **Source of truth**: `lib/design-tokens.ts` (TS) + `app/globals.css` (CSS custom properties)
> **Product identity**: Pulsaria is an intelligent media library with a cinema experience — dark premium aesthetic, glassmorphism, and TikTok-inspired chromatic identity.

## 1. Product Identity and Design Thesis

Pulsaria is a desktop media library app (Tauri 2 + Next.js 16) that treats media browsing as a cinema experience. The design thesis is **intelligent immersion**: the UI recedes, the content advances, and the product feels like a premium private theater rather than a file manager.

Key qualities:

- **Dark-first**: every theme is dark. No light-mode switch.
- **Glassmorphism**: surfaces float over an aurora WebGL backdrop via `backdrop-filter: blur(40px)`.
- **Cinema mode**: spatial cover flow with a dock player, ambient backlight, and idle auto-hide.
- **TikTok chromatic DNA**: hot pink (`#fe2c55`) + cyan (`#25f4ee`) as the default accent pair.
- **Quiet confidence**: the app is not loud by default; accents are used sparingly for primary actions and status.

## 2. Themes

Pulsaria ships with six dark themes, all dark-first. The active theme is set via the `data-theme` attribute on the root element.

| Theme | Accent | Surface base | Vibe |
|-------|--------|--------------|------|
| `chromatic` (default) | `#fe2c55` pink + `#25f4ee` cyan | `#0a0b0f` | TikTok-inspired, vibrant |
| `carbon` | `#94a3b8` slate | `#111317` | Grayscale, neutral, cinematic |
| `aurora` | `#25f4ee` cyan | `#06201b` | Northern lights, monochrome cyan |
| `oled` | `#ffffff` white | `#000000` | Pure black, maximum contrast |
| `cyberpunk` | `#c084fc` purple | `#11071e` | Neon purple, futuristic |
| `solar` | `#f59e0b` amber | `#1c0a06` | Warm amber, golden hour |

Theme switching is handled via CSS custom properties on `[data-theme="..."]` selectors in `app/globals.css`. All surface, accent, and shadow tokens are overridden per theme.

## 3. Color System

### 3.1 Surface Tokens

Surfaces follow a neumorphic depth model with glassmorphism.

| Token | Chromatic value | Role |
|-------|-----------------|------|
| `--surface-deep` | `#07080b` | Deepest background, below all content |
| `--surface-base` | `#0a0b0f` | App background, body |
| `--surface-raised` | `rgba(24, 25, 31, 0.7)` | Elevated panels, cards with blur |
| `--surface-float` | `rgba(24, 25, 31, 0.85)` | Floating surfaces (sidebar, dock) with stronger blur |
| `--surface-sidebar` | `#0e1017` | Navigation rail background |
| `--surface-border` | `rgba(255, 255, 255, 0.12)` | Subtle borders on glassmorphic surfaces |

The canonical float surface is:

```css
background: var(--surface-float);
backdrop-filter: blur(40px);
-webkit-backdrop-filter: blur(40px);
```

### 3.2 Accent Tokens

| Token | Chromatic value | Role |
|-------|-----------------|------|
| `--accent-primary` | `#fe2c55` | Primary action, active state |
| `--accent-cyan` | `#25f4ee` | Secondary accent, play indicator, scanlines |
| `--accent-success` | `#10b981` | Success states, completed actions |
| `--accent-primary-8` | `rgba(254, 44, 85, 0.08)` | Subtle tinted backgrounds |
| `--accent-primary-12` | `rgba(254, 44, 85, 0.12)` | Hover backgrounds, focus rings |
| `--accent-primary-20` | `rgba(254, 44, 85, 0.20)` | Active/pressed backgrounds |

### 3.3 Text Opacity Scale

Text uses opacity rather than fixed colors to maintain legibility across themes.

| Token | Value | Use |
|-------|-------|-----|
| `--text-ghost` | `rgba(255, 255, 255, 0.20)` | Disabled, decorative |
| `--text-muted` | `rgba(255, 255, 255, 0.45)` | Secondary info, captions |
| `--text-default` | `rgba(255, 255, 255, 0.80)` | Body text, labels |
| `--text-strong` | `rgba(255, 255, 255, 0.95)` | Headlines, active states |

### 3.4 Contrast Requirements

All text combinations must meet or exceed WCAG 2.1 AA:

- Body text (≤17 px): 4.5:1 minimum against surface.
- Large text (≥18 px or bold ≥14 px): 3:1 minimum against surface.
- UI components and graphical objects: 3:1 minimum against adjacent surface.

The default `--text-default` (`rgba(255,255,255,0.80)`) against `--surface-base` (`#0a0b0f`) yields approximately 12.6:1.

## 4. Typography

### 4.1 Font Stack

```css
--font-tiktok: 'TikTokFont', 'TikTok Sans', 'Plus Jakarta Sans', 'Proxima Nova',
               -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
               'Helvetica Neue', Arial, sans-serif;

--font-tiktok-display: 'TikTokDisplayFont', 'TikTokFont', 'TikTok Sans', 'Outfit',
                       'Plus Jakarta Sans', 'Proxima Nova', -apple-system, sans-serif;
```

Monospace (data, counters, metadata):

```css
font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
```

### 4.2 Type Scale

| Token | Size | Use |
|-------|------|-----|
| `--text-micro` | 10 px | Micro metadata, timestamps, badges |
| `--text-sm` | 11 px | Small labels, secondary text, cinema meta |
| `--text-base` | 13 px | Body text, card titles, sidebar labels |
| `--text-md` | 15 px | Subheadings, section headers |
| `--text-lg` | 17 px | Display text, headlines |

Line-height target: 1.4–1.6 for body, 1.25–1.35 for headlines.

### 4.3 Weight Rules

- System font for navigation and controls.
- Brand can live in display text, content, and moments.
- Small text (≤11 px) avoids light and thin weights to preserve legibility.

## 5. Layout

### 5.1 Window Frame

- **Rounded corners**: 22 px on the window frame (`.pulsaria-window-frame`).
- **Transparent background**: applied when `html[data-native="true"]` is set by Tauri.
- **Cinema host**: inherits the 22 px radius in windowed mode; radius is removed in native fullscreen (`:fullscreen`).

```css
html[data-native="true"] .pulsaria-window-frame {
  background: var(--surface-base);
  border-radius: 22px;
}
```

### 5.2 Sidebar Rail Navigation

- Vertical navigation rail (not a tab bar).
- Minimum 44 px hit area per icon button (matching iOS standard for touch comfort).
- Hidden on narrow viewports or collapsible via user preference.
- At most two levels of hierarchy.
- Does not hold critical actions at the bottom.

### 5.3 Cinema Spatial Cover Flow

- Stage height: `min(76vh, 720px)`.
- Perspective: `1600px`.
- Central card: `clamp(300px, 34vw, 420px)` × `clamp(520px, 70vh, 680px)` with 22 px radius.
- Lateral cards offset by ±260 px (immediate) and ±300 px (far), with 3D rotation and reduced opacity.
- Transitions: 480 ms cubic-bezier(0.22, 0.8, 0.2, 1).

### 5.4 Grid / List / Compact Views

- Video cards support three density modes.
- Grid: responsive columns with `clamp()` widths.
- List: horizontal thumbnail + metadata row.
- Compact: icon-only thumbnail with tooltip metadata.

## 6. Components

### 6.1 Navigation Rail Buttons

- Icon-only buttons with tooltip labels.
- 36–44 px hit area.
- Active state: accent color fill or underline.
- Hover: subtle background tint (`--accent-primary-8`).

### 6.2 Video Cards

- Three density modes: grid, list, compact.
- Hover autoplay preview (muted, seamless loop).
- Glassmorphic overlay with title, author, and metadata.
- Shadow: `0 20px 50px rgba(0,0,0,0.8)` + inset highlight.

### 6.3 Cinema Mode Components

- **Spatial cover flow**: 3D card carousel with depth.
- **Dock player**: floating pill-shaped transport bar with play/pause, scrubber, volume, speed toggle, AI toggle.
- **Edge navigation**: wide invisible hit zones with subtle chevrons.
- **Auto-hide idle**: header, footer, edge nav, and card meta fade out after inactivity.

### 6.4 Header Tool Buttons

- Tool buttons live in the header, not in a tab bar.
- Hover state: background tint + subtle scale.
- Focus-visible: 2 px accent ring.
- Window controls: drag region + traffic-light buttons (Windows: minimize, maximize, close).

## 7. Motion

### 7.1 Cinema Transitions

- Enter veil: 760 ms cubic-bezier(0.22, 1, 0.36, 1).
- Exit veil: 460 ms cubic-bezier(0.76, 0, 0.24, 1).
- Shell fade-out: 680 ms.
- Interface enter: 760 ms with slight overshoot scale.

### 7.2 Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  .cinema-root *,
  .cinema-root *::before,
  .cinema-root *::after {
    animation-duration: 1ms !important;
    transition-duration: 1ms !important;
    scroll-behavior: auto !important;
  }
}
```

All non-essential motion is disabled under `prefers-reduced-motion: reduce`.

### 7.3 Hover Autoplay

Video cards preview playback on hover (desktop only). Autoplay is muted and loops. The preview is pausable via keyboard focus (space/enter).

## 8. Accessibility

### 8.1 Focus Management

- All interactive elements have `:focus-visible` styles.
- The global `outline: none !important` in `globals.css` is a known accessibility debt item (see Design Gate).
- Focus rings use `--accent-primary-12` tint: `box-shadow: 0 0 0 3px rgba(254,44,85,0.12)`.
- Cinema edge nav and cover flow cards are keyboard-navigable (left/right arrows).

### 8.2 Screen Readers

- Icon-only nav buttons have `aria-label` text.
- Video cards expose title, author, and duration via `aria-describedby`.
- Dynamic content updates (queue progress, playback state) use `aria-live` regions.

### 8.3 Window Controls Hit Area

- Window controls (minimize, maximize, close) have a 36 px minimum hit area to match Apple's 44 pt guidance for desktop.

### 8.4 Cinema Idle Auto-Hide

After 3 seconds of inactivity in cinema mode:

- Header meta (counter, exit button) fades out.
- Footer dock fades out.
- Edge navigation chevrons fade out.
- Card topbar and meta line fade out.
- Brand mark remains at 35% opacity as a location indicator.

Motion is disabled entirely under `prefers-reduced-motion: reduce`.

## 9. Glassmorphism

### 9.1 Blur Rules

- Blur is applied **only on floating functional layers** (sidebar, dock, floating panels).
- Blur is **not** applied on content surfaces (video cards, scrollable lists) to avoid performance degradation and visual noise.
- Canonical float surface:

```css
background: var(--surface-float);
backdrop-filter: blur(40px) saturate(1.18);
-webkit-backdrop-filter: blur(40px) saturate(1.18);
```

### 9.2 Cinema-Specific Glass

- Dock player: `blur(28px)` at lower opacity (`rgba(14, 17, 22, 0.74)`).
- Copilot drawer: `blur(30px)`.
- Ingest box segmented control: `blur(20px) saturate(145%)`.

## 10. Dark Mode

All themes are dark-first. There is no light-mode switch. The system respects:

- `prefers-color-scheme: dark` is implicit; the app never queries for light mode.
- `prefers-contrast: more` can be honored via a future theme override.

## 11. Spacing and Rhythm

- Base scale: multiplicative of 4 px (`--space-1` through `--space-6`).
- Card padding: 16–24 px.
- Section gaps: 12–24 px.
- Inline gaps: 6–10 px.

## 12. Cross-Reference to Apple Design Skill

Pulsaria uses `.agents/skills/apple-design/` as the authoritative Design Gate auditor. The skill applies Apple's Human Interface Guidelines as a benchmark for cross-platform desktop quality.

- **Skill location**: `.agents/skills/apple-design/`
- **Audit command**: `.kilo/command/apple-design-review.md`
- **Improvement command**: `.kilo/command/apple-design-improve.md`
- **Skill references**: `references/hig/*.md`, `references/hig-lookup.md`, `references/cross-platform.md`

When in doubt about a design decision, consult the skill's five-lens audit (accessibility, platform conventions, visual design & craft, interaction, content/writing) and the HIG pages it cites.

## 13. Maintenance

- **Token changes**: update both `lib/design-tokens.ts` and `app/globals.css`.
- **Theme additions**: add a new `[data-theme="..."]` block in `globals.css` and a matching entry in the theme picker component.
- **Audit cadence**: run the Design Gate before each major release and after any significant layout or theme change.
