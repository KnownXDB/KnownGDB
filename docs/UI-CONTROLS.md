# Interface controls and feedback

All public and administrative forms use the shared Tailwind-styled controls and
application feedback. Use the shared Disclosure for expandable sections and shared Select for menus; retain a form-compatible
value and support keyboard interaction. Do not introduce browser-native select,
date or time popovers. File selection must use the browser's operating-system
file chooser; style its visible trigger and never pretend a web page can replace
that security boundary.

Report validation errors next to the affected field, identify the field for
assistive technology and keep focus actionable. Do not use browser validation
bubbles, alert, confirm or prompt. Use the shared confirmation dialog for
in-application navigation that would discard changes. Browser refresh, tab
closure and external navigation cannot be intercepted with a custom modal; avoid
claiming that these actions are protected from unsaved-data loss.

Use real labels, focus indicators, keyboard support and visible busy, success
and error feedback. Keep validation and authorization on the server as well.


Design values are centralized in `packages/ui/src/tokens.css`: primitive palette,
spacing and size variables preserve existing UI values while semantic aliases such
as `--form-field-gap`, `--form-section-gap` and `--control-height` define shared
component intent. Use semantic tokens for repeated patterns and add new values to
the central file rather than embedding literals in individual screens. Responsive
media-query breakpoints remain literals because custom properties cannot be used
in media query conditions. Inline SVG data and relative layout units remain local.
