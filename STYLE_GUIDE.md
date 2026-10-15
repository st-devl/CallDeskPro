---
name: Apex Leadflow
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#45474c'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#75777d'
  outline-variant: '#c5c6cd'
  surface-tint: '#545f73'
  primary: '#091426'
  on-primary: '#ffffff'
  primary-container: '#1e293b'
  on-primary-container: '#8590a6'
  inverse-primary: '#bcc7de'
  secondary: '#0051d5'
  on-secondary: '#ffffff'
  secondary-container: '#316bf3'
  on-secondary-container: '#fefcff'
  tertiary: '#00190e'
  on-tertiary: '#ffffff'
  tertiary-container: '#00301e'
  on-tertiary-container: '#00a472'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d8e3fb'
  primary-fixed-dim: '#bcc7de'
  on-primary-fixed: '#111c2d'
  on-primary-fixed-variant: '#3c475a'
  secondary-fixed: '#dbe1ff'
  secondary-fixed-dim: '#b4c5ff'
  on-secondary-fixed: '#00174b'
  on-secondary-fixed-variant: '#003ea8'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.025em
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.02em
  headline-sm:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0.005em
  label-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.04em
  tabular-numeric:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: -0.01em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-compact: 0.75rem
  margin: 1.5rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1.25rem
  space-xl: 2rem
---

## Brand & Style

This design system delivers an ultra-clean, hyper-focused interface tailored for high-volume call centers and lead conversion pipelines. The aesthetic merges clinical modern minimalism with high-speed operational ergonomics. By discarding ornamental distractions, decorative gradients, and visual noise, the interface prioritizes operator cognitive bandwidth, rapid lead assessment, and friction-free interaction workflows.

The visual style is characterized by:
- Pure white workspaces set against calm, cool-slate structural panels.
- Micro-elevation using hairline borders rather than heavy ambient occlusion.
- High-contrast, scannable data hierarchies optimized for rapid parsing during live calls.
- Tactical semantic micro-indicators that surface lead health, status velocity, and queue positions instantly.

## Colors

The palette establishes an authoritative, calm, and distraction-free operational environment. Surfaces rely on bright optical clarity, while data elements use high-contrast ink values.

### Core Roles
- **Base Canvas (`#FFFFFF`)**: Pure white primary workspace for cards, data tables, and modal dialogues.
- **Surface Secondary (`#F8FAFC`)**: Cool off-white for app framing, sidebar navigation, and read-only preview panels.
- **Surface Elevated (`#F1F5F9`)**: Subtle gray for input fills, hover transitions, and inactive item chips.
- **Structural Outlines (`#E2E8F0`)**: 1px low-contrast dividers, borders, and component boundaries.
- **Primary Ink (`#0F172A`)**: Deep slate for headlines, lead names, critical values, and focused controls.
- **Secondary Ink (`#64748B`)**: Muted slate for metadata, labels, timestamps, and secondary actions.

### Functional Semantics
- **Command Slate (`#1E293B`)**: Foundational primary tone for structural framing, core triggers, and dominant controls.
- **Interactive Indigo (`#2563EB`)**: Targeted accent for real-time cues, active links, primary system progress, and WhatsApp integrations.
- **Positive / Converted (`#10B981` on `#ECFDF5`)**: Soft emerald tone for positive dispositions, successful conversions, and reachable contact statuses.
- **Negative / Disqualified (`#EF4444` on `#FEF2F2`)**: Soft rose tint for unreached leads, lost opportunities, and urgent alerts.
- **Pending / Scheduled Follow-up (`#F59E0B` on `#FFFBEB`)**: Muted amber for callbacks, queued actions, and mid-funnel stages.

## Typography

Typography relies entirely on the geometric precision and clarity of Inter. With uniform vertical rhythm and subtle optical tracking adjustments, copy maintains legibility across density-heavy interfaces.

- **Numerics**: Monospaced tabular numerals (`tabular-numeric` / `font-variant-numeric: tabular-nums`) must be activated across call timers, queue counts, phone numbers, and conversion percentages to eliminate visual layout shifts.
- **Labels**: Micro-labels (`label-sm`) use uppercase transforms paired with extended letter spacing (`0.04em`) to establish visual separation above input groups and metrics without visual bulk.
- **Vertical Rhythm**: Generous line-heights on body copy prevent ocular fatigue across extended operator shifts.

## Layout & Spacing

The layout is built upon an operational multi-column grid configured for high-density responsiveness:

