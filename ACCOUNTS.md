# Account system setup

Players log in with Discord, pick **one player name**, and submit records on the site (`#/submit`).
Mods review them on the site (`#/review`). Accepted records show up on the List and Leaderboard
automatically within about a minute. No Google Form, no extra services: only Cloudflare (which already
hosts the site) and Discord login.

Your existing `data/*.json` records keep working exactly as before. Records from accounts are merged
in on top (one entry per player per level, best percent wins).

## One-time setup (about 10 minutes)

### 1. Create the Discord app
1. Go to <https://discord.com/developers/applications>, then **New Application** (name it "Nerfed Demon List").
2. Open **OAuth2**. Copy the **Client ID**, then click **Reset Secret** and copy the **Client Secret**.
3. Under **Redirects**, add exactly: `https://nerfeddl.pages.dev/api/auth/callback`, then save.

### 2. Create the database
1. Cloudflare dashboard → **Storage & Databases → D1** → **Create database**, named `ndl-accounts`.
2. Open it → **Console**, paste the contents of `schema.sql`, and run it.

### 3. Connect it to the Pages project
In the Cloudflare dashboard, open **Workers & Pages → your NDL project → Settings**:

- **Bindings → Add → D1 database**: variable name `DB`, database `ndl-accounts`.
- **Variables and Secrets**: add
  | Name | Type | Value |
  |---|---|---|
  | `DISCORD_CLIENT_ID` | Text | the Client ID |
  | `DISCORD_CLIENT_SECRET` | **Secret** | the Client Secret |
  | `DISCORD_REDIRECT_URI` | Text | `https://nerfeddl.pages.dev/api/auth/callback` |
  | `STAFF_DISCORD_IDS` | Text | Discord user IDs of you and your mods, comma-separated |

  To get a Discord user ID, turn on Discord Settings → Advanced → Developer Mode,
  then right-click a user and choose **Copy User ID**.

### 4. Deploy
Push these files to GitHub. Bindings and variables only apply to **new** deployments, so if you set them
after pushing, use **Deployments → Retry deployment**.

## Day to day

- **Players:** click Submit Record, log in with Discord, choose a name once, then submit. They can see each
  record's status and the mod's reason on the same page.
- **Mods:** a **Review** tab appears in the nav for anyone in `STAFF_DISCORD_IDS`.
  - *Pending:* watch the video inline, then Accept or Reject (rejecting requires a reason).
  - *Names to confirm:* if someone picks a name that already has records in the JSON files, they can't submit
    until a mod confirms it's really them. This stops people from taking credit under someone else's name.
  - *Recently reviewed:* undo a mistake.
  - Banning a player logs them out and hides their accepted records.
- **Adding or removing a mod:** edit `STAFF_DISCORD_IDS` and redeploy.
- **Renaming a player who already has submissions:** D1 console:
  `UPDATE users SET name = 'NewName', name_lower = 'newname' WHERE name = 'OldName';`

## Security notes
- No passwords are stored. Discord handles login, and only the `identify` scope (username and ID) is requested.
- The Discord secret exists only as an encrypted Cloudflare secret. Never put it in this repo, because the repo is public.
- Session cookies are `HttpOnly`, `Secure`, `SameSite=Lax`, and use the `__Host-` prefix. The database stores
  only a SHA-256 hash of each session token.
- Every write checks the `Origin` header and requires JSON (CSRF protection). Every mod action checks
  the mod list on the server.
- Video links must be https links on YouTube, Medal, Twitch, Streamable, Google Drive, or Bilibili.
- Limits: 10 pending records per player, 20 submissions per day, no duplicate pending record for the same level,
  and no submitting a record that isn't better than one you already have accepted.

## Discord review notifications (optional)
When a mod accepts or rejects a record, the bot posts the result to a channel.
Add these in Cloudflare → Settings → Variables and Secrets, then redeploy:

| Name | Type | Value |
|---|---|---|
| `DISCORD_BOT_TOKEN` | **Secret** | Discord Developer Portal → your app → Bot → Reset Token |
| `DISCORD_CHANNEL_ID` | Text | right-click the channel (Developer Mode on) → Copy Channel ID |

The bot needs to be in your server with **View Channel**, **Send Messages** and **Embed Links** in that channel.
The player who submitted the record gets pinged, but only if they are in the server.
If you don't set these, reviewing still works and nothing gets posted.

## Account page (`#/account`)
Click your name in the top bar. Players can:
- **Change their country** (flag next to their name on the List and Leaderboard). It overrides `_players.json` for that player.
- **Show or hide their Discord profile picture** on the leaderboard.
- **Turn Discord pings for review results on or off.**
- **Request a name change.** A mod approves or denies it under Review → Names. The player's site records move
  to the new name automatically. Records in `data/*.json` don't, so rename those by hand (the Review page warns you).
  Changing only capital letters is instant. One change every 30 days.
- **Log out**, or log out on all devices.

If you set the site up before the account page existed, run `migration-2-account-page.sql` once in the D1 Console.
