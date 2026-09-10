# One-time Birthday Surprise

This project turns the birthday page into a private, expiring, single-use link. The server delivers the birthday page only once; after the link is claimed, every later visit sees a closed message.

## Use it locally

1. Install Node.js 18 or newer.
2. In this folder, run `node server.js --create-link --expires-hours 24`.
3. Run `node server.js`.
4. Open the printed link in a browser.

For a real recipient link, deploy this folder to a Node-compatible host with persistent storage. Set these environment values before creating the link:

- `PORT`: supplied by most hosts automatically.
- `PUBLIC_ORIGIN`: your deployed address, for example `https://my-birthday-surprise.example`.
- `DATA_DIR`: the mounted persistent-storage folder, for example `/data`.
- `ADMIN_SECRET`: a long private password you choose. It lets you create a link at `/admin` after deployment.

Then create the link using the same command. Do not send the local `localhost` link to another person; it only works on your own computer.

After deployment, open `https://your-address/admin`, enter your `ADMIN_SECRET`, choose how long the link should work, and copy the generated private link to send it.

Do not use a static-site host for this project. The one-time rule requires the server and its persistent token store. A host such as Render or Railway with a persistent disk/volume works well.

## What it protects

- The token is random and only its hash is saved.
- A link expires (72 hours by default; change it with `--expires-hours`).
- The first person to open it consumes it; page refreshes and later visits are rejected.
- Link-preview bots only see the neutral landing page and do not consume the link.

No website can prevent a recipient from taking screenshots, recording their screen, or showing the content to someone else. Also, whoever opens a forwarded single-use link first gets the one view. Identity verification would require a sign-in or a verified email/phone system.
