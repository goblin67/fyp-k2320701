# CourtSync

CourtSync is a badminton session-management web application for players and session organisers. It helps organisers coordinate courts, player queues, match lineups, scores, and session results, while giving players a place to review their performance and history.

The app addresses the practical overhead of running a badminton session: manually assigning players and courts, keeping track of match progress and scores, and compiling rankings and player records afterward.

## Core capabilities

### Player experience

- Register an account and sign in with a username and password.
- View personal match results, recent form, win rate, and match history.
- View a leaderboard for players who share session history.
- Track factual achievements, such as completed-match and points-scored milestones.
- View session history and the summaries for sessions available to the account.
- Change a password, export account data as JSON, or delete an account.
- See their active match/session and participate in organiser-managed queues and matches.

ELO-style ratings are maintained by the backend and used for ranking, but are not shown in the player-facing views.

### Organiser experience

- Create and schedule sessions with a title, venue, court count, and singles/doubles formats.
- Add registered players or guests, including player preferences where applicable.
- Start sessions, monitor court activity and waiting players, adjust proposed lineups, and manage player replacements.
- Record match scores, select winners, finish matches, and close sessions.
- Download ranked session summaries.
- View a Player Stats leaderboard for registered players who have participated in the organiser's sessions, including rating and lifetime performance statistics.
- Export the organiser's leaderboard and individual players' lifetime match histories.

Guest participation remains scoped to its session and is not included in registered players' all-time leaderboard/history.

### Match assignment and rankings

Players are prioritised by queue waiting time, with ratings used to help form balanced matches. For doubles, the pairing logic attempts to avoid recent repeated teammate combinations and to vary sides where possible. Match proposals may wait for an ongoing match to finish when that can enable a better eligible lineup; organisers can review and edit proposed lineups.

Registered players' ratings and rating progression are recorded by the backend using the Glicko-2 library. Session rankings are based on session results, while the organiser's all-time leaderboard uses player ratings.

## Technology stack

### Client

- React 19 and React DOM
- TypeScript
- React Router 7
- Vite 7 for development and production builds
- ESLint 9 with React Hooks linting

### Server

- Node.js with TypeScript and ES modules
- Express 5 and CORS
- MongoDB through Mongoose 9
- JSON Web Tokens (`jsonwebtoken`) for authentication
- `bcryptjs` for password hashing
- `glicko2` for player rating calculations
- `tsx` for running TypeScript in development and utility scripts

The root npm workspace coordinates the `client` and `server` packages. The Express server serves the built client as well as the API.

## Architecture and folder structure

```text
client/
  src/
    App.tsx                     Authentication and top-level role routing
    components/                 Shared UI components
    modules/
      auth/                     Login and registration
      dashboard/                Player dashboard and page components
        pages/                  Overview, leaderboard, histories, settings,
                                achievements, session summary, active match
      organiser/                Organiser interface and styles
    types/                      Shared client-side domain types
  public/                       Static client assets

server/
  src/
    index.ts                    Express setup, API mounts, database connection
    modules/
      auth/                     Authentication and access-control middleware/routes
      sessions/                 Session model, player/session APIs, organiser APIs,
                                match and rating logic
      users/                    User model
    scripts/                    Organiser account/access utility scripts

package.json                    Root workspace and build/start commands
```

The client uses top-level routes for authentication and the signed-in application. Player dashboard screens are separate React components rendered within the dashboard; the dashboard retains shared state and API actions needed across screens. Organiser screens are in a distinct organiser panel.

The server is organised by feature modules. `server/src/index.ts` mounts authentication, player/session, and organiser APIs, connects to MongoDB, and serves the production client build. TypeScript output is written to `server/dist`; that directory contains generated JavaScript and source maps, not the maintained server source.

## Backend functionality

- **Authentication:** registration and login endpoints; passwords are hashed; successful login returns a signed token and role/access information.
- **Access control:** authenticated API middleware protects account and session operations; organiser middleware limits organiser endpoints.
- **Account management:** profile and match-history retrieval, password changes, JSON data export, and account deletion while preserving historical session results.
- **Sessions and matches:** session creation/management, active session and history retrieval, player queue management, match lineup handling, scoring, winner recording, and session closure.
- **Ratings and records:** finished matches update registered players' match history and rating data; APIs calculate leaderboards, lifetime points, and organiser player statistics.
- **Organiser APIs:** retrieve registered players and organiser-owned sessions, create/update/start sessions, manage participants and match lineups, finish matches, and retrieve player lifetime stats.
- **Client delivery:** the production Express server serves the built Vite application and routes non-API GET requests to the client entry page.

## Local development

### Requirements

- Node.js and npm
- A MongoDB database

### Setup

1. Install the root workspace dependencies:

   ```sh
   npm install
   ```

2. Configure the server environment with `MONGO_DB_URI` and `JWT_SECRET`. Set `VITE_BACKEND_URL` for the client to the backend base URL used by your environment.

3. Start the server and client in separate terminals:

   ```sh
   npm run dev --workspace=server
   ```

   ```sh
   npm run dev --workspace=client
   ```

### Build and run

Build both workspaces:

```sh
npm run build
```

Start the built server (which serves the production client build):

```sh
npm start
```

The client also provides `npm run lint --workspace=client`. The server package currently has a placeholder test script; automated server tests are not configured there.

## Deployment

The repository includes a Render deployment configuration in `render.yaml`. The production application is available at [courtsync-ebsd.onrender.com](https://courtsync-ebsd.onrender.com).
