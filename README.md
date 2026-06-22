# Revizely.ai

Public pages, an authenticated student workspace and a dependency-free Node backend.

## Run locally

```sh
cp .env.example .env
npm start
```

Open `http://localhost:4173`. Email sign-up and sign-in work without external services. Workspace data is kept in memory and resets when the server stops.

## Optional services

- Add `GROQ_API_KEY` to `.env` to enable the AI tutor, homework solver, note condenser, AI examiner, study-plan generator, applied lessons, Grade 9 studio, model answers and practice-paper generator.
- Add the three `STRIPE_CHECKOUT_*_URL` values to send pricing selections to Stripe Payment Links.
- Google, Apple and Microsoft sign-in need their own OAuth credentials and are deliberately not simulated.
