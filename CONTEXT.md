# Domain context

## Conversation

A MAX chat identified by `chat_id`. A Conversation owns the selected Project,
Session, Model, and Agent for that chat. State from one Conversation must not
change another Conversation.

## Project

An OpenCode worktree selected within a Conversation. A Project scopes the
Sessions, Models, Agents, MCP servers, and event stream used by that
Conversation.

## Session

An OpenCode session selected within a Conversation and associated with the
Project directory that created it.

## MAX transport

The adapter that converts raw MAX updates into a Conversation-aware inbound
message or callback, and sends replies and callback acknowledgements to the
correct chat.

## OpenCode Workspace

The adapter that exposes Project-scoped OpenCode operations to the MAX bot
without leaking generated SDK request shapes into command and handler modules.
