# Badminton Session Manager

A web app for players and session organisers to manage badminton sessions, courts, matches, scores, and results.

## Organising a session

Organisers can schedule sessions, choose court formats, add registered players or guests, and start matches from the waiting queue. Each court shows a proposed lineup for approval. Organisers can edit a lineup before starting a match, enter scores, select the winner, and download CSV reports for match summaries or individual player performances.

## How player pairing works

Waiting players are prioritised by how long they have been in the queue. For doubles, the app tries to avoid repeating teammate pairings from the last three completed matches and rearranges players onto different sides when possible.

If a fresh pairing may become possible when an ongoing match ends, the proposal waits for that match to finish. If no eligible ongoing match can release players, the app uses the best available lineup instead of blocking play. Organisers can also edit a proposed lineup manually.

## Development

Install dependencies in the `client` and `server` folders, configure the server environment, then run each app using its development script.
