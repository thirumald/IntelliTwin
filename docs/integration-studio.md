# Integration Studio

The **Integrations** entry in the side menu opens the Integration Studio: a place to onboard a data source, discover its fields, map them to the platform's data model, test the transformations and publish a versioned mapping, without writing code.

It follows the "Dynamic Data Mapping Studio" frontend design. This page says what is built, how it was fitted to IntelliTwin, and what a deployment still has to add.

## What is real and what is not

| Part | Status |
| --- | --- |
| Schema discovery from a pasted or uploaded sample (JSON, CSV, XML) | Real, runs in the browser |
| Field mapping, transformations, expressions, live preview | Real |
| Validation: required fields, types, ranges, patterns, allowed values, duplicates | Real |
| Mapping suggestions | Real, rule-based: field names, synonyms, types and sample values. No language model is involved |
| Schema change detection (added, removed, renamed, type changed) | Real, on each new discovery |
| Versions, roll back, templates, custom entity fields | Real, **kept in this browser** (`localStorage`) |
| Connecting to a source system | **Not done.** The app is static and has no server. "Check connection settings" checks that the settings are complete and well formed; it does not open a connection |
| Ingesting data | **Not done.** Publishing records a version; no records flow |
| Monitor figures (records a second, lag, error rate) | **Synthetic**, like the Platform section. The schema-change flag is real |
| Credentials | Never entered. Only a reference to a secret (for example `vault://intellitwin/anpr-vendor/api-key`) is kept |

The example vendors, endpoints and payloads are invented.

## The six steps

| Step | What it does |
| --- | --- |
| 1. Integration type | REST, GraphQL, SOAP, Kafka, MQTT, SQL database, SFTP / file drop, file upload |
| 2. Connect and discover | Connection form, sign-in method and secret reference, schedule; paste or upload a sample; discover the fields, including nested ones (`location.lat`) and the list of records inside a response (`events`) |
| 3. Target entity | Choose the entity of the platform data model to write to |
| 4. Field mapping | Three panels: source fields, connections, target fields. Choose a source then a target (or drag on a computer). Edit each rule under "Mapping properties" |
| 5. Test and validate | Every sample record is transformed and validated; source and result are shown side by side with the errors |
| 6. Publish and monitor | Checklist, publish a version, roll back, pause, copy or download the mapping definition, save as a template |

Two more views sit beside the list of integrations:

- **Schema registry**: the entities, their fields, rules and personal-data (PII) flags; add or remove custom fields, each change raising the entity's schema version.
- **Monitor**: one row per integration with status, rate, lag, mapping error rate and broken rules.

Published integrations created in the studio also appear in **Platform → Data ingestion**.

## Transformations

| Transformation | Use |
| --- | --- |
| Direct, Uppercase, Lowercase, Trim, Text | Copy and tidy text |
| Whole number, Decimal, Scale | Number conversion, rounding, unit changes (multiply and add) |
| Yes / no | Boolean from text |
| Date format | Read a date (`auto`, `epoch-s`, `epoch-ms`, or a pattern such as `dd/MM/yyyy HH:mm:ss`) and write ISO 8601 in UTC. Values without a time zone are read in the zone given (default `+04:00`) |
| Lookup | Replace codes from a table of `source=target` lines, with an optional fallback |
| Replace text | Regular-expression replace |
| Join fields | Many to one: join several source fields with a separator |
| Constant | A fixed value, no source field |
| Expression | A formula: `value > 100 ? 100 : round(value, 1)` |

A source field can feed several rules (one to many). Each target field is written by one rule.

**Expressions** use a small evaluator written for this purpose; they are never run as JavaScript. `value` is the rule's source value and any source path can be used by name. Operators: `+ - * / %`, comparisons, `&& || !`, `a ? b : c`. Functions: `upper lower trim len substr round abs min max number string coalesce contains replace if`.

## Validation codes

