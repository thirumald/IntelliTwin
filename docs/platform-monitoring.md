# Platform monitoring

The **Platform** section shows data ingestion and infrastructure health, updating every 2 seconds.

**Every figure is synthetic.** IntelliTwin is a static demonstrator that runs in the browser; there are no servers, message brokers or live feeds behind it. The section shows what the monitoring view of a deployed platform would contain, so it can be discussed and specified.

| Part | Content |
| --- | --- |
| Platform now | Events ingested a second, end-to-end latency, feeds healthy, queue backlog, average CPU and GPU, each with a two-minute trend |
| Open issues | Feeds that are delayed or not receiving, degraded services, servers under high load, storage running out |
| Data ingestion | One row per feed: status, source, messages a second, lag, error rate |
| Infrastructure | One block per server: CPU, memory, GPU where fitted, disk |
| Services | Status, response time and 30-day uptime per service |
| Storage and backup | Capacity used, growth a day, days until full, video retention, last backup |

Integrations published in the [Integration Studio](integration-studio.md) are added to the Data ingestion list, with synthetic rates like the rest.

## How the figures are generated

Feeds marked `followsTraffic` scale with the number of vehicles moving in the twin, so ingestion rises at the peak. Servers marked `followsLoad` do the same. Each value has a slow wave and small noise on top. A feed is shown as delayed or not receiving for some five-minute periods, and a service as degraded for some ten-minute periods, so the statuses and the open-issues list have something to show.

## Settings

`platform` in `config.js` lists the feeds, servers and services with their base values, plus storage capacity and video retention.

## For a real deployment

Replace `sample()` in `js/platform.js` with calls to the monitoring system in use (for example Prometheus, Grafana or the cloud provider's metrics service), keeping the same fields.
