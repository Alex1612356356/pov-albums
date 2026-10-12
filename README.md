# POV Albums

FDMS-branded event albums: create an album, share its guest QR/link for photo
and video uploads, and view the private gallery.

On iPhone and iPad, the event QR code opens the camera page directly in the
browser. The guest taps **Pornește camera** and grants camera access; the
browser requires this user action and permission. On other devices, the QR
code opens an install page; adding its shortcut to the home screen opens the
event-specific camera for consecutive photos and videos, or the phone's camera
and photo library pickers. Guests only see previews of files selected or
captured on their own device; there is no guest gallery or guest-facing upload
list. The couple's separate gallery link is private and should only be shared
with them.

The private couple's gallery opens each photo or video in a full-size viewer
with previous/next arrows, keyboard navigation, and touch swipes. Admins can
open **Gestionează fișierele** on an album card to browse its media as
thumbnails, open the same kind of viewer, and delete individual files directly
from a thumbnail or the viewer. Media management is protected by the admin
session.

Each album has one event date, a start and end time, and an IANA time zone
(for example, `Europe/Bucharest`). Camera controls and uploads are available
only during that interval; the server enforces the same schedule. An end time
earlier than the start time is treated as an overnight event. Local times
skipped or repeated by a daylight-saving transition are rejected to avoid an
ambiguous upload window.

Live camera, service workers, and browser install prompts require HTTPS (or
localhost). On iPhone and iPad, use Safari for camera access. The full-screen
camera-style page provides photo/video modes and a camera switch; camera and
microphone capabilities depend on browser support and permissions.

## TrueNAS SCALE deployment

The app is packaged as a Docker image and stores albums and uploaded media in a
separate persistent data directory. Keep that directory on a TrueNAS dataset
so app updates do not remove photos.

### 1. Create a dataset

In TrueNAS, create a dataset such as `tank/apps/pov-albums`. Give it read/write
access for UID and GID `568` (the identity used by the included container).
The resulting host path will look like `/mnt/tank/apps/pov-albums`.

Use periodic ZFS snapshots or another backup for this dataset: it contains
`albums.json` and all uploaded files.

### 2. Build and publish the image

The GitHub Actions workflow at `.github/workflows/publish-image.yml` builds
Linux AMD64 and ARM64 images and publishes them to GitHub Container Registry
(GHCR) whenever code is pushed to the default branch or a `v*` tag.

After the first successful workflow run, open the repository's **Packages**
section, select `pov-albums`, and set package visibility to **Public** if the
TrueNAS host will pull it without registry credentials. If the image stays
private, configure a GitHub Container Registry credential in TrueNAS.

The image name is `ghcr.io/OWNER/pov-albums:latest`. For a versioned
deployment, push a tag such as `v1.0.0` and use
`ghcr.io/OWNER/pov-albums:v1.0.0`.

### 3. Install as a Custom App

In TrueNAS, open **Apps**, choose **Discover Apps** / **Install via YAML**
(the labels may vary between SCALE versions), and paste the deployment
definition from `truenas-app.yaml`. It is prefilled with this deployment's
image, dataset path (`/mnt/Apps/Site/Pov/Albums`), and public URL
(`https://pov.fdmedia.studio`). Before installing, replace
`REPLACE_WITH_64_HEX_CHAR_RANDOM_PASSWORD` with a strong generated secret:

    openssl rand -hex 32

Use a long, unique admin password. Point `pov.fdmedia.studio` at your reverse
proxy, configure a valid TLS certificate, and route requests to the NAS on port
3001. The proxy must forward the `X-Forwarded-Proto: https` header so secure
admin cookies work. Do not expose the app's plain HTTP port directly to the
Internet.

The app listens on container port `3000`, published on NAS port `3001` to avoid
conflicts with other apps. Open `http://YOUR_NAS_LAN_IP:3001/admin` on your
local network, or `https://pov.fdmedia.studio/admin` through your reverse proxy,
and sign in with the password configured as `ADMIN_PASSWORD`. No username is
required.

### Updating

Build and push a new image tag, update the `image` value in the Custom App
definition, and redeploy. Album metadata and media remain in the dataset
mounted at `/app/data`.

## Local development

Node.js 22 or later is required. Set an admin password before starting.

PowerShell:

    $env:ADMIN_PASSWORD = "replace-with-a-long-random-password"
    npm install
    npm start

Open `http://localhost:3000/admin`. No default admin password is configured;
the server refuses to start if `ADMIN_PASSWORD` is missing.

For local container testing, copy `.env.example` to `.env`, set a strong
`ADMIN_PASSWORD`, and run:

    docker compose up --build -d

The Compose file maps `./data` to the container by default. On TrueNAS, prefer
the Custom App definition above and mount the dataset directly.

## Project files

- `server.js` — Express server, uploads, QR generation, and ZIP downloads
- `public/admin.html` — album management dashboard
- `public/guest.html` — event install page linked from the QR code
- `public/camera.html` — event-specific camera and upload page
- `public/gallery.html` — private gallery
- `public/style.css` — shared FDMS visual styling
- `public/fdmsalb.png` — FIXDUOMEDIA Studios logo
- `Dockerfile`, `compose.yaml` — container build and local Compose setup
