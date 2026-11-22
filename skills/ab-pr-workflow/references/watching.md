# Watching an open pull request

Loaded on demand from SKILL.md Phase 2 when a pull request is open and its checks or automated reviewers have not finished, for example right after Phase 1 publishes it.

## Wait on a watcher, not a loop

Wait with the host's own pull-request or check watcher when it has one. Otherwise use the GitHub CLI's: `gh pr checks <number> --watch` returns when every check has finished. Do not write a loop of sleeps and polls: it burns turns, and it ends on a timer instead of on the event you are waiting for. Only the session that owns the pull request waits on it; a resolver helper never starts a watcher of its own.

## Skip automated findings on superseded commits

When the checks finish, read the comments and reviews again. Skip an automated reviewer's finding posted before the newest commit you pushed: it is about code that has since changed, so it is either fixed already or will be raised again on the new head. A person's comment stays until it is answered or resolved, whenever it was posted. Then handle what is left with Phase 2's steps, from Step 1.

- Check each automated finding against the code before changing anything, and reply with the reason when it is wrong; a bot's confidence is not evidence.
- A failing check is fixed like any failure: reproduce it locally where you can, find the cause, fix it, and run the declared checks again before the next push.
- When the base branch moved and the branch fell behind, update it under the rules in `references/merging.md`.

## When to stop watching

Stop when every check has passed, no person's comment is left unanswered and no automated finding on the latest push is left unhandled, and say so. Stop too when a check fails for a reason outside the change (an expired secret, a flaky runner, a service outage): report it with the failing job's name and leave it for the user, since rerunning or editing CI configuration is not part of answering review.
