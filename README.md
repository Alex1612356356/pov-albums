# POV Albums

FDMS-branded event albums: create an album, share its guest QR/link for photo
and video uploads, and view the private gallery.

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
(the labels may vary between SCALE versions), and use this Compose definition.
Replace the image name, dataset path, password, and `BASE_URL` before deploying:

    services:
      pov-albums:
        image: ghcr.io/OWNER/pov-albums:latest
        container_name: pov-albums
        restart: unless-stopped
        init: true
        user: "568:568"
        ports:
          - "3000:3000"
        environment:
          NODE_ENV: production
          PORT: "3000"
          DATA_DIR: /app/data
          ADMIN_PASSWORD: "REPLACE_WITH_A_LONG_RANDOM_PASSWORD"
          BASE_URL: "https://YOUR_PUBLIC_ALBUM_DOMAIN"
        volumes:
          - /mnt/YOUR_POOL/apps/pov-albums:/app/data

Replace `OWNER`, the dataset path, and the public HTTPS URL with your values.
Use a long, unique admin password. Point the domain at your reverse proxy,
configure a valid TLS certificate, and route requests to the NAS on port 3000.
Do not expose the app's plain HTTP port directly to the Internet. For LAN-only
use, set `BASE_URL` to the NAS's stable local IP and published port instead.

The app listens on port `3000`. Open
`http://YOUR_NAS_LAN_IP:3000/admin` on your network and sign in with the
password configured as `ADMIN_PASSWORD`. No username is required.

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
- `public/guest.html` — guest photo/video upload page
- `public/gallery.html` — private gallery
- `public/style.css` — shared FDMS visual styling
- `public/fdmsalb.png` — FIXDUOMEDIA Studios logo
- `Dockerfile`, `compose.yaml` — container build and local Compose setup
