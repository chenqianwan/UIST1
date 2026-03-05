# Remote Study Tunnel SOP (No Domain Needed)

This SOP starts the local backend and frontend, opens two Cloudflare tunnels, and prints one participant-facing URL.

## 1) Prerequisites

- macOS/Linux shell
- `python3`
- `npm`
- `cloudflared` installed and available in `PATH`

Quick check:

```bash
python3 --version
npm --version
cloudflared --version
```

## 2) Install Python deps (one-time)

```bash
python3 -m pip install -r python/requirements.txt
```

## 3) One-command start

From repo root:

```bash
npm run remote-study
```

When startup completes, the script prints:
- participant URL (share this URL)
- backend health URL
- log file paths

Keep the terminal open during the session.

## 4) Stop services

Press `Ctrl + C` in the same terminal.  
This stops backend/frontend and both tunnels.

## 5) Troubleshooting

- `Missing required command: cloudflared`
  - Install cloudflared first.
- `Port 8008 is already in use` or `Port 5173 is already in use`
  - Stop existing processes, or run with custom ports:
    ```bash
    BACKEND_PORT=8010 FRONTEND_PORT=5174 npm run remote-study
    ```
- Backend tunnel URL not found
  - Check `./.runtime/remote-study/backend_tunnel.log`
- Frontend tunnel URL not found
  - Check `./.runtime/remote-study/frontend_tunnel.log`

## 6) Session reliability checklist

- Use stable network (mobile hotspot as backup)
- Disable sleep mode during interviews
- Run one 5-10 minute dry-run before each participant block
- Verify backend health URL returns `{"ok": true, ...}` before sharing URL
