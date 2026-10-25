---
name: Splyce frontend
description: One task in focus, with context and review within reach
colors:
  ink: "#292923"
  ground: "#faf9f5"
  surface: "#ffffff"
  muted: "#716f65"
  coral: "#a34d2e"
  coral-light: "#efb18b"
  sand: "#eee9dc"
typography:
  body:
    fontFamily: "Manrope, Arial, sans-serif"
    lineHeight: 1.7
rounded:
  control: "18px"
  panel: "24px"
  composer: "26px"
  hero: "34px"
---

# Splyce frontend design

## Overview

A task-first workspace with four main destinations: Build, Runs, Memory and Models. A single Settings entry opens a dedicated area with Appearance & data, Permissions, Extensions and Research tabs. Source-linked research stays separate from simulated execution.

## Colors

Warm charcoal, ivory and sand establish the light interface; copper identifies primary actions and olive supports secondary emphasis. Dark mode uses neutral gray: page `#151515`, panels `#212121` and sidebar `#1b1b1b`, with separate header and composer elevation. No blue or purple palette is used. Status colors always include text. Light, Dark and System modes apply to the complete page. System follows the device setting and updates when it changes.

## Typography

Manrope is bundled under its retained open font license. Consolas is used only for code and identifiers. Main actions and task names take precedence over metadata.

## Layout

The desktop sidebar is 216px and narrows to 185px at 880px. Below 640px it becomes a drawer with a backdrop, Escape handling and contained keyboard navigation. The product page stacks its explanation and interactive sample on phones. The task composer remains the main workspace action.

## Elevation & Depth

Fine borders and tonal fields separate most content. The interactive specimen and notifications use soft neutral shadows. The specimen stays level. Device and explicit reduced-motion preferences disable interface transitions.

## Shapes

The splice-junction emblem pairs an open octagonal loop with a copper interlocking strand. Its silhouette remains legible in light and dark modes, and the matching SVG favicon follows the device theme. Buttons, panels and the composer use generous curves. Mobile panels retain rounded corners without reducing usable task width.

## Components

Appearance choices and the header theme switch apply immediately, save to browser storage and preserve unsaved workspace-name edits. A separate reduced-motion preference is saved immediately. Navigation uses consistently sized, outlined SVG icons on a shared alignment grid. Local model summaries show saved model IDs without promising connected providers. Memory entries expose their original sources and saved state. Run detail shows fictional evidence as fictional. Reset offers undo while Settings remains open.

The sidebar omits the former storage-status block and expanded controls list. Settings tabs keep configuration in the content area. The website closes with a dedicated call to action and structured workspace, research, contribution and license links.

The optional Define success section captures acceptance criteria and a planned verification command. It stays collapsed by default. Drafts, run records and task reuse preserve these fields; planned checks never appear as executed receipts.

## Do's and Don'ts

Do preserve local-only product scope and clear prototype labels. Do keep one obvious next action. Do retain readable focus indicators and status text. Do not present a model label as a loaded model, a sample receipt as executed evidence, or a UI switch as runtime enforcement.