`TRANSFORM` a transformation failed · `REQUIRED` a required field is empty · `TYPE` · `RANGE` · `LENGTH` · `PATTERN` · `ENUM` value not allowed · `DUPLICATE` same key as an earlier record (the entity's `key` fields).

A mapping can be published only when the connection settings are complete, the fields are discovered, every required target field is mapped, and every sample record passes.

## How it was fitted to IntelliTwin

The design document recommends React with TypeScript, React Flow, Monaco Editor and a standalone micro-frontend with a GraphQL backend. IntelliTwin is a static application in plain JavaScript with no build step and no server, so the studio was built the same way as the other sections:

| Design document | In IntelliTwin |
| --- | --- |
| React + TypeScript components | `js/integrations.js`, one page module like OSINT and Analytics |
| React Flow canvas | Connection lines drawn in SVG between the two field lists |
| Monaco Editor | Plain text boxes for expressions and lookup tables |
| JSON tree viewer | Discovered-schema table with indented paths |
| UI generated from connector metadata and target schemas | Kept: connectors and entities are metadata in `config.js`, nothing is coded per integration type |
| GraphQL `saveMapping`, `testMapping`, `publishMapping` | Not called. Testing runs in the browser; the mapping is exported in the `MappingRuleInput` shape for a backend to accept |
| AI-assisted suggestions with human approval | Rule-based suggestions, each accepted by a person |
| Schema drift, nested mapping, conditions, templates, versioning and roll back | Built |
| Governance | PII flags, audit log entries, administrator-only editing (demo roles). **No approval workflow and no field-level permissions** |

The mapping logic is separate from the screens: `js/mapping-engine.js` has no page or network access and can be reused in a React micro-frontend or run on a server under Node.

Array handling is limited: the first element of a nested list can be mapped (`items[0].name`); iterating a nested list into child records is not built.

## Files

| File | Purpose |
| --- | --- |
| `js/mapping-engine.js` | Discovery, transformations, expressions, validation, suggestions, schema-change detection |
| `js/integrations.js` | The studio page |
| `config.js` → `integrations` | Connectors, sign-in methods, schedules, entities, example integrations, templates |
| `tools/test_mapping_engine.js` | Tests for the engine: `node tools/test_mapping_engine.js` |

## Settings

Under `integrations` in `config.js`:

| Setting | Meaning |
| --- | --- |
| `connectors` | Connector types. `mode` is `polling`, `streaming` or `file`; `formats` lists the payload formats; `fields` builds the connection form (`type`: `text`, `url`, `select`, `area`) |
| `authTypes`, `pollEvery` | Choices offered for sign-in method and schedule |
| `entities` | The data model. Each field has `name`, `type` (`string`, `integer`, `number`, `boolean`, `datetime`) and optional `required`, `min`, `max`, `pattern`, `enum`, `maxLength`, `pii`, `note`. `key` lists the fields that identify a record |
| `seed` | Example integrations shown on first use. `platformFeed` names the Platform feed an example stands for, so it is not listed twice |
| `templates` | Reusable mappings |
| `apiUrl` | Reserved for a backend; not used yet |

Adding a connector or an entity here makes it appear in the studio with no code change. Editing needs the `integrations` permission, which the administrator role has (`auth.roles`).

"Restore examples" in the list returns the studio to the examples and clears what was saved in the browser.

## For a real deployment

1. **Backend.** A service that stores integrations and mapping versions, opens connections, and applies mappings to incoming records. Replace `save()` and the publish action in `js/integrations.js` with calls to it (`saveMapping`, `testMapping`, `publishMapping`), and run `js/mapping-engine.js` server-side so the browser test and the ingestion path give the same result.
2. **Connection test and live discovery.** Fetch a real sample from the source instead of a pasted one.
3. **Secrets.** Resolve the secret references in a secret store on the server.
4. **Monitoring.** Replace `metric()` with figures from the ingestion service.
5. **Governance.** Real authentication, an approval step before publishing, field-level permissions.
6. **Feeding the twin.** Connect each entity to its section, as listed under "Integration points" in [configuration.md](configuration.md).
