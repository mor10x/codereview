import axios from 'axios';
import * as dotenv from 'dotenv';

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
    changeType: string;
    error?: string;
  }>;
}

/**
 * Detect the programming language based on file extension
 */
function detectLanguage(filePath: string): string {
  const extension = filePath.split('.').pop()?.toLowerCase();

  const languageMap: Record<string, string> = {
    'js': 'JavaScript',
    'ts': 'TypeScript',
    'jsx': 'React JSX',
    'tsx': 'React TSX',
    'py': 'Python',
    'java': 'Java',
    'cs': 'C#',
    'go': 'Go',
    'rb': 'Ruby',
    'php': 'PHP',
    'swift': 'Swift',
    'kt': 'Kotlin',
    'rs': 'Rust',
    'c': 'C',
    'cpp': 'C++',
    'h': 'C/C++ Header',
    'html': 'HTML',
    'css': 'CSS',
    'scss': 'SCSS',
    'json': 'JSON',
    'md': 'Markdown',
    'sql': 'SQL',
    'sh': 'Shell',
    'ps1': 'PowerShell',
    'yaml': 'YAML',
    'yml': 'YAML',
    'xml': 'XML',
    'dockerfile': 'Dockerfile',
  };

  return extension ? (languageMap[extension] || 'Unknown') : 'Unknown';
}

/**
 * Prepare the code review prompt with the pull request details
 */
function prepareCodeReviewPrompt(prDetails: PullRequestDetails): string {
  const { pullRequest, changes } = prDetails;

  let prompt = `${codeReviewPrompt}\n\n`;

  // Add pull request information
  prompt += `Pull Request Title: ${pullRequest.title}\n`;
  prompt += `Description: ${pullRequest.description || 'No description provided'}\n\n`;

  // Add files changed
  prompt += `Files changed (${changes.length}):\n\n`;

  // Add each file's content
  changes.forEach((file, index) => {
    const language = detectLanguage(file.path);
    prompt += `File ${index + 1}: ${file.path} (${language})\n`;
    prompt += `Change type: ${file.changeType}\n`;

    if (file.error) {
      prompt += `Error retrieving content: ${file.error}\n`;
    } else if (file.content) {
      prompt += "```\n";
      prompt += file.content;
      prompt += "\n```\n\n";
    } else {
      prompt += "Content not available\n\n";
    }
  });

  // Add instructions for the review format
  prompt += `\nPlease provide a comprehensive code review according to the language of the code with the following sections:
1. Overall Assessment
2. Code Quality
3. Potential Issues
4. Security Concerns
5. Specific Recommendations

Format your review for readability in Azure DevOps comments.`;

  return prompt;
}

/**
 * Perform code review using OpenRouter API
 */
export async function doCodeReview(prDetails: PullRequestDetails): Promise<string> {
  if (prDetails.changes.length === 0) {
    return "";
  }

  try {
    const prompt = prepareCodeReviewPrompt(prDetails);

    console.log(`Starting code review with model ${openRouterModel}`);

    // Call OpenRouter API
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: openRouterModel,
        messages: [
          {
            role: 'system',
            content: 'You are a senior developer and an expert code reviewer of the language of the code. Analyze the code and provide detailed, constructive feedback. Do not halucinate any code, and be specific about the changes. Use markdown formatting of review.'
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
    const reviewText = response.data.choices[0]?.message?.content || 'Error: No review content generated';

    return reviewText;
  } catch (error: unknown) {
    console.error('Error performing code review with OpenRouter:', error);

    // Return a formatted error message
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return `# Code Review Error\n\nThere was an error generating the code review:\n\n\`\`\`\n${errorMessage}\n\`\`\`\n\nPlease check the function logs for more details.`;
  }
}
