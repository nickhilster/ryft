# RyFine Media Package — Implementation Plan

> Status: Implemented on 2026-05-31. This file is preserved as the planning brief for the shipped `/guides` media hub, export workflow, downloadable PDFs, and infographic asset package.

## Overview

Create a visually cohesive media package for the RyFine product consisting of video tutorials, illustrated step-by-step guides, and infographics. All assets must align with RyFine's existing visual identity (colors, typography, logo) and support the three primary goals: **inform**, **engage**, **convert**.

---

## Target Audience

- Developers, content creators, and technical writers using RyFine for prompt refinement
- Familiar with AI tools and prompt engineering
- Value efficiency, clarity, and productivity

---

## Deliverables

### 1. Video Tutorials (2–4 min each)

| # | Title | Format | Length |
|---|-------|--------|--------|
| 1 | Getting Started with RyFine | Screen recording + voiceover | 2–3 min |
| 2 | Boost Mode: Supercharge Your Prompts | Screen recording + voiceover | 3–4 min |
| 3 | Context Files & Relevance Scoring | Screen recording + voiceover | 3–4 min |
| 4 | Saved Prompts & Skills Workflow | Screen recording + voiceover | 2–3 min |

**Structure per video:**
1. Hook / problem statement (15–20 s)
2. Feature introduction (30 s)
3. Step-by-step walkthrough (main body)
4. Use case / best practice example (30–60 s)
5. CTA outro: "Try RyFine now!" with URL on screen

**Accessibility:** Closed captions (auto-generated + reviewed) on all videos.

---

### 2. Illustrated Step-by-Step Guides (PDF + web)

| # | Title | Pages |
|---|-------|-------|
| 1 | Quick Start Guide | 2–3 |
| 2 | How to Use Boost Mode | 3–4 |
| 3 | Working with Context Files | 3–5 |
| 4 | Building and Saving Prompts | 2–3 |

**Structure per guide:**
1. Cover page — feature title, tagline, RyFine logo
2. What it does + why it matters (1 page)
3. Step-by-step instructions with annotated screenshots
4. Use cases & best practices
5. Back page — CTA + QR code linking to RyFine

**Formats:** Export as PDF and render as web page under `/docs` or `/guides` on the RyFine site.

**Accessibility:** Alt text for all images; PDF tagged for screen readers.

---

### 3. Infographics (single-page, web + social)

| # | Title | Primary Channel |
|---|-------|-----------------|
| 1 | How RyFine Refines a Prompt (before/after flow) | Website, LinkedIn |
| 2 | 5 Ways to Get Better AI Outputs with RyFine | Twitter/X, LinkedIn |
| 3 | RyFine Feature Map | Website |

**Structure per infographic:**
- Headline
- Visual flow / comparison / icon grid
- RyFine logo + URL
- CTA: "Learn more at ryfine.com"

**Dimensions:** 1080×1080 (square, social) and 1200×630 (OG/banner, web).

---

## Brand Guidelines to Apply

Pull design tokens and assets from the existing RyFine web UI source (`web/src/`):

- **Colors:** Match CSS variables / Tailwind config from `web/src/` and `web/tailwind.config.*`
- **Typography:** Match font families used in the web app
- **Logo:** Use assets from `resources/` (or wherever the logo SVG/PNG lives)
- **Tone:** Conversational, friendly, jargon-light; never condescending

---

## Content Structure (all formats)

```
1. Introduction to the feature
2. Step-by-step instructions
3. Use cases and best practices
4. Call to action
```

---

## Calls to Action

All pieces must end with at least one of:

- `"Try RyFine now!"` — link to app
- `"Learn more about prompt refinement!"` — link to docs/guides

Place CTAs:
- Videos: verbal + on-screen text in the final 10–15 s
- Guides: back cover + end of each major section
- Infographics: bottom band

---

## Distribution Channels

| Channel | Asset Types |
|---------|------------|
| RyFine website (`/guides`) | Guides (web), infographics, embedded videos |
| YouTube | Video tutorials (full) |
| Twitter/X | Infographics, short video clips (≤60 s) |
| LinkedIn | Infographics, guides (PDF download), full videos |

---

## Implementation Tasks for Copilot

### Phase 1 — Content & Script Writing
- [ ] Write scripts for all 4 video tutorials
- [ ] Write body copy for all 4 step-by-step guides
- [ ] Write headline + body copy for all 3 infographics

### Phase 2 — Design Production
- [ ] Extract brand tokens (colors, fonts) from `web/src/`
- [ ] Design guide templates (cover, body, back-cover) in brand style
- [ ] Design infographic templates (square + banner variants)
- [ ] Apply designs to each guide and infographic deliverable
- [ ] Create video intro/outro motion graphics matching brand

### Phase 3 — Video Production
- [ ] Record screen walkthroughs for each tutorial topic
- [ ] Record or generate voiceover using approved script
- [ ] Edit video with intro/outro, captions, and CTA overlay
- [ ] Export: 1080p MP4 for YouTube, 720p for social clips

### Phase 4 — Web Integration
- [ ] Add `/guides` or `/resources` route to RyFine site
- [ ] Embed guide PDFs + web-rendered versions
- [ ] Embed video players (YouTube iframe or native)
- [ ] Add infographic images with proper alt text
- [ ] Add OG meta tags for all guide/resource pages

### Phase 5 — QA & Accessibility
- [ ] Review captions on all videos
- [ ] Verify all images have descriptive alt text
- [ ] Tag guide PDFs for screen readers
- [ ] Test web pages on mobile (responsive)
- [ ] Stakeholder review + sign-off

---

## Nice-to-Haves (backlog)

- Interactive elements in web guides (e.g., clickable example prompts that open the app)
- Embedded user testimonials or short case studies in guides
- Short-form vertical video cuts (≤60 s) for Instagram/TikTok

---

## Success Metrics

- Guide page views + PDF downloads
- Video view count and watch-time retention (target >60% at midpoint)
- CTA click-through rate from each asset
- New sign-ups attributed to `/guides` referral source

---

_Plan created: 2026-05-31_
