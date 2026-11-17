# Integration Studio

The **Integrations** entry in the side menu, and the small connection icon in the top bar beside the map-theme button, open the Integration Studio: a place to onboard any device or data source (cameras, radar, LiDAR, traffic equipment, IoT sensors, vehicles, device health, control systems), discover its fields, map them to the platform's data model, test the transformations and publish a versioned mapping, without writing code.

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
| Time-series database | **Design only.** The table definitions (SQL) are generated and can be copied; no database runs |
| Reports and machine-learning use cases | **Catalogue only.** No model is trained or run. Whether the published mappings supply the fields each one needs is worked out for real |
| Storage volumes | Estimates from the example rates |
| Credentials | Never entered. Only a reference to a secret (for example `vault://intellitwin/anpr-vendor/api-key`) is kept |

The example vendors, endpoints and payloads are invented.

## The six steps

| Step | What it does |
| --- | --- |
| 1. Device and type | Choose the device type, then how it delivers data: REST, GraphQL, SOAP, Kafka, MQTT, SQL database, SFTP / file drop, file upload, ONVIF / RTSP metadata, TCP / UDP stream, WebSocket, SNMP / NTCIP, Modbus TCP, OPC UA, LoRaWAN. Choosing a device presets the usual connector, the target entity and an example payload |
| 2. Connect and discover | Connection form, sign-in method and secret reference, schedule; paste or upload a sample; discover the fields, including nested ones (`location.lat`) and the list of records inside a response (`events`) |
| 3. Target entity | Choose the entity of the platform data model to write to |
| 4. Field mapping | Three panels: source fields, connections, target fields. Choose a source then a target (or drag on a computer). Edit each rule under "Mapping properties" |
| 5. Test and validate | Every sample record is transformed and validated; source and result are shown side by side with the errors |
| 6. Publish and monitor | Checklist, publish a version, roll back, pause, copy or download the mapping definition, save as a template |

Three more views sit beside the list of integrations:

- **Schema registry**: the entities, their fields, rules and personal-data (PII) flags; add or remove custom fields, each change raising the entity's schema version.
- **Data and analytics**: the time-series store and the reports and machine-learning use cases (see below).
- **Monitor**: one row per integration with status, rate, lag, mapping error rate and broken rules.

Published integrations created in the studio also appear in **Platform → Data ingestion**.

## Device types

| Group | Device types | Writes to |
| --- | --- | --- |
| Cameras | ANPR / plate-reading camera; CCTV with video analytics; thermal camera; speed and red-light enforcement camera | Vehicle detection, Video analytics event, Speed measurement |
| Radar and LiDAR | Speed radar; traffic counting radar; LiDAR sensor; tracking radar | Speed measurement, Traffic reading, Object track |
| Traffic field equipment | Loop or detector station; signal controller; variable message sign | Traffic reading, Signal status, Device health |
| IoT sensors | Air quality and noise station; road weather station; parking bay sensor; smart streetlight; water level and flood sensor; any other sensor | Environment reading, Road weather reading, Parking occupancy, Sensor reading |
| Vehicles | Bus and fleet tracker | Transit position |
| Infrastructure health | Device health for cameras, radars and network; cabinet, power and UPS | Device health |
| Systems | Control room or incident system | Incident |

**Sensor reading** is the catch-all entity (device, metric, value, unit) for a sensor with no entity of its own. A new device type is one entry in `integrations.devices`; a new entity is one entry in `integrations.entities`.

The example integrations cover an ANPR vendor, roadside detectors, control room incidents, a speed radar network, a junction LiDAR, CCTV video analytics, field device health and air quality stations.

**Records inside a message.** A LiDAR frame or an API envelope carries values that belong to every record in it (the sensor, the frame time). These are offered on each record as `_parent.name`, so they can be mapped like any other field.

## Time-series database

Every entity is time-stamped, so each is kept as a time-series table. The **Data and analytics** view shows, per entity:

| Item | Meaning |
| --- | --- |
| Tags | The fields that identify a series: device identifiers and fields with a fixed list of values. Personal data and one-per-record identifiers are kept as plain columns |
| Measures | The numeric and yes/no fields |
| Raw records kept | The retention period; older raw records are dropped |
| Rollups | Aggregates (count, average, maximum) at fixed intervals, kept after the raw records expire: the source for trends, reports and model training |
| Records a day, storage a month | Estimates from the example rates and an assumed compression ratio |

