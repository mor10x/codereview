# Azure DevOps Automated Code Review

This project is an Azure Function that automatically performs code reviews on Azure DevOps pull requests using AI through the OpenRouter API. When a new pull request is created with no comments, the function analyzes the code changes and adds a comprehensive code review as a comment.

## Features

- Triggers on Azure DevOps pull request creation
- Checks if the pull request has existing comments
- Retrieves pull request details and changed files
- Sends code to OpenRouter API for AI-powered code review
- Posts the review as a comment on the pull request
- Customizable code review prompt and AI model

## Prerequisites

- Node.js 18 or later
- Azure Functions Core Tools
- Azure DevOps account with a Personal Access Token (PAT)
- OpenRouter API key

## Setup

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Configure environment variables in `local.settings.json`:
   ```json
   {
     "IsEncrypted": false,
     "Values": {
       "AzureWebJobsStorage": "UseDevelopmentStorage=true",
       "FUNCTIONS_WORKER_RUNTIME": "node",
       "AZURE_DEVOPS_PAT": "your_personal_access_token",
       "AZURE_DEVOPS_ORGANIZATION": "your_organization",
       "AZURE_DEVOPS_PROJECT": "your_project",
       "OPENROUTER_API_KEY": "your_openrouter_api_key",
       "OPENROUTER_MODEL": "anthropic/claude-3-opus-20240229",
       "CODE_REVIEW_PROMPT": "Perform a thorough code review focusing on best practices, potential bugs, security issues, and performance optimizations."
     }
   }
   ```

## Local Development

1. Start the Azure Functions runtime:
   ```
   npm start
   ```
2. The function will be available at `http://localhost:7071/api/pullRequestTrigger`

## Deployment to Azure

1. Create an Azure Function App in the Azure Portal
2. Deploy using Azure Functions Core Tools:
   ```
   func azure functionapp publish <your-function-app-name>
   ```
3. Configure application settings in the Azure Portal with the same environment variables as in `local.settings.json`

## Setting up the Azure DevOps Webhook

1. In your Azure DevOps project, go to Project Settings > Service Hooks
2. Create a new webhook subscription
3. Select "Pull request created" as the trigger
4. Set the webhook URL to your deployed Azure Function URL
5. Add authentication if needed (function key)

## Customization

- Change the AI model by updating the `OPENROUTER_MODEL` environment variable
- Customize the code review prompt by updating the `CODE_REVIEW_PROMPT` environment variable
- Modify the code review format in the `prepareCodeReviewPrompt` function

## License

ISC
