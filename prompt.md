# Autonomous Development Prompt

You are running autonomously inside the Ralph Loop. Your objective is to complete exactly one pending task from the `task.md` file in each run.

## Instructions

1. **Check Status**:
   - Check if `error.log` exists in the root. If it does, read it first to understand any test failures from the previous run.
   - Read the `task.md` file to identify the first uncompleted task (marked with `[ ]`).
   - Check `git status` to see what files are currently modified.

2. **Implement Task**:
   - Make the necessary file changes for the selected task. Do not make unrelated changes.
   - Do NOT run git commit or git push.

3. **Verify**:
   - Run the E2E tests using `npm run test:harness`.
   - If tests fail, write the failure output to `error.log`.
   - If tests pass, remove `error.log` if it exists.

4. **Update & Handoff**:
   - Update `task.md` to mark the completed task as `[x]`.
   - Keep your final output extremely concise and exit cleanly.
