# Manage API keys - Runpod Documentation

**URL:** https://docs.runpod.io/get-started/api-keys

> ## Documentation Index
>
> Fetch the complete documentation index at: [/llms.txt](https://docs.runpod.io/llms.txt)
>
> Use this file to discover all available pages before exploring further.

[Skip to main content](https://docs.runpod.io/get-started/api-keys#content-area)

[Docs](https://docs.runpod.io/overview) [Examples](https://docs.runpod.io/tutorials/introduction/overview) [Community](https://docs.runpod.io/community-solutions/overview) [CLI](https://docs.runpod.io/flash/cli/overview) [API](https://docs.runpod.io/api-reference/overview) [Models](https://docs.runpod.io/public-endpoints/models/flux-dev) [Release notes](https://docs.runpod.io/release-notes)

Legacy API keys generated before November 11, 2024 have either Read/Write or Read Only access to GraphQL based on what was set for that key. All legacy keys have full access to AI API. To improve security, generate a new key with **Restricted** permission and select the minimum permission needed for your use case.

## [​](https://docs.runpod.io/get-started/api-keys\#create-an-api-key)  Create an API key

Follow these steps to create a new Runpod API key:

1. In the Runpod console, navigate to the [Settings page](https://www.console.runpod.io/user/settings).
2. Expand the **API Keys** section and select **Create API Key**.
3. Give your key a name and set its permissions ( **All**, **Restricted**, or **Read Only**). If you choose **Restricted**, you can customize access for each Runpod API:   - **None**: No access
   - **Restricted**: Customize access for each of your Serverless endpoints. (Default: None.)
   - **Read/Write**: Full access to your endpoints.
   - **Read Only**: Read access without write access.
4. Select **Create**, then select your newly-generated key to copy it to your clipboard.

Runpod does not store your API key, so you may wish to save it elsewhere (e.g., in your password manager, or in a GitHub secret). Treat your API key like a password and don’t share it with anyone.

## [​](https://docs.runpod.io/get-started/api-keys\#edit-api-key-permissions)  Edit API key permissions

To edit an API key:

1. Navigate to the [Settings page](https://www.console.runpod.io/user/settings).
2. Under **API Keys**, select the pencil icon for the key you wish to update
3. Update the key with your desired permissions, then select **Update**.

## [​](https://docs.runpod.io/get-started/api-keys\#enable/disable-an-api-key)  Enable/disable an API key

To enable/disable an API key:

1. Navigate to the [Settings page](https://www.console.runpod.io/user/settings).
2. Under **API Keys**, select the toggle for the API key you wish to enable/disable, then select **Yes** in the confirmation modal.

## [​](https://docs.runpod.io/get-started/api-keys\#delete-an-api-key)  Delete an API key

To delete an API key:

1. From the console, select **Settings**.
2. Under **API Keys**, select the trash can icon and select **Revoke Key** in the confirmation modal.

Was this page helpful?

YesNo

[Suggest edits](https://github.com/runpod/docs/edit/main/get-started/api-keys.mdx) [Raise issue](https://github.com/runpod/docs/issues/new?title=Issue%20on%20docs&body=Path:%20/get-started/api-keys)

[Previous](https://docs.runpod.io/get-started/concepts) [Agent skillsManage GPU workloads on Runpod with coding agents like Claude Code and Cursor.\\
\\
Next](https://docs.runpod.io/get-started/agent-skills)

Ctrl+I

Ask AI Ctrl I

Runpod Assistant

Hi! How can I help you with Runpod today?