- **Sidebar Anchor**: Collapsible utility sidebar (64px collapsed, 240px expanded) docked at the left viewport boundary.
- **Work Area**: 12-column dynamic fluid layout with strict 16px (`1rem`) gutters and 24px (`1.5rem`) canvas margins.
- **Panel Ergonomics**: The core screen architecture follows a primary split-pane pattern:
  - Lead Queue / Feed: 340px-400px fixed or proportional width.
  - Active Lead Dossier: Fluid flex column containing real-time script cues, lead histories, and quick disposition drawers.
- **Density Controls**: Standard operational density utilizes `space-sm` (8px) for inline actions and `space-md` (12px) for stack spacing, while data tables compress down to 40px row heights.

## Elevation & Depth

Visual hierarchy uses crisp boundary containment paired with ultra-subtle micro-shadows, avoiding dark or murky drops.

- **Level 0 (Flat)**: Background workspaces (`#F8FAFC`) with no shadow.
- **Level 1 (Card & Row Panels)**: `#FFFFFF` surfaces bounded by a 1px solid `#E2E8F0` border and backed by a feather micro-shadow: `0 1px 3px 0 rgba(15, 23, 42, 0.04)`.
- **Level 2 (Popovers, Select Menus & Drawers)**: 1px border `#E2E8F0` with elevated floating shadow: `0 4px 12px -2px rgba(15, 23, 42, 0.06), 0 2px 4px -2px rgba(15, 23, 42, 0.03)`.
- **Level 3 (Modal Dialogues & Alerts)**: Crisp containment against dimming backdrop (`rgba(15, 23, 42, 0.35)` with `backdrop-filter: blur(2px)`): `0 12px 24px -4px rgba(15, 23, 42, 0.1)`.

## Shapes

The interface balances crisp geometric precision with soft 10–14px radiuses that humanize repetitive data surfaces without feeling playful.

- **Standard Elements (Buttons, Inputs, Selectors)**: 10px corner radius (`roundedness: 2`).
- **Surface Containers (Data Cards, Modal Dialogs, Floating Panels)**: 12px–14px corner radius (`rounded-lg`).
- **Micro Tokens (Status Pills, Badges, Tag Markers)**: Fully rounded capsule/pill (`9999px`) to visually differentiate metadata tags from clickable interface actions.

## Components

### Buttons
- **Primary Action ("Sıradakini Al" / Next Lead)**: Solid `#1E293B` background with `#FFFFFF` text. Height: 42px. Font: 14px medium. Hover state shifts to `#0F172A` with a micro-scale of 0.99.
- **Secondary / Communication (WhatsApp Action)**: `#FFFFFF` fill, 1px `#E2E8F0` border, `#0F172A` text, with leading brand icon in `#10B981`. Hover switches background to `#F8FAFC`.
- **Semantic Call Triggers**: 
  - Call/Connect: `#10B981` text, `#ECFDF5` background, hover `#D1FAE5`.
  - Terminate: `#EF4444` text, `#FEF2F2` background, hover `#FEE2E2`.

### Chips & Disposition Selectors
Interactive outcome tags for immediate post-call classification:
- Base: 32px height, 12px horizontal padding, 9999px radius, 13px font weight 500.
- State: "Olumlu" (Positive): `#ECFDF5` base, `#065F46` label, 1px `#A7F3D0` border.
- State: "Olumsuz" (Lost/Invalid): `#FEF2F2` base, `#991B1B` label, 1px `#FECACA` border.
- State: "Tekrar Aranacak" (Follow-up): `#FFFBEB` base, `#92400E` label, 1px `#FDE68A` border.

### Tabular Layouts
- **Header**: `#F8FAFC` background, 36px height, uppercase 11px `#64748B` labels, bottom border 1px `#E2E8F0`.
- **Row**: `#FFFFFF` background, 48px height, 1px bottom border `#F1F5F9`. Hover state shifts cleanly to `#F8FAFC`. Phone and time columns apply tabular-numeric font settings.

### Input Fields
- Flat background (`#FFFFFF` or `#F8FAFC` on white cards), 40px height, 10px radius, 1px `#E2E8F0` border.
- Focus: Border switches to `#2563EB` with an outer glow: `0 0 0 3px rgba(37, 99, 235, 0.12)`. No harsh browser outlines.

### Cards & Panels
- Clean white surface with 1px `#E2E8F0` border, 12px radius, and Level 1 micro-shadow. Section dividers within cards use 1px `#F1F5F9` rules.
