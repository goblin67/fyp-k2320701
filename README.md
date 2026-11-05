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
- Request membership in one or more clubs during registration or later in account settings using an organiser-provided invite code.
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
- Create and rename clubs, choose allowed and default session formats per club, rotate shareable invite codes, approve membership requests, and manage separate club rosters and sessions.

Guest participation remains scoped to its session and is not included in registered players' all-time leaderboard/history.

### New organiser: quick start

Follow these steps the first time you use the organiser panel. If someone has already given you a username and password, you do not need to run any setup command.

1. **Sign in.** Open CourtSync, choose **Login**, and enter the organiser username and password you were given. You should land in the organiser workspace.
2. **Choose or create a club.** Open **Manage clubs**. Each club has **Enter club**, **Rename**, and **Members & settings** actions. Use **Create club** to add another club. To delete a club, first delete its planned/completed sessions and remove its members. You must keep at least one club.
3. **Set club rules and invite code.** Open **Members & settings** for the club. Rename it from the club list. Under **Session formats**, choose which formats the club allows and its default. For a doubles-only club, leave **Doubles** selected and save; preference and court format choices will be hidden. Under **Invite code**, generate a code if needed and share it with players. Rotating a code invalidates the old one.
4. **Approve players.** Players choose your club and enter its code when registering, or request to join later in account settings. In **Members & settings**, approve requests you accept and reject the others. Only approved members appear in the club's player list. You can remove a member from the same page. Players can also belong to multiple clubs.
5. **Enter the club and plan a session.** Choose **Enter club**, then open **Club sessions** and choose **New session**. Enter a session name, date and time, and optionally a venue; save it. Open the planned session and choose **Start session** when you are ready to set it up.
6. **Choose players and courts.** Select approved club players, or add guests for this session. Set each player's singles or doubles preference. Choose 1–6 courts and set each court's format, then choose **Start session**. You can edit the session plan until it starts.
7. **Run the courts.** Proposed lineups appear on the live page. Review them, make any needed changes with **Edit proposed players**, then choose **Approve & start match**. While a match is playing, enter both sides' scores, choose the winning side, and select **Save score & end match**. New lineups are proposed as players become available. Add an approved club member or a guest from the live page if someone arrives late. You can also change the number or format of courts while the session is live; finish a match before removing its court.
8. **Finish up.** When play is over, choose **End session** and confirm. The session summary shows player totals and match results. Use the CSV buttons if you want to download the results. You can return to the summary later from the session list.

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
                                achievements, club memberships, session summary,
                                active match
      organiser/                Organiser interface and styles
    types/                      Shared client-side domain types
  public/                       Static client assets

server/
  src/
    index.ts                    Express setup, API mounts, database connection
    modules/
      auth/                     Authentication and access-control middleware/routes
      clubs/                    Club model and player membership APIs
      sessions/                 Session model, player/session APIs, organiser APIs,
                                match and rating logic
      users/                    User model
    scripts/                    Organiser account/access utility scripts

package.json                    Root workspace and build/start commands
```

The client uses top-level routes for authentication and the signed-in application. Player dashboard screens are separate React components rendered within the dashboard; the dashboard retains shared state and API actions needed across screens. Organiser screens are in a distinct organiser panel.

The server is organised by feature modules. `server/src/index.ts` mounts authentication, club, player/session, and organiser APIs, connects to MongoDB, and serves the production client build. Existing organisers receive a default club when they first open the organiser workspace; their legacy sessions and registered session players are migrated into that club. TypeScript output is written to `server/dist`; that directory contains generated JavaScript and source maps, not the maintained server source.

## Backend functionality

- **Authentication:** registration and login endpoints; passwords are hashed; successful login returns a signed token and role/access information.
- **Access control:** authenticated API middleware protects account and session operations; organiser middleware limits organiser endpoints.
- **Account management:** profile and match-history retrieval, password changes, JSON data export, and account deletion while preserving historical session results.
- **Club membership:** public club discovery, invite-code verification, pending membership requests, organiser approvals, and club-scoped approved player rosters. Invite codes are stored as password hashes.
- **Sessions and matches:** session creation/management, active session and history retrieval, player queue management, match lineup handling, scoring, winner recording, and session closure.
- **Ratings and records:** finished matches update registered players' match history and rating data; APIs calculate leaderboards, lifetime points, and organiser player statistics.
- **Organiser APIs:** manage clubs and invite codes, approve membership requests, retrieve club-scoped players and sessions, create/update/start sessions, manage participants and match lineups, finish matches, and retrieve club-scoped player stats.
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
