# Badminton Session Manager

A web app for players and session organisers to manage badminton sessions, courts, matches, scores, and results.

## Organising a session

Organisers can schedule sessions, choose court formats, add registered players or guests, and start matches from the waiting queue. Each court shows a proposed lineup for approval. Organisers can edit a lineup before starting a match, enter scores, select the winner, and download ranked session reports.

The organiser panel also includes Player Stats: registered players from that organiser's sessions are ranked by current ELO, with an export for the leaderboard and a separate lifetime match-history export for each player. Guest records remain session-only.

## Organiser access

Organiser-only accounts use the organiser panel directly. To give an existing player account access while keeping its player dashboard, set `ORGANISER_ACCESS_USERNAME` and `ORGANISER_ACCESS_PASSWORD` in the server environment and run `npm run grant-organiser-access` from `server`. The script verifies the existing account password and does not change it. Log out and back in after access is granted.

## How player pairing works

Waiting players are prioritised by how long they have been in the queue. For doubles, the app tries to avoid repeating teammate pairings from the last three completed matches and rearranges players onto different sides when possible.

If a fresh pairing may become possible when an ongoing match ends, the proposal waits for that match to finish. If no eligible ongoing match can release players, the app uses the best available lineup instead of blocking play. Organisers can also edit a proposed lineup manually.

## Development

Install dependencies in the `client` and `server` folders, configure the server environment, then run each app using its development script.
