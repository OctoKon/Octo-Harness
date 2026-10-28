# Splyce Desktop UI/UX Prototype (Canonical Reference)

**Status:** Canonical UI/UX Specification  
**Approved by:** @mdsiddiqx (UI/UX Lead & Owner)  
**Port / Live Preview:** `http://localhost:4321/`  
**Stack:** Svelte 5 (Runes) + TypeScript + Vite

---

## Overview

This package serves as the **canonical UI/UX design and interaction model** for the Splyce Windows desktop application. All native desktop shell implementations (`apps/desktop/src`) inherit and align with the visual and spatial paradigms established here.

## Core Design Principles

1. **Work-First Stage:**
   - Motto: *"Barebones by default. Modular by choice. Evidence by design."*
   - Immediate access to task drafting, workspace picker, base branch selection, and recent runs.
2. **Typography & Aesthetics:**
   - Display/Headers: `Crimson Text` serif.
   - Body & Interface: `@fontsource-variable/geist` sans.
   - Warm, low-contrast neutral surfaces with instant Dark/Light mode theme toggle (`splyce.theme`).
3. **Collapsible Workspace Rail & Navigation:**
   - Foldable sidebar with quick navigation to **Work**, **Runs**, **Memory**, **Models**, **Extensions**, and **Settings**.
   - Accessible keyboard focus, escape dismissals, and visible status badges.
4. **Evidence & Run Stream:**
   - Inline diff inspection with line comments.
   - Step-by-step turn execution cards with receipts and verification logs.
   - Anti-race single-use approval cards.

## Running Locally

To run the standalone preview server:

```bash
cd apps/desktop/prototype
npm ci
npm run build
npm run preview -- --port 4321 --host
```

Open `http://localhost:4321/` in any modern web browser.
