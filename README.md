# Cockipedia

Cockipedia is a static, browser-based personal encyclopedia inspired by Wikipedia. Articles, revisions, settings, and uploaded media are stored locally in IndexedDB. No application server or hosted database is required.

## Run it locally

Install Node.js 22 or newer, then run:

```bash
corepack enable
pnpm install
pnpm dev
```

Open the local address shown in the terminal.

## Build the static website

```bash
pnpm build
```

The complete upload-ready website is generated in `dist/`. You can upload that folder to any static web host.

## Publish with GitHub Pages

1. Create a GitHub repository and upload this whole project.
2. Keep the default branch named `main`.
3. In the repository, open **Settings → Pages**.
4. Set **Source** to **GitHub Actions**.
5. Push a commit to `main`, or run the **Deploy Cockipedia to GitHub Pages** workflow manually.

The included workflow builds and publishes the site automatically. Relative asset paths and hash-based article navigation allow it to work both at a root domain and under a repository path such as `username.github.io/cockipedia/`.

## Data and backups

Each browser profile has its own independent Cockipedia database. Clearing browser site data removes that local database, so use **Export → Export full backup** regularly. Import the resulting `.cockipedia` file to restore it or move it to another browser or device.

## Useful commands

```bash
pnpm dev      # development server
pnpm build    # production static build
pnpm preview  # preview the production build
pnpm test     # build and run automated checks
pnpm lint     # code-quality checks
```
