# fyp-k2320701
Final Year Project, Racket Sports player administration module

## Organiser account setup

Organiser access is assigned to an existing account or a new account through the
one-time provisioning command. Set `MONGO_DB_URI`, `INITIAL_ORGANISER_USERNAME`
(defaults to `1234`), and `INITIAL_ORGANISER_PASSWORD` in the server environment.
Use a private password of at least 8 characters; do not commit it to the
repository or share it in chat. Then run `npm run create-organiser` from the
`server` workspace. If the username already exists, the command verifies its
password before granting organiser access and will not replace that password.

All other registered accounts receive the player role. Organisers are routed to
the session panel after login; planned sessions can be edited until they start.
