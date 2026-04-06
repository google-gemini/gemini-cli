# TASK-11: UI - Browse Agent Teams View

## Objective
Implement a fully functional "Browse Agent Teams" component in the CLI to allow users to search, browse, and install teams from a registry.

## Implementation Details

### 1. New UI Components (`packages/cli/src/ui/components/views/`)
- [ ] Create `TeamRegistryView.tsx`:
  - Uses `useTeamRegistry` hook (mirroring `useExtensionRegistry`).
  - Displays a `SearchableList` of `RegistryTeam`s.
  - Visuals: Use the color-coded provider tags (TASK-07).
- [ ] Create `TeamDetailsView.tsx`:
  - Shows team objective, author, and roster of agents.
  - Action: "Install Team".

### 2. Integration in TeamSelectionDialog (`packages/cli/src/ui/components/TeamSelectionDialog.tsx`)
- [ ] Rename "Marketplace" to "Browse Agent Teams".
- [ ] Replace the marketplace placeholder with the new `TeamRegistryView`.
- [ ] Support back navigation from `TeamRegistryView` to the initial selection screen.

## Verification
- Manual verification of searching for a team in the registry.
- Verify "Install Team" transitions correctly to the main selection screen with the new team selected.
