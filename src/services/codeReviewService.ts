import axios from 'axios';
import * as dotenv from 'dotenv';
import * as GitInterfaces from 'azure-devops-node-api/interfaces/GitInterfaces';
import { FileChange } from './azureDevOpsService';
dotenv.config();

// OpenRouter API configuration
const openRouterApiKey = process.env.OPENROUTER_API_KEY;
const openRouterModel = process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-lite-preview-02-05:free';
const codeReviewPrompt = process.env.CODE_REVIEW_PROMPT || '';

export interface PullRequestDetails {
  pullRequest: any;
  changes: Array<{
    path: string;
    content: string | null;
    diff: string | null;
    changeType: string;
    error?: string;
  }>;
}

/**
 * Prepare the code review prompt with the pull request details
 */
function prepareCodeReviewPrompt(pullRequest: GitInterfaces.GitPullRequest, changes: FileChange[]): string
{
  let prompt = "Perform a thorough code review focusing on best practices, potential bugs, security issues, and performance optimizations.\n\n";

  // Add pull request information
  prompt += `Pull Request Title: ${pullRequest.title}\n`;
  prompt += `Description: ${pullRequest.description || 'No description provided'}\n\n`;

  // Add files changed
  prompt += `Files changed (${changes.length}):\n\n`;

  var index = 1;
  // Add each file's content
  changes.forEach((file) => {
    const language = file.language;
    if (language != "Unknown") {
      prompt += `File ${index}: ${file.fileName} (${language})\n`;
      prompt += `<ChangeContent>\n`;
      prompt += file.changeContent;
      prompt += `</ChangeContent>\n\n`;
    }
  });

  // Add instructions for the review format
  prompt += `\nPlease provide a comprehensive code review according to the language of the code with the following sections:
1. Overall Assessment
2. Code Quality
3. Potential Issues
4. Security Concerns
5. Specific Recommendations

Give the developer some encouragement at the end of the review.

Format your review for readability in Azure DevOps comments.`;

  return prompt;
}

/**
 * Perform code review using OpenRouter API
 */
export async function doCodeReview(pullRequest: GitInterfaces.GitPullRequest, changes: FileChange[]): Promise<string> {
  if (changes.length === 0) {
    return "";
  }

  try {
    const prompt = prepareCodeReviewPrompt(pullRequest, changes);

    console.log(prompt);

    console.log(`Starting code review with model ${openRouterModel}`);

    // Call OpenRouter API
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: openRouterModel,
        messages: [
          {
            role: 'system',
            content: 'You are a senior developer and an expert code reviewer of the language of the code. \
              Analyze the code and provide detailed, constructive feedback where the comments about the code are not harsh or can be considered \
              as a negative comment. Do not hallucinate any code, and be specific about the changes. \
              Give the developer some encouragement at the end of the review to keep going and be positive. Use markdown formatting of review.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 64000
      },
      {
        headers: {
          'Authorization': `Bearer ${openRouterApiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://azure-function-code-review',
          'X-Title': 'Azure Function Code Review'
        }
      }
    );

    if (response.status !== 200) {
      throw new Error(response.data.error);
    }

    // Extract the review text from the response
    const reviewText = response.data?.choices[0]?.message?.content || "";

    return reviewText;
  } catch (error: unknown) {
    console.error('Error performing code review with OpenRouter:', error);

    // Return a formatted error message
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return "";
  }
}
