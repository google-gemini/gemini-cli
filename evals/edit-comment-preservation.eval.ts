/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('edit comment preservation', () => {
  evalTest('USUALLY_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: 'should preserve unrelated comments during a multi-part edit',
    files: {
      'oauth_endpoints.py': `import logging

logger = logging.getLogger(__name__)


async def authorize(request, client_id, current_user, db):
    # Validate client exists first (before showing consent page)
    client = OAuthClientCRUD.get(db, client_id)
    if not client:
        raise ValueError("Client not found")

    # If user is not authenticated, show server-side login page
    if not current_user:
        # Show login form that redirects back here after authentication
        return get_login_html(
            authorize_url=str(request.url),
            client_name=client.client_name,
        )

    # User is authenticated - validate OAuth parameters and process authorization
    if client.is_revoked:
        raise ValueError("Client has been revoked")

    client_updates = {}
    auth_client = client
    should_delete_new_client = False

    if client.user_id is None:
        # This client was created by dynamic client registration.
        stale_client = OAuthClientCRUD.get_by_project_user_and_type(
            db,
            hub_project_id=client.hub_project_id,
            user_id=current_user.id,
            client_type=client.client_type,
        )

        if stale_client:
            # Recycle the previous record with the newly issued secret.
            client_updates["client_secret"] = client.client_secret
            should_delete_new_client = True
            auth_client = stale_client
        else:
            # Link a first-time client to the authenticated user.
            client_updates["user_id"] = current_user.id

    elif client.user_id != current_user.id:
        # Security check: an owned client can only be used by its owner.
        raise PermissionError("Not authorized to approve this client")

    # Capture redirect metadata on first use for backward compatibility
    if not auth_client.redirect_uris:
        metadata = auth_client.client_metadata
        metadata["redirect_uris"] = [request.redirect_uri]
        auth_client.set_client_metadata(metadata)

    # Apply all accumulated client updates in one transaction
    if client_updates or not auth_client.redirect_uris:
        OAuthClientCRUD.update(db, auth_client, client_updates)

    # Delete the temporary client only after recycling succeeded
    if should_delete_new_client:
        OAuthClientCRUD.delete(db, client.client_id)

    # Generate and return the authorization code
    return create_authorization_code(db, auth_client, current_user)
`,
    },
    prompt:
      'In oauth_endpoints.py, log the raw incoming request URL immediately before the client lookup. Also adapt the stale-client lookup to the new global user/client-type scope by renaming get_by_project_user_and_type to get_by_user_and_type and removing its hub_project_id argument. Make only the necessary changes and do not run the code.',
    timeout: 180000,
    assert: async (rig) => {
      const content = rig.readFile('oauth_endpoints.py');

      expect(content).toMatch(
        /logger\.info\([\s\S]{0,200}request\.url[\s\S]{0,200}\)/,
      );
      expect(content).toContain('OAuthClientCRUD.get_by_user_and_type(');
      expect(content).not.toContain('hub_project_id=client.hub_project_id');

      const unrelatedComments = [
        '# Validate client exists first (before showing consent page)',
        '# If user is not authenticated, show server-side login page',
        '# Show login form that redirects back here after authentication',
        '# User is authenticated - validate OAuth parameters and process authorization',
        '# Security check: an owned client can only be used by its owner.',
        '# Capture redirect metadata on first use for backward compatibility',
        '# Apply all accumulated client updates in one transaction',
        '# Delete the temporary client only after recycling succeeded',
        '# Generate and return the authorization code',
      ];

      for (const comment of unrelatedComments) {
        expect(
          content,
          `Expected comment to be preserved: ${comment}`,
        ).toContain(comment);
      }
    },
  });
});
