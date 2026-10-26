# S3-F3a: design system v2: seasonal tokens, season switching, Appearance setting, shared components (owner: cursor-exec)

S3-F3 is split. **F3a (this task)** migrates the visual system to v2 on the existing pages, with no layout redesign. **F3b (next)** builds the leader's week view on the canvas surface.

Read first, carefully: `DESIGN.md` "设计系统 v2" (lines 39–198: tokens, surfaces, season switching, typography, radii, components, markers, type icons, motion, WeChat limits, migration). That section is the spec; where it and older sections conflict, v2 wins. Also `miniprogram/app.wxss`, `custom-tab-bar/`, `components/`, `pages/me/`, `utils/locale.js` (the per-device setting pattern to copy), `scripts/screens.js`.

Do not run git. Do not edit `miniprogram/domain/`, `store/`, `data/`, `viewmodels/`, `i18n/index.js`, `cloudfunctions/` or their tests. If a view model emits an old tone name you need remapped and you cannot do it in the template layer, tell the lead. Locale keys in `i18n/zh-CN.js` / `en.js`, proper UTF-8 Chinese.

## 1. Tokens (`app.wxss`)
- Paper tokens per the 纸面 table (`--bg`, `--card`, `--ink*`, `--icon`, `--line`, `--mute`, `--cancel`, `--disabled`), shared by all seasons.
- Seasonal tokens per the 四季主色 table (`--accent`, `--accent-press`, `--accent-soft`, `--canvas-a`, `--canvas-b`, `--highlight`, `--on-highlight`) under `.season-spring`, `.season-summer`, `.season-autumn`, `.season-winter`. Brand blue = the summer set.
- Canvas tokens (`--canvas-c`, `--glass*`, `--on-canvas*`) defined now even though only F3b uses the canvas.
- Migration: rename `--primary*` → `--accent*`; remove `--warn*`, `--ok*`, `--danger*` (→ `--cancel`) and `--vehicle`. No old token name may remain anywhere (`npm run check` or a test should catch it; add a small Node test that greps `miniprogram/**/*.wxss` for the retired names).
- Radii and spacing per "圆角、间距、阴影" for paper (card 16, primary button 16, sheet top 24, pills 999; spacing step 20 added).

## 2. Season (`utils/season.js`, new)
- `seasonFor(date)`: meteorological northern seasons from a `YYYY-MM-DD` date (3–5 spring, 6–8 summer, 9–11 autumn, 12–2 winter).
- `currentSeason()`: setting `auto` → today's date in the viewer's zone (use the same clock and viewer zone as the pages, so the demo date 2026-10-24 gives autumn); a fixed setting → that season; `brand` → summer tokens.
- Setting stored on the device only, like the language (`auto | spring | summer | autumn | winter | brand`, default `auto`). "Reset demo data" must not change it.
- `seasonClass()` → `season-autumn` etc. Every page root and the custom tab bar carry it; re-evaluate on page show and when the day changes (the existing minute clock is enough). Paper nav bars stay white.
- Node tests: month boundaries, the viewer-zone date (a UTC instant that is already the next month in Asia/Shanghai), fixed and brand settings, a storage failure falls back to `auto`.

## 3. Me → Appearance (外观 / Appearance)
A row on Me opening a paper sheet or page with the six options and a small swatch of each season's `--accent`. Selecting applies at once (current page and tab bar) and persists.

## 4. Shared components on paper (v2)
- **Status markers** per "提示标记" (paper column): pending confirmation and awaiting dispatch → `--accent` text on `--accent-soft`; updated → `--accent` dot + text; important → `--accent` outline pill; cancelled / rejected / error → `--cancel`; finished / done → `--mute` with a check icon. Map the existing tones in the template/component layer.
- **Type icons instead of colour bars**: meeting, trip, visit, milestone, vehicle each a line icon + text; remove the meeting blue bar and the vehicle amber bar.
- **Tab bar**: icon + 11px label; selected = opaque + 4px dot below (`--accent` on paper); unselected 60% opacity; white background on paper pages. Keep F1a's role tab sets and the leader ＋ (44px white circle with a thin line on paper).
- **Buttons, cells, sheets, chips, banners, state-view**: move to the v2 tokens and radii. Success banners use `--accent-soft`.
- Give 待办 and 来访 their own icons now (F1a reused the meetings icon); give the driver's 任务 tab its own icon. Simple line icons in the existing format (SVG or PNG as the repo already does); no external downloads.

## 5. Terminology
DESIGN.md: the home tab is 行程 / Itinerary for leaders and secretaries. Update the locale strings and `i18n/glossary.md` accordingly (日程 → 行程 where it names the tab or page title; keep 日程 where it means a calendar entry in general only if the glossary says so).

## 6. Screens (`scripts/screens.js`)
- Keep all 124 runs passing (demo date → autumn).
- Add a four-season comparison: the schedule page and the vehicles list in each of spring, summer, winter and brand blue (autumn is the default runs), both locales; plus the Appearance sheet. Drive the season through a demo-only hook (for example `__dev.setSeason('spring')`), reset between scenarios.
- Look at the screenshots yourself and check the contrast notes in DESIGN.md line 106; report any pair that looks under 4.5 : 1.

## 7. Checks
`npm test` (once; the lead runs three zones), `npm run check`, `npm run screens`. No `\u` escapes, no BOM, ≤ 100 columns in JS, no secrets.

## Reply with
Files added and changed, the token map (old → new), where the season class is applied, icons added, the screens totals, contrast concerns, and open questions (product questions go to the lead; do not invent product rules).
