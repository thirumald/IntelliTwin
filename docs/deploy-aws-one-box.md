# Deploy on one AWS box (India region), designed to move on-prem

One small virtual machine runs two containers: **app** (API, login, the front end) and **caddy** (web server, HTTPS when
you add a domain). Nothing here is AWS-specific: the same `docker-compose.yml` runs on any Linux server, which is the
on-prem path.

**Region:** your account is in India, so use **Asia Pacific (Mumbai) `ap-south-1`**. Demo data only, so data residency is
not a concern now; for UAE production data use a UAE region or on-prem.

**Cost (estimate, check the AWS Pricing Calculator):** a `t3.medium` is roughly US$0.04 to 0.05 an hour, about US$30 to 35 a
month if left on, plus about US$3 disk and US$4 public IPv4. Stop the instance when not demoing (compute billing stops;
disk and IP still bill). Realistic office-hours use: about US$15 to 25 a month.

> This setup has not been run on AWS yet. The first deployment is the test. Expect to fix small things.

## Before you start

- A repository the box can clone. The default is the public `thirumald/IntelliTwin`, branch `platform-app`.
- Your office or home public IP (search "what is my IP"), written as `x.x.x.x/32`.
- Your TomTom key (`docs/tomtom-key.md`), optional: without it the app runs on the simulation.

## 1. Launch the instance (AWS console, region Mumbai)

1. Region selector (top right): **Asia Pacific (Mumbai) ap-south-1**.
2. **EC2 > Launch instance**
   - Name: `intellitwin-demo`
   - Image: **Ubuntu Server 24.04 LTS**
   - Type: **t3.medium** (2 vCPU, 4 GB). `t3.small` works for a short demo but is tight.
   - Key pair: create one and download it (or skip and use browser-based **EC2 Instance Connect**).
   - Storage: **30 GB gp3**
   - **Network settings > Edit**: create a security group with
     - SSH (22): source **My IP**
     - HTTP (80): source **My IP** (add your colleagues' IPs as extra rules)
     - HTTPS (443): source **My IP** (only needed once you add a domain)
     - Do not use `0.0.0.0/0` for 80 or 22: the app has a login, but a demo box has no reason to be public.
   - **Advanced details > User data:** paste the contents of `deploy/aws-one-box/user-data.sh`.
3. **Launch instance**. Wait about 3 minutes for the user data to finish.
4. Optional but recommended: **Elastic IPs > Allocate**, then **Associate** with the instance, so the address does not change
   when you stop and start it.

## 2. Configure and start

Connect: **EC2 > Instances > select > Connect > EC2 Instance Connect > Connect** (or `ssh -i key.pem ubuntu@<ip>`).

```bash
cd /opt/intellitwin
ls .bootstrap-done              # must exist; if not, wait a minute (sudo tail -f /var/log/cloud-init-output.log)
nano .env                       # set TOMTOM_KEY and INTELLITWIN_ADMIN_PASSWORD (use a long random value), save with Ctrl+O, Enter, Ctrl+X
sudo docker compose up -d --build
sudo docker compose ps          # app should become "healthy" in about a minute
sudo docker compose logs app | tail -20
```

The first build takes a few minutes (Python packages, the front end download).

If you left `INTELLITWIN_ADMIN_PASSWORD` empty, a random password is printed once in the log:
`sudo docker compose logs app | grep "First start"`. You must change it at first sign-in either way.

## 3. Open it

`http://<instance public IP>/` : sign in as `admin`, then open **Admin** (user menu, top right) to add users and run the
**live demo window**. Run `tools/check_tomtom.py` first if you have not already (`docs/tomtom-key.md`).

## Day to day

| Task | Command or action |
| --- | --- |
| Update to the latest code | `cd /opt/intellitwin && git pull && sudo docker compose up -d --build` |
| Logs | `sudo docker compose logs -f app` |
| Stop to save money | EC2 console: **Instance state > Stop**. Start it again before a demo, then `sudo docker compose up -d` if needed |
| Reset all users | `sudo docker compose down && sudo docker volume rm intellitwin_appdata && sudo docker compose up -d` |
| Back up users and audit log | `sudo docker run --rm -v intellitwin_appdata:/d -v $PWD:/b busybox tar czf /b/appdata.tgz -C /d .` |
| Delete everything | Terminate the instance, release the Elastic IP, delete the security group |

## Add HTTPS later

Point a DNS name at the Elastic IP, open port 443 to the people who need it, set `SITE_ADDRESS=your.domain` in `.env` and run
`sudo docker compose up -d`. Caddy gets and renews the certificate itself. Until then the connection is plain HTTP, so keep
the source IP restriction and do not reuse passwords you use elsewhere.

## Moving on-prem

1. A Linux server with Docker and the compose plugin.
2. Clone the repository, copy `.env`, `docker compose up -d --build`.
3. The data volume (`appdata`) holds users and the audit log; back it up as above. PostgreSQL, single sign-on and
   Kubernetes come later; nothing here depends on an AWS service.
