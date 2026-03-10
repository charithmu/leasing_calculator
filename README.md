# Leasing Calculator

A Vite + React + TypeScript app for checking Swiss leasing calculations, including VAT-aware residual value and implied interest rate calculations.

## Features

- Calculates residual value from financed amount, term, monthly payment, and nominal rate.
- Calculates implied nominal and effective rates from a known residual value.
- Handles Swiss VAT differences between gross financed values and residual values shown excluding VAT.
- Includes an AMAG-style test case for quick verification.

## Local development

Requirements:

- Node.js 20+
- npm

Install dependencies:

```bash
npm install
```

Start the dev server:

```bash
npm run dev
```

The app will be available at the local Vite URL printed in the terminal.

## Quality checks

Lint the project:

```bash
npm run lint
```

Create a production build:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

## Vercel deployment

This repository includes [vercel.json](./vercel.json) with the expected Vite settings:

- Build command: `npm run build`
- Output directory: `dist`
- Framework: `vite`

To deploy:

1. Push the repository to GitHub.
2. Import the repo into Vercel.
3. Confirm the project settings if prompted.
4. Deploy.

For this app, no additional environment variables are required.

## Project structure

- `src/App.tsx`: main leasing calculator UI and business logic.
- `src/components/ui/`: reusable UI primitives.
- `src/lib/utils.ts`: shared utility helpers.
- `src/index.css`: theme and Tailwind styling.

## Notes

The production build and lint checks have been verified locally with:

- `npm run lint`
- `npm run build`
