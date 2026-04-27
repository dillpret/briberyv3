# Architecture & Guiding Principles

## Purpose

This document defines the architectural constraints and design principles for the Bribery Game project.

It is NOT a snapshot of the current implementation.
It is the target model that all code should converge toward.

---

# 1. Core Architectural Model

The system follows a strict layered architecture:

Frontend (Angular)
→ SignalR Hub (transport layer)
→ GameService (application layer)
→ Game (domain layer)

---

## Responsibilities

### Game (Domain Layer)
- Owns ALL game state
- Contains ALL game rules and logic
- Implements the full game state machine (FSM)
- Is deterministic and self-contained

Game must NOT:
- Know about SignalR
- Know about HTTP or transport
- Access external services

---

### GameService (Application Layer)
- Manages multiple Game instances
- Maps connectionId → gameId
- Routes commands to the correct Game
- Does NOT contain game rules

---

### GameHub (Transport Layer)
- Thin SignalR wrapper
- Receives client requests
- Calls GameService
- Broadcasts results

GameHub must NOT:
- Contain business logic
- Make decisions about game rules

---

### Frontend (Angular)
- Displays state
- Sends user actions
- Holds reactive state (signals)

Frontend must:
- Treat backend as source of truth

Frontend must NOT:
- Contain game rules
- Infer state transitions

---

# 2. State Management Philosophy

## Single Source of Truth

All authoritative state lives in the backend Game instance.

Frontend state is:
a projection of backend state

---

## Deterministic State Machine

The game is a strict FSM.

- Every action is only valid in specific phases
- No implicit transitions
- No side effects outside Game

---

## Phase Controls Behavior

GamePhase determines:
- What actions are allowed
- What data is relevant
- What UI should display

No action should bypass phase checks.

---

# 3. Multiplayer Model

## Connection Model

- Each browser tab = one connection
- Each player has a persistent playerId
- Reconnection is supported

---

## Join-in-Progress

Players may join mid-game.

- They are added to the game
- They are marked IsActive = false
- They do NOT participate until next round

This distinction is critical:
presence ≠ participation

---

# 4. Game Model (Critical)

## No Central Authority

There is NO judge role.

Each player:
- defines a prompt
- receives submissions
- evaluates their own submissions

This is a distributed system of parallel interactions.

---

## Round Structure

Each round consists of:

1. Prompt Phase
   - Each player submits a prompt

2. Submission Phase
   - Each player submits TWO bribes
   - Each targets a different player

3. Evaluation Phase
   - Each player receives TWO bribes
   - Selects one winner

4. Results Phase
   - Winning bribes award points

---

## Interaction Mapping

The backend is responsible for assigning:
who sends bribes to whom

Clients must NOT decide this.

---

# 5. Data Ownership Rules

## Game owns all mutable state

Including:
- Players
- Prompts
- Bribes
- Scores
- Phase

---

## DTOs are read-only projections

Data sent to frontend must not expose internal mutability assumptions

---

# 6. Error Handling Philosophy

Avoid:
null = failure

Prefer:
explicit success/failure results

---

# 7. Incremental Development Strategy

## Build Order

1. Domain logic (Game)
2. Application routing (GameService)
3. Transport (Hub)
4. UI (Frontend)

---

## Never build UI first

UI should reflect existing backend capabilities

---

# 8. Constraints (Non-Negotiable)

- No business logic in Hub
- No business logic in frontend
- No direct state mutation outside Game
- All transitions must be phase-driven
- No client-side authority

---

# 9. Anti-Patterns to Avoid

- “God Service” (GameService doing logic)
- Silent failures
- Client-driven game flow
- Implicit state transitions
- Duplicate logic across layers

---

# 10. Guiding Principle

This is not a CRUD app.

This is a deterministic multiplayer state machine.

Every design decision should reinforce that.
