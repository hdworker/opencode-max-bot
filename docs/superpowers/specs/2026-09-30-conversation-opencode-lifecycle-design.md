# Conversation and OpenCode lifecycle safety

Date: 2026-09-30

## Status

Design approved in chat for both work areas. Implementation has not started; this document is awaiting user review.

## Context

The bot keeps project and session selection per MAX chat, submits prompts to OpenCode, listens to project-scoped SSE streams, and can start or stop a local OpenCode process. Recent fixes added project/session revisions, remote abort handling, SSE readiness checks, and process identity checks. A follow-up integration review found remaining asynchronous races and a mismatch between the deployed systemd owner and bot process controls.

`CONTEXT.md` defines a Conversation as the owner of the selected Project, Session, Model, and Agent for a chat. Project-scoped OpenCode operations must stay attached to that Conversation. The deployed systemd units run OpenCode as `dev` with `Restart=on-failure`; the bot unit disables its internal auto-restart.

## Decisions

1. The most recently started authorized action with valid local input that changes the selected Project or Session owns the right to commit. Remote lookup failure does not change the committed context, but the older in-flight transition stays superseded and cannot commit later.
2. A failed transition leaves the last committed Conversation context unchanged. An older in-flight action invalidated by a newer transition does not resume and commit later.
3. A prompt reserves its Conversation context before any network wait. It may be submitted only while the captured context still owns the operation.
4. A context change must stop the previous OpenCode operation before committing. If the remote stop cannot be confirmed, preserve the selected context and report failure. `/mkdir` may leave the new directory created but unselected in this case.
5. Authorization must happen before dispatcher predicates, ordering decisions, or interaction expiry logic can cause side effects.
6. systemd is the sole OpenCode process owner in the deployed VPS mode. The bot may control only the fixed `opencode.service` unit through narrowly scoped permissions. In local standalone mode, the bot owns the spawned process and its internal auto-restart behavior.

## Design

### Conversation updates and prompt submission

Conversation state transitions will use one per-chat ordering rule for project and session changes. Every project/session command or callback claims an ordering revision immediately after its arguments and basic local validity are checked. Each asynchronous result is applied only if that revision remains current. Command failures report the failure without partially changing the committed Conversation state.

The prompt path will capture the selected Project, Session, Model, Agent, and Variant together and reserve the prompt operation synchronously before awaiting the SSE connection. The handler rechecks ownership after each wait and before `promptAsync`. A context-changing action cancels the operation identified by its exact session, directory, and operation identity; completion of an older `/abort` or `/detach` cannot clear a newer operation.

An operation is not eligible for normal `session.idle` finalization until OpenCode has accepted its prompt. If an idle event arrives while the request is being submitted, the listener records that observation and the handler reconciles remote session status after acceptance; it must not finalize from an idle event that predates the prompt. If SSE setup fails before submission, the pending operation and listener are removed without an OpenCode abort call.

The same context-transition flow will stop a chat's previous event listener after a successful switch or detach. Events from the old Project will no longer remain subscribed. Model, Agent, and Variant callbacks will verify their selection against the current Project and model selection before committing.

When a question or permission request is pending, clearing its local record is allowed only after the OpenCode request is known to be resolved by remote abort/reply or is confirmed no longer active. A failed remote resolution keeps the Conversation selected and reports the failure.

### Authorization and update dispatch

The update flow will establish authorization before evaluating the dispatcher's priority predicate or queueing work based on interaction state. The predicate will not perform remote calls or mutate interaction state. Expired-interaction cleanup will run only for an authorized update and will use the normal Conversation cancellation path.

### OpenCode process ownership

OpenCode control mode will be explicit so the bot does not infer ownership from the current PID or service state. The deployment configuration selects systemd mode; local development selects standalone mode.

In systemd mode, `/opencode_start`, `/opencode_stop`, and `/status` report and control only `opencode.service`; they do not signal a PID found by port. The deployment script will grant the `dev` user only the exact required systemctl operations for that unit and validate the generated sudoers entry. The bot waits for service state and the configured health endpoint before reporting success. Internal auto-restart is not started in this mode.

In standalone mode, start, stop, and auto-restart share one serialized lifecycle owner. Process identification will parse executable identity and arguments as separate fields rather than search the full command line for substrings. A process that cannot be identified with confidence is left untouched. Local target resolution accepts only supported loopback HTTP URLs and a root path; unsupported scheme, path, host, or port combinations disable process management with a clear message. Wildcard bind addresses such as `0.0.0.0` are not treated as loopback client targets.

### Errors and user-visible behavior

- A stale transition reports that it was superseded and does not mutate the newer context.
- An abort failure reports that the prior selection remains active; no new prompt is submitted to a different context.
- An unrecognized PID or unrelated listener is never terminated.
- A systemd command reports success only after the unit state and OpenCode health agree.
- A standalone command reports success only after the process is identified and healthy.
- A directory created by `/mkdir` remains on disk if later cancellation fails, but is not selected automatically.

## Verification plan

Tests will exercise behavior at module interfaces using controlled MAX updates and OpenCode adapters:

1. An unauthorized update arriving after interaction expiry does not call OpenCode or change interaction state.
2. A prompt held at SSE readiness is superseded by `/new`, project selection, or `/abort` and is not submitted with stale context.
3. Overlapping project/session transitions follow the most-recently-started rule; remote failures do not partially commit and superseded operations do not later commit.
4. A prompt operation cannot be finalized by a stale `session.idle` before acceptance; an idle observed during submission is reconciled after acceptance.
5. An old abort or detach completion cannot clear a newer session operation.
6. Context changes stop the old event listener; late old-project events cannot create interactions in the new context.
7. Stale model, agent, and variant buttons are rejected.
8. Pending question/permission requests are not forgotten until remote resolution is confirmed.
9. systemd mode invokes only fixed unit operations and never signals a PID; standalone mode refuses unrelated or ambiguous processes.
10. Unsupported local OpenCode URLs are rejected, while supported loopback URLs resolve to the matching process target.
11. Concurrent start/stop/restart requests serialize and their responses reflect the resulting owner state.

No test, build, live service change, or deployment is included in this design step.

## Scope boundaries

- TTS behavior and streaming product decisions remain unchanged.
- The live VPS is not modified by the local implementation. Deployment requires a separate explicit release step.
- Existing uncommitted source changes, including `/mkdir`, remain outside the design-document commit.