Choosing an entity shows its table definition, written for TimescaleDB on PostgreSQL: the table, the hypertable, an index, compression, a retention policy and one continuous aggregate per rollup. Retention and rollups can be changed per entity. **The SQL is generated text and has not been run against a database; review it against the version in use.** InfluxDB, ClickHouse or QuestDB would hold the same model with their own syntax.

The mapping definition exported at the Publish step carries a `storage` block (table, time column, tags, measures, retention, rollups).

## Reports, analytics and machine-learning use cases

The same view lists what the stored data can feed:

| Kind | Use cases |
| --- | --- |
| Report | Daily traffic report; device availability report; enforcement summary |
| Predictive | Short-term congestion forecast; incident clearance time; accident risk hot spots; predictive maintenance of field devices; parking demand forecast; air quality and noise forecast; bus arrival prediction |
| Anomaly detection | Automatic incident detection; sensor data quality monitoring |
| Analytics | Journey time and origin-destination flows; near-miss and conflict analysis |
| Optimisation | Adaptive signal timing |

Each one names the entity fields it needs, the usual method, the result and the IntelliTwin section that would use it. The studio checks those fields against the **published** mappings and marks the use case **Data ready**, **Partly covered** or **No data source**, listing the fields still missing. Opening a use case also gives an example feature query over the time-series tables.

**No model is trained or run here**, and the methods named are the usual choices, not a tested design. The predictions shown elsewhere in IntelliTwin come from its traffic simulation, not from these use cases. The list is `integrations.analytics` in `config.js`.

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

Array handling is limited: the list of records inside a message is found and the message's own values are available as `_parent.*`, and the first element of a deeper nested list can be mapped (`items[0].name`); iterating a second level of lists into child records is not built.

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
| `devices` | Device types: `cat` (group), `connectors` (usual ways it delivers data, most common first), `entity`, `format` and an example `sample` payload |
| `storage` | Time-series store: `engine`, default `retention` and `rollups`, the choices offered, `compressAfter`, assumed `compression`, and per-entity overrides under `entity` |
| `analytics` | Reports and machine-learning use cases: `kind`, `grain`, `needs` (entity and fields, `optional`), `method`, `output`, `section` |
| `connectors` | Connector types. `mode` is `polling`, `streaming` or `file`; `formats` lists the payload formats; `fields` builds the connection form (`type`: `text`, `url`, `select`, `area`) |
| `authTypes`, `pollEvery` | Choices offered for sign-in method and schedule |
| `entities` | The data model. Each field has `name`, `type` (`string`, `integer`, `number`, `boolean`, `datetime`) and optional `required`, `min`, `max`, `pattern`, `enum`, `maxLength`, `pii`, `note`. `key` lists the fields that identify a record |
| `seed` | Example integrations shown on first use. `platformFeed` names the Platform feed an example stands for, so it is not listed twice |
| `templates` | Reusable mappings |
| `apiUrl` | Reserved for a backend; not used yet |

Adding a connector or an entity here makes it appear in the studio with no code change. Editing needs the `integrations` permission, which the administrator role has (`auth.roles`).

"Restore examples" in the list returns the studio to the examples and clears what was saved in the browser.

## For a real deployment

1. **Time-series database and models.** Create the tables from the generated definitions (after review), write mapped records to them, and build the reports and models on the rollups. A feature store and model registry are outside this demonstrator.
1. **Backend.** A service that stores integrations and mapping versions, opens connections, and applies mappings to incoming records. Replace `save()` and the publish action in `js/integrations.js` with calls to it (`saveMapping`, `testMapping`, `publishMapping`), and run `js/mapping-engine.js` server-side so the browser test and the ingestion path give the same result.
2. **Connection test and live discovery.** Fetch a real sample from the source instead of a pasted one.
3. **Secrets.** Resolve the secret references in a secret store on the server.
4. **Monitoring.** Replace `metric()` with figures from the ingestion service.
5. **Governance.** Real authentication, an approval step before publishing, field-level permissions.
6. **Feeding the twin.** Connect each entity to its section, as listed under "Integration points" in [configuration.md](configuration.md).
