Build the project and deploy to a Firebase preview channel for testing.

Steps:
1. Run `npm run build` — stop and report if there are any errors
2. Run `firebase hosting:channel:deploy preview --expires 7d`
3. Print the preview URL clearly so the user can click it

If the build fails, show the error output and do NOT proceed with the deploy.
At the end, show a one-line summary: build status + preview URL.
