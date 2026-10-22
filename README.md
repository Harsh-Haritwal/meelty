# Meetly

A small MERN video-conferencing starter: React + Vite frontend, Express API, MongoDB meeting records, and Socket.IO/WebRTC peer signaling. Rooms are capped at 10 participants.

## Run locally

1. Install dependencies: `npm run install:all`
2. Copy `server/.env.example` to `server/.env` and set `MONGODB_URI` to your MongoDB connection string. MongoDB is needed to persist and look up meeting codes across server restarts. Without it, rooms are kept in memory while the server is running.
3. Run `npm run dev` from this directory.
4. Open the Vite URL (normally `http://localhost:5173`) and allow camera/microphone access.

The local dev ports are `http://localhost:5174` (client) and `http://localhost:5100` (API), chosen to avoid colliding with other apps on this machine. The client otherwise defaults to `http://localhost:5000`. Set `VITE_API_URL` in `client/.env.local` when deploying the API elsewhere, and set `CLIENT_URL` on the server to the deployed frontend origin.

## Notes

- Audio/video uses browser `getUserMedia` and mesh WebRTC connections; the browser may require HTTPS outside localhost.
- Signaling is handled by Socket.IO. The sample config uses public STUN servers; production deployments should configure TURN servers for reliable connections behind restrictive NAT/firewalls.
- Room occupancy is tracked in process memory, so deploy a shared Socket.IO adapter/store when running multiple server instances.
- Authentication, scheduling, recording, and persistent chat are not included.

## Deploy on Vercel + Render

1. Push this project to a GitHub repository. Do not commit either `.env` file; deployment secrets belong in the host dashboards.
2. On Render, create a Blueprint from the repository using `render.yaml`. Add `MONGODB_URI` in the Render service environment and set `CLIENT_URL` to the exact Vercel production origin (for example, `https://meetly-yourname.vercel.app`). Render supplies `PORT` automatically.
3. On Vercel, import the same repository and set **Root Directory** to `client`. Add `VITE_API_URL` as an environment variable with the Render service URL (for example, `https://meetly-api.onrender.com`), without a trailing slash. Redeploy after setting it.
4. If the Vercel domain changes, update Render's `CLIENT_URL` and redeploy/restart the API. This origin is used for both HTTP API CORS and Socket.IO signaling.

Free Render instances may sleep when idle. For production WebRTC connections across restrictive networks, configure a TURN provider; public STUN alone cannot guarantee connectivity.
