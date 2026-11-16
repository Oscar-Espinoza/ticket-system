# Interface language: glossary and rules

Taller's interface comes in English (`en`, the base) and Spanish (`es`).
Messages live in `messages/{locale}.json` (shared `common_*` keys and app-wide
strings) and `messages/<area>/{locale}.json` (one folder per area: `issues`,
`projects`, `settings`, `auth`, `editor`). Paraglide compiles them to
`src/lib/paraglide` (generated, not committed); code imports `m` from
`@/lib/i18n`.

## Spanish voice

Neutral Spanish, for any Spanish-speaking reader (Oscar, 2026-11-15):

- **"tú"**, never "vos" or "usted": *Crea un ticket*, *Tu bandeja de entrada*,
  *Inténtalo de nuevo*, *¿Quieres eliminarlo?*
- No regional words: *computadora/ordenador* → avoid both (say *dispositivo*);
  *celular/móvil* → *teléfono*; *guardar*, not *salvar*; *correo*, not *mail*.
- Short and plain, like the English. Sentence case (only the first word
  capitalised), as in English. Opening marks: *¿…?*, *¡…!*.
- Keep the English's punctuation style: `…` (one character) for "in progress"
  and placeholders, curly apostrophes and quotes.

## Product terms

| English (UI) | Spanish | Notes |
|---|---|---|
| Issue, Ticket | Ticket | masc.: *el ticket, los tickets, un ticket nuevo* |
| Project (also "Team" in workspaces) | Proyecto | *Equipo* only where the English says "team" for people |
| Cycle | Ciclo | |
| Inbox | Bandeja de entrada | |
| Backlog | Pendientes | the state/column; "in the backlog" → *en pendientes* |
| Workspace | Espacio de trabajo | |
| Epic | Épica | fem. |
| Initiative | Iniciativa | |
| Roadmap | Hoja de ruta | |
| Triage | Clasificación | verb: *clasificar* |
| Label | Etiqueta | |
| Assignee | Responsable | "Assign to me" → *Asignarme* |
| Priority: Urgent / High / Medium / Low / No priority | Urgente / Alta / Media / Baja / Sin prioridad | |
| Status / State | Estado | |
| Due date | Fecha de vencimiento | |
| Estimate | Estimación | |
| Sub-issue | Subticket | |
| Comment | Comentario | |
| View | Vista | |
| Draft | Borrador | |
| Customer / Request | Cliente / Solicitud | |
| Member / Admin / Guest / Owner | Miembro / Administrador / Invitado / Propietario | |
| Invite | Invitar / Invitación | |
| Sign in / Sign up / Sign out | Iniciar sesión / Crear cuenta / Cerrar sesión | |
| Settings | Configuración | |
| Waiting on | En espera de | |
| Follow-up | Seguimiento | |
| Archive / Trash | Archivo / Papelera | |
| Insights / Dashboard | Estadísticas / Panel | |

Not translated: brand and product names (Taller, GitHub, GitLab, Bitbucket,
Slack, Sentry, Google, Claude, ChatGPT, MCP, SAML, OIDC, SCIM, API, OAuth),
keyboard keys, code, URLs, issue keys (`TEN-12`), and anything users write
(titles, descriptions, comments, project/label/state names, custom fields).
MCP tool names and API fields stay English.

## Keys

- `snake_case`, prefixed by area: `issues_…`, `projects_…`, `settings_…`,
  `auth_…`, `email_…`, `editor_…`. Shared words live in `messages/{locale}.json`
  as `common_…` (Cancel, Save, Delete, …): use them before adding your own.
- One key per sentence or label, never a sentence glued from pieces: word order
  differs between languages. Put values in parameters: `"Moved {key} to
  {project}"`.
- Same keys in every locale (the guard test checks it, and that no key is
  defined twice).

## Plurals

Never `count === 1 ? … : …` or `pluralize()` for interface text: use a plural
message.

```json
"issues_selected_count": [
  {
    "declarations": ["input count", "local countPlural = count: plural"],
    "selectors": ["countPlural"],
    "match": {
      "countPlural=one": "{count} issue selected",
      "countPlural=other": "{count} issues selected"
    }
  }
]
```

```svelte
{m.issues_selected_count({ count: selected.length })}
```

## Dates, times and numbers

Use the helpers in `src/lib/i18n.ts` (`formatDate`, `formatNumber`,
`dateFormat`, `numberFormat`, `relativeTimeFormat`) or `relativeTime` /
`formatDueDate`; never `new Intl.DateTimeFormat('en' | 'en-US' | undefined, …)`
or `toLocaleDateString()` without a locale. They follow the current language.

## Emails and notifications

They go out in the recipient's language: `recipientLocale(userId)` /
`recipientLocaleByEmail(email)` and `withLocale(locale, () => build())` from
`src/lib/server/i18n.ts`. Users who never chose a language get English.

## Checking

- `npm run i18n:compile` after editing messages when no dev server is running.
- `src/tests/i18n-guard.test.ts` fails on hardcoded English in `.svelte` files.
  Exceptions: `src/tests/i18n-allowlist/*.json` (whole file, with a reason) or
  an `i18n-ignore` comment on the line.
