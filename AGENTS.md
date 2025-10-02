# Repository Agent Instructions

## General Guidelines
- Maintain clear separation between HTML, CSS, and JavaScript files; avoid inline scripts and styles except for critical fixes.
- Favor semantic HTML5 structure and accessible ARIA attributes when extending the UI.
- Keep CSS organized with component-level sections and use CSS custom properties for repeated values.
- Write JavaScript using modern ES modules and avoid polluting the global namespace; prefer pure functions.
- Update documentation in the `docs/` directory whenever new features are added or existing ones change.

## Testing & Tooling
- Include instructions for manual verification steps in the README when adding new interactive behavior.
- Prefer lightweight tooling; do not add heavy dependencies without documented justification in the spec.
