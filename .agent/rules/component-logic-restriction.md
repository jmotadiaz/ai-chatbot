---
trigger: glob
globs: {components,app}/**/*.tsx
---

Components must not contain imperative logic within them. The logic should be extracted into hooks or functions within their corresponding lib/feature. Components should only be responsible for presentation and composition using the logic housed in lib/features.
