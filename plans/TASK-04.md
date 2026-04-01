# TASK-04: CLI UX: Startup Team Selection Dialog

## Objective

Introduce a selection dialog during the CLI startup process to allow users to
choose an agent team, browse existing teams, or create new ones.

## Implementation Details

### 1. New UI Component (`packages/cli/src/ui/components/TeamSelectionDialog.tsx`)

- [ ] Create a new React/Ink component that displays a list of available teams.
- [ ] Options should include:
  - [ ] Specific discovered teams (name + description).
  - [ ] "No Team" (continue as individual agent).
  - [ ] "Browse Team Marketplace" (placeholder for MVP).
  - [ ] "Create New Team" (placeholder for MVP).
- [ ] Use `SelectInput` from `@inkjs/select-input` for selection.

### 2. Startup Flow (`packages/cli/src/ui/AppContainer.tsx`)

- [ ] Add state: `isTeamSelectionActive: boolean`.
- [ ] In `useEffect` or `useLayoutEffect` that runs once after initialization:
  - [ ] If multiple teams are available and no active team is set in the
        session/config:
    - [ ] Set `isTeamSelectionActive(true)`.
- [ ] Intercept the render flow:
  - [ ] If `isTeamSelectionActive`, render the `TeamSelectionDialog`.
- [ ] Implement `handleTeamSelect(teamName: string | undefined)`:
  - [ ] Call `config.setActiveTeam(teamName)`.
  - [ ] Set `isTeamSelectionActive(false)`.

## Verification

- Manual verification of the startup screen.
- Test selection of a team and confirm the CLI proceeds to the main chat.
- Test the "No Team" option.
- Verify that if only one team exists, the dialog can be bypassed (optional UX
  polish).
