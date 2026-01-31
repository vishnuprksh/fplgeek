# Bug Fixes Log

| Date | Bug Title | Source | Root Cause | Fix Summary | Risk |
|------|-----------|--------|------------|-------------|------|
| 2026-01-31 | Pitch View CSS Layout Broken | User Report | Missing standard CSS import in `PitchView.tsx` | Added `import './PitchView.css'` to `PitchView.tsx` to restore grid layout and styling | Low |
