# Runbook: Synchronize CORS Configuration

This runbook outlines the steps to synchronize CORS configuration between the client and server workspaces.

## 1. Find all occurrences of "CORS"

```
Search for "CORS" in both the `client` and `server` contexts and show all matches.
```

## 2. Read the relevant files

```
Read the contents of `client/client.js` and `server/server.js`.
```

## 3. Propose and apply changes

Based on the contents of the files, propose a unified CORS configuration and apply the changes to both files.

## 4. Verify the changes

Run the appropriate tests for the client and server to ensure that the CORS changes have not introduced any regressions.
